import 'server-only'
import type { PoolClient } from 'pg'
import { escribir, fila, filas, enTransaccion } from '@/lib/db'
import { oNulo } from '@/lib/texto'
import { condicionDeAlcance, type Alcance } from '@/lib/permisos'
import { anotar } from './cambios'
import { comoViene, fechaDelToque, toqueSiguiente, type Toque, type Urgencia } from '@/motor/toques'
import { sacaDelPipeline, type EstadoToque, type Situacion } from '@/dominio/seguimientos'
import type { NivelDeCalidad } from '@/dominio/calidad'

/**
 * El pipeline de seguimientos.
 *
 * No es una tabla aparte de leads: es una VISTA de los leads que quedaron en
 * seguimiento, más en qué toque de la cadencia va cada uno. Si fuera una lista
 * propia se desincronizaría —un lead vendido seguiría apareciendo para
 * perseguir— y nadie sabría cuál de las dos pantallas tiene razón.
 *
 * El lead entra solo cuando el closer marca «seguimiento», y sale solo cuando
 * se vende, se pierde, se reflota o se marca «no interesado».
 */

export async function toques(): Promise<Toque[]> {
  return filas<Toque>('select orden, nombre, dias from seguimiento_toques where activo order by orden')
}

// ── Entrar y salir ──────────────────────────────────────────────────────────

/** Al marcar «seguimiento». Idempotente: volver a cargar el resultado no lo reinicia. */
export async function entrarAlPipeline(leadId: number, cx?: PoolClient): Promise<void> {
  await escribir(
    `insert into seguimiento_estado (lead_id, toque_actual, desde, ingreso_en, situacion)
     values ($1, 1, current_date, current_date, 'activo')
     on conflict (lead_id) do update
        set situacion = case when seguimiento_estado.situacion = 'fuera' then 'activo'
                             else seguimiento_estado.situacion end,
            salio_en = null,
            actualizado_en = now()`,
    [leadId], { esperadas: 1, cliente: cx },
  )
}

export async function salirDelPipeline(leadId: number, cx?: PoolClient): Promise<void> {
  await escribir(
    `update seguimiento_estado
        set situacion = 'fuera', salio_en = current_date, actualizado_en = now()
      where lead_id = $1 and situacion <> 'fuera'`,
    [leadId], { esperadas: 'cualquiera', cliente: cx },
  )
}

// ── Registrar un toque ──────────────────────────────────────────────────────

/**
 * El closer marca qué pasó en el toque y la tarjeta se mueve sola.
 *
 * `desde` pasa a ser HOY, no la fecha en que el toque tocaba. Es la diferencia
 * entre una cadencia que se puede seguir y una que se llena de vencidos el
 * primer día que alguien se atrasa.
 */
export async function registrarInteraccion(
  leadId: number,
  estado: EstadoToque,
  nota: string | null,
  usuarioId: number,
): Promise<{ toque: number | null; salio: boolean }> {
  const actual = await fila<{ toque_actual: number }>(
    'select toque_actual from seguimiento_estado where lead_id = $1', [leadId],
  )
  if (!actual) throw new Error('Este lead no está en el pipeline de seguimientos.')

  const cadencia = await toques()
  const siguiente = toqueSiguiente(cadencia, actual.toque_actual)
  // «No interesado» lo saca; «agendó» también, porque vuelve a estar en agenda
  // y perseguirlo en dos lados es perseguirlo mal.
  const salio = sacaDelPipeline(estado) || estado === 'agendo'

  await enTransaccion(async (cx) => {
    await escribir(
      `insert into seguimiento_interacciones (lead_id, toque, estado, nota, usuario_id)
       values ($1,$2,$3,$4,$5)`,
      [leadId, actual.toque_actual, estado, oNulo(nota), usuarioId],
      { esperadas: 1, cliente: cx },
    )

    if (salio) {
      await escribir(
        `update seguimiento_estado
            set situacion = 'fuera', salio_en = current_date, actualizado_en = now()
          where lead_id = $1`,
        [leadId], { esperadas: 1, cliente: cx },
      )
      // Marcar «no interesado» cierra el lead: si quedara en seguimiento,
      // seguiría contando como oportunidad abierta en el embudo.
      if (estado === 'no_interesado') {
        await escribir(
          `update leads set resultado = 'perdida',
                            motivo_perdida = coalesce(motivo_perdida, 'encaje'),
                            actualizado_en = now()
            where id = $1 and resultado in ('pendiente', 'seguimiento')`,
          [leadId], { esperadas: 'cualquiera', cliente: cx },
        )
      }
    } else {
      await escribir(
        `update seguimiento_estado
            set toque_actual = $1, desde = current_date, actualizado_en = now()
          where lead_id = $2`,
        [siguiente ?? actual.toque_actual, leadId], { esperadas: 1, cliente: cx },
      )
    }

    await anotar([{
      entidad: 'lead', entidadId: leadId, campo: `seguimiento · toque ${actual.toque_actual}`,
      anterior: null, nuevo: estado, motivo: oNulo(nota),
    }], usuarioId, cx)
  })

  return { toque: salio ? null : siguiente, salio }
}

