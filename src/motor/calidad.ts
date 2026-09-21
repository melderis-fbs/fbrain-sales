import {
  CAMPOS_QUE_PUNTUAN, COMPLETITUD_MINIMA, PESO_TOTAL, nivelDeCalidad,
  type NivelDeCalidad,
} from '@/dominio/calidad'
import { redondear } from './embudo'

/**
 * El Lead Quality Score.
 *
 * Función pura: recibe lo que contestó el setter y devuelve el número con el
 * detalle de cómo se armó. El detalle no es decoración — un score sin aportes
 * es un número que nadie puede discutir, y un número que nadie puede discutir
 * es un número que nadie usa.
 *
 * Lo que no se contestó no puntúa cero: se saca del cálculo y baja la
 * completitud. Cero sería afirmar que el lead no puede pagar; lo que pasa es
 * que nadie preguntó.
 */

export type Aporte = {
  clave: string
  etiqueta: string
  /** Lo que se eligió, en palabras. null cuando quedó sin contestar. */
  respuesta: string | null
  peso: number
  /** Los puntos que aporta al score final, sobre 100. */
  aporte: number
}

export type Calidad = {
  /** 0 a 100 sobre lo contestado. null cuando no alcanza para decir nada. */
  score: number | null
  nivel: NivelDeCalidad | null
  /** Qué porcentaje del peso total se contestó. */
  completitud: number
  aportes: Aporte[]
  /** Qué falta preguntar, para que la pantalla lo pueda pedir. */
  faltan: string[]
}

export type Respuestas = Record<string, string | number | null | undefined>

export function calidadDelLead(respuestas: Respuestas): Calidad {
  const aportes: Aporte[] = []
  const faltan: string[] = []
  let pesoContestado = 0
  let puntos = 0

  for (const campo of CAMPOS_QUE_PUNTUAN) {
    const crudo = respuestas[campo.clave]
    const valor = crudo === null || crudo === undefined || crudo === '' ? null : String(crudo)
    const opcion = valor === null ? undefined : campo.opciones.find((o) => o.valor === valor)

    if (!opcion) {
      faltan.push(campo.etiqueta)
      aportes.push({ clave: campo.clave, etiqueta: campo.etiqueta, respuesta: null, peso: campo.peso, aporte: 0 })
      continue
    }

    // El nivel va de 0 a 4; el aporte es la fracción de su peso.
    const aporte = (opcion.nivel / 4) * campo.peso
    pesoContestado += campo.peso
    puntos += aporte
    aportes.push({
      clave: campo.clave, etiqueta: campo.etiqueta, respuesta: opcion.etiqueta,
      peso: campo.peso, aporte: redondear(aporte),
    })
  }

  const completitud = redondear((pesoContestado / PESO_TOTAL) * 100)
  if (completitud < COMPLETITUD_MINIMA) {
    return { score: null, nivel: null, completitud, aportes, faltan }
  }

  // Sobre lo contestado, no sobre el total: si se contestó el 80% del peso, el
  // score es el porcentaje logrado de ese 80%, no un 80% con techo.
  const score = Math.round((puntos / pesoContestado) * 100)
  return { score, nivel: nivelDeCalidad(score), completitud, aportes, faltan }
}
