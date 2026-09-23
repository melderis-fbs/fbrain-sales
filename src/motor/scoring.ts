import { redondear } from './embudo'

/**
 * El motor de la nota de una llamada.
 *
 * Acá está lo que arregla el 7,4 de todas las llamadas. El modelo no pone la
 * nota: pone un NIVEL de rúbrica por dimensión, con su cita. Este motor —que es
 * aritmética, no criterio— aplica pesos, topes, penalizaciones y bonificaciones
 * y saca el número.
 *
 * Dos consecuencias que valen el rediseño:
 *
 *  - La misma llamada evaluada dos veces da la misma nota, porque la nota no la
 *    improvisa nadie.
 *  - Recalibrar no cuesta una llamada al modelo: se cambia un peso y se
 *    recalculan mil análisis en segundos sobre los niveles ya guardados.
 */

export type Modelo = {
  dimensiones: { clave: string; nombre: string; peso: number }[]
  /** Nivel de rúbrica (0 a 4) → nota de 0 a 10. */
  niveles: Record<string, number>
  /**
   * Cuánto resta cada evento y —cuando existe— qué dimensión lo mide.
   *
   * La dimensión es la que evita contar el mismo error dos veces: si la
   * dimensión que le corresponde ya quedó floja, la penalización no entra.
   */
  penalizaciones: Record<string, { valor: number; dimension?: string }>
  bonificaciones: Record<string, number>
  topeBonificaciones: number
  /** Techo de la nota final cuando una dimensión quedó por debajo. */
  topes: { dimension: string; menorA: number; tope: number }[]
}

export type NivelAsignado = {
  dimension: string
  /** null cuando el modelo no encontró evidencia. */
  nivel: number | null
}

export type AporteDeDimension = {
  dimension: string
  nombre: string
  nivel: number | null
  /** La nota de 0 a 10 de esa dimensión. null si no hubo evidencia. */
  score: number | null
  peso: number
  /** Cuánto de la nota final salió de acá. */
  aporte: number
}

export type Puntaje = {
  score: number
  base: number
  penalizacion: number
  bonificacion: number
  /** El techo que se aplicó, si se aplicó alguno. */
  topeAplicado: number | null
  topesQueEntraron: { dimension: string; tope: number }[]
  dimensiones: AporteDeDimension[]
  /** Dimensiones sin evidencia: quedaron fuera del promedio, no en cero. */
  sinEvidencia: string[]
  /**
   * Los eventos malos que NO restaron porque su dimensión ya los había
   * contado. Se devuelven para poder mostrarlos: siguen siendo cierto lo que
   * dicen, y esconderlos sería tapar el detalle que explica la nota.
   */
  penalizacionesAbsorbidas: string[]
}

/**
 * El piso de la penalización total.
 *
 * Ocho eventos malos en una llamada no la hacen ocho veces peor que uno: a
 * partir de cierto punto la nota ya dijo lo que tenía que decir, y seguir
 * restando sólo hace que todas las llamadas malas se vean iguales.
 *
 * Bajó de 2,5 a 1,5 junto con la regla de no contar dos veces: con las dos
 * cosas sueltas, una llamada cuyas dimensiones promediaban 5,0 terminaba en
 * 3,0 —«mala»— contradiciendo su propio detalle, donde ninguna dimensión
 * bajaba de 3. Una nota que no se sostiene con lo que está escrito abajo no se
 * discute con el closer: se descarta.
 */
export const PENALIZACION_MAXIMA = 1.5

/** Una dimensión de 5 o menos ya dice que eso salió mal. */
const YA_LO_CONTO = 5.0

