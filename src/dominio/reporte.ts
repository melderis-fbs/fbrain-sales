import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_SALIDA, NOMBRE_DE_MOTIVO,
  type Estado, type Salida, type MotivoPerdida, type TipoSesion,
} from './resultados'

/**
 * El reporte de una llamada, como lo piensa el closer.
 *
 * Antes esto vivía en dos lados y ninguno era el suyo: el Tracker, que es un
 * tablero de dirección con quince números arriba, y la ficha del lead, con una
 * pestaña de catorce campos donde los de la venta y los de la pérdida
 * convivían. El que sale de una llamada y tiene otra en diez minutos no
 * recorre nada de eso: reporta o no reporta, y lo que no se reporta en el
 * momento no se reporta.
 *
 * Son cinco preguntas y van en este orden porque es el orden en que pasaron
 * las cosas: si vino, si se llegó a mostrar el precio, en qué quedó, qué hay
 * que contarle al equipo y —si vendió— con qué se puede analizar la llamada.
 * Cada paso depende del anterior: al que no vino no se le pregunta el
 * resultado, y al que se perdió no se le pide el importe.
 */

export const PASOS = ['asistencia', 'oferta', 'resultado', 'notas', 'transcripcion'] as const
export type Paso = (typeof PASOS)[number]

export const NOMBRE_DE_PASO: Record<Paso, string> = {
  asistencia: 'Asistencia',
  oferta: 'Oferta',
  resultado: 'Resultado',
  notas: 'Reporte de la llamada',
  transcripcion: 'Transcripción',
}

export const AYUDA_DE_PASO: Record<Paso, string> = {
  asistencia: '¿Vino a la reunión?',
  oferta: '¿Se llegó a presentar el precio?',
  resultado: '¿En qué quedó?',
  notas: 'El reporte que va al canal. El sistema arma el formato; vos escribís lo que pasó.',
  transcripcion: 'Para poder analizar la llamada después. Se pega entera.',
}

/**
 * Un paso que no aplica no se dibuja.
 *
 * A quien no vino no se le pregunta si mostró el precio ni en qué quedó: la
 * respuesta ya la sabemos y preguntarla es la clase de campo que se completa
 * con cualquier cosa para poder seguir.
 */
export function pasosQueAplican(estado: Estado, salida: Salida): Paso[] {
  if (estado !== 'asistio') return ['asistencia', 'notas']
  const hubo: Paso[] = ['asistencia', 'oferta', 'resultado', 'notas']
  // La transcripción sólo se pide donde sirve de verdad: es un texto largo, y
  // pedirlo en las seis salidas lo convierte en un campo que nadie completa.
  return salida === 'venta' || salida === 'sena' || salida === 'segunda'
    ? [...hubo, 'transcripcion']
    : hubo
}

/** Qué dato extra pide cada resultado. Es lo único que cambia entre uno y otro. */
export type Pide = 'venta' | 'sena' | 'segunda' | 'volverEl' | 'motivo' | null

export const PIDE_DE_SALIDA: Record<Salida, Pide> = {
  pendiente: null,
  venta: 'venta',
  sena: 'sena',
  segunda: 'segunda',
  seguimiento_largo: 'volverEl',
  seguimiento_cadencia: null,
  perdida: 'motivo',
  no_calificado: null,
}

/**
 * El mensaje que va al canal.
 *
 * Seis renglones con sus rótulos, siempre los mismos y siempre en el mismo
 * orden, aunque alguno quede vacío. Es el formato que el equipo ya usa, y el
 * motivo por el que lo arma el sistema es el mismo por el que los motivos de
 * pérdida son una lista cerrada: tres personas escribiendo el mismo reporte
 * de tres maneras distintas es un canal que no se puede leer de corrido ni
 * buscar.
 *
 * Tres renglones los sabe el sistema —el tipo de llamada, el lead y el
 * estado— y tres los escribe el closer: el resumen, la oferta y los próximos
 * pasos. El que se calcula es el estado: que «seguimiento largo» se escriba
 * siempre igual es lo que hace que después se pueda contar.
 */
export type ParaSlack = {
  tipoSesion: TipoSesion
  fuente: string | null
  lead: string
  resumen: string | null
  oferta: string | null
  estado: Estado
  salida: Salida
  importe: number | null
  moneda: string
  programa: string | null
  motivoPerdida: MotivoPerdida | null
  /** Si quedó en seguimiento largo, el día en que hay que volver. */
  volverEl: string | null
  /** Si quedó una segunda llamada, cuándo es. */
  fechaSegunda: string | null
  proximosPasos: string | null
}

const MILES = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** «2027-01-05» → «05/01/2027». Sin `Date`, que corre la fecha un día. */
function dia(iso: string | null): string | null {
  if (iso === null) return null
  const [a, m, d] = iso.slice(0, 10).split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

/**
 * Cómo se nombra cada llamada en el canal.
 *
 * «Primera sesión» es como lo llama la base; «Llamada de venta» es como lo
 * llama el equipo. Los reportes los leen personas, así que gana el segundo.
 */
export const LLAMADA_DE: Record<TipoSesion, string> = {
  primera: 'Llamada de venta',
  segunda: 'Segunda llamada',
  seguimiento: 'Llamada de seguimiento',
  onboarding: 'Onboarding',
  otra: 'Llamada',
}

/** El renglón de estado, que es el único que se calcula. */
export function estadoEnUnaLinea(d: ParaSlack): string {
  if (d.estado !== 'asistio') return NOMBRE_DE_ESTADO[d.estado]

  const plata = d.importe !== null && d.importe > 0
    ? `${MILES.format(d.importe)} ${d.moneda}` : null

  switch (d.salida) {
    case 'venta':
      return ['Venta', d.programa, plata].filter(Boolean).join(' · ')
    case 'sena':
      return ['Seña', plata].filter(Boolean).join(' · ')
    case 'segunda': {
      const cuando = dia(d.fechaSegunda)
      return cuando ? `Segunda llamada · ${cuando}` : 'Segunda llamada'
    }
    case 'seguimiento_largo': {
      const cuando = dia(d.volverEl)
      return cuando ? `Seguimiento largo · vuelve el ${cuando}` : 'Seguimiento largo'
    }
    case 'seguimiento_cadencia':
      return 'Seguimiento · 12 toques'
    case 'perdida':
      return d.motivoPerdida
        ? `Perdido · ${NOMBRE_DE_MOTIVO[d.motivoPerdida]}`
        : 'Perdido'
    default:
      return NOMBRE_DE_SALIDA[d.salida]
  }
}

export function textoParaSlack(d: ParaSlack): string {
  const tipo = [LLAMADA_DE[d.tipoSesion], d.fuente?.toUpperCase()].filter(Boolean).join(' ')
  // Un rótulo sin nada al lado va igual, y sin el espacio que sobra: el bloque
  // se lee por su forma, y un renglón que falta obliga a contar cuál falta.
  const renglon = (rotulo: string, valor: string | null) =>
    valor && valor.trim() !== '' ? `${rotulo}: ${valor.trim()}` : `${rotulo}:`

  return [
    renglon('Tipo de llamada', tipo),
    renglon('Nombre del lead', d.lead),
    renglon('Resumen de la llamada', d.resumen),
    renglon('Oferta', d.oferta),
    renglon('Estado', estadoEnUnaLinea(d)),
    renglon('Próximos pasos', d.proximosPasos),
  ].join('\n')
}
