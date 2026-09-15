import 'server-only'
import { filas } from '@/lib/db'
import type { Rol } from '@/dominio/roles'

/**
 * El equipo: quién es quién y quién puede entrar.
 *
 * Una persona del equipo son hasta dos cosas: una **cuenta** (`usuarios`, para
 * entrar) y una **figura comercial** (`closers` o `setters`, para que los
 * números salgan a su nombre). No siempre van juntas: un closer que ya no está
 * sigue teniendo sus ventas, y alguien de operaciones tiene cuenta pero no
 * cierra nada.
 *
 * Lo que sí tiene que estar atado es el caso del medio: si la cuenta de un
 * closer no apunta a su fila de `closers`, entra a la aplicación y no ve
 * ninguno de sus leads. Es vacío por permiso, y desde afuera parece que se
 * perdieron los datos.
 */

export type Persona = {
  usuarioId: number | null
  nombre: string
  email: string | null
  rol: Rol | null
  activo: boolean
  esCloser: boolean
  esSetter: boolean
  /** Tiene cuenta de closer/setter pero sin figura asociada: no vería nada. */
  sinVincular: boolean
}

export async function equipo(): Promise<Persona[]> {
  const cuentas = await filas<{
    id: number; email: string; nombre: string; rol: Rol; activo: boolean
    closer: string | null; setter: string | null
  }>(
    `select u.id, u.email, u.nombre, u.rol, u.activo,
            c.nombre as closer, s.nombre as setter
       from usuarios u
       left join closers c on c.usuario_id = u.id and c.activo
       left join setters s on s.usuario_id = u.id and s.activo
      order by u.activo desc, u.nombre`,
  )

  const sinCuenta = await filas<{ nombre: string; funcion: string }>(
    `select nombre, 'closer' as funcion from closers where usuario_id is null and activo
     union all
     select nombre, 'setter' as funcion from setters where usuario_id is null and activo
     order by nombre`,
  )

  return [
    ...cuentas.map((u) => ({
      usuarioId: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      activo: u.activo,
      esCloser: u.closer !== null,
      esSetter: u.setter !== null,
      sinVincular: (u.rol === 'closer' && u.closer === null) || (u.rol === 'setter' && u.setter === null),
    })),
    ...sinCuenta.map((p) => ({
      usuarioId: null,
      nombre: p.nombre,
      email: null,
      rol: null,
      activo: true,
      esCloser: p.funcion === 'closer',
      esSetter: p.funcion === 'setter',
      sinVincular: false,
    })),
  ]
}
