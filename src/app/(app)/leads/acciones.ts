'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, exigir } from '@/lib/permisos'
import {
  crearLead, editarLead, posiblesDuplicados, puedeVerLead,
  type DatosDeLead, type ClaveEditable,
} from '@/datos/leads'
import {
  crearOportunidad, reasignarCloser, cargarResultado, leadDeLaOportunidad,
} from '@/datos/oportunidades'
import type { Estado, Resultado, MotivoPerdida, TipoSesion } from '@/dominio/resultados'

function texto(datos: FormData, campo: string): string | null {
  const v = datos.get(campo)
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function numero(datos: FormData, campo: string): number | null {
  const s = texto(datos, campo)
  if (s === null) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function leerLead(datos: FormData): DatosDeLead {
  return {
    nombre: String(datos.get('nombre') ?? '').trim(),
    email: texto(datos, 'email'),
    telefono: texto(datos, 'telefono'),
    pais: texto(datos, 'pais'),
    empresa: texto(datos, 'empresa'),
    fuenteId: numero(datos, 'fuenteId'),
    funnelId: numero(datos, 'funnelId'),
    setterId: numero(datos, 'setterId'),
    notas: texto(datos, 'notas'),
    links: texto(datos, 'links'),
    infoNegocio: texto(datos, 'infoNegocio'),
    infoExtra: texto(datos, 'infoExtra'),
  }
}

export type EstadoDeAlta =
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'duplicados'; mensaje: string; duplicados: { id: number; nombre: string; porque: string }[] }
  | null

/**
 * Registrar un lead.
 *
 * Antes de crear busca duplicados y, si encuentra, NO crea: devuelve la lista y
 * espera. El sistema no decide que dos personas son la misma, y tampoco decide
 * que no lo son. Con `confirmado` la persona dice «sí, es otro» y ahí entra.
 */
export async function crearLeadAccion(_previo: EstadoDeAlta, datos: FormData): Promise<EstadoDeAlta> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const lead = leerLead(datos)
  if (lead.nombre === '') return { tipo: 'error', mensaje: 'El lead necesita un nombre.' }

  if (datos.get('confirmado') !== '1') {
    const encontrados = await posiblesDuplicados(lead)
    if (encontrados.length > 0) {
      return {
        tipo: 'duplicados',
        mensaje: 'Puede que este lead ya esté cargado. Mirá antes de crear otro.',
        duplicados: encontrados.map((d) => ({
          id: d.id,
          nombre: d.nombre,
          porque: d.porque === 'email' ? 'mismo email'
            : d.porque === 'telefono' ? 'mismo teléfono' : 'nombre parecido',
        })),
      }
    }
  }

  const id = await crearLead(lead, usuario.id)

  // Si vino con fecha de reunión, se crea la primera oportunidad de una.
  const fecha = texto(datos, 'fechaAgenda')
  const closerId = numero(datos, 'closerId')
  if (fecha || closerId) {
    await crearOportunidad({
      leadId: id,
      closerId,
      tipoSesion: (texto(datos, 'tipoSesion') ?? 'primera') as TipoSesion,
      fechaAgenda: fecha,
      horaAgenda: texto(datos, 'horaAgenda'),
      valorPotencial: numero(datos, 'valorPotencial'),
      moneda: texto(datos, 'moneda') ?? 'USD',
    }, usuario.id)
  }

  redirect(`/leads/${id}`)
}

export async function editarLeadAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const leadId = Number(datos.get('leadId'))
  // El id viene del navegador: es lo que escribió cualquiera, no lo que vio en
  // la pantalla. Se comprueba contra la base.
  if (!(await puedeVerLead(leadId, alcanceDe(usuario)))) throw new Error('No tenés acceso a ese lead.')

  const cambios: Partial<Record<ClaveEditable, string | null>> = {}
  for (const campo of ['nombre', 'email', 'telefono', 'pais', 'empresa', 'fuenteId', 'funnelId',
                       'setterId', 'notas', 'links', 'infoNegocio', 'infoExtra'] as ClaveEditable[]) {
    if (datos.has(campo)) cambios[campo] = texto(datos, campo)
  }

  await editarLead(leadId, cambios, usuario.id, texto(datos, 'motivo') ?? undefined)
  revalidatePath(`/leads/${leadId}`)
}

