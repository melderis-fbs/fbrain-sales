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
 *
 * Por eso esta consulta devuelve las dos listas por separado: las cuentas y las
 * figuras. Atarlas es una acción explícita, y tiene que poder deshacerse — una
 * persona cambia de email, o una cuenta se creó con el nombre mal escrito.
 */

export type Persona = {
  usuarioId: number | null
  nombre: string
  email: string | null
  rol: Rol | null
  activo: boolean
  /** La figura comercial atada a esta cuenta, si la hay. */
  figuraId: number | null
  figuraNombre: string | null
  esCloser: boolean
  esSetter: boolean
  /** Cuenta activa de closer/setter sin figura: entra y no ve nada. */
  sinVincular: boolean
}

export type Figura = {
  id: number
  nombre: string
  tipo: 'closer' | 'setter'
  activo: boolean
  usuarioId: number | null
  /** El nombre de la cuenta a la que está atada, si lo está. */
  usuario: string | null
}

export type Equipo = { personas: Persona[]; figuras: Figura[] }

export async function equipo(): Promise<Equipo> {
  const [cuentas, figuras] = await Promise.all([
    filas<{
      id: number; email: string; nombre: string; rol: Rol; activo: boolean
      closer_id: number | null; closer: string | null
      setter_id: number | null; setter: string | null
    }>(
      `select u.id, u.email, u.nombre, u.rol, u.activo,
              c.id as closer_id, c.nombre as closer,
              s.id as setter_id, s.nombre as setter
         from usuarios u
         left join closers c on c.usuario_id = u.id
         left join setters s on s.usuario_id = u.id
        order by u.activo desc, u.nombre`,
    ),
    filas<{ id: number; nombre: string; tipo: 'closer' | 'setter'; activo: boolean
            usuario_id: number | null; usuario: string | null }>(
      `select c.id, c.nombre, 'closer' as tipo, c.activo, c.usuario_id, u.nombre as usuario
         from closers c left join usuarios u on u.id = c.usuario_id
       union all
       select s.id, s.nombre, 'setter' as tipo, s.activo, s.usuario_id, u2.nombre as usuario
         from setters s left join usuarios u2 on u2.id = s.usuario_id
       order by 3, 2`,
    ),
  ])

  const personas: Persona[] = [
    ...cuentas.map((u) => {
      const esComercial = u.rol === 'closer' || u.rol === 'setter'
      const figuraId = u.rol === 'setter' ? u.setter_id : u.closer_id
      const figuraNombre = u.rol === 'setter' ? u.setter : u.closer
      return {
        usuarioId: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        activo: u.activo,
        figuraId,
        figuraNombre,
        esCloser: u.closer_id !== null,
        esSetter: u.setter_id !== null,
        // Sólo molesta si la cuenta entra: una desactivada no ve nada de todos
        // modos, y avisar de eso es ruido que tapa el aviso que sí importa.
        sinVincular: esComercial && u.activo && figuraId === null,
      }
    }),
    // Las figuras sin cuenta se muestran igual: son personas del equipo cuyos
    // números cuentan aunque no entren a la aplicación.
    ...figuras.filter((f) => f.usuario_id === null && f.activo).map((f) => ({
      usuarioId: null,
      nombre: f.nombre,
      email: null,
      rol: null,
      activo: true,
      figuraId: f.id,
      figuraNombre: f.nombre,
      esCloser: f.tipo === 'closer',
      esSetter: f.tipo === 'setter',
      sinVincular: false,
    })),
  ]

  return {
    personas,
    figuras: figuras.map((f) => ({
      id: f.id, nombre: f.nombre, tipo: f.tipo, activo: f.activo,
      usuarioId: f.usuario_id, usuario: f.usuario,
    })),
  }
}
