/**
 * Los rangos de fecha del tablero.
 *
 * Todo en aaaa-mm-dd y sin `Date` donde se pueda evitar: una fecha que pasa por
 * `new Date('2026-09-01')` vuelve corrida un día en cualquier servidor que no
 * esté en UTC, y ese día de diferencia es el que mueve una venta de mes.
 */

export type Rango = { desde: string; hasta: string; etiqueta: string }

export type NombreDePeriodo =
  | 'hoy' | 'semana' | 'semana_anterior' | 'mes' | 'mes_anterior'
  | 'ultimos_3_meses' | 'anio' | 'personalizado'

export const PERIODOS: { clave: NombreDePeriodo; etiqueta: string }[] = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'semana', etiqueta: 'Semana' },
  { clave: 'semana_anterior', etiqueta: 'Semana anterior' },
  { clave: 'mes', etiqueta: 'Mes' },
  { clave: 'mes_anterior', etiqueta: 'Mes anterior' },
  { clave: 'ultimos_3_meses', etiqueta: 'Últimos 3 meses' },
  { clave: 'anio', etiqueta: 'Año' },
]

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number)
  return [a ?? 1970, m ?? 1, d ?? 1]
}

function armar(a: number, m: number, d: number): string {
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function diasDelMes(anio: number, mes: number): number {
  return [31, esBisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] ?? 30
}

function esBisiesto(a: number): boolean {
  return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
}

export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso)
  const t = Date.UTC(a, m - 1, d) + dias * 86_400_000
  const f = new Date(t)
  return armar(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate())
}

/** Lunes de la semana de esa fecha. La semana comercial arranca el lunes. */
export function lunesDe(iso: string): string {
  const [a, m, d] = partes(iso)
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay()   // 0 = domingo
  return sumarDias(iso, dia === 0 ? -6 : 1 - dia)
}

export function rango(periodo: NombreDePeriodo, hoy: string): Rango {
  const [a, m] = partes(hoy)
  switch (periodo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy, etiqueta: 'Hoy' }
    case 'semana': {
      const lunes = lunesDe(hoy)
      return { desde: lunes, hasta: sumarDias(lunes, 6), etiqueta: 'Esta semana' }
    }
    case 'semana_anterior': {
      const lunes = sumarDias(lunesDe(hoy), -7)
      return { desde: lunes, hasta: sumarDias(lunes, 6), etiqueta: 'Semana anterior' }
    }
    case 'mes':
      return { desde: armar(a, m, 1), hasta: armar(a, m, diasDelMes(a, m)), etiqueta: 'Este mes' }
    case 'mes_anterior': {
      const ma = m === 1 ? a - 1 : a
      const mm = m === 1 ? 12 : m - 1
      return { desde: armar(ma, mm, 1), hasta: armar(ma, mm, diasDelMes(ma, mm)), etiqueta: 'Mes anterior' }
    }
    case 'ultimos_3_meses': {
      const ma = m <= 2 ? a - 1 : a
      const mm = m <= 2 ? m + 10 : m - 2
      return { desde: armar(ma, mm, 1), hasta: armar(a, m, diasDelMes(a, m)), etiqueta: 'Últimos 3 meses' }
    }
    case 'anio':
      return { desde: armar(a, 1, 1), hasta: armar(a, 12, 31), etiqueta: 'Este año' }
    default:
      return { desde: armar(a, m, 1), hasta: armar(a, m, diasDelMes(a, m)), etiqueta: 'Este mes' }
  }
}

/** El día de hoy en aaaa-mm-dd, en la zona que se le diga. */
export function hoyEn(zona = 'America/Argentina/Buenos_Aires', ahora = new Date()): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return f.format(ahora)
}

/**
 * El período inmediatamente anterior, del mismo largo.
 *
 * Para meses usa el mes calendario anterior y no «treinta días antes»: comparar
 * febrero con «los 28 días previos al 1 de marzo» da un número parecido y
 * responde otra pregunta.
 */
export function rangoAnterior(periodo: NombreDePeriodo, actual: Rango): Rango {
  if (periodo === 'mes' || periodo === 'mes_anterior') {
    const [a, m] = partes(actual.desde)
    const ma = m === 1 ? a - 1 : a
    const mm = m === 1 ? 12 : m - 1
    return { desde: armar(ma, mm, 1), hasta: armar(ma, mm, diasDelMes(ma, mm)), etiqueta: 'Período anterior' }
  }
  if (periodo === 'anio') {
    const [a] = partes(actual.desde)
    return { desde: armar(a - 1, 1, 1), hasta: armar(a - 1, 12, 31), etiqueta: 'Año anterior' }
  }
  const largo = diasEntreFechas(actual.desde, actual.hasta) + 1
  return {
    desde: sumarDias(actual.desde, -largo),
    hasta: sumarDias(actual.desde, -1),
    etiqueta: 'Período anterior',
  }
}

function diasEntreFechas(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde)
  const [a2, m2, d2] = partes(hasta)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

/** La diferencia entre dos números, o null cuando no hay con qué comparar. */
export function variacion(ahora: number, antes: number): number | null {
  if (antes === 0 && ahora === 0) return 0
  if (antes === 0) return null
  return Math.round(((ahora - antes) / antes) * 1000) / 10
}
