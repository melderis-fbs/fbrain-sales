import { redondear } from './embudo'
import type { NivelDeCalidad } from '@/dominio/calidad'

/**
 * El cierre ajustado por Lead Quality.
 *
 * El problema que resuelve: un closer que cierra 18% con leads flojos y otro
 * que cierra 22% con leads buenos están ordenados al revés en cualquier tabla
 * que mire el 18 y el 22. Ordenarlos así no es sólo injusto: hace que el closer
 * bueno pida los leads buenos, que es cómo se rompe un equipo.
 *
 * Lo que se hace acá es simple de explicar y esa es la idea: se calcula cuánto
 * DEBERÍA cerrar cualquiera con la mezcla de leads que le tocó, y se compara
 * contra lo que cerró. Índice 1,00 es «rindió lo esperable con lo que recibió».
 *
 * Dos cuidados, los dos por el mismo motivo —los números de un mes son pocos—:
 *
 *  - Las tasas se suavizan contra la tasa general. Un closer con 4 asistencias
 *    y 2 ventas no cierra al 50%: cierra «no sabemos, parece bien».
 *  - Por debajo de un mínimo de asistencias no se publica índice. Un número
 *    ruidoso en una tabla de desempeño se lee igual que uno sólido.
 */

/** Cuántas asistencias «de prestado» pesa la tasa general. */
export const SUAVIZADO = 10

/** Debajo de esto no se publica un índice. */
export const MINIMO_PARA_PUBLICAR = 8

/**
 * Una tasa que no se vuelve loca con pocos casos.
 *
 * 2 de 4 con una tasa general de 20% no da 50%: da 26%. Con 40 asistencias, el
 * suavizado casi no se nota, que es exactamente lo que se quiere.
 */
export function tasaSuavizada(exitos: number, intentos: number, general: number, k = SUAVIZADO): number {
  if (intentos + k === 0) return general
  return (exitos + general * k) / (intentos + k)
}

export type MezclaDeLeads = { nivel: NivelDeCalidad | 'sin_calificar'; asistencias: number; ventas: number }

export type Ajustado = {
  asistencias: number
  ventas: number
  /** Lo que cerró, en porcentaje. null sin asistencias. */
  bruto: number | null
  /** Lo que se esperaría de cualquiera con esa mezcla de leads. */
  esperado: number | null
  /** bruto / esperado. 1,00 es rendir lo esperable. */
  indice: number | null
  /** El cierre bruto llevado a la mezcla promedio de la operación. */
  ajustado: number | null
  /** Por qué no hay índice, cuando no lo hay. */
  porque: string | null
  mezcla: MezclaDeLeads[]
}

/**
 * @param mezcla        Las asistencias y ventas del closer, abiertas por nivel de lead.
 * @param tasasGenerales Tasa de cierre de TODA la operación por nivel de lead.
 * @param tasaGeneral   Tasa de cierre de toda la operación, sin abrir.
 */
export function cierreAjustado(
  mezcla: readonly MezclaDeLeads[],
  tasasGenerales: Record<string, number>,
  tasaGeneral: number,
): Ajustado {
  const asistencias = mezcla.reduce((s, m) => s + m.asistencias, 0)
  const ventas = mezcla.reduce((s, m) => s + m.ventas, 0)
  const bruto = asistencias === 0 ? null : redondear((ventas / asistencias) * 100)

  if (asistencias < MINIMO_PARA_PUBLICAR) {
    return {
      asistencias, ventas, bruto, esperado: null, indice: null, ajustado: null,
      porque: `Con ${asistencias} ${asistencias === 1 ? 'asistencia' : 'asistencias'} el número se mueve demasiado. ` +
              `Desde ${MINIMO_PARA_PUBLICAR} se publica.`,
      mezcla: [...mezcla],
    }
  }

  // Lo esperable: la tasa general de cada nivel, ponderada por cuántos leads de
  // ese nivel le tocaron.
  const esperadoCrudo = mezcla.reduce(
    (s, m) => s + m.asistencias * (tasasGenerales[m.nivel] ?? tasaGeneral),
    0,
  ) / asistencias

  const propia = tasaSuavizada(ventas, asistencias, tasaGeneral)
  const indice = esperadoCrudo === 0 ? null : redondear(propia / esperadoCrudo, 2)

  return {
    asistencias, ventas, bruto,
    esperado: redondear(esperadoCrudo * 100),
    indice,
    // Llevado a la mezcla promedio: qué cerraría este closer si le tocaran los
    // leads que le tocan a todos.
    ajustado: indice === null ? null : redondear(indice * tasaGeneral * 100),
    porque: null,
    mezcla: [...mezcla],
  }
}

export function comoSeLeeElIndice(indice: number): string {
  if (indice >= 1.2) return 'muy por encima de lo esperable'
  if (indice >= 1.05) return 'por encima de lo esperable'
  if (indice >= 0.95) return 'en lo esperable'
  if (indice >= 0.8) return 'por debajo de lo esperable'
  return 'muy por debajo de lo esperable'
}
