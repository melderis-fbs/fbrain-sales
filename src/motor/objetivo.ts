import { redondear } from './embudo'

/**
 * Cómo viene el mes contra el objetivo.
 *
 * Lo que importa no es el porcentaje alcanzado: es el porcentaje alcanzado
 * CONTRA el ritmo esperado a esta altura del mes. 67% el día 12 de 22 está muy
 * bien; 67% el día 21 está muy mal. Un número sin contra qué compararse no
 * dice nada.
 */

export type Ritmo = {
  objetivo: number
  logrado: number
  /** Porcentaje del objetivo alcanzado. */
  alcanzado: number
  diasTranscurridos: number
  diasTotales: number
  /** Dónde debería estar hoy, en porcentaje. */
  ritmoEsperado: number
  /** Cuánto por encima o por debajo del ritmo. Positivo es bueno. */
  desvio: number
  estado: 'sobre' | 'en_ritmo' | 'debajo'
}

export function ritmo(
  objetivo: number,
  logrado: number,
  diasTranscurridos: number,
  diasTotales: number,
): Ritmo | null {
  // Sin objetivo cargado no hay ritmo que calcular. Inventar uno sería peor que
  // no mostrarlo: la pantalla diría que vamos bien contra un número que nadie
  // eligió.
  if (objetivo <= 0 || diasTotales <= 0) return null

  const transcurridos = Math.min(Math.max(diasTranscurridos, 0), diasTotales)
  const alcanzado = redondear((logrado / objetivo) * 100)
  const ritmoEsperado = redondear((transcurridos / diasTotales) * 100)
  const desvio = redondear(alcanzado - ritmoEsperado)

  return {
    objetivo,
    logrado,
    alcanzado,
    diasTranscurridos: transcurridos,
    diasTotales,
    ritmoEsperado,
    desvio,
    // Cinco puntos de banda: un tablero que cambia de color por medio punto
    // deja de mirarse.
    estado: desvio > 5 ? 'sobre' : desvio < -5 ? 'debajo' : 'en_ritmo',
  }
}

/** Cuántos días hábiles pasaron del mes, contando el de hoy. */
export function diasHabilesTranscurridos(desde: string, hoy: string, hasta: string): number {
  const tope = hoy > hasta ? hasta : hoy
  if (tope < desde) return 0
  let dias = 0
  let cursor = desde
  while (cursor <= tope) {
    const [a, m, d] = cursor.split('-').map(Number)
    const dow = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
    if (dow !== 0 && dow !== 6) dias++
    const t = Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1) + 86_400_000
    const f = new Date(t)
    cursor = `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`
  }
  return dias
}
