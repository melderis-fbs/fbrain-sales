/** Qué contestó el lead en cada toque. */
export const ESTADOS_TOQUE = [
  'contesto', 'no_contesto', 'sigue_interesado', 'agendo', 'no_interesado',
] as const
export type EstadoToque = (typeof ESTADOS_TOQUE)[number]

export const NOMBRE_DE_TOQUE: Record<EstadoToque, string> = {
  contesto: 'Contestó',
  no_contesto: 'No contestó',
  sigue_interesado: 'Sigue interesado',
  agendo: 'Agendó',
  no_interesado: 'No interesado',
}

/**
 * Marcar «no interesado» saca al lead del pipeline solo, para que deje de
 * ocupar lugar. No hacen falta dos acciones.
 */
export function sacaDelPipeline(estado: EstadoToque): boolean {
  return estado === 'no_interesado'
}

export const SITUACIONES = ['activo', 'largo', 'fuera'] as const
export type Situacion = (typeof SITUACIONES)[number]

export const NOMBRE_DE_SITUACION: Record<Situacion, string> = {
  activo: 'En cadencia',
  largo: 'Seguimiento largo',
  fuera: 'No interesado',
}

/**
 * Por qué un lead salió del pipeline.
 *
 * Hasta acá «fuera del pipeline» era una bolsa: el que dijo que no, el que
 * agendó y el que se cerró, todos en la misma lista y sin forma de
 * distinguirlos. Y falta el cuarto, que era el que no existía: el que recorrió
 * los doce toques sin decidirse.
 */
export const MOTIVOS_DE_SALIDA = [
  'no_interesado', 'agendo', 'cadencia_agotada', 'resultado', 'a_mano',
] as const
export type MotivoDeSalida = (typeof MOTIVOS_DE_SALIDA)[number]

export const NOMBRE_DE_SALIDA_SEG: Record<MotivoDeSalida, string> = {
  no_interesado: 'Dijo que no',
  agendo: 'Agendó',
  cadencia_agotada: 'Se acabó la cadencia',
  resultado: 'Se cargó su resultado',
  a_mano: 'Lo sacaron a mano',
}
