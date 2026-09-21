'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, exigir } from '@/lib/permisos'
import { exigirAccesoAlLead } from '@/datos/leads'
import {
  registrarInteraccion, moverAToque, marcarSeguimientoLargo, salirDelPipeline,
  entrarAlPipeline, guardarCadencia,
} from '@/datos/seguimientos'
import { ESTADOS_TOQUE, type EstadoToque } from '@/dominio/seguimientos'

function refrescar(leadId?: number) {
  revalidatePath('/seguimientos')
  revalidatePath('/tracker')
  revalidatePath('/dashboard')
  if (leadId) revalidatePath(`/leads/${leadId}`)
}

/**
 * Registrar qué pasó en un toque.
 *
 * La tarjeta se mueve sola al siguiente y la fecha se recuenta desde HOY, no
 * desde el día en que el toque tocaba. Es la diferencia entre una cadencia que
 * se puede seguir y una que se llena de vencidos el primer día que alguien se
 * atrasa.
 */
export async function registrarToqueAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const estado = String(datos.get('estado') ?? '') as EstadoToque
  if (!ESTADOS_TOQUE.includes(estado)) throw new Error('Ese estado de seguimiento no existe.')

  const nota = datos.get('nota') === null ? null : String(datos.get('nota')).trim() || null
  await registrarInteraccion(leadId, estado, nota, usuario.id)
  refrescar(leadId)
}

/** Moverlo a mano: la cadencia no siempre describe lo que pasó. */
export async function moverToqueAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const toque = Number(datos.get('toque'))
  if (!Number.isInteger(toque) || toque < 1) throw new Error('Ese toque no existe.')

  await moverAToque(leadId, toque, usuario.id)
  refrescar(leadId)
}

export async function largoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const fecha = datos.get('fecha') === null ? null : String(datos.get('fecha')).trim() || null
  if (fecha === null) throw new Error('Un seguimiento largo necesita la fecha en la que hay que volver.')

  await marcarSeguimientoLargo(leadId, fecha, usuario.id,
    datos.get('nota') === null ? null : String(datos.get('nota')).trim() || null)
  refrescar(leadId)
}

export async function sacarDelPipelineAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await salirDelPipeline(leadId)
  refrescar(leadId)
}

export async function volverAlPipelineAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await entrarAlPipeline(leadId)
  refrescar(leadId)
}

/**
 * Cambiar los nombres y los días de la cadencia.
 *
 * Hace falta de verdad: en tres meses, cuando se vea qué toque convierte, esta
 * tabla va a cambiar — y que cambiarla exija un deploy es lo que hace que no
 * cambie nunca.
 */
export async function guardarCadenciaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const lineas: { orden: number; nombre: string; dias: number; activo: boolean }[] = []
  for (const [clave, valor] of datos.entries()) {
    const m = clave.match(/^nombre_(\d+)$/)
    if (!m) continue
    const orden = Number(m[1])
    const nombre = String(valor).trim()
    const dias = Number(datos.get(`dias_${orden}`))
    if (nombre === '' || !Number.isFinite(dias)) continue
    lineas.push({ orden, nombre, dias, activo: datos.get(`activo_${orden}`) === 'on' })
  }
  if (lineas.length === 0) throw new Error('No llegó ninguna línea de la cadencia.')

  await guardarCadencia(lineas, usuario.id)
  revalidatePath('/seguimientos')
  revalidatePath('/configuracion')
}
