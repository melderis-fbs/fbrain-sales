'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, exigir, puede } from '@/lib/permisos'
import { exigirAccesoAlLead } from '@/datos/leads'
import {
  registrarInteraccion, moverAToque, marcarSeguimientoLargo, salirDelPipeline,
  entrarAlPipeline, guardarCadencia, registrarEnTanda, posponerEnTanda,
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
/**
 * Lo que contestó el servidor. El mismo tipo que usa la ficha del lead.
 *
 * Estas cuatro acciones devolvían `void` y dejaban salir la excepción. En
 * producción Next reemplaza el mensaje por «An error occurred in the Server
 * Components render» y un digest, así que cualquier problema al registrar un
 * toque terminaba en la pantalla rota sin decir qué. Es el mismo defecto que
 * ya se arregló en la pestaña Resultado; acá estaba igual.
 */
export type Hecho = { ok: boolean; mensaje: string } | null

export async function registrarToqueAccion(_previo: Hecho, datos: FormData): Promise<Hecho> {
  const usuario = await exigirUsuario()
  if (!puede(usuario, 'cargarResultado')) {
    return { ok: false, mensaje: 'Tu rol no puede registrar toques.' }
  }

  const leadId = Number(datos.get('leadId'))
  const estado = String(datos.get('estado') ?? '') as EstadoToque
  const nota = datos.get('nota') === null ? null : String(datos.get('nota')).trim() || null

  try {
    await exigirAccesoAlLead(leadId, alcanceDe(usuario))
    if (!ESTADOS_TOQUE.includes(estado)) throw new Error('Ese estado de seguimiento no existe.')
    const r = await registrarInteraccion(leadId, estado, nota, usuario.id)
    refrescar(leadId)
    return {
      ok: true,
      mensaje: r.salio
        ? 'Registrado. Sale de la cadencia.'
        : `Registrado. Pasa al toque ${r.toque}.`,
    }
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo registrar el toque.' }
  }
}

/**
 * El mismo toque en varios leads de una vez.
 *
 * Es lo que hace que treinta atrasados se puedan bajar. Sin esto son sesenta
 * clics para decir sesenta veces lo mismo, y lo que se hace en vez de eso es
 * dejar de abrir la pantalla.
 */
export async function registrarTandaAccion(_previo: Hecho, datos: FormData): Promise<Hecho> {
  const usuario = await exigirUsuario()
  if (!puede(usuario, 'cargarResultado')) {
    return { ok: false, mensaje: 'Tu rol no puede registrar toques.' }
  }

  const ids = datos.getAll('leadId').map(Number).filter(Number.isInteger)
  if (ids.length === 0) return { ok: false, mensaje: 'No hay ninguno elegido.' }

  const nota = datos.get('nota') === null ? null : String(datos.get('nota')).trim() || null
  const posponerA = datos.get('fecha') === null ? null : String(datos.get('fecha')).trim() || null
  const que = String(datos.get('que') ?? 'toque')

  try {
    for (const id of ids) await exigirAccesoAlLead(id, alcanceDe(usuario))
  } catch {
    return { ok: false, mensaje: 'Hay un lead al que no tenés acceso. No se registró nada.' }
  }

  try {
    if (que === 'posponer') {
      if (posponerA === null) return { ok: false, mensaje: 'Elegí para cuándo los posponés.' }
      const r = await posponerEnTanda(ids, posponerA, usuario.id, nota)
      refrescar()
      return { ok: r.fallaron.length === 0, mensaje: resumen(r, 'pospuesto', 'pospuestos') }
    }

    const estado = String(datos.get('estado') ?? '') as EstadoToque
    if (!ESTADOS_TOQUE.includes(estado)) return { ok: false, mensaje: 'Ese estado no existe.' }
    const r = await registrarEnTanda(ids, estado, nota, usuario.id)
    refrescar()
    return { ok: r.fallaron.length === 0, mensaje: resumen(r, 'registrado', 'registrados') }
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo hacer la tanda.' }
  }
}

/**
 * Qué pasó con la tanda, sin esconder lo que falló.
 *
 * Una tanda que dice «listo» habiendo dejado tres afuera es peor que una que
 * falla entera: los tres quedan atrasados y nadie los mira de nuevo.
 */
function resumen(
  r: { hechos: number; fallaron: { leadId: number; porque: string }[] },
  uno: string, varios: string,
): string {
  const hechos = `${r.hechos} ${r.hechos === 1 ? uno : varios}`
  if (r.fallaron.length === 0) return `${hechos}.`
  return `${hechos}. ${r.fallaron.length} no se ${r.fallaron.length === 1 ? 'pudo' : 'pudieron'}: ` +
         `${r.fallaron.map((f) => f.porque).join(' · ')}`
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

export async function largoAccion(_previo: Hecho, datos: FormData): Promise<Hecho> {
  const usuario = await exigirUsuario()
  if (!puede(usuario, 'cargarResultado')) {
    return { ok: false, mensaje: 'Tu rol no puede posponer un seguimiento.' }
  }

  const leadId = Number(datos.get('leadId'))
  const fecha = datos.get('fecha') === null ? null : String(datos.get('fecha')).trim() || null

  try {
    await exigirAccesoAlLead(leadId, alcanceDe(usuario))
    if (fecha === null) throw new Error('Un seguimiento largo necesita la fecha en la que hay que volver.')
    await marcarSeguimientoLargo(leadId, fecha, usuario.id,
      datos.get('nota') === null ? null : String(datos.get('nota')).trim() || null)
    refrescar(leadId)
    return { ok: true, mensaje: 'Pospuesto. Vuelve a aparecer ese día.' }
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo posponer.' }
  }
}

export async function sacarDelPipelineAccion(_previo: Hecho, datos: FormData): Promise<Hecho> {
  const usuario = await exigirUsuario()
  if (!puede(usuario, 'cargarResultado')) {
    return { ok: false, mensaje: 'Tu rol no puede sacar leads del pipeline.' }
  }

  const leadId = Number(datos.get('leadId'))
  try {
    await exigirAccesoAlLead(leadId, alcanceDe(usuario))
    await salirDelPipeline(leadId, 'a_mano')
    refrescar(leadId)
    return { ok: true, mensaje: 'Fuera de la cadencia. Se puede volver a meter.' }
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo sacar.' }
  }
}

export async function volverAlPipelineAccion(_previo: Hecho, datos: FormData): Promise<Hecho> {
  const usuario = await exigirUsuario()
  if (!puede(usuario, 'cargarResultado')) {
    return { ok: false, mensaje: 'Tu rol no puede meter leads al pipeline.' }
  }

  const leadId = Number(datos.get('leadId'))
  try {
    await exigirAccesoAlLead(leadId, alcanceDe(usuario))
    await entrarAlPipeline(leadId)
    refrescar(leadId)
    return { ok: true, mensaje: 'De vuelta en la cadencia, desde el primer toque.' }
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo volver a meter.' }
  }
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
