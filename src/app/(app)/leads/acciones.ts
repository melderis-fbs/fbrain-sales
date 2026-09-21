'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, exigir } from '@/lib/permisos'
import {
  crearLead, editarLead, posiblesDuplicados, reflotarLead, reasignarCloser,
  exigirAccesoAlLead, type DatosDeLead, type ClaveEditable,
} from '@/datos/leads'
import { cargarResultado, registrarPago } from '@/datos/resultado'
import { guardarCalificacion, congelarQuality } from '@/datos/calificacion'
import { agregarNota, borrarNota } from '@/datos/notas'
import { marcarSeguimientoLargo } from '@/datos/seguimientos'
import { NOMBRE_DE_RESULTADO, type Estado, type Resultado, type MotivoPerdida, type TipoSesion } from '@/dominio/resultados'
import { CAMPOS_LIBRES, CAMPOS_QUE_PUNTUAN } from '@/dominio/calidad'

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

/** Refrescar todo lo que puede haber cambiado. Una pantalla vieja miente igual que un dato mal. */
function refrescar(leadId: number) {
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/tracker')
  revalidatePath('/dashboard')
  revalidatePath('/seguimientos')
}

// ── Alta ────────────────────────────────────────────────────────────────────

export type EstadoDeAlta =
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'duplicados'; mensaje: string
      duplicados: { id: number; nombre: string; porque: string; cerrado: boolean; resultado: string }[] }
  | null

/**
 * Registrar un lead.
 *
 * Con lo mínimo: nombre, cómo contactarlo, de dónde vino y —si ya está la
 * reunión— cuándo. Todo lo demás se carga después en su ficha, por quien lo
 * sepa. Un alta de doce campos obligatorios se completa con datos inventados.
 *
 * Antes de crear busca duplicados y, si encuentra, NO crea: devuelve la lista y
 * espera. El sistema no decide que dos personas son la misma, y tampoco que no
 * lo son. Y si el que ya está es un lead perdido, lo que corresponde no es
 * crear otro: es reflotarlo, porque esa repesca la cobra quien la hace.
 */
export async function crearLeadAccion(_previo: EstadoDeAlta, datos: FormData): Promise<EstadoDeAlta> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const lead: DatosDeLead = {
    nombre: String(datos.get('nombre') ?? '').trim(),
    email: texto(datos, 'email'),
    telefono: texto(datos, 'telefono'),
    pais: texto(datos, 'pais'),
    empresa: texto(datos, 'empresa'),
    industria: texto(datos, 'industria'),
    fuenteId: numero(datos, 'fuenteId'),
    funnelId: numero(datos, 'funnelId'),
    setterId: numero(datos, 'setterId'),
    closerId: numero(datos, 'closerId'),
    fechaSesion: texto(datos, 'fechaSesion'),
    horaSesion: texto(datos, 'horaSesion'),
    tipoSesion: (texto(datos, 'tipoSesion') ?? 'primera') as TipoSesion,
    valorPotencial: numero(datos, 'valorPotencial'),
    moneda: texto(datos, 'moneda') ?? 'USD',
  }
  if (lead.nombre === '') return { tipo: 'error', mensaje: 'El lead necesita un nombre.' }

  if (datos.get('confirmado') !== '1') {
    const encontrados = await posiblesDuplicados(lead)
    if (encontrados.length > 0) {
      return {
        tipo: 'duplicados',
        mensaje: 'Puede que esta persona ya esté cargada. Mirá antes de crear otra ficha.',
        duplicados: encontrados.map((d) => ({
          id: d.id,
          nombre: d.nombre,
          porque: d.porque === 'email' ? 'mismo email'
            : d.porque === 'telefono' ? 'mismo teléfono' : 'nombre parecido',
          cerrado: d.resultado === 'perdida' || d.resultado === 'no_calificado',
          resultado: NOMBRE_DE_RESULTADO[d.resultado] ?? d.resultado,
        })),
      }
    }
  }

  const id = await crearLead(lead, usuario.id)
  revalidatePath('/leads')
  revalidatePath('/tracker')
  redirect(`/leads/${id}`)
}

