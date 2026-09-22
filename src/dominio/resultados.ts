/**
 * Qué le puede pasar a un lead.
 *
 * El lead ES la oportunidad: no hay una capa intermedia. Las llamadas que
 * hagan falta para cerrarlo —una, dos o tres— cuelgan de él.
 *
 * Dos ejes distintos, y mezclarlos es lo que hace que después no se pueda
 * contestar «cuántas asistencias hubo» sin discutir:
 *
 *   ESTADO     qué pasó con la reunión  (vino, no vino, se canceló)
 *   RESULTADO  qué pasó con la venta    (compró, señó, quedó abierto, se perdió)
 */

export const ESTADOS = ['agendado', 'asistio', 'no_show', 'cancelado', 'reagendado'] as const
export type Estado = (typeof ESTADOS)[number]

export const NOMBRE_DE_ESTADO: Record<Estado, string> = {
  agendado: 'Agendado',
  asistio: 'Asistió',
  no_show: 'No show',
  cancelado: 'Cancelado',
  reagendado: 'Reagendado',
}

export const RESULTADOS = ['pendiente', 'venta', 'sena', 'seguimiento', 'perdida', 'no_calificado'] as const
export type Resultado = (typeof RESULTADOS)[number]

export const NOMBRE_DE_RESULTADO: Record<Resultado, string> = {
  pendiente: 'Pendiente',
  venta: 'Venta',
  sena: 'Seña',
  seguimiento: 'Seguimiento',
  perdida: 'Perdido',
  no_calificado: 'No calificado',
}

/**
 * El color de cada cosa. Nunca un color sin significado.
 *
 * La seña tiene el acento celeste: no es una venta y no es un seguimiento
 * cualquiera, porque hubo compromiso financiero. Que el acento de la interfaz
 * tenga un trabajo es lo que evita que sea decoración.
 */
export type Color = 'verde' | 'acento' | 'ambar' | 'rojo' | 'gris'

export const COLOR_DE_RESULTADO: Record<Resultado, Color> = {
  venta: 'verde',
  sena: 'acento',
  seguimiento: 'ambar',
  perdida: 'rojo',
  no_calificado: 'gris',
  pendiente: 'gris',
}

export const COLOR_DE_ESTADO: Record<Estado, Color> = {
  asistio: 'verde',
  agendado: 'gris',
  reagendado: 'ambar',
  no_show: 'rojo',
  cancelado: 'rojo',
}

export const TIPOS_SESION = ['primera', 'segunda', 'seguimiento', 'onboarding', 'otra'] as const
export type TipoSesion = (typeof TIPOS_SESION)[number]

export const NOMBRE_DE_TIPO: Record<TipoSesion, string> = {
  primera: 'Primera sesión',
  segunda: 'Segunda sesión',
  seguimiento: 'Seguimiento',
  onboarding: 'Onboarding',
  otra: 'Otra',
}

/**
 * Por qué se pierde. Lista cerrada a propósito: «no le interesó» escrito de
 * nueve maneras no se puede contar, y contar por qué se pierde es de lo poco
 * que cambia decisiones.
 */
export const MOTIVOS_PERDIDA = [
  'precio', 'timing', 'socio', 'confianza', 'urgencia', 'encaje',
  'competencia', 'no_entendio', 'no_tenia_dinero', 'no_era_decisor', 'seguimiento_deficiente',
] as const
export type MotivoPerdida = (typeof MOTIVOS_PERDIDA)[number]

export const NOMBRE_DE_MOTIVO: Record<MotivoPerdida, string> = {
  precio: 'Precio',
  timing: 'Timing',
  socio: 'Socio o pareja',
  confianza: 'Confianza',
  urgencia: 'Sin urgencia',
  encaje: 'No hay encaje',
  competencia: 'Competencia',
  no_entendio: 'No entendió la oferta',
  no_tenia_dinero: 'No tenía el dinero',
  no_era_decisor: 'No era decisor',
  seguimiento_deficiente: 'Seguimiento deficiente',
}

/** Un lead sigue abierto mientras no se haya vendido ni perdido. La seña NO lo cierra. */
export function sigueAbierto(resultado: Resultado): boolean {
  return resultado === 'pendiente' || resultado === 'seguimiento' || resultado === 'sena'
}

/**
 * ¿La plata cargada contradice el resultado?
 *
 * Existe porque faltaba y la falta era cara: cargar una venta por error y
 * después corregir el resultado a «Perdido» sacaba el lead del embudo pero
 * dejaba la venta. La facturación del mes seguía contando plata que no entró, y
 * el número no se podía arreglar desde ningún lado.
 *
 * Una seña convertida ya es una venta: no cuenta acá, se mira la venta.
 */
export function plataQueNoCuadra(
  resultado: Resultado,
  plata: { venta: number; sena: number },
): 'venta' | 'sena' | null {
  if (plata.venta > 0 && resultado !== 'venta') return 'venta'
  // Una seña convive con «pendiente», «seguimiento» y «seña». Con un lead
  // cerrado en falso, no: o la seña se perdió y hay que anularla, o el lead
  // no está perdido.
  if (plata.sena > 0 && (resultado === 'perdida' || resultado === 'no_calificado')) return 'sena'
  return null
}
