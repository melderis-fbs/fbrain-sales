import 'server-only'
import { escribir, escribirDevolviendo, fila, filas, enTransaccion } from '@/lib/db'
import { oNulo } from '@/lib/texto'
import { condicionDeAlcance, type Alcance } from '@/lib/permisos'
import type { TipoSesion, Resultado } from '@/dominio/resultados'

/**
 * Las llamadas de un lead.
 *
 * Un lead puede tener una llamada o tres, y eso no lo convierte en tres leads.
 * La transcripción vive en su propia tabla para que ninguna lista se la lleve
 * al navegador: son cuarenta mil caracteres por llamada.
 */

export type Llamada = {
  id: number
  leadId: number
  lead: string
  numero: number
  fecha: string | null
  duracionSeg: number | null
  tipoSesion: TipoSesion
  asistio: boolean
  resultado: Resultado | null
  closer: string | null
  closerId: number | null
  ciclo: number
  tieneTranscripcion: boolean
  analisisId: number | null
  estadoAnalisis: string | null
  score: number | null
}

const SELECT = `
  select ll.id, ll.lead_id, l.nombre as lead, ll.numero, ll.fecha, ll.duracion_seg,
         ll.tipo_sesion, ll.asistio, ll.resultado, ll.ciclo, ll.closer_id, c.nombre as closer,
         exists (select 1 from transcripciones t where t.llamada_id = ll.id) as tiene_transcripcion,
         a.id as analisis_id, a.estado as estado_analisis, cs.score
    from llamadas ll
    join leads l on l.id = ll.lead_id and l.borrado_en is null
    left join closers c on c.id = ll.closer_id
    left join lateral (select * from analisis a2 where a2.llamada_id = ll.id
                        order by a2.creado_en desc, a2.id desc limit 1) a on true
    left join lateral (select score from call_scores cs2
                        where cs2.analisis_id = a.id and cs2.vigente
                        order by cs2.creado_en desc limit 1) cs on true`

function aLlamada(x: Record<string, any>): Llamada {
  return {
    id: x.id, leadId: x.lead_id, lead: x.lead, numero: Number(x.numero), fecha: x.fecha,
    duracionSeg: x.duracion_seg === null ? null : Number(x.duracion_seg),
    tipoSesion: x.tipo_sesion, asistio: x.asistio, resultado: x.resultado,
    closer: x.closer, closerId: x.closer_id, ciclo: Number(x.ciclo),
    tieneTranscripcion: x.tiene_transcripcion,
    analisisId: x.analisis_id, estadoAnalisis: x.estado_analisis,
    score: x.score === null || x.score === undefined ? null : Number(x.score),
  }
}

export async function llamadasDelLead(leadId: number): Promise<Llamada[]> {
  const f = await filas<Record<string, any>>(
    `${SELECT} where ll.lead_id = $1 order by ll.numero desc, ll.id desc`, [leadId],
  )
  return f.map(aLlamada)
}

export async function verLlamada(id: number): Promise<Llamada | null> {
  const f = await fila<Record<string, any>>(`${SELECT} where ll.id = $1`, [id])
  return f ? aLlamada(f) : null
}

export type FiltrosDeLlamada = { closerId?: number; desde?: string; hasta?: string; conTranscripcion?: boolean; sinAnalizar?: boolean }

