import { sumarDias } from './periodos'

/**
 * La aritmética del pipeline de seguimientos.
 *
 * Los doce toques tienen su día: 0, 1, 3, 7, 10, 15, 21, 35, 45, 60, 70, 80.
 * Pero la fecha de cada uno NO se cuenta desde que el lead entró: se cuenta
 * desde el último toque que se hizo de verdad.
 *
 * La diferencia importa. Con las fechas contadas desde el ingreso, un closer
 * que se toma tres días para el toque 2 abre la pantalla y encuentra los toques
 * 3, 4 y 5 vencidos a la vez. Nadie hace tres toques el mismo día: lo que pasa
 * de verdad es que deja de mirar la pantalla. Recontando desde el último toque
 * real, lo que se conserva es el ESPACIO entre toques, que es lo que la
 * cadencia quiso decir.
 */

export type Toque = { orden: number; nombre: string; dias: number }

/** Los días entre un toque y el anterior. El primero cae el mismo día. */
export function espera(toques: readonly Toque[], orden: number): number {
  const actual = toques.find((t) => t.orden === orden)
  if (!actual) return 0
  const anterior = toques.filter((t) => t.orden < orden).sort((a, b) => b.orden - a.orden)[0]
  return Math.max(0, actual.dias - (anterior?.dias ?? 0))
}

/** Cuándo toca el toque `orden`, contando desde `desde` (el último toque real). */
export function fechaDelToque(toques: readonly Toque[], orden: number, desde: string): string {
  return sumarDias(desde, espera(toques, orden))
}

export type Urgencia = 'vencido' | 'hoy' | 'proximo' | 'espera'

export type Vencimiento = {
  fecha: string
  /** Días de atraso. 0 o negativo cuando todavía no venció. */
  atraso: number
  urgencia: Urgencia
}

/**
 * Cómo viene un toque contra el día de hoy.
 *
 * Cuatro estados y no cinco: «vencido» y «hoy» piden acción, «próximo» avisa
 * que viene en los próximos dos días, «espera» es todo lo demás. Un pipeline
 * donde todo está siempre en algún color es un pipeline donde el color no
 * significa nada.
 */
export function comoViene(fecha: string, hoy: string): Vencimiento {
  const atraso = diasEntre(fecha, hoy)
  const urgencia: Urgencia =
    atraso > 0 ? 'vencido' : atraso === 0 ? 'hoy' : atraso >= -2 ? 'proximo' : 'espera'
  return { fecha, atraso, urgencia }
}

export const COLOR_DE_URGENCIA: Record<Urgencia, 'rojo' | 'acento' | 'ambar' | 'gris'> = {
  vencido: 'rojo',
  hoy: 'acento',
  proximo: 'ambar',
  espera: 'gris',
}

export const NOMBRE_DE_URGENCIA: Record<Urgencia, string> = {
  vencido: 'Vencido',
  hoy: 'Toca hoy',
  proximo: 'En dos días',
  espera: 'En espera',
}

/** Días de `desde` a `hasta`, en aaaa-mm-dd y sin zonas horarias de por medio. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/**
 * El toque siguiente después de registrar una interacción.
 *
 * Devuelve `null` cuando ya se hizo el último: el lead salió de la cadencia y
 * hay que decidir qué hacer con él a mano, no dejarlo girando para siempre.
 */
export function toqueSiguiente(toques: readonly Toque[], actual: number): number | null {
  const siguientes = toques.filter((t) => t.orden > actual).sort((a, b) => a.orden - b.orden)
  return siguientes[0]?.orden ?? null
}
