'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, exigir, puede } from '@/lib/permisos'
import { exigirAccesoAlLead } from '@/datos/leads'
import { crearLlamada, guardarTranscripcion, verLlamada, llamadasDelLead } from '@/datos/llamadas'
import { guardarPlaybook } from '@/datos/playbooks'
import { analizarLlamada } from '@/ia/correr'
import { recalcular } from '@/datos/analisis'
import type { TipoSesion } from '@/dominio/resultados'
import type { Guardado } from '../leads/acciones'

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
/**
 * Abrir la transcripción de un lead, creando la llamada si hace falta.
 *
 * Antes había que «registrar la llamada» y recién después subir el texto. Ese
 * paso no aporta nada: si hay una reunión cargada, la llamada existió. Pedirlo
 * es la clase de fricción que hace que las transcripciones no se suban, y sin
 * transcripciones el analizador no existe.
 */
export async function abrirTranscripcionAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const existentes = await llamadasDelLead(leadId)
  const llamadaId = existentes[0]?.id ?? await crearLlamada(leadId, {
    fecha: texto(datos, 'fecha'),
    tipoSesion: (texto(datos, 'tipoSesion') ?? 'primera') as TipoSesion,
  })

  revalidatePath('/llamadas')
  redirect(`/analizador/${llamadaId}`)
}

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
  revalidatePath(`/analizador/${llamadaId}`)
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

  revalidatePath(`/analizador/${llamadaId}`)
  revalidatePath(`/leads/${llamada.leadId}`)
  revalidatePath('/llamadas')
  // A la pantalla del informe, que es la que existe. Iba a `/llamadas/{id}`,
  // que no es una ruta de esta aplicación: el análisis se guardaba bien y el
  // que lo había lanzado terminaba en un 404 después de esperar dos minutos.
  // Del otro lado eso se lee como que el analizador no anda —aunque el
  // informe estuviera hecho y cualquier otro pudiera verlo.
  redirect(`/analizador/${llamadaId}`)
}

/**
 * Guardar el playbook, y DECIR si se guardó.
 *
 * Antes tiraba la excepción y devolvía `void`: el guion corto, el peso mal
 * sumado o la cuenta sin closer vinculado terminaban en un error que sólo
 * existía en el log del servidor. Del lado del que carga, el botón no hacía
 * nada. Un botón que a veces guarda y a veces no hace nada, sin diferencia
 * visible entre las dos cosas, es peor que uno que no existe: el closer
 * termina creyendo que el analizador no le anda a él.
 */
export async function guardarPlaybookAccion(
  _previo: Guardado, datos: FormData,
): Promise<Guardado> {
  const usuario = await exigirUsuario()

  const closerId = Number(datos.get('closerId'))
  if (!Number.isInteger(closerId)) {
    return { ok: false, mensaje: 'Elegí a qué closer es este playbook. Si el desplegable está ' +
                                 'vacío, tu cuenta todavía no está vinculada a un closer: se ' +
                                 'vincula en Configuración, en «El equipo».' }
  }
  // Un closer carga el suyo; quien configura, el de cualquiera.
  if (usuario.closerId !== closerId && !puede(usuario, 'configurar')) {
    return { ok: false, mensaje: 'Sólo podés cargar tu propio playbook.' }
  }

  // Las fases vienen numeradas desde la pantalla. Se leen mientras haya
  // alguna: la cantidad la decide quien carga, no una constante de acá.
  const fases: { nombre: string; peso: unknown; objetivo: string; comoSeHace: string }[] = []
  for (let i = 0; datos.has(`fase${i}Nombre`); i++) {
    fases.push({
      nombre: String(datos.get(`fase${i}Nombre`) ?? ''),
      peso: datos.get(`fase${i}Peso`),
      objetivo: String(datos.get(`fase${i}Objetivo`) ?? ''),
      comoSeHace: String(datos.get(`fase${i}Como`) ?? ''),
    })
  }

  try {
    await guardarPlaybook(closerId, {
      nombre: String(datos.get('nombre') ?? 'Playbook').trim(),
      oferta: texto(datos, 'oferta'),
      script: String(datos.get('script') ?? ''),
      fases,
    })
  } catch (error) {
    return { ok: false, mensaje: error instanceof Error ? error.message : 'No se pudo guardar.' }
  }

  revalidatePath('/llamadas')
  revalidatePath('/analizador')
  revalidatePath('/configuracion')
  return { ok: true, mensaje: `Guardado. Es la versión nueva del playbook, y desde ahora las ` +
                              `llamadas de ese closer se miden contra estas ${fases.length} fases.` }
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
