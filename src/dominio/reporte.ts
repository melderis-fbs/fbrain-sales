import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_SALIDA, NOMBRE_DE_MOTIVO,
  type Estado, type Salida, type MotivoPerdida,
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
  notas: 'Notas para el equipo',
  transcripcion: 'Transcripción',
}

export const AYUDA_DE_PASO: Record<Paso, string> = {
  asistencia: '¿Vino a la reunión?',
  oferta: '¿Se llegó a presentar el precio?',
  resultado: '¿En qué quedó?',
  notas: 'Lo que se manda al canal. Sale armado, se edita antes de copiarlo.',
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

export type ParaSlack = {
  lead: string
  empresa: string | null
  closer: string | null
  fecha: string
  estado: Estado
  salida: Salida
  huboOferta: boolean
  importe: number | null
  moneda: string
  motivoPerdida: MotivoPerdida | null
  proximoPaso: string | null
  notas: string | null
}

const MILES = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/**
 * El mensaje que se manda al canal.
 *
 * Lo arma el sistema y no cada closer, por el mismo motivo por el que los
 * motivos de pérdida son una lista cerrada: tres personas escribiendo el mismo
 * reporte de tres maneras distintas es un canal que no se puede leer de
 * corrido ni buscar. Lo que sí escribe cada uno es lo de abajo, que es lo
 * único que el sistema no sabe.
 */
export function textoParaSlack(d: ParaSlack): string {
  const quien = d.empresa ? `${d.lead} · ${d.empresa}` : d.lead
  const renglones = [
    `*${quien}*`,
    `${d.fecha}${d.closer ? ` · ${d.closer}` : ''}`,
  ]

  if (d.estado !== 'asistio') {
    renglones.push(`Resultado: ${NOMBRE_DE_ESTADO[d.estado]}`)
  } else {
    const plata = d.importe !== null && d.importe > 0
      ? ` · ${MILES.format(d.importe)} ${d.moneda}` : ''
    renglones.push(`Resultado: ${NOMBRE_DE_SALIDA[d.salida]}${plata}`)
    renglones.push(`Oferta presentada: ${d.huboOferta ? 'sí' : 'no'}`)
    if (d.motivoPerdida) renglones.push(`Motivo: ${NOMBRE_DE_MOTIVO[d.motivoPerdida]}`)
  }

  if (d.proximoPaso) renglones.push(`Próximo paso: ${d.proximoPaso}`)
  if (d.notas) renglones.push('', d.notas.trim())

  return renglones.join('\n')
}
