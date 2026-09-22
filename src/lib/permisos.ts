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
  /** Un closer: sus leads asignados, más lo que haya cargado él. */
  | { todo: false; usuarioId: number; closerId: number }
  /** Un setter: los leads que agendó, más lo que haya cargado él. */
  | { todo: false; usuarioId: number; setterId: number }
  /** Sin figura comercial vinculada: ve lo que cargó, y nada más. */
  | { todo: false; usuarioId: number; nada: true }

export function alcanceDe(usuario: Usuario): Alcance {
  if (PUEDE[usuario.rol].verTodo) return { todo: true }
  const usuarioId = usuario.id
  if (usuario.rol === 'closer' && usuario.closerId !== null) {
    return { todo: false, usuarioId, closerId: usuario.closerId }
  }
  if (usuario.rol === 'setter' && usuario.setterId !== null) {
    return { todo: false, usuarioId, setterId: usuario.setterId }
  }
  return { todo: false, usuarioId, nada: true }
}

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
 * La condición SQL del alcance, con los valores aparte.
 *
 * Devuelve el fragmento y los parámetros por separado para que ningún valor se
 * pegue a la consulta a mano.
 *
 * La regla de fondo, y la que evita el problema que tuvo bloqueado a un closer
 * días enteros: **lo que cargó una persona lo ve esa persona, siempre**. Da
 * igual si su cuenta tiene figura comercial vinculada, si la figura quedó
 * desactivada o si el lead terminó asignado a otro. Un lead que se guarda y
 * desaparece de la pantalla de quien lo cargó no se lee como «quedó mal
 * asignado»: se lee como «esto no anda», y lo siguiente que pasa es que se
 * carga de nuevo y quedan duplicados que nadie ve.
 *
 * Arriba de eso se suma lo suyo por figura: un closer ve además todo lo que le
 * asignaron, un setter todo lo que agendó.
 */
export function condicionDeAlcance(
  alcance: Alcance,
  columnas: { closer: string; setter: string; creador: string },
  siguienteParametro: number,
): { condicion: string; parametros: number[] } {
  if (alcance.todo) return { condicion: 'true', parametros: [] }

  const parametros: number[] = [alcance.usuarioId]
  const partes = [`${columnas.creador} = $${siguienteParametro}`]

  if ('closerId' in alcance) {
    parametros.push(alcance.closerId)
    partes.push(`${columnas.closer} = $${siguienteParametro + 1}`)
  } else if ('setterId' in alcance) {
    parametros.push(alcance.setterId)
    partes.push(`${columnas.setter} = $${siguienteParametro + 1}`)
  }

  return { condicion: `(${partes.join(' or ')})`, parametros }
}

export function asignarAQuienCarga<T extends { closerId?: number | null; setterId?: number | null }>(
  alcance: Alcance, lead: T,
): T {
  if (alcance.todo || 'nada' in alcance) return lead
  if ('closerId' in alcance) return { ...lead, closerId: lead.closerId ?? alcance.closerId }
  return { ...lead, setterId: lead.setterId ?? alcance.setterId }
}
