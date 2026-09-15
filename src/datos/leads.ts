import 'server-only'
import { escribir, escribirDevolviendo, fila, filas, enTransaccion } from '@/lib/db'
import { clave, plegar, soloDigitos, colaDelTelefono, emailPlegado, oNulo } from '@/lib/texto'
import { condicionDeAlcance, sinEquipoAsignado, type Alcance } from '@/lib/permisos'
import { anotar, type Cambio } from './cambios'
import type { Resultado, Estado, TipoSesion } from '@/dominio/resultados'

export type DatosDeLead = {
  nombre: string
  email?: string | null
  telefono?: string | null
  pais?: string | null
  empresa?: string | null
  fuenteId?: number | null
  funnelId?: number | null
  setterId?: number | null
  notas?: string | null
  links?: string | null
  infoNegocio?: string | null
  infoExtra?: string | null
}

/**
 * Los campos que se pueden editar después de creado un lead.
 *
 * Es literalmente todos. El problema declarado del sistema actual es que una
 * vez registrado un lead no se podía corregir; acá la lista de lo editable y la
 * lista de lo que tiene un lead son la misma lista, y eso no es casualidad: si
 * mañana se agrega un campo, se agrega acá y ya se puede editar.
 */
export const CAMPOS_EDITABLES = [
  { clave: 'nombre', etiqueta: 'Nombre', columna: 'nombre', tipo: 'texto' },
  { clave: 'email', etiqueta: 'Email', columna: 'email', tipo: 'texto' },
  { clave: 'telefono', etiqueta: 'Teléfono', columna: 'telefono', tipo: 'texto' },
  { clave: 'pais', etiqueta: 'País', columna: 'pais', tipo: 'texto' },
  { clave: 'empresa', etiqueta: 'Empresa', columna: 'empresa', tipo: 'texto' },
  { clave: 'fuenteId', etiqueta: 'Fuente', columna: 'fuente_id', tipo: 'opcion' },
  { clave: 'funnelId', etiqueta: 'Funnel', columna: 'funnel_id', tipo: 'opcion' },
  { clave: 'setterId', etiqueta: 'Setter', columna: 'setter_id', tipo: 'opcion' },
  { clave: 'notas', etiqueta: 'Notas', columna: 'notas', tipo: 'largo' },
  { clave: 'links', etiqueta: 'Links', columna: 'links', tipo: 'largo' },
  { clave: 'infoNegocio', etiqueta: 'Información del negocio', columna: 'info_negocio', tipo: 'largo' },
  { clave: 'infoExtra', etiqueta: 'Información adicional', columna: 'info_extra', tipo: 'largo' },
] as const

export type ClaveEditable = (typeof CAMPOS_EDITABLES)[number]['clave']

// ── Duplicados ──────────────────────────────────────────────────────────────

export type PosibleDuplicado = {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
  porque: 'email' | 'telefono' | 'nombre'
  creadoEn: string
}

/**
 * Antes de crear un lead, buscar si ya está.
 *
 * Tres señales, de la más fuerte a la más débil: mismo email, mismo teléfono,
 * nombre parecido. El nombre parecido **no** decide nada: se informa y decide
 * la persona que está cargando. Unir dos registros es una acción explícita.
 */
export async function posiblesDuplicados(datos: DatosDeLead): Promise<PosibleDuplicado[]> {
  const email = emailPlegado(datos.email)
  const tel = colaDelTelefono(datos.telefono)
  const pleg = plegar(datos.nombre)

  const f = await filas<{
    id: number; nombre: string; email: string | null; telefono: string | null
    creado_en: Date; porque: string
  }>(
    `select id, nombre, email, telefono, creado_en,
            case when $1::text is not null and email_pleg = $1 then 'email'
                 when $2::text is not null and right(telefono_pleg, 8) = $2 then 'telefono'
                 else 'nombre' end as porque
       from leads
      where borrado_en is null
        and (($1::text is not null and email_pleg = $1)
          or ($2::text is not null and right(telefono_pleg, 8) = $2)
          or nombre_pleg = $3)
      order by creado_en desc
      limit 10`,
    [email, tel, pleg],
  )

  return f.map((x) => ({
    id: x.id, nombre: x.nombre, email: x.email, telefono: x.telefono,
    porque: x.porque as PosibleDuplicado['porque'], creadoEn: x.creado_en.toISOString(),
  }))
}

