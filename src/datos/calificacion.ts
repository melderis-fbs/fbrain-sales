import 'server-only'
import type { PoolClient } from 'pg'
import { escribir, escribirDevolviendo, fila, filas, enTransaccion } from '@/lib/db'
import { oNulo } from '@/lib/texto'
import { anotar } from './cambios'
import { calidadDelLead, type Calidad } from '@/motor/calidad'
import { CAMPOS_LIBRES, CAMPOS_QUE_PUNTUAN } from '@/dominio/calidad'

/**
 * La calificación del setter y el Lead Quality que sale de ella.
 *
 * Se guarda en dos lugares a propósito y no es duplicación:
 *
 *  - `lead_calificacion` son las RESPUESTAS. Cambian cuando el setter se
 *    entera de algo nuevo.
 *  - `lead_quality` es el SCORE con el que se evaluó. Cada vez que cambian las
 *    respuestas se agrega una fila nueva; las viejas quedan.
 *
 * Y una de esas filas se CONGELA al asignar el closer. Sin eso, el cierre
 * ajustado se puede maquillar: basta con bajarle la calidad a un lead después
 * de perderlo para que el closer quede mejor. Congelado, el número con el que
 * se lo evalúa es el que había cuando recibió el lead.
 */

const COLUMNAS = [
  ...CAMPOS_QUE_PUNTUAN.map((c) => c.clave),
  ...CAMPOS_LIBRES.map((c) => c.clave),
]

export type Respuestas = Record<string, string | null>

export async function calificacionDelLead(leadId: number): Promise<Respuestas> {
  const f = await fila<Record<string, unknown>>(
    `select ${COLUMNAS.join(', ')} from lead_calificacion where lead_id = $1`, [leadId],
  )
  const r: Respuestas = {}
  for (const c of COLUMNAS) r[c] = f?.[c] === null || f?.[c] === undefined ? null : String(f[c])
  return r
}

/**
 * Guardar la calificación y recalcular el Lead Quality de una.
 *
 * De una, y no en un trabajo de fondo: el setter carga la ficha y quiere ver el
 * número. Si tarda, deja de cargarla.
 */
export async function guardarCalificacion(
  leadId: number,
  respuestas: Respuestas,
  usuarioId: number,
): Promise<Calidad> {
  const anteriores = await calificacionDelLead(leadId)
  const valores = COLUMNAS.map((c) => {
    const v = respuestas[c]
    if (v === undefined) return anteriores[c] ?? null
    // `urgencia` y `ticket_actual` son numéricas en la base.
    const limpio = oNulo(v)
    if (limpio === null) return null
    if (c === 'urgencia') return Number(limpio)
    if (c === 'ticket_actual') return Number(limpio.replace(/\./g, '').replace(',', '.'))
    return limpio
  })

  const calidad = calidadDelLead(
    Object.fromEntries(COLUMNAS.map((c, i) => [c, valores[i] as string | number | null])),
  )

  await enTransaccion(async (cx) => {
    const marcadores = COLUMNAS.map((_, i) => `$${i + 2}`).join(', ')
    const actualiza = COLUMNAS.map((c, i) => `${c} = $${i + 2}`).join(', ')
    await escribir(
      `insert into lead_calificacion (lead_id, ${COLUMNAS.join(', ')}, actualizado_por)
       values ($1, ${marcadores}, $${COLUMNAS.length + 2})
       on conflict (lead_id) do update
          set ${actualiza}, actualizado_en = now(), actualizado_por = $${COLUMNAS.length + 2}`,
      [leadId, ...valores, usuarioId], { esperadas: 1, cliente: cx },
    )

    if (calidad.score !== null && calidad.nivel !== null) {
      await escribir(
        `insert into lead_quality (lead_id, score, nivel, aportes, congelado)
         values ($1, $2, $3, $4::jsonb, false)`,
        [leadId, calidad.score, calidad.nivel, JSON.stringify(calidad.aportes)],
        { esperadas: 1, cliente: cx },
      )
    }

    const cambiados = COLUMNAS.filter((c, i) =>
      String(anteriores[c] ?? '') !== String(valores[i] ?? ''))
    if (cambiados.length > 0) {
      await anotar([{
        entidad: 'lead', entidadId: leadId, campo: 'calificación',
        anterior: null,
        nuevo: `${cambiados.length} ${cambiados.length === 1 ? 'campo' : 'campos'}` +
               (calidad.score === null ? '' : ` · quality ${calidad.score}`),
      }], usuarioId, cx)
    }
  })

  return calidad
}

