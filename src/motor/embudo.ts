/**
 * El embudo, de agendadas a vendidas.
 *
 * Función pura: recibe los conteos y devuelve las etapas con su porcentaje. No
 * sabe de base de datos, y por eso se puede probar sin una.
 *
 * Cada etapa dice CONTRA QUÉ se mide, y no siempre es la de arriba. Eso último
 * era el error: medir cada etapa contra la anterior daba por hecho que todas
 * son pasos obligatorios, y la SEÑA no lo es —la mayoría de las ventas no pasa
 * por ahí—. Con dos señas y doce ventas el tablero mostraba «Ventas · 600% de
 * señas», que no es una exageración: es un número imposible, y un número
 * imposible en la pantalla principal se lleva puesta la confianza en el resto.
 *
 * La seña y la venta se miden las dos sobre las ASISTENCIAS, que es el
 * universo del que salen. La oferta también. Sólo la asistencia se mide sobre
 * lo agendado, que sí es un paso obligatorio.
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
  /** Porcentaje contra su base. null en la primera, que no tiene contra qué. */
  paso: number | null
  /** Contra qué se mide, en palabras: «de las asistencias». */
  sobre: string | null
}

const ETIQUETAS: Record<keyof Conteos, string> = {
  agendadas: 'Agendadas',
  asistidas: 'Asistidas',
  ofertas: 'Ofertas',
  senas: 'Señas',
  ventas: 'Ventas',
}

const ORDEN: (keyof Conteos)[] = ['agendadas', 'asistidas', 'ofertas', 'senas', 'ventas']

/** Contra qué se mide cada etapa. `null` es «contra nada»: es la primera. */
const BASE: Record<keyof Conteos, keyof Conteos | null> = {
  agendadas: null,
  asistidas: 'agendadas',
  ofertas: 'asistidas',
  senas: 'asistidas',
  ventas: 'asistidas',
}

const EN_PALABRAS: Record<keyof Conteos, string> = {
  agendadas: 'de las agendadas',
  asistidas: 'de las asistencias',
  ofertas: 'de las ofertas',
  senas: 'de las señas',
  ventas: 'de las ventas',
}

export function embudo(c: Conteos): Etapa[] {
  return ORDEN.map((clave) => {
    const base = BASE[clave]
    const total = base === null ? null : c[base]
    return {
      clave,
      etiqueta: ETIQUETAS[clave],
      cantidad: c[clave],
      paso: total === null || total === 0 ? null : redondear((c[clave] / total) * 100),
      sobre: base === null ? null : EN_PALABRAS[base],
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
