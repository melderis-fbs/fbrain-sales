'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, exigir } from '@/lib/permisos'
import { exigirAccesoAlLead } from '@/datos/leads'
import { crearLlamada, guardarTranscripcion, verLlamada } from '@/datos/llamadas'
import { guardarPlaybook } from '@/datos/playbooks'
import { analizarLlamada } from '@/ia/correr'
import { recalcular } from '@/datos/analisis'
import type { TipoSesion } from '@/dominio/resultados'

function texto(datos: FormData, campo: string): string | null {
  const v = datos.get(campo)
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export async function crearLlamadaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const duracion = texto(datos, 'duracionMin')
  await crearLlamada(leadId, {
    fecha: texto(datos, 'fecha'),
    duracionSeg: duracion === null ? null : Math.round(Number(duracion) * 60),
    tipoSesion: (texto(datos, 'tipoSesion') ?? 'primera') as TipoSesion,
    asistio: datos.get('asistio') !== 'no',
  })
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/llamadas')
}

/**
 * Pegar la transcripción.
 *
 * Es cómo entra hoy: la reunión se graba en Meet, la transcripción se copia y
 * se pega. Automatizarlo es una integración más; poder analizar la llamada de
 * ayer es hoy.
 */
export async function subirTranscripcionAccion(
  _previo: string | null, datos: FormData,
): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const llamadaId = Number(datos.get('llamadaId'))
  const llamada = await verLlamada(llamadaId)
  if (!llamada) return 'Esa llamada no existe.'
  await exigirAccesoAlLead(llamada.leadId, alcanceDe(usuario))

  try {
    await guardarTranscripcion(llamadaId, String(datos.get('texto') ?? ''), 'pegado', usuario.id)
  } catch (error) {
    return error instanceof Error ? error.message : 'No se pudo guardar la transcripción.'
  }

  revalidatePath(`/leads/${llamada.leadId}`)
  revalidatePath(`/llamadas/${llamadaId}`)
  revalidatePath('/llamadas')
  return null
}

/**
 * Analizar una llamada.
 *
 * Corre en el pedido y puede tardar. Es a propósito: con el volumen de este
 * equipo, una cola sería infraestructura que hay que mantener para resolver un
 * problema que todavía no existe.
 */
export async function analizarAccion(_previo: string | null, datos: FormData): Promise<string | null> {
  const usuario = await exigirUsuario()

  const llamadaId = Number(datos.get('llamadaId'))
  const llamada = await verLlamada(llamadaId)
  if (!llamada) return 'Esa llamada no existe.'
  await exigirAccesoAlLead(llamada.leadId, alcanceDe(usuario))

  try {
    await analizarLlamada(llamadaId, usuario.id)
  } catch (error) {
    return error instanceof Error ? error.message : 'El análisis falló.'
  }

  revalidatePath(`/llamadas/${llamadaId}`)
  revalidatePath(`/leads/${llamada.leadId}`)
  revalidatePath('/llamadas')
  redirect(`/llamadas/${llamadaId}`)
}

export async function guardarPlaybookAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()

  const closerId = Number(datos.get('closerId'))
  // Un closer carga el suyo; quien configura, el de cualquiera.
  if (usuario.closerId !== closerId) exigir(usuario, 'configurar')

  await guardarPlaybook(closerId, {
    nombre: String(datos.get('nombre') ?? 'Playbook').trim(),
    oferta: texto(datos, 'oferta'),
    script: String(datos.get('script') ?? ''),
  })
  revalidatePath('/llamadas')
  revalidatePath('/configuracion')
}

/**
 * Recalibrar el modelo de scoring.
 *
 * No cuesta una sola llamada al modelo: los niveles ya están guardados, así que
 * se vuelve a puntuar sobre lo que hay. Las notas viejas quedan con su versión,
 * para poder comparar las dos distribuciones antes de adoptar la nueva.
 */
export async function recalibrarAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const configId = Number(datos.get('configId'))
  await recalcular(configId)
  revalidatePath('/llamadas')
  revalidatePath('/configuracion')
}