// ── Crear ───────────────────────────────────────────────────────────────────

export async function crearLead(datos: DatosDeLead, usuarioId: number): Promise<number> {
  const nombre = clave(datos.nombre)
  if (nombre === '') throw new Error('El lead necesita un nombre.')

  const creado = await escribirDevolviendo<{ id: number }>(
    `insert into leads
       (nombre, nombre_clave, nombre_pleg, email, email_pleg, telefono, telefono_pleg,
        pais, empresa, fuente_id, funnel_id, setter_id, notas, links, info_negocio, info_extra, creado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning id`,
    [
      nombre, nombre, plegar(nombre),
      oNulo(datos.email), emailPlegado(datos.email),
      oNulo(datos.telefono), soloDigitos(datos.telefono),
      oNulo(datos.pais), oNulo(datos.empresa),
      datos.fuenteId ?? null, datos.funnelId ?? null, datos.setterId ?? null,
      oNulo(datos.notas), oNulo(datos.links), oNulo(datos.infoNegocio), oNulo(datos.infoExtra),
      usuarioId,
    ],
  )

  await anotar([{ entidad: 'lead', entidadId: creado.id, campo: 'alta', anterior: null, nuevo: nombre }], usuarioId)
  return creado.id
}

// ── Editar ──────────────────────────────────────────────────────────────────

type FilaLead = Record<string, unknown> & { id: number }

/**
 * Editar un lead ya creado.
 *
 * Nunca se borra y se vuelve a crear. Se cambia el campo, queda el histórico y
 * las oportunidades siguen colgadas del mismo lead.
 */
export async function editarLead(
  leadId: number,
  cambios: Partial<Record<ClaveEditable, string | null>>,
  usuarioId: number,
  motivo?: string,
): Promise<number> {
  const antes = await fila<FilaLead>(
    `select id, ${CAMPOS_EDITABLES.map((c) => c.columna).join(', ')} from leads where id = $1 and borrado_en is null`,
    [leadId],
  )
  if (!antes) throw new Error('Ese lead no existe.')

  const sets: string[] = []
  const valores: unknown[] = []
  const anotaciones: Cambio[] = []
  /** Agrega un valor y devuelve su marcador. Los valores nunca se pegan al SQL. */
  const p = (v: unknown): string => {
    valores.push(v)
    return `$${valores.length}`
  }

  for (const campo of CAMPOS_EDITABLES) {
    if (!(campo.clave in cambios)) continue

    const crudo = cambios[campo.clave]
    const nuevo = campo.tipo === 'opcion'
      ? (crudo === null || crudo === '' ? null : Number(crudo))
      : oNulo(crudo)
    const anterior = antes[campo.columna] ?? null
    if (String(anterior ?? '') === String(nuevo ?? '')) continue

    // Tres campos arrastran su forma normalizada. Si no se actualiza junto con
    // el valor, el buscador y la detección de duplicados quedan mirando el dato
    // viejo y nadie se entera hasta que se duplica un lead.
    if (campo.clave === 'nombre') {
      const n = clave(String(nuevo ?? ''))
      if (n === '') throw new Error('El lead necesita un nombre.')
      sets.push(`nombre = ${p(n)}, nombre_clave = ${p(n)}, nombre_pleg = ${p(plegar(n))}`)
    } else if (campo.clave === 'email') {
      sets.push(`email = ${p(nuevo)}, email_pleg = ${p(emailPlegado(nuevo as string | null))}`)
    } else if (campo.clave === 'telefono') {
      sets.push(`telefono = ${p(nuevo)}, telefono_pleg = ${p(soloDigitos(nuevo as string | null))}`)
    } else {
      sets.push(`${campo.columna} = ${p(nuevo)}`)
    }

    anotaciones.push({
      entidad: 'lead', entidadId: leadId, campo: campo.clave,
      anterior: anterior === null ? null : String(anterior),
      nuevo: nuevo === null ? null : String(nuevo),
      motivo,
    })
  }

  if (sets.length === 0) return 0

  return enTransaccion(async (cx) => {
    await escribir(
      `update leads set ${sets.join(', ')}, actualizado_en = now()
        where id = ${p(leadId)} and borrado_en is null`,
      valores,
      { esperadas: 1, cliente: cx },
    )
    await anotar(anotaciones, usuarioId, cx)
    return anotaciones.length
  })
}

