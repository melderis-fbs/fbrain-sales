import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { claveCoincide } from './claves'
import { escribir, escribirDevolviendo, fila } from './db'
import type { Rol } from '@/dominio/roles'

export const COOKIE_SESION = 'fsos_sesion'
const DIAS_DE_SESION = 30

export type Usuario = {
  id: number
  email: string
  nombre: string
  rol: Rol
  /** Si este usuario es un closer, cuál. En null, no lo es. */
  closerId: number | null
  /** Si este usuario es un setter, cuál. */
  setterId: number | null
}

type FilaUsuario = {
  id: number
  email: string
  nombre: string
  rol: Rol
  clave_hash: string
  closer_id: number | null
  setter_id: number | null
}

const CONSULTA_USUARIO = `
  select u.id, u.email, u.nombre, u.rol, u.clave_hash,
         c.id as closer_id, s.id as setter_id
    from usuarios u
    left join closers c on c.usuario_id = u.id and c.activo
    left join setters s on s.usuario_id = u.id and s.activo
   where %s and u.activo`

function aUsuario(f: FilaUsuario): Usuario {
  return { id: f.id, email: f.email, nombre: f.nombre, rol: f.rol, closerId: f.closer_id, setterId: f.setter_id }
}

export async function entrar(email: string, clave: string): Promise<Usuario | null> {
  const encontrado = await fila<FilaUsuario>(
    CONSULTA_USUARIO.replace('%s', 'lower(u.email) = lower($1)'),
    [email.trim()],
  )
  if (!encontrado) return null
  if (!(await claveCoincide(clave, encontrado.clave_hash))) return null

  const token = randomBytes(32).toString('hex')
  await escribirDevolviendo(
    `insert into sesiones_login (token, usuario_id, expira_en)
     values ($1, $2, now() + ($3 || ' days')::interval) returning token`,
    [token, encontrado.id, String(DIAS_DE_SESION)],
  )

  const bolsa = await cookies()
  bolsa.set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DIAS_DE_SESION * 24 * 60 * 60,
  })

  return aUsuario(encontrado)
}

export async function salir(): Promise<void> {
  const bolsa = await cookies()
  const token = bolsa.get(COOKIE_SESION)?.value
  if (token) {
    // Puede que la sesión ya no exista (expirada, o cerrada en otra pestaña):
    // acá borrar cero filas es normal y no es un error de escritura.
    await escribir('delete from sesiones_login where token = $1', [token], { esperadas: 'cualquiera' })
  }
  bolsa.delete(COOKIE_SESION)
}

/** El usuario de esta petición, o null si no hay sesión válida. */
export async function usuarioActual(): Promise<Usuario | null> {
  const bolsa = await cookies()
  const token = bolsa.get(COOKIE_SESION)?.value
  if (!token) return null

  const encontrado = await fila<FilaUsuario>(
    `${CONSULTA_USUARIO.replace('%s', 'true')}
       and u.id = (select usuario_id from sesiones_login where token = $1 and expira_en > now())`,
    [token],
  )
  return encontrado ? aUsuario(encontrado) : null
}

/**
 * El usuario, o se corta.
 *
 * Lo usan las acciones de servidor y los route handlers. Devolver null y que
 * cada lugar se acuerde de chequearlo es un permiso que depende de la memoria.
 */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioActual()
  if (!usuario) throw new Error('Tu sesión venció. Volvé a entrar.')
  return usuario
}