export async function editarLeadAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const leadId = Number(datos.get('leadId'))
  // El id viene del navegador: es lo que escribió cualquiera, no lo que vio en
  // la pantalla. Se comprueba contra la base.
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const cambios: Partial<Record<ClaveEditable, string | null>> = {}
  for (const campo of ['nombre', 'email', 'telefono', 'pais', 'empresa', 'industria',
                       'fuenteId', 'funnelId', 'setterId', 'fechaSesion', 'horaSesion',
                       'tipoSesion', 'valorPotencial', 'moneda',
                       'links', 'infoNegocio', 'infoExtra'] as ClaveEditable[]) {
    if (datos.has(campo)) cambios[campo] = texto(datos, campo)
  }

  await editarLead(leadId, cambios, usuario.id, texto(datos, 'motivo') ?? undefined)
  refrescar(leadId)
}

export async function reasignarCloserAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'reasignarCloser')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await reasignarCloser(leadId, numero(datos, 'closerId'), usuario.id, texto(datos, 'motivo'))
  // Asignarle el lead a un closer congela el quality con el que se lo va a
  // evaluar. Después de esto, bajarle la calidad al lead ya no cambia su número.
  await congelarQuality(leadId)
  refrescar(leadId)
}

// ── Lo que carga el setter ──────────────────────────────────────────────────

export async function guardarCalificacionAccion(
  _previo: string | null, datos: FormData,
): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const respuestas: Record<string, string | null> = {}
  for (const c of [...CAMPOS_QUE_PUNTUAN.map((x) => x.clave), ...CAMPOS_LIBRES.map((x) => x.clave)]) {
    if (datos.has(c)) respuestas[c] = texto(datos, c)
  }

  const calidad = await guardarCalificacion(leadId, respuestas, usuario.id)
  refrescar(leadId)

  return calidad.score === null
    ? `Guardado. Todavía falta contestar ${calidad.faltan.length} ` +
      `${calidad.faltan.length === 1 ? 'campo' : 'campos'} para que haya un Lead Quality: ` +
      `${calidad.faltan.join(', ')}.`
    : `Guardado. Lead Quality ${calidad.score} · ${calidad.completitud}% de la ficha completa.`
}

// ── Lo que carga el closer ──────────────────────────────────────────────────

export async function cargarResultadoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

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
    throw new Error('Un lead perdido necesita su motivo: es lo que después dice por qué se pierde.')
  }

  await cargarResultado(leadId, {
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

  refrescar(leadId)
}

export async function registrarPagoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarDinero')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const importe = numero(datos, 'importe')
  const fecha = texto(datos, 'fecha')
  if (importe === null || fecha === null) throw new Error('Un cobro necesita importe y fecha.')

  await registrarPago(leadId, {
    importe, fecha,
    moneda: texto(datos, 'moneda') ?? 'USD',
    medio: texto(datos, 'medio'),
    nCuota: numero(datos, 'nCuota'),
  }, usuario.id)
  refrescar(leadId)
}

// ── Repesca ─────────────────────────────────────────────────────────────────

/**
 * Volver a abrir un lead perdido.
 *
 * No se crea otro: se le suma un ciclo al mismo y queda escrito quién lo
 * reflotó, porque esa repesca la cobra quien la hace —suele ser el setter—.
 */
export async function reflotarLeadAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await reflotarLead(leadId, usuario.id, {
    closerId: numero(datos, 'closerId'),
    fechaSesion: texto(datos, 'fechaSesion'),
    horaSesion: texto(datos, 'horaSesion'),
    motivo: texto(datos, 'motivo'),
  })
  refrescar(leadId)
}

// ── Notas ───────────────────────────────────────────────────────────────────

export async function agregarNotaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await agregarNota(leadId, String(datos.get('texto') ?? ''), usuario.id)
  revalidatePath(`/leads/${leadId}`)
}

export async function borrarNotaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await borrarNota(Number(datos.get('notaId')), usuario.id)
  revalidatePath(`/leads/${leadId}`)
}

// ── Seguimiento largo desde la ficha ────────────────────────────────────────

export async function seguimientoLargoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const fecha = texto(datos, 'fecha')
  if (fecha === null) throw new Error('Un seguimiento largo necesita la fecha en la que hay que volver.')

  await marcarSeguimientoLargo(leadId, fecha, usuario.id, texto(datos, 'nota'))
  refrescar(leadId)
}