export function puntuar(
  niveles: readonly NivelAsignado[],
  eventos: readonly string[],
  modelo: Modelo,
): Puntaje {
  const dimensiones: AporteDeDimension[] = []
  const sinEvidencia: string[] = []
  let pesoConEvidencia = 0
  let acumulado = 0

  for (const d of modelo.dimensiones) {
    const asignado = niveles.find((n) => n.dimension === d.clave)
    const nivel = asignado?.nivel ?? null
    const score = nivel === null ? null : (modelo.niveles[String(nivel)] ?? null)

    if (score === null) {
      sinEvidencia.push(d.clave)
      dimensiones.push({ dimension: d.clave, nombre: d.nombre, nivel: null, score: null, peso: d.peso, aporte: 0 })
      continue
    }

    pesoConEvidencia += d.peso
    acumulado += score * d.peso
    dimensiones.push({
      dimension: d.clave, nombre: d.nombre, nivel, score,
      peso: d.peso, aporte: redondear(score * d.peso / 100, 2),
    })
  }

  // Sin una sola dimensión con evidencia no hay nota. Devolver 0 diría que la
  // llamada fue pésima; lo que pasa es que no se pudo evaluar.
  const base = pesoConEvidencia === 0 ? 0 : redondear(acumulado / pesoConEvidencia)

  // Cada aporte se recalcula sobre el peso con evidencia, así la suma de los
  // aportes da la base y la pantalla no muestra una suma que no cierra.
  if (pesoConEvidencia > 0) {
    for (const d of dimensiones) {
      d.aporte = d.score === null ? 0 : redondear(d.score * d.peso / pesoConEvidencia, 2)
    }
  }

  // Una penalización sólo entra si la dimensión que le corresponde NO la contó
  // ya. «No pidió una decisión» con el cierre en 3 es el mismo hecho dos
  // veces: la dimensión lo midió y el evento lo vuelve a cobrar. Lo que sigue
  // restando es lo que ninguna dimensión mide —prometer algo que el programa
  // no hace— y lo que pasó DENTRO de una dimensión que por lo demás salió
  // bien, que es justo lo que el nivel no alcanza a mostrar.
  const notaDe = (clave?: string) =>
    clave === undefined ? null : (dimensiones.find((d) => d.dimension === clave)?.score ?? null)

  const penalizacionesQueEntraron = eventos.filter((e) => {
    const p = modelo.penalizaciones[e]
    if (p === undefined) return false
    const nota = notaDe(p.dimension)
    return nota === null || nota > YA_LO_CONTO
  })

  const penalizacion = redondear(
    Math.max(
      -PENALIZACION_MAXIMA,
      penalizacionesQueEntraron.reduce((s, e) => s + (modelo.penalizaciones[e]?.valor ?? 0), 0),
    ),
  )
  const bonificacion = redondear(
    Math.min(
      modelo.topeBonificaciones,
      eventos.reduce((s, e) => s + (modelo.bonificaciones[e] ?? 0), 0),
    ),
  )

  let score = base + penalizacion + bonificacion

  // Los topes. Se aplican DESPUÉS de sumar y restar, porque son un techo de la
  // nota final: un cierre brillante no compensa no haber descubierto nada.
  const topesQueEntraron: { dimension: string; tope: number }[] = []
  for (const t of modelo.topes) {
    const d = dimensiones.find((x) => x.dimension === t.dimension)
    if (d && d.score !== null && d.score < t.menorA) topesQueEntraron.push({ dimension: t.dimension, tope: t.tope })
  }
  const techo = topesQueEntraron.length === 0 ? null : Math.min(...topesQueEntraron.map((t) => t.tope))
  const topeAplicado = techo !== null && score > techo ? techo : null
  if (topeAplicado !== null) score = topeAplicado

  return {
    score: redondear(Math.max(0, Math.min(10, score))),
    base,
    penalizacion,
    bonificacion,
    topeAplicado,
    topesQueEntraron,
    dimensiones,
    sinEvidencia,
    penalizacionesAbsorbidas: eventos.filter(
      (e) => modelo.penalizaciones[e] !== undefined && !penalizacionesQueEntraron.includes(e)),
  }
}
