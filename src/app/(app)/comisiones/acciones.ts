'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { guardarReglas, type Reglas } from '@/datos/comisiones'

export async function guardarReglasAccion(_previo: string | null, datos: FormData): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const numero = (campo: string): number => {
    const v = String(datos.get(campo) ?? '').trim().replace(',', '.')
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
  }

  const nuevas: Reglas = {
    sobre: String(datos.get('sobre') ?? 'cash') as Reglas['sobre'],
    closer: numero('closer'),
    setter: numero('setter'),
    repesca: numero('repesca'),
    head: numero('head'),
  }

  try {
    await guardarReglas(nuevas, usuario.id)
  } catch (error) {
    return error instanceof Error ? error.message : 'No se pudieron guardar las reglas.'
  }

  revalidatePath('/comisiones')
  return 'Reglas guardadas. Los números de abajo ya están recalculados.'
}
