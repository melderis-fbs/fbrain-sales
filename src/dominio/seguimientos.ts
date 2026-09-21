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
