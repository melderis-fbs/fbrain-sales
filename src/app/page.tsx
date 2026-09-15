import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { HOME_DE_ROL } from '@/dominio/roles'

/** Cada rol abre en la pregunta que le toca, no todos en el mismo tablero. */
export default async function Inicio() {
  const usuario = await usuarioActual()
  if (!usuario) redirect('/login')
  redirect(HOME_DE_ROL[usuario.rol])
}