export type QualityGuardado = {
  score: number
  nivel: 'alto' | 'medio' | 'bajo'
  congelado: boolean
  creadoEn: string
}

export async function qualityDelLead(leadId: number): Promise<QualityGuardado | null> {
  const f = await fila<{ score: number; nivel: 'alto' | 'medio' | 'bajo'; congelado: boolean; creado_en: Date }>(
    `select score, nivel, congelado, creado_en from lead_quality
      where lead_id = $1 order by creado_en desc, id desc limit 1`,
    [leadId],
  )
  return f ? { score: Number(f.score), nivel: f.nivel, congelado: f.congelado, creadoEn: f.creado_en.toISOString() } : null
}

/**
 * Congelar el quality al asignarle el lead a un closer.
 *
 * Toma el score vigente y lo marca. Si ya había uno congelado no lo pisa: el
 * lead se evalúa con la calidad que tenía cuando el closer lo recibió, no con
 * la que quedó después.
 */
export async function congelarQuality(leadId: number, cx?: PoolClient): Promise<void> {
  const yaHay = await fila('select 1 from lead_quality where lead_id = $1 and congelado', [leadId])
  if (yaHay) return

  const vigente = await fila<{ id: number }>(
    'select id from lead_quality where lead_id = $1 order by creado_en desc, id desc limit 1', [leadId],
  )
  if (!vigente) return

  await escribir('update lead_quality set congelado = true where id = $1', [vigente.id], { cliente: cx })
}

/** El score congelado, que es con el que se mide al closer. */
export async function qualityCongelado(leadId: number): Promise<QualityGuardado | null> {
  const f = await fila<{ score: number; nivel: 'alto' | 'medio' | 'bajo'; creado_en: Date }>(
    `select score, nivel, creado_en from lead_quality
      where lead_id = $1 and congelado order by creado_en desc limit 1`,
    [leadId],
  )
  return f ? { score: Number(f.score), nivel: f.nivel, congelado: true, creadoEn: f.creado_en.toISOString() } : null
}

/** El historial del score, para ver por qué cambió. */
export async function historialDeQuality(leadId: number): Promise<QualityGuardado[]> {
  const f = await filas<{ score: number; nivel: 'alto' | 'medio' | 'bajo'; congelado: boolean; creado_en: Date }>(
    `select score, nivel, congelado, creado_en from lead_quality
      where lead_id = $1 order by creado_en desc, id desc limit 20`,
    [leadId],
  )
  return f.map((x) => ({
    score: Number(x.score), nivel: x.nivel, congelado: x.congelado, creadoEn: x.creado_en.toISOString(),
  }))
}

/** Recalcular la calidad de un lead desde lo que ya está guardado. */
export async function recalcularCalidad(leadId: number): Promise<Calidad> {
  return calidadDelLead(await calificacionDelLead(leadId) as Record<string, string | null>)
}

export async function crearQualityInicial(leadId: number, usuarioId: number): Promise<void> {
  const calidad = await recalcularCalidad(leadId)
  if (calidad.score === null || calidad.nivel === null) return
  await escribirDevolviendo<{ id: number }>(
    `insert into lead_quality (lead_id, score, nivel, aportes) values ($1,$2,$3,$4::jsonb) returning id`,
    [leadId, calidad.score, calidad.nivel, JSON.stringify(calidad.aportes)],
  )
  await anotar([{ entidad: 'lead', entidadId: leadId, campo: 'lead quality',
                  anterior: null, nuevo: String(calidad.score) }], usuarioId)
}
