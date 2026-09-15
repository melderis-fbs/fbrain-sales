/**
 * El embudo, de agendadas a cobrado.
 *
 * Función pura: recibe los conteos y devuelve las etapas con su porcentaje de
 * paso. No sabe de base de datos, y por eso se puede probar sin una.
 *
 * Los porcentajes son de PASO, no sobre el total: 83 asistidas sobre 100
 * agendadas es 83%, y 76 ofertas sobre 83 asistidas es 91%. Un porcentaje
 * siempre contra la etapa anterior, porque eso es lo que dice dónde se pierde.
 */

export type Conteos = {
  agendadas: number
  asistidas: number
  ofertas: number
  senas: number
  ventas: number
}

export type Etapa = {
  clave: keyof Conteos
  etiqueta: string
  cantidad: number
  /** Porcentaje de paso desde la etapa anterior. null en la primera. */
  paso: number | null
}

const ETIQUETAS: Record<keyof Conteos, string> = {
  agendadas: 'Agendadas',
  asistidas: 'Asistidas',
  ofertas: 'Ofertas',
  senas: 'Señas',
  ventas: 'Ventas',
}

const ORDEN: (keyof Conteos)[] = ['agendadas', 'asistidas', 'ofertas', 'senas', 'ventas']

export function embudo(c: Conteos): Etapa[] {
  return ORDEN.map((clave, i) => {
    const anterior = i === 0 ? null : c[ORDEN[i - 1]!]
    return {
      clave,
      etiqueta: ETIQUETAS[clave],
      cantidad: c[clave],
      paso: anterior === null || anterior === 0 ? null : redondear((c[clave] / anterior) * 100),
    }
  })
}

/**
 * Una tasa, o null.
 *
 * Nunca cero cuando el denominador es cero. «0% de asistencia» sobre cero
 * agendadas es una afirmación falsa con apariencia de dato.
 */
export function tasa(parte: number, total: number): number | null {
  if (total === 0) return null
  return redondear((parte / total) * 100)
}

export function redondear(n: number, decimales = 1): number {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}
