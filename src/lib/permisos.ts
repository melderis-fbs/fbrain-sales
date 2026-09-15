import type { Usuario } from './auth'
import { PUEDE, type Permiso } from '@/dominio/roles'

/**
 * Quién ve qué.
 *
 * Dirección, admin, head y coach ven toda la operación. Un closer ve sus
 * oportunidades. Un setter ve los leads que agendó. No hay un quinto caso.
 *
 * El alcance viaja como argumento obligatorio de cada consulta que toca leads u
 * oportunidades: si mañana alguien agrega una pantalla y se olvida de filtrar,
 * no compila. Un filtro que depende de acordarse no es un filtro.
 */

export type Alcance =
  /** Ve la operación entera. */
  | { todo: true }
  /** Un closer: sólo las oportunidades asignadas a él. */
  | { todo: false; closerId: number }
  /** Un setter: sólo los leads que agendó. */
  | { todo: false; setterId: number }
  /** Un usuario sin closer ni setter asignado: no ve ninguno. */
  | { todo: false; nada: true }

export function alcanceDe(usuario: Usuario): Alcance {
  if (PUEDE[usuario.rol].verTodo) return { todo: true }
  if (usuario.rol === 'closer' && usuario.closerId !== null) return { todo: false, closerId: usuario.closerId }
  if (usuario.rol === 'setter' && usuario.setterId !== null) return { todo: false, setterId: usuario.setterId }
  return { todo: false, nada: true }
}

/** Sin closer ni setter asignado no se ve nada. Vacío por permiso, no por falta de datos. */
export function sinEquipoAsignado(alcance: Alcance): boolean {
  return !alcance.todo && 'nada' in alcance
}

export function puede(usuario: Usuario, permiso: Permiso): boolean {
  return PUEDE[usuario.rol][permiso]
}

export function exigir(usuario: Usuario, permiso: Permiso): void {
  if (!puede(usuario, permiso)) {
    throw new Error(`Tu rol (${usuario.rol}) no puede hacer esto.`)
  }
}

/**
 * La condición SQL del alcance, con el valor aparte.
 *
 * Devuelve el fragmento y el parámetro por separado para que el valor nunca se
 * pegue a la consulta a mano. `false` cuando no hay equipo asignado: es más
 * claro que inventar un id que no existe, y no trae nada igual.
 */
export function condicionDeAlcance(
  alcance: Alcance,
  columnas: { closer: string; setter: string },
  siguienteParametro: number,
): { condicion: string; parametro: number | null } {
  if (alcance.todo) return { condicion: 'true', parametro: null }
  if ('nada' in alcance) return { condicion: 'false', parametro: null }
  if ('closerId' in alcance) {
    return { condicion: `${columnas.closer} = $${siguienteParametro}`, parametro: alcance.closerId }
  }
  return { condicion: `${columnas.setter} = $${siguienteParametro}`, parametro: alcance.setterId }
}
