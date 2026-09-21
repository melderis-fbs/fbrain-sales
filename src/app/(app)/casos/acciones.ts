'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { guardarCaso, activarCaso } from '@/datos/casos'

function texto(datos: FormData, campo: string): string | null {
  const v = datos.get(campo)
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export async function guardarCasoAccion(_previo: string | null, datos: FormData): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const titulo = texto(datos, 'titulo')
  if (!titulo) return 'El caso necesita un título.'

  const id = texto(datos, 'id')
  try {
    await guardarCaso({
      titulo,
      cliente: texto(datos, 'cliente'),
      industria: texto(datos, 'industria'),
      situacion: texto(datos, 'situacion'),
      resultado: texto(datos, 'resultado'),
      metrica: texto(datos, 'metrica'),
      cita: texto(datos, 'cita'),
      link: texto(datos, 'link'),
      mensaje: texto(datos, 'mensaje'),
    }, usuario.id, id ? Number(id) : undefined)
  } catch (error) {
    return error instanceof Error ? error.message : 'No se pudo guardar el caso.'
  }

  revalidatePath('/casos')
  return null
}

export async function activarCasoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  await activarCaso(Number(datos.get('id')), datos.get('activo') === '1')
  revalidatePath('/casos')
}