// ── Listar ──────────────────────────────────────────────────────────────────

export type FiltrosDeLead = {
  texto?: string
  fuenteId?: number
  funnelId?: number
  setterId?: number
  closerId?: number
  resultado?: Resultado
  soloAbiertas?: boolean
}

export type LeadEnLista = {
  id: number
  nombre: string
  fuente: string | null
  setter: string | null
  funnel: string | null
  creadoEn: string
  closer: string | null
  estado: Estado | null
  resultado: Resultado | null
  proximoContacto: string | null
  valorPotencial: number | null
  moneda: string | null
  ultimaInteraccion: string | null
  oportunidades: number
}

/**
 * La lista de leads.
 *
 * Trae la ÚLTIMA oportunidad de cada lead, no una fila por oportunidad: la
 * pantalla contesta «cómo viene cada persona», y una persona con tres llamadas
 * no son tres personas.
 */
export async function listarLeads(alcance: Alcance, filtros: FiltrosDeLead = {}, limite = 200): Promise<LeadEnLista[]> {
  if (sinEquipoAsignado(alcance)) return []

  const condiciones = ['l.borrado_en is null']
  const valores: unknown[] = []

  const alc = condicionDeAlcance(alcance, { closer: 'o.closer_id', setter: 'l.setter_id' }, valores.length + 1)
  if (alc.parametro !== null) valores.push(alc.parametro)
  // El alcance del closer mira la oportunidad; el del setter, el lead. Por eso
  // la condición va sobre la lateral y no sobre `leads` a secas.
  const condicionAlcance = alc.condicion

  if (filtros.texto) {
    valores.push(`%${plegar(filtros.texto)}%`)
    condiciones.push(`(l.nombre_pleg like $${valores.length} or l.email_pleg like $${valores.length}
                      or l.telefono_pleg like $${valores.length})`)
  }
  for (const [campo, columna] of [
    ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'], ['setterId', 'l.setter_id'],
  ] as const) {
    const v = filtros[campo]
    if (v !== undefined) { valores.push(v); condiciones.push(`${columna} = $${valores.length}`) }
  }
  if (filtros.closerId !== undefined) { valores.push(filtros.closerId); condiciones.push(`o.closer_id = $${valores.length}`) }
  if (filtros.resultado !== undefined) { valores.push(filtros.resultado); condiciones.push(`o.resultado = $${valores.length}`) }
  if (filtros.soloAbiertas) condiciones.push(`o.resultado in ('pendiente', 'seguimiento', 'sena')`)

  valores.push(limite)

  const f = await filas<{
    id: number; nombre: string; fuente: string | null; setter: string | null; funnel: string | null
    creado_en: Date; closer: string | null; estado: Estado | null; resultado: Resultado | null
    proximo_contacto: string | null; valor_potencial: number | null; moneda: string | null
    ultima: Date | null; oportunidades: number
  }>(
    `select l.id, l.nombre, fu.nombre as fuente, s.nombre as setter, fn.nombre as funnel, l.creado_en,
            c.nombre as closer, o.estado, o.resultado, o.proximo_contacto,
            o.valor_potencial, o.moneda, o.actualizado_en as ultima,
            (select count(*) from oportunidades x where x.lead_id = l.id and x.borrado_en is null) as oportunidades
       from leads l
       left join fuentes fu on fu.id = l.fuente_id
       left join funnels fn on fn.id = l.funnel_id
       left join setters s  on s.id  = l.setter_id
       left join lateral (
            select * from oportunidades o2
             where o2.lead_id = l.id and o2.borrado_en is null
             order by coalesce(o2.fecha_agenda, o2.creado_en::date) desc, o2.id desc
             limit 1
       ) o on true
       left join closers c on c.id = o.closer_id
      where ${condiciones.join(' and ')} and ${condicionAlcance}
      order by coalesce(o.fecha_agenda, l.creado_en::date) desc, l.id desc
      limit $${valores.length}`,
    valores,
  )

  return f.map((x) => ({
    id: x.id, nombre: x.nombre, fuente: x.fuente, setter: x.setter, funnel: x.funnel,
    creadoEn: x.creado_en.toISOString(), closer: x.closer, estado: x.estado, resultado: x.resultado,
    proximoContacto: x.proximo_contacto, valorPotencial: x.valor_potencial, moneda: x.moneda,
    ultimaInteraccion: x.ultima ? x.ultima.toISOString() : null, oportunidades: Number(x.oportunidades),
  }))
}