/**
 * Moverlo a mano a otro toque.
 *
 * Existe porque la cadencia no siempre describe lo que pasó: a veces el closer
 * ya hizo tres toques por WhatsApp y la tarjeta quedó atrás. Que lo mueva él es
 * mejor que inventar un salto automático que nadie pidió.
 */
export async function moverAToque(leadId: number, toque: number, usuarioId: number): Promise<void> {
  await enTransaccion(async (cx) => {
    await escribir(
      `update seguimiento_estado
          set toque_actual = $1, desde = current_date, situacion = 'activo',
              fecha_larga = null, salio_en = null, actualizado_en = now()
        where lead_id = $2`,
      [toque, leadId], { esperadas: 1, cliente: cx },
    )
    await anotar([{ entidad: 'lead', entidadId: leadId, campo: 'seguimiento · toque',
                    anterior: null, nuevo: `movido al toque ${toque}` }], usuarioId, cx)
  })
}

/**
 * Seguimiento largo: el cliente pidió que lo llamen en tres meses.
 *
 * Sale de la cadencia y queda con una fecha. Ese día le vuelve a aparecer al
 * closer, en vez de estorbar en la grilla doce semanas.
 */
/**
 * Poner un lead en seguimiento largo, dentro de una transacción que ya existe.
 *
 * Es la mitad de `marcarSeguimientoLargo`: la que escribe. Separarla es lo que
 * deja marcar el seguimiento largo en el mismo movimiento en que se carga el
 * resultado, sin abrir una transacción adentro de otra.
 */
export async function ponerSeguimientoLargo(
  leadId: number, fecha: string, cx: PoolClient,
): Promise<void> {
  await escribir(
    `insert into seguimiento_estado (lead_id, toque_actual, desde, ingreso_en, situacion, fecha_larga)
     values ($1, 1, current_date, current_date, 'largo', $2)
     on conflict (lead_id) do update
        set situacion = 'largo', fecha_larga = excluded.fecha_larga,
            salio_en = null, actualizado_en = now()`,
    [leadId, fecha], { esperadas: 1, cliente: cx },
  )
  await escribir(
    `update leads set proximo_contacto = $1, actualizado_en = now() where id = $2`,
    [fecha, leadId], { esperadas: 1, cliente: cx },
  )
}

export async function marcarSeguimientoLargo(
  leadId: number,
  fecha: string,
  usuarioId: number,
  nota: string | null,
): Promise<void> {
  await enTransaccion(async (cx) => {
    await ponerSeguimientoLargo(leadId, fecha, cx)
    await anotar([{ entidad: 'lead', entidadId: leadId, campo: 'seguimiento largo',
                    anterior: null, nuevo: fecha, motivo: oNulo(nota) }], usuarioId, cx)
  })
}

// ── Leer el pipeline ────────────────────────────────────────────────────────

export type Tarjeta = {
  leadId: number
  nombre: string
  empresa: string | null
  closer: string | null
  closerId: number | null
  toque: number
  /** Cuándo toca, contando desde el último toque real. */
  fecha: string
  atraso: number
  urgencia: Urgencia
  situacion: Situacion
  fechaLarga: string | null
  ingresoEn: string
  ultimoEstado: EstadoToque | null
  valorPotencial: number | null
  moneda: string
  calidadNivel: NivelDeCalidad | null
  interacciones: number
}