export async function listarLlamadas(
  alcance: Alcance,
  filtros: FiltrosDeLlamada = {},
  limite = 200,
): Promise<Llamada[]> {

  const valores: unknown[] = []
  const condiciones: string[] = []
  const alc = condicionDeAlcance(alcance, { closer: 'll.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 1)
  valores.push(...alc.parametros)
  condiciones.push(alc.condicion)

  if (filtros.closerId !== undefined) { valores.push(filtros.closerId); condiciones.push(`ll.closer_id = $${valores.length}`) }
  if (filtros.desde) { valores.push(filtros.desde); condiciones.push(`ll.fecha >= $${valores.length}`) }
  if (filtros.hasta) { valores.push(filtros.hasta); condiciones.push(`ll.fecha <= $${valores.length}`) }
  if (filtros.conTranscripcion) condiciones.push(`exists (select 1 from transcripciones t2 where t2.llamada_id = ll.id)`)
  if (filtros.sinAnalizar) condiciones.push(`a.id is null`)

  valores.push(limite)

  const f = await filas<Record<string, any>>(
    `${SELECT} where ${condiciones.join(' and ')}
      order by ll.fecha desc nulls last, ll.id desc limit $${valores.length}`,
    valores,
  )
  return f.map(aLlamada)
}

export async function crearLlamada(
  leadId: number,
  datos: { closerId?: number | null; fecha?: string | null; duracionSeg?: number | null
           tipoSesion?: TipoSesion; asistio?: boolean },
): Promise<number> {
  return enTransaccion(async (cx) => {
    const n = await fila<{ n: number }>(
      'select coalesce(max(numero), 0) + 1 as n from llamadas where lead_id = $1', [leadId], cx,
    )
    // El ciclo y el closer salen del lead: una llamada sin closer no se puede
    // atribuir, y una llamada sin ciclo no se puede leer después de una repesca.
    const l = await fila<{ closer_id: number | null; ciclo: number }>(
      'select closer_id, ciclo from leads where id = $1', [leadId], cx,
    )
    const creada = await escribirDevolviendo<{ id: number }>(
      `insert into llamadas (lead_id, closer_id, numero, fecha, duracion_seg, tipo_sesion, asistio, ciclo)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [leadId, datos.closerId ?? l?.closer_id ?? null, n?.n ?? 1,
       oNulo(datos.fecha), datos.duracionSeg ?? null,
       datos.tipoSesion ?? 'primera', datos.asistio ?? true, l?.ciclo ?? 1],
      cx,
    )
    return creada.id
  })
}

// ── Transcripciones ─────────────────────────────────────────────────────────

export type Transcripcion = { id: number; texto: string; caracteres: number; origen: string; creadoEn: string }

export async function transcripcionDe(llamadaId: number): Promise<Transcripcion | null> {
  const f = await fila<{ id: number; texto: string; caracteres: number; origen: string; creado_en: Date }>(
    `select id, texto, caracteres, origen, creado_en from transcripciones
      where llamada_id = $1 order by creado_en desc, id desc limit 1`,
    [llamadaId],
  )
  return f ? { id: f.id, texto: f.texto, caracteres: Number(f.caracteres), origen: f.origen,
               creadoEn: f.creado_en.toISOString() } : null
}

/**
 * Guardar una transcripción pegada a mano.
 *
 * Es cómo entra hoy: la reunión se graba en Google Meet, la transcripción se
 * copia y se pega. Automatizarlo es una integración más; poder analizar la
 * llamada de ayer es hoy.
 */
export async function guardarTranscripcion(
  llamadaId: number,
  texto: string,
  origen: 'pegado' | 'archivo' | 'automatico',
  usuarioId: number,
): Promise<number> {
  const limpio = texto.trim()
  if (limpio.length < 200) {
    throw new Error('La transcripción es muy corta para analizar: pegá la conversación completa.')
  }
  const creada = await escribirDevolviendo<{ id: number }>(
    `insert into transcripciones (llamada_id, texto, caracteres, origen, subida_por)
     values ($1,$2,$3,$4,$5) returning id`,
    [llamadaId, limpio, limpio.length, origen, usuarioId],
  )
  return creada.id
}

/**
 * Cuánto habló cada uno.
 *
 * Se cuenta en código y NO se le pregunta al modelo. Contar palabras es
 * aritmética: un modelo de lenguaje la hace mal, cuesta plata y encima el
 * resultado cambia entre corridas. La heurística de los turnos es tosca a
 * propósito y lo dice el nombre: reconoce el formato «Nombre:» al principio de
 * la línea, que es cómo vienen las transcripciones de Meet y de Zoom.
 */
export function medirTurnos(texto: string, nombreDelCloser: string | null): {
  turnosCloser: number; turnosProspecto: number; palabrasCloser: number; palabrasProspecto: number
} {
  const lineas = texto.split('\n')
  const marca = /^\s*([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ .'-]{1,40}?)\s*[:\-–]\s*(.*)$/
  const closer = (nombreDelCloser ?? '').trim().toLowerCase().split(/\s+/)[0] ?? ''

  let quien: 'closer' | 'prospecto' | null = null
  const cuenta = { turnosCloser: 0, turnosProspecto: 0, palabrasCloser: 0, palabrasProspecto: 0 }

  for (const linea of lineas) {
    const m = linea.match(marca)
    if (m) {
      const hablante = (m[1] ?? '').toLowerCase()
      const nuevo: 'closer' | 'prospecto' =
        closer !== '' && hablante.includes(closer) ? 'closer' : 'prospecto'
      if (nuevo !== quien) {
        if (nuevo === 'closer') cuenta.turnosCloser++
        else cuenta.turnosProspecto++
        quien = nuevo
      }
      sumar(m[2] ?? '')
    } else if (quien !== null) {
      sumar(linea)
    }
  }

  function sumar(t: string) {
    const palabras = t.trim().split(/\s+/).filter(Boolean).length
    if (quien === 'closer') cuenta.palabrasCloser += palabras
    else if (quien === 'prospecto') cuenta.palabrasProspecto += palabras
  }

  return cuenta
}
