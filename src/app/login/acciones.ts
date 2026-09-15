'use server'

import { redirect } from 'next/navigation'
import { entrar, salir } from '@/lib/auth'
import { HOME_DE_ROL } from '@/dominio/roles'

export async function entrarAccion(_previo: string | null, datos: FormData): Promise<string | null> {
  const email = String(datos.get('email') ?? '').trim()
  const clave = String(datos.get('clave') ?? '')

  if (email === '' || clave === '') return 'Poné tu email y tu clave.'

  const usuario = await entrar(email, clave)
  // El mismo mensaje para email que no existe y clave incorrecta: decir cuál de
  // las dos falló le confirma a cualquiera qué emails están dados de alta.
  if (!usuario) return 'Email o clave incorrectos.'

  redirect(HOME_DE_ROL[usuario.rol])
}

export async function salirAccion(): Promise<void> {
  await salir()
  redirect('/login')
}