export async function nuevaOportunidadAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const leadId = Number(datos.get('leadId'))
  if (!(await puedeVerLead(leadId, alcanceDe(usuario)))) throw new Error('No tenés acceso a ese lead.')

  await crearOportunidad({
    leadId,
    closerId: numero(datos, 'closerId'),
    tipoSesion: (texto(datos, 'tipoSesion') ?? 'segunda') as TipoSesion,
    fechaAgenda: texto(datos, 'fechaAgenda'),
    horaAgenda: texto(datos, 'horaAgenda'),
    valorPotencial: numero(datos, 'valorPotencial'),
    moneda: texto(datos, 'moneda') ?? 'USD',
  }, usuario.id)

  revalidatePath(`/leads/${leadId}`)
}

export async function reasignarCloserAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'reasignarCloser')

  const oportunidadId = Number(datos.get('oportunidadId'))
  const leadId = await leadDeLaOportunidad(oportunidadId)
  if (leadId === null) throw new Error('Esa oportunidad no existe.')
  if (!(await puedeVerLead(leadId, alcanceDe(usuario)))) throw new Error('No tenés acceso a ese lead.')

  await reasignarCloser(oportunidadId, numero(datos, 'closerId'), usuario.id, texto(datos, 'motivo'))
  revalidatePath(`/leads/${leadId}`)
}

export async function cargarResultadoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const oportunidadId = Number(datos.get('oportunidadId'))
  const leadId = await leadDeLaOportunidad(oportunidadId)
  if (leadId === null) throw new Error('Esa oportunidad no existe.')
  if (!(await puedeVerLead(leadId, alcanceDe(usuario)))) throw new Error('No tenés acceso a ese lead.')

  const resultado = texto(datos, 'resultado') as Resultado | null
  const moneda = texto(datos, 'moneda') ?? 'USD'
  const importe = numero(datos, 'importe')
  const fecha = texto(datos, 'fecha')

  if ((resultado === 'venta' || resultado === 'sena') && (importe === null || fecha === null)) {
    throw new Error(
      resultado === 'venta'
        ? 'Una venta necesita importe y fecha: sin eso no se puede contar en facturación.'
        : 'Una seña necesita importe y fecha.',
    )
  }
  if (resultado === 'perdida' && texto(datos, 'motivoPerdida') === null) {
    throw new Error('Una oportunidad perdida necesita su motivo: es lo que después dice por qué se pierde.')
  }

  await cargarResultado(oportunidadId, {
    estado: (texto(datos, 'estado') ?? undefined) as Estado | undefined,
    resultado: resultado ?? undefined,
    huboOferta: datos.has('huboOferta') ? datos.get('huboOferta') === 'on' : undefined,
    motivoPerdida: (texto(datos, 'motivoPerdida') ?? null) as MotivoPerdida | null,
    proximoContacto: texto(datos, 'proximoContacto'),
    proximoPaso: texto(datos, 'proximoPaso'),
    observaciones: texto(datos, 'observaciones'),
    ...(resultado === 'venta' && importe !== null && fecha !== null
      ? { venta: { importe, moneda, fecha, programa: texto(datos, 'programa') } }
      : {}),
    ...(resultado === 'sena' && importe !== null && fecha !== null
      ? { sena: {
            importe, moneda, fecha,
            saldoPendiente: numero(datos, 'saldoPendiente'),
            fechaComprometida: texto(datos, 'fechaComprometida'),
          } }
      : {}),
  }, usuario.id)

  revalidatePath(`/leads/${leadId}`)
}
