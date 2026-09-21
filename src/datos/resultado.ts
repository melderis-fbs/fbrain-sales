import 'server-only'
import { escribir, escribirDevolviendo, fila, enTransaccion } from '@/lib/db'
import { oNulo } from '@/lib/texto'
import { anotar, type Cambio } from './cambios'
import { entrarAlPipeline, salirDelPipeline } from './seguimientos'
import type { Estado, Resultado, MotivoPerdida } from '@/dominio/resultados'

/**
 * Qué pasó con la llamada.
 *
 * Dos ejes distintos y mezclarlos es lo que hace que después no se pueda
 * contestar «cuántas asistencias hubo» sin discutir:
 *
 *   ESTADO     qué pasó con la reunión  (vino, no vino, se canceló)
 *   RESULTADO  qué pasó con la venta    (compró, señó, quedó abierto, se perdió)
 *
 * El setter carga lo de arriba de la ficha antes de la llamada; el closer entra
 * el día de la reunión y completa esto. Son dos momentos y dos personas, y el
 * formulario lo refleja.
 */

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

const CAMPOS = [
  { clave: 'estado', columna: 'estado' },
  { clave: 'resultado', columna: 'resultado' },
  { clave: 'huboOferta', columna: 'hubo_oferta' },
  { clave: 'motivoPerdida', columna: 'motivo_perdida' },
  { clave: 'proximoContacto', columna: 'proximo_contacto' },
  { clave: 'proximoPaso', columna: 'proximo_paso' },
  { clave: 'observaciones', columna: 'observaciones' },
] as const

/**
 * Cargar el resultado de un lead.
 *
 * Tres cosas que no son obvias y son la mitad del sistema:
 *
 *  - La SEÑA no cierra nada. Deja el lead abierto y crea una fila en `senias`
 *    con su saldo y su fecha comprometida. No es facturación y no es cash: se
 *    ve en su propia tarjeta hasta que se convierte.
 *  - Una VENTA crea la fila en `ventas`; el cobro se carga aparte en `pagos`.
 *    Facturación y cash collected no son el mismo número.
 *  - Marcar «seguimiento» mete el lead en el pipeline de 12 toques solo. Si
 *    hiciera falta acordarse de una segunda acción, la mitad de los leads en
 *    seguimiento no estarían en el pipeline y nadie sabría cuáles.
 */