// ── Ver uno ─────────────────────────────────────────────────────────────────

export type Lead = {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
  pais: string | null
  empresa: string | null
  fuenteId: number | null
  funnelId: number | null
  setterId: number | null
  notas: string | null
  links: string | null
  infoNegocio: string | null
  infoExtra: string | null
  creadoEn: string
}

export async function verLead(leadId: number): Promise<Lead | null> {
  const f = await fila<{
    id: number; nombre: string; email: string | null; telefono: string | null; pais: string | null
    empresa: string | null; fuente_id: number | null; funnel_id: number | null; setter_id: number | null
    notas: string | null; links: string | null; info_negocio: string | null; info_extra: string | null
    creado_en: Date
  }>(
    `select id, nombre, email, telefono, pais, empresa, fuente_id, funnel_id, setter_id,
            notas, links, info_negocio, info_extra, creado_en
       from leads where id = $1 and borrado_en is null`,
    [leadId],
  )
  if (!f) return null
  return {
    id: f.id, nombre: f.nombre, email: f.email, telefono: f.telefono, pais: f.pais, empresa: f.empresa,
    fuenteId: f.fuente_id, funnelId: f.funnel_id, setterId: f.setter_id,
    notas: f.notas, links: f.links, infoNegocio: f.info_negocio, infoExtra: f.info_extra,
    creadoEn: f.creado_en.toISOString(),
  }
}

/**
 * ¿Este usuario puede tocar este lead?
 *
 * Lo usan las acciones que reciben un id desde el navegador. Un id en el cuerpo
 * de un pedido es lo que escribió cualquiera, no lo que vio en la pantalla, así
 * que se comprueba contra la base y no contra lo que llegó.
 */
export async function puedeVerLead(leadId: number, alcance: Alcance): Promise<boolean> {
  if (alcance.todo) {
    return (await fila('select 1 from leads where id = $1 and borrado_en is null', [leadId])) !== null
  }
  if ('nada' in alcance) return false
  if ('setterId' in alcance) {
    return (await fila('select 1 from leads where id = $1 and setter_id = $2 and borrado_en is null',
      [leadId, alcance.setterId])) !== null
  }
  return (await fila(
    `select 1 from oportunidades where lead_id = $1 and closer_id = $2 and borrado_en is null limit 1`,
    [leadId, alcance.closerId],
  )) !== null
}

export type TipoDeSesion = TipoSesion