async function tarjetas(alcance: Alcance, hoy: string, situaciones: Situacion[]): Promise<Tarjeta[]> {

  const valores: unknown[] = [situaciones]
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 2)
  valores.push(...alc.parametros)

  const f = await filas<Record<string, any>>(
    `select se.lead_id, se.toque_actual, se.desde, se.ingreso_en, se.situacion, se.fecha_larga,
            l.nombre, l.empresa, l.closer_id, l.valor_potencial, l.moneda,
            c.nombre as closer, q.nivel as calidad_nivel,
            (select count(*) from seguimiento_interacciones i where i.lead_id = se.lead_id) as interacciones,
            (select i2.estado from seguimiento_interacciones i2 where i2.lead_id = se.lead_id
              order by i2.creado_en desc, i2.id desc limit 1) as ultimo_estado
       from seguimiento_estado se
       join leads l on l.id = se.lead_id and l.borrado_en is null
       left join closers c on c.id = l.closer_id
       left join lateral (select nivel from lead_quality q2 where q2.lead_id = l.id
                           order by q2.creado_en desc, q2.id desc limit 1) q on true
      where se.situacion = any($1) and ${alc.condicion}
      order by l.nombre`,
    valores,
  )

  const cadencia = await toques()

  return f.map((x) => {
    const fecha = x.situacion === 'largo' && x.fecha_larga
      ? x.fecha_larga
      : fechaDelToque(cadencia, Number(x.toque_actual), x.desde)
    const v = comoViene(fecha, hoy)
    return {
      leadId: x.lead_id, nombre: x.nombre, empresa: x.empresa,
      closer: x.closer, closerId: x.closer_id,
      toque: Number(x.toque_actual),
      fecha: v.fecha, atraso: v.atraso, urgencia: v.urgencia,
      situacion: x.situacion, fechaLarga: x.fecha_larga, ingresoEn: x.ingreso_en,
      ultimoEstado: x.ultimo_estado ?? null,
      valorPotencial: x.valor_potencial === null ? null : Number(x.valor_potencial),
      moneda: x.moneda,
      calidadNivel: x.calidad_nivel ?? null,
      interacciones: Number(x.interacciones),
    }
  })
}

export type Columna = { toque: Toque; tarjetas: Tarjeta[] }

export type Pipeline = {
  columnas: Columna[]
  largos: Tarjeta[]
  fuera: Tarjeta[]
  resumen: ResumenDeSeguimientos
}

export type ResumenDeSeguimientos = {
  enCadencia: number
  vencidos: number
  hoy: number
  proximos: number
  largos: number
  fuera: number
  /** Plata potencial de lo que sigue en cadencia. No es forecast: es lo que hay. */
  valorEnJuego: number
  moneda: string
  /** Cuántos leads pasaron por cada toque, para ver dónde se cae la cadencia. */
  porToque: { orden: number; nombre: string; activos: number; vencidos: number }[]
}

export async function pipelineDeSeguimientos(
  alcance: Alcance,
  hoy: string,
  monedaBase = 'USD',
): Promise<Pipeline> {
  const cadencia = await toques()
  const [activos, largos, fuera] = await Promise.all([
    tarjetas(alcance, hoy, ['activo']),
    tarjetas(alcance, hoy, ['largo']),
    tarjetas(alcance, hoy, ['fuera']),
  ])

  const columnas: Columna[] = cadencia.map((t) => ({
    toque: t,
    tarjetas: activos.filter((a) => a.toque === t.orden)
      .sort((a, b) => b.atraso - a.atraso || a.nombre.localeCompare(b.nombre)),
  }))

  const cuenta = (u: Urgencia) => activos.filter((a) => a.urgencia === u).length
  const largosQueTocan = largos.filter((l) => l.urgencia === 'vencido' || l.urgencia === 'hoy').length

  return {
    columnas, largos, fuera,
    resumen: {
      enCadencia: activos.length,
      vencidos: cuenta('vencido'),
      hoy: cuenta('hoy') + largosQueTocan,
      proximos: cuenta('proximo'),
      largos: largos.length,
      fuera: fuera.length,
      valorEnJuego: activos
        .filter((a) => a.moneda === monedaBase)
        .reduce((s, a) => s + (a.valorPotencial ?? 0), 0),
      moneda: monedaBase,
      porToque: columnas.map((c) => ({
        orden: c.toque.orden,
        nombre: c.toque.nombre,
        activos: c.tarjetas.length,
        vencidos: c.tarjetas.filter((t) => t.urgencia === 'vencido').length,
      })),
    },
  }
}

