import 'server-only'
import type { PoolClient } from 'pg'
import { escribir, escribirDevolviendo, fila, filas, enTransaccion } from '@/lib/db'
import { oNulo } from '@/lib/texto'
import { anotar, type Cambio } from './cambios'
import type { Estado, Resultado, TipoSesion, MotivoPerdida } from '@/dominio/resultados'

export type DatosDeOportunidad = {
  leadId: number
  closerId?: number | null
  tipoSesion?: TipoSesion
  fechaAgenda?: string | null
  horaAgenda?: string | null
  valorPotencial?: number | null
  moneda?: string
  observaciones?: string | null
}

export async function crearOportunidad(datos: DatosDeOportunidad, usuarioId: number): Promise<number> {
  return enTransaccion(async (cx) => {
    const numero = await fila<{ n: number }>(
      'select coalesce(max(numero), 0) + 1 as n from oportunidades where lead_id = $1',
      [datos.leadId], cx,
    )

    const creada = await escribirDevolviendo<{ id: number }>(
      `insert into oportunidades
         (lead_id, closer_id, closer_inicial_id, numero, tipo_sesion, fecha_agenda, hora_agenda,
          valor_potencial, moneda, observaciones, creado_por)
       values ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [
        datos.leadId, datos.closerId ?? null, numero?.n ?? 1,
        datos.tipoSesion ?? 'primera',
        oNulo(datos.fechaAgenda), oNulo(datos.horaAgenda),
        datos.valorPotencial ?? null, datos.moneda ?? 'USD',
        oNulo(datos.observaciones), usuarioId,
      ],
      cx,
    )

    if (datos.closerId) await registrarParticipacion(creada.id, datos.closerId, 'inicial', cx)

    await anotar([{
      entidad: 'oportunidad', entidadId: creada.id, campo: 'alta',
      anterior: null, nuevo: `sesión ${numero?.n ?? 1}`,
    }], usuarioId, cx)

    return creada.id
  })
}

async function registrarParticipacion(
  oportunidadId: number,
  closerId: number,
  rol: 'inicial' | 'final' | 'apoyo',
  cx?: PoolClient,
): Promise<void> {
  await escribir(
    `insert into oportunidad_participaciones (oportunidad_id, closer_id, rol)
     values ($1, $2, $3) on conflict (oportunidad_id, closer_id, rol) do nothing`,
    [oportunidadId, closerId, rol],
    { esperadas: 'cualquiera', cliente: cx },
  )
}

// ── Reasignar closer ────────────────────────────────────────────────────────

/**
 * Cambiar el closer de una oportunidad.
 *
 * Esto es el caso que el documento marca como crítico: si el lead era de Kevin
 * y ahora va a Braian, no se borra y se recrea. Se cambia la asignación, queda
 * el histórico con quién lo hizo y por qué, y el closer inicial no se pisa
 * nunca: sin él no se puede atribuir el cierre más adelante.
 */
export async function reasignarCloser(
  oportunidadId: number,
  closerId: number | null,
  usuarioId: number,
  motivo: string | null,
): Promise<void> {
  const antes = await fila<{ closer_id: number | null; nombre: string | null }>(
    `select o.closer_id, c.nombre
       from oportunidades o left join closers c on c.id = o.closer_id
      where o.id = $1 and o.borrado_en is null`,
    [oportunidadId],
  )
  if (!antes) throw new Error('Esa oportunidad no existe.')
  if (antes.closer_id === closerId) return

  const despues = closerId === null ? null
    : await fila<{ nombre: string }>('select nombre from closers where id = $1', [closerId])

  await enTransaccion(async (cx) => {
    await escribir(
      `update oportunidades set closer_id = $1, actualizado_en = now()
        where id = $2 and borrado_en is null`,
      [closerId, oportunidadId], { esperadas: 1, cliente: cx },
    )
    if (closerId !== null) await registrarParticipacion(oportunidadId, closerId, 'apoyo', cx)
    await anotar([{
      entidad: 'oportunidad', entidadId: oportunidadId, campo: 'closer',
      anterior: antes.nombre, nuevo: despues?.nombre ?? null, motivo,
    }], usuarioId, cx)
  })
}

// ── Cargar el resultado ─────────────────────────────────────────────────────

export type ResultadoCargado = {
  estado?: Estado
  resultado?: Resultado
  huboOferta?: boolean
  motivoPerdida?: MotivoPerdida | null
  proximoContacto?: string | null
  proximoPaso?: string | null
  observaciones?: string | null
  /** Cuando el resultado es venta. */
  venta?: { importe: number; moneda: string; fecha: string; programa?: string | null }
  /** Cuando el resultado es seña. */
  sena?: { importe: number; moneda: string; fecha: string; saldoPendiente?: number | null; fechaComprometida?: string | null }
}

const CAMPOS_RESULTADO = [
  { clave: 'estado', columna: 'estado' },
  { clave: 'resultado', columna: 'resultado' },
  { clave: 'huboOferta', columna: 'hubo_oferta' },
  { clave: 'motivoPerdida', columna: 'motivo_perdida' },
  { clave: 'proximoContacto', columna: 'proximo_contacto' },
  { clave: 'proximoPaso', columna: 'proximo_paso' },
  { clave: 'observaciones', columna: 'observaciones' },
] as const

/**
 * Cargar qué pasó en una oportunidad.
 *
 * Dos avisos que valen la pena:
 *
 *  - La SEÑA no cierra nada. Deja la oportunidad abierta y crea una fila en
 *    `senias` con su saldo y su fecha comprometida. No se cuenta como venta ni
 *    entra al cash: se ve en su propia tarjeta hasta que se convierte.
 *  - Una VENTA crea la fila en `ventas`, y el cobro se carga aparte en `pagos`.
 *    Facturación y cash collected no son el mismo número y no salen de la misma
 *    tabla.
 */
export async function cargarResultado(
  oportunidadId: number,
  datos: ResultadoCargado,
  usuarioId: number,
): Promise<void> {
  const antes = await fila<Record<string, unknown>>(
    `select ${CAMPOS_RESULTADO.map((c) => c.columna).join(', ')} from oportunidades
      where id = $1 and borrado_en is null`,
    [oportunidadId],
  )
  if (!antes) throw new Error('Esa oportunidad no existe.')

  const sets: string[] = []
  const valores: unknown[] = []
  const anotaciones: Cambio[] = []
  const p = (v: unknown): string => { valores.push(v); return `$${valores.length}` }

  for (const campo of CAMPOS_RESULTADO) {
    const nuevo = (datos as Record<string, unknown>)[campo.clave]
    if (nuevo === undefined) continue
    const anterior = antes[campo.columna] ?? null
    const normalizado = typeof nuevo === 'string' ? oNulo(nuevo) : nuevo
    if (String(anterior ?? '') === String(normalizado ?? '')) continue

    sets.push(`${campo.columna} = ${p(normalizado)}`)
    anotaciones.push({
      entidad: 'oportunidad', entidadId: oportunidadId, campo: campo.clave,
      anterior: anterior === null ? null : String(anterior),
      nuevo: normalizado === null || normalizado === undefined ? null : String(normalizado),
    })
  }

  await enTransaccion(async (cx) => {
    if (sets.length > 0) {
      await escribir(
        `update oportunidades set ${sets.join(', ')}, actualizado_en = now()
          where id = ${p(oportunidadId)} and borrado_en is null`,
        valores, { esperadas: 1, cliente: cx },
      )
    }

    if (datos.venta) {
      const v = await escribirDevolviendo<{ id: number }>(
        `insert into ventas (oportunidad_id, importe, moneda, fecha, programa, creado_por)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [oportunidadId, datos.venta.importe, datos.venta.moneda, datos.venta.fecha,
         oNulo(datos.venta.programa), usuarioId],
        cx,
      )
      anotaciones.push({
        entidad: 'venta', entidadId: oportunidadId, campo: 'importe',
        anterior: null, nuevo: `${datos.venta.moneda} ${datos.venta.importe}`,
      })

      // Si venía de una seña, la seña se convierte y su importe pasa a ser el
      // primer pago de esta venta. Así el dinero se cuenta una vez: no dos, y
      // no cero.
      const abierta = await fila<{ id: number; importe: number; moneda: string; fecha: string }>(
        `select id, importe, moneda, fecha from senias
          where oportunidad_id = $1 and estado = 'abierta' and borrado_en is null
          order by fecha limit 1`,
        [oportunidadId], cx,
      )
      if (abierta) {
        await escribir(
          `update senias set estado = 'convertida', venta_id = $1 where id = $2`,
          [v.id, abierta.id], { esperadas: 1, cliente: cx },
        )
        await escribir(
          `insert into pagos (venta_id, importe, moneda, fecha, origen, estado)
           values ($1, $2, $3, $4, 'sena', 'cobrado')`,
          [v.id, abierta.importe, abierta.moneda, abierta.fecha], { esperadas: 1, cliente: cx },
        )
        anotaciones.push({
          entidad: 'sena', entidadId: oportunidadId, campo: 'estado',
          anterior: 'abierta', nuevo: 'convertida',
        })
      }
    }

    if (datos.sena) {
      await escribir(
        `insert into senias (oportunidad_id, importe, moneda, fecha, saldo_pendiente, fecha_comprometida, creado_por)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [oportunidadId, datos.sena.importe, datos.sena.moneda, datos.sena.fecha,
         datos.sena.saldoPendiente ?? null, oNulo(datos.sena.fechaComprometida), usuarioId],
        { esperadas: 1, cliente: cx },
      )
      anotaciones.push({
        entidad: 'sena', entidadId: oportunidadId, campo: 'importe',
        anterior: null, nuevo: `${datos.sena.moneda} ${datos.sena.importe}`,
      })
    }

    await anotar(anotaciones, usuarioId, cx)
  })
}

// ── Leer ────────────────────────────────────────────────────────────────────

export type OportunidadDelLead = {
  id: number
  numero: number
  tipoSesion: TipoSesion
  fechaAgenda: string | null
  horaAgenda: string | null
  estado: Estado
  resultado: Resultado
  huboOferta: boolean
  motivoPerdida: string | null
  closer: string | null
  closerId: number | null
  closerInicial: string | null
  valorPotencial: number | null
  moneda: string
  proximoContacto: string | null
  proximoPaso: string | null
  observaciones: string | null
  venta: { importe: number; moneda: string; fecha: string } | null
  sena: { importe: number; moneda: string; fecha: string; saldo: number | null; comprometida: string | null; estado: string } | null
}

export async function oportunidadesDelLead(leadId: number): Promise<OportunidadDelLead[]> {
  const f = await filas<any>(
    `select o.id, o.numero, o.tipo_sesion, o.fecha_agenda, o.hora_agenda, o.estado, o.resultado,
            o.hubo_oferta, o.motivo_perdida, o.closer_id, o.valor_potencial, o.moneda,
            o.proximo_contacto, o.proximo_paso, o.observaciones,
            c.nombre as closer, ci.nombre as closer_inicial,
            v.importe as venta_importe, v.moneda as venta_moneda, v.fecha as venta_fecha,
            s.importe as sena_importe, s.moneda as sena_moneda, s.fecha as sena_fecha,
            s.saldo_pendiente as sena_saldo, s.fecha_comprometida as sena_comprometida, s.estado as sena_estado
       from oportunidades o
       left join closers c  on c.id  = o.closer_id
       left join closers ci on ci.id = o.closer_inicial_id
       left join lateral (select * from ventas v2 where v2.oportunidad_id = o.id and v2.borrado_en is null
                          order by v2.fecha desc limit 1) v on true
       left join lateral (select * from senias s2 where s2.oportunidad_id = o.id and s2.borrado_en is null
                          order by s2.fecha desc limit 1) s on true
      where o.lead_id = $1 and o.borrado_en is null
      order by o.numero desc, o.id desc`,
    [leadId],
  )

  return f.map((x) => ({
    id: x.id, numero: x.numero, tipoSesion: x.tipo_sesion, fechaAgenda: x.fecha_agenda,
    horaAgenda: x.hora_agenda, estado: x.estado, resultado: x.resultado, huboOferta: x.hubo_oferta,
    motivoPerdida: x.motivo_perdida, closer: x.closer, closerId: x.closer_id,
    closerInicial: x.closer_inicial, valorPotencial: x.valor_potencial, moneda: x.moneda,
    proximoContacto: x.proximo_contacto, proximoPaso: x.proximo_paso, observaciones: x.observaciones,
    venta: x.venta_importe === null || x.venta_importe === undefined ? null
      : { importe: x.venta_importe, moneda: x.venta_moneda, fecha: x.venta_fecha },
    sena: x.sena_importe === null || x.sena_importe === undefined ? null
      : { importe: x.sena_importe, moneda: x.sena_moneda, fecha: x.sena_fecha,
          saldo: x.sena_saldo, comprometida: x.sena_comprometida, estado: x.sena_estado },
  }))
}

export async function leadDeLaOportunidad(oportunidadId: number): Promise<number | null> {
  const f = await fila<{ lead_id: number }>(
    'select lead_id from oportunidades where id = $1 and borrado_en is null', [oportunidadId],
  )
  return f?.lead_id ?? null
}
