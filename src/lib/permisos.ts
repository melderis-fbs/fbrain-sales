import type { Usuario } from './auth'
import { PUEDE, type Permiso } from '@/dominio/roles'

/**
 * Quién ve qué, y quién es cada uno. Son dos preguntas distintas.
 *
 * EL ALCANCE es la primera: qué leads entran en una consulta. Hoy todos ven
 * toda la operación, y es una decisión del negocio: el equipo es chico, los
 * leads se pasan entre closers, y no poder abrir el lead que cargó otro
 * costaba más que lo que cuidaba. Un setter veía «está duplicado» y no podía
 * ver contra qué; el otro setter sí lo veía. Eso no se lee como un permiso:
 * se lee como que el sistema está roto.
 *
 * Se apaga por rol, en `PUEDE[rol].verTodo`, y el filtro sigue viajando como
 * argumento obligatorio de cada consulta que toca leads: si mañana hay que
 * volver a separar por equipo, es una línea y no una auditoría. Un filtro que
 * depende de acordarse no es un filtro.
 *
 * LA FIGURA es la segunda: quién es el que está cargando. Va aparte a
 * propósito. Que un closer vea todo NO significa que el lead que carga sea de
 * nadie: sigue siendo suyo. Cuando las dos preguntas eran la misma, abrirle
 * la vista a un closer le quitaba el dueño a lo que cargaba.
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

/**
 * Quién es el que carga: su figura comercial, si tiene una.
 *
 * No depende de lo que pueda ver. Un closer que ve toda la operación sigue
 * siendo un closer, y lo que carga entra a su nombre.
 */
export type Figura =
  | { tipo: 'closer'; closerId: number }
  | { tipo: 'setter'; setterId: number }
  | { tipo: 'ninguna' }

export function figuraDe(usuario: Usuario): Figura {
  if (usuario.rol === 'closer' && usuario.closerId !== null) {
    return { tipo: 'closer', closerId: usuario.closerId }
  }
  if (usuario.rol === 'setter' && usuario.setterId !== null) {
    return { tipo: 'setter', setterId: usuario.setterId }
  }
  return { tipo: 'ninguna' }
}

/**
 * Una cuenta de closer o de setter sin su figura vinculada.
 *
 * No es un caso raro: pasa cada vez que se crea el usuario antes que la
 * persona en Configuración. Lo que carga no queda a nombre de nadie, así que
 * la aplicación lo dice arriba de todo en vez de dejarlo pasar.
 */
export function sinFiguraVinculada(usuario: Usuario): boolean {
  return (usuario.rol === 'closer' || usuario.rol === 'setter')
    && figuraDe(usuario).tipo === 'ninguna'
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

/**
 * El lead que carga un closer es suyo; el que carga un setter, también.
 *
 * Lo decide la FIGURA y no el alcance: que alguien vea toda la operación no
 * convierte en huérfano lo que carga.
 */
export function asignarAQuienCarga<T extends { closerId?: number | null; setterId?: number | null }>(
  figura: Figura, lead: T,
): T {
  if (figura.tipo === 'closer') return { ...lead, closerId: lead.closerId ?? figura.closerId }
  if (figura.tipo === 'setter') return { ...lead, setterId: lead.setterId ?? figura.setterId }
  return lead
}