/**
 * Lo que le toca hoy a alguien.
 *
 * Es lo que alimenta el aviso de las 8 de la mañana y la tarjeta del Tracker.
 * Incluye los vencidos: si sólo mostrara los de hoy, un día de vacaciones
 * borraría el trabajo en vez de acumularlo.
 */
export async function toquesDeHoy(alcance: Alcance, hoy: string): Promise<Tarjeta[]> {
  const [activos, largos] = await Promise.all([
    tarjetas(alcance, hoy, ['activo']),
    tarjetas(alcance, hoy, ['largo']),
  ])
  return [...activos, ...largos]
    .filter((t) => t.urgencia === 'vencido' || t.urgencia === 'hoy')
    .sort((a, b) => b.atraso - a.atraso)
}

export type Interaccion = {
  id: number
  toque: number
  toqueNombre: string | null
  estado: EstadoToque
  nota: string | null
  usuario: string | null
  cuando: string
}

export async function interaccionesDelLead(leadId: number): Promise<Interaccion[]> {
  const f = await filas<Record<string, any>>(
    `select i.id, i.toque, i.estado, i.nota, i.creado_en, u.nombre as usuario, t.nombre as toque_nombre
       from seguimiento_interacciones i
       left join usuarios u on u.id = i.usuario_id
       left join seguimiento_toques t on t.orden = i.toque
      where i.lead_id = $1
      order by i.creado_en desc, i.id desc`,
    [leadId],
  )
  return f.map((x) => ({
    id: x.id, toque: Number(x.toque), toqueNombre: x.toque_nombre, estado: x.estado,
    nota: x.nota, usuario: x.usuario, cuando: x.creado_en.toISOString(),
  }))
}

export type EstadoDelLead = {
  toque: number
  toqueNombre: string | null
  fecha: string
  atraso: number
  urgencia: Urgencia
  situacion: Situacion
  fechaLarga: string | null
  ingresoEn: string
}

export async function seguimientoDelLead(leadId: number, hoy: string): Promise<EstadoDelLead | null> {
  const x = await fila<Record<string, any>>(
    `select se.*, t.nombre as toque_nombre
       from seguimiento_estado se
       left join seguimiento_toques t on t.orden = se.toque_actual
      where se.lead_id = $1`,
    [leadId],
  )
  if (!x) return null

  const cadencia = await toques()
  const fecha = x.situacion === 'largo' && x.fecha_larga
    ? x.fecha_larga
    : fechaDelToque(cadencia, Number(x.toque_actual), x.desde)
  const v = comoViene(fecha, hoy)

  return {
    toque: Number(x.toque_actual), toqueNombre: x.toque_nombre,
    fecha: v.fecha, atraso: v.atraso, urgencia: v.urgencia,
    situacion: x.situacion, fechaLarga: x.fecha_larga, ingresoEn: x.ingreso_en,
  }
}

// ── La cadencia, editable ───────────────────────────────────────────────────

/**
 * Cambiar los días y los nombres de los toques.
 *
 * El pedido era poder cargarlos rápido. Y hace falta de verdad: en tres meses,
 * cuando se vea qué toque convierte, esta tabla va a cambiar — y que cambiarla
 * exija un deploy es lo que hace que no cambie nunca.
 */
export async function guardarCadencia(
  lineas: { orden: number; nombre: string; dias: number; activo: boolean }[],
  usuarioId: number,
): Promise<void> {
  await enTransaccion(async (cx) => {
    for (const l of lineas) {
      await escribir(
        `insert into seguimiento_toques (orden, nombre, dias, activo) values ($1,$2,$3,$4)
         on conflict (orden) do update
            set nombre = excluded.nombre, dias = excluded.dias, activo = excluded.activo`,
        [l.orden, l.nombre, l.dias, l.activo], { esperadas: 1, cliente: cx },
      )
    }
    await anotar([{ entidad: 'config', entidadId: 0, campo: 'cadencia de seguimientos',
                    anterior: null, nuevo: `${lineas.length} toques` }], usuarioId, cx)
  })
}
