/**
 * El informe de una llamada: lo que se lee, no lo que se calcula.
 *
 * Los números viven en el motor de scoring y en las fases. Acá están las
 * piezas narrativas, y una en particular es la que cambia para qué sirve el
 * informe entero: LA LECTURA JUSTA.
 *
 * Sin ella, el análisis contesta «¿estuvo bien la llamada?» y lo contesta
 * contra un ideal. Pero un closer no elige el lead que le toca. Alguien que
 * maneja impecablemente a un prospecto que no tenía plata, no era decisor y
 * venía frío hizo un buen trabajo aunque no haya vendido, y decirle que sacó
 * 4,5 lo entrena para desconfiar del analizador. Al revés también: un lead
 * caliente y calificado que se cae es mucho peor que un 6, y promediarlo con
 * el resto lo esconde.
 *
 * Por eso el informe primero establece QUÉ LE TOCÓ y CUÁL ERA EL TECHO de esa
 * llamada, y recién después juzga cuánto de ese techo se aprovechó. No es ser
 * amable: es medir contra lo que había.
 */

/** Hasta dónde se podía llegar en esta llamada, con este prospecto. */
export const TECHOS = ['venta', 'sena', 'segunda_llamada', 'seguimiento', 'no_habia_venta'] as const
export type Techo = (typeof TECHOS)[number]

export const NOMBRE_DE_TECHO: Record<Techo, string> = {
  venta: 'Se podía cerrar',
  sena: 'Se podía sacar una seña',
  segunda_llamada: 'Se podía dejar una segunda llamada',
  seguimiento: 'Se podía dejar abierto un seguimiento',
  no_habia_venta: 'Acá no había venta',
}

/** Cuánto de ese techo se aprovechó. Tres estados: no hace falta más. */
export const APROVECHAMIENTOS = ['si', 'casi', 'no'] as const
export type Aprovechamiento = (typeof APROVECHAMIENTOS)[number]

export const NOMBRE_DE_APROVECHAMIENTO: Record<Aprovechamiento, string> = {
  si: 'Lo aprovechó',
  casi: 'Le faltó poco',
  no: 'No lo aprovechó',
}

export const COLOR_DE_APROVECHAMIENTO: Record<Aprovechamiento, 'verde' | 'ambar' | 'rojo'> = {
  si: 'verde', casi: 'ambar', no: 'rojo',
}

export type LecturaJusta = {
  /** Qué lead le tocó, en una frase con evidencia. */
  queRecibio: string
  techo: Techo
  porQueEseTecho: string
  aprovecho: Aprovechamiento
  /** El párrafo que se lee primero: el juicio general, en contexto. */
  insight: string
}

export type ErrorCritico = { titulo: string; detalle: string }
export type Recomendacion = { titulo: string; detalle: string }
