import 'server-only'
import { filas } from '@/lib/db'
import { tasaSuavizada, MINIMO_PARA_PUBLICAR } from '@/motor/ajuste'
import { tasasGenerales } from './equipo'
import type { Rango } from '@/motor/periodos'

/**
 * Qué closer cierra mejor qué tipo de lead.
 *
 * La promesa fácil acá es un algoritmo que asigne leads solo. La promesa
 * honesta es esta tabla, que dice qué se sabe y —sobre todo— qué no.
 *
 * Con el volumen de un equipo de dos closers, «Kevin cierra mejor los de
 * e-commerce» suele ser cuatro llamadas. Por eso cada celda trae su cantidad y
 * su nivel de confianza, y por debajo del mínimo no se publica una tasa: un
 * número que se mueve treinta puntos con una venta más se lee igual que uno
 * sólido, y es lo que hace que alguien reparta leads con una moneda creyendo
 * que usa datos.
 */

export type Confianza = 'ninguna' | 'baja' | 'media' | 'alta'

export function confianzaDe(asistencias: number): Confianza {
  if (asistencias < MINIMO_PARA_PUBLICAR) return 'ninguna'
  if (asistencias < 15) return 'baja'
  if (asistencias < 40) return 'media'
  return 'alta'
}

export const NOMBRE_DE_CONFIANZA: Record<Confianza, string> = {
  ninguna: 'sin datos suficientes',
  baja: 'confianza baja',
  media: 'confianza media',
  alta: 'confianza alta',
}

export type Celda = {
  segmento: string
  closerId: number
  closer: string
  asistencias: number
  ventas: number
  /** Cierre crudo. null cuando no alcanza para publicarlo. */
  tasa: number | null
  /** Cierre suavizado contra la tasa general: es el que se puede comparar. */
  ajustado: number | null
  confianza: Confianza
}

export type Dimension = 'industria' | 'fuente' | 'funnel' | 'calidad'

export const DIMENSIONES: { clave: Dimension; nombre: string; ayuda: string }[] = [
  { clave: 'industria', nombre: 'Industria', ayuda: 'Se carga a mano en la ficha del lead.' },
  { clave: 'fuente', nombre: 'Fuente', ayuda: 'De dónde llegó el lead.' },
  { clave: 'funnel', nombre: 'Funnel', ayuda: 'Por qué embudo entró.' },
  { clave: 'calidad', nombre: 'Lead Quality', ayuda: 'El nivel que le puso el setter antes de la llamada.' },
]

const COLUMNA: Record<Dimension, string> = {
  industria: `coalesce(nullif(btrim(l.industria), ''), 'Sin industria')`,
  fuente: `coalesce(fu.nombre, 'Sin fuente')`,
  funnel: `coalesce(fn.nombre, 'Sin funnel')`,
  calidad: `coalesce(
    (select q.nivel from lead_quality q where q.lead_id = l.id and q.congelado
      order by q.creado_en desc limit 1),
    (select q.nivel from lead_quality q where q.lead_id = l.id
      order by q.creado_en desc limit 1),
    'sin calificar')`,
}

export type Matriz = {
  dimension: Dimension
  segmentos: string[]
  closers: { id: number; nombre: string }[]
  celdas: Celda[]
  /** La tasa general de la operación, que es contra la que se compara todo. */
  general: number
  asistenciasTotales: number
}

export async function matriz(dimension: Dimension, rango: Rango): Promise<Matriz> {
  const generales = await tasasGenerales(rango.hasta, 12)

  const f = await filas<Record<string, any>>(
    `select ${COLUMNA[dimension]} as segmento,
            c.id as closer_id, c.nombre as closer,
            count(*) as asistencias,
            count(*) filter (where l.resultado = 'venta') as ventas
       from leads l
       join closers c on c.id = l.closer_id
       left join fuentes fu on fu.id = l.fuente_id
       left join funnels fn on fn.id = l.funnel_id
      where l.borrado_en is null and l.estado = 'asistio'
        and l.fecha_sesion between $1 and $2
      group by 1, 2, 3
      order by 1, 3`,
    [rango.desde, rango.hasta],
  )

  const celdas: Celda[] = f.map((x) => {
    const asistencias = Number(x.asistencias)
    const ventas = Number(x.ventas)
    const confianza = confianzaDe(asistencias)
    return {
      segmento: x.segmento,
      closerId: x.closer_id,
      closer: x.closer,
      asistencias,
      ventas,
      tasa: confianza === 'ninguna' ? null : Math.round((ventas / asistencias) * 1000) / 10,
      ajustado: confianza === 'ninguna' ? null
        : Math.round(tasaSuavizada(ventas, asistencias, generales.general) * 1000) / 10,
      confianza,
    }
  })

  const segmentos = [...new Set(celdas.map((c) => c.segmento))].sort()
  const closers = [...new Map(celdas.map((c) => [c.closerId, { id: c.closerId, nombre: c.closer }])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return {
    dimension, segmentos, closers, celdas,
    general: Math.round(generales.general * 1000) / 10,
    asistenciasTotales: celdas.reduce((s, c) => s + c.asistencias, 0),
  }
}

/**
 * Lo que se puede afirmar hoy.
 *
 * Sólo las parejas donde hay con qué. Si la lista sale vacía, la pantalla lo
 * dice: es la respuesta correcta cuando todavía no hay volumen, y es mejor que
 * una tabla llena de números que nadie debería usar.
 */
export function loQueSeSabe(m: Matriz): { texto: string; diferencia: number }[] {
  const conclusiones: { texto: string; diferencia: number }[] = []

  for (const segmento of m.segmentos) {
    const delSegmento = m.celdas
      .filter((c) => c.segmento === segmento && c.ajustado !== null)
      .sort((a, b) => (b.ajustado ?? 0) - (a.ajustado ?? 0))
    if (delSegmento.length < 2) continue

    const mejor = delSegmento[0]!
    const peor = delSegmento[delSegmento.length - 1]!
    const diferencia = Math.round(((mejor.ajustado ?? 0) - (peor.ajustado ?? 0)) * 10) / 10
    // Menos de 5 puntos entre el mejor y el peor no es una diferencia: es ruido
    // con dos decimales.
    if (diferencia < 5) continue

    conclusiones.push({
      diferencia,
      texto: `En «${segmento}», ${mejor.closer} cierra ${mejor.ajustado}% y ${peor.closer} ${peor.ajustado}% ` +
             `(${mejor.asistencias} y ${peor.asistencias} asistencias).`,
    })
  }

  return conclusiones.sort((a, b) => b.diferencia - a.diferencia)
}