export async function cargarResultado(
  leadId: number,
  datos: ResultadoCargado,
  usuarioId: number,
): Promise<void> {
  const antes = await fila<Record<string, unknown>>(
    `select ${CAMPOS.map((c) => c.columna).join(', ')} from leads where id = $1 and borrado_en is null`,
    [leadId],
  )
  if (!antes) throw new Error('Ese lead no existe.')

  const sets: string[] = []
  const valores: unknown[] = []
  const anotaciones: Cambio[] = []
  const p = (v: unknown): string => { valores.push(v); return `$${valores.length}` }

  for (const campo of CAMPOS) {
    const nuevo = (datos as Record<string, unknown>)[campo.clave]
    if (nuevo === undefined) continue
    const anterior = antes[campo.columna] ?? null
    const normalizado = typeof nuevo === 'string' ? oNulo(nuevo) : nuevo
    if (String(anterior ?? '') === String(normalizado ?? '')) continue

    sets.push(`${campo.columna} = ${p(normalizado)}`)
    anotaciones.push({
      entidad: 'lead', entidadId: leadId, campo: campo.clave,
      anterior: anterior === null ? null : String(anterior),
      nuevo: normalizado === null || normalizado === undefined ? null : String(normalizado),
    })
  }

  await enTransaccion(async (cx) => {
    if (sets.length > 0) {
      await escribir(
        `update leads set ${sets.join(', ')}, actualizado_en = now()
          where id = ${p(leadId)} and borrado_en is null`,
        valores, { esperadas: 1, cliente: cx },
      )
    }

    if (datos.venta) {
      const v = await escribirDevolviendo<{ id: number }>(
        `insert into ventas (lead_id, importe, moneda, fecha, programa, creado_por)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [leadId, datos.venta.importe, datos.venta.moneda, datos.venta.fecha,
         oNulo(datos.venta.programa), usuarioId],
        cx,
      )
      anotaciones.push({
        entidad: 'venta', entidadId: leadId, campo: 'importe',
        anterior: null, nuevo: `${datos.venta.moneda} ${datos.venta.importe}`,
      })

      // Si venía de una seña, la seña se convierte y su importe pasa a ser el
      // primer pago de esta venta. Así el dinero se cuenta una vez: no dos, y
      // no cero.
      const abierta = await fila<{ id: number; importe: number; moneda: string; fecha: string }>(
        `select id, importe, moneda, fecha from senias
          where lead_id = $1 and estado = 'abierta' and borrado_en is null
          order by fecha limit 1`,
        [leadId], cx,
      )
      if (abierta) {
        await escribir(`update senias set estado = 'convertida', venta_id = $1 where id = $2`,
          [v.id, abierta.id], { esperadas: 1, cliente: cx })
        await escribir(
          `insert into pagos (venta_id, importe, moneda, fecha, origen, estado)
           values ($1, $2, $3, $4, 'sena', 'cobrado')`,
          [v.id, abierta.importe, abierta.moneda, abierta.fecha], { esperadas: 1, cliente: cx },
        )
        anotaciones.push({ entidad: 'sena', entidadId: leadId, campo: 'estado',
                           anterior: 'abierta', nuevo: 'convertida' })
      }
    }

    if (datos.sena) {
      await escribir(
        `insert into senias (lead_id, importe, moneda, fecha, saldo_pendiente, fecha_comprometida, creado_por)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [leadId, datos.sena.importe, datos.sena.moneda, datos.sena.fecha,
         datos.sena.saldoPendiente ?? null, oNulo(datos.sena.fechaComprometida), usuarioId],
        { esperadas: 1, cliente: cx },
      )
      anotaciones.push({ entidad: 'sena', entidadId: leadId, campo: 'importe',
                         anterior: null, nuevo: `${datos.sena.moneda} ${datos.sena.importe}` })
    }

    // El pipeline de seguimientos se mueve solo con el resultado.
    if (datos.resultado === 'seguimiento') await entrarAlPipeline(leadId, cx)
    if (datos.resultado === 'venta' || datos.resultado === 'perdida' || datos.resultado === 'no_calificado') {
      await salirDelPipeline(leadId, cx)
    }

    await anotar(anotaciones, usuarioId, cx)
  })
}

/** Registrar un cobro de una venta. Esto —y no la venta— es el cash collected. */
export async function registrarPago(
  leadId: number,
  datos: { importe: number; moneda: string; fecha: string; medio?: string | null; nCuota?: number | null },
  usuarioId: number,
): Promise<void> {
  const venta = await fila<{ id: number }>(
    `select id from ventas where lead_id = $1 and borrado_en is null order by fecha desc limit 1`,
    [leadId],
  )
  if (!venta) throw new Error('No hay una venta cargada en este lead: un cobro tiene que ser de algo.')

  await enTransaccion(async (cx) => {
    await escribir(
      `insert into pagos (venta_id, importe, moneda, fecha, medio, n_cuota, origen, estado)
       values ($1,$2,$3,$4,$5,$6,'cuota','cobrado')`,
      [venta.id, datos.importe, datos.moneda, datos.fecha, oNulo(datos.medio), datos.nCuota ?? null],
      { esperadas: 1, cliente: cx },
    )
    await anotar([{ entidad: 'venta', entidadId: leadId, campo: 'cobro',
                    anterior: null, nuevo: `${datos.moneda} ${datos.importe}` }], usuarioId, cx)
  })
}
