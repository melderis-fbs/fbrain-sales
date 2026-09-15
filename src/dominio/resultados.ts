/**
 * Qué le puede pasar a una oportunidad.
 *
 * Dos ejes distintos, y mezclarlos es lo que hace que después no se pueda
 * contestar «cuántas asistencias hubo» sin discutir:
 *
 *   ESTADO     qué pasó con la reunión  (vino, no vino, se canceló)
 *   RESULTADO  qué pasó con la venta    (compró, señó, quedó abierto, se perdió)
 *
 * Una reunión a la que el prospecto asistió y terminó en seguimiento tiene
 * estado «asistida» y resultado «seguimiento». Las dos cosas son ciertas.
 */

export const ESTADOS = ['agendada', 'asistida', 'no_show', 'cancelada', 'reagendada'] as const
export type Estado = (typeof ESTADOS)[number]

export const NOMBRE_DE_ESTADO: Record<Estado, string> = {
  agendada: 'Agendada',
  asistida: 'Asistió',
  no_show: 'No show',
  cancelada: 'Cancelada',
  reagendada: 'Reagendada',
}

export const RESULTADOS = ['pendiente', 'venta', 'sena', 'seguimiento', 'perdida', 'no_calificado'] as const
export type Resultado = (typeof RESULTADOS)[number]

export const NOMBRE_DE_RESULTADO: Record<Resultado, string> = {
  pendiente: 'Pendiente',
  venta: 'Venta',
  sena: 'Seña',
  seguimiento: 'Seguimiento',
  perdida: 'Perdida',
  no_calificado: 'No calificado',
}

/**
 * El color de cada resultado. Nunca un color sin significado.
 *
 * La seña es su propio color —no es verde y no es amarillo— porque no es una
 * venta y tampoco es un seguimiento cualquiera: hubo compromiso financiero.
 */
export type Color = 'verde' | 'sena' | 'amarillo' | 'rojo' | 'gris'

export const COLOR_DE_RESULTADO: Record<Resultado, Color> = {
  venta: 'verde',
  sena: 'sena',
  seguimiento: 'amarillo',
  perdida: 'rojo',
  no_calificado: 'gris',
  pendiente: 'gris',
}

export const COLOR_DE_ESTADO: Record<Estado, Color> = {
  asistida: 'verde',
  agendada: 'gris',
  reagendada: 'amarillo',
  no_show: 'rojo',
  cancelada: 'rojo',
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
 * Los motivos por los que se pierde una oportunidad.
 *
 * Lista cerrada a propósito: «no le interesó» escrito de nueve maneras
 * distintas no se puede contar, y contar por qué se pierde es de lo poco que
 * cambia decisiones.
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

/** Una oportunidad sigue abierta mientras no se haya vendido ni perdido. La seña NO la cierra. */
export function sigueAbierta(resultado: Resultado): boolean {
  return resultado === 'pendiente' || resultado === 'seguimiento' || resultado === 'sena'
}
