import 'server-only'
import type { PoolClient } from 'pg'
import { escribir, escribirDevolviendo, fila, filas, enTransaccion } from '@/lib/db'
import { clave, plegar, soloDigitos, colaDelTelefono, emailPlegado, oNulo } from '@/lib/texto'
import { condicionDeAlcance, sinEquipoAsignado, type Alcance } from '@/lib/permisos'
import { anotar, type Cambio } from './cambios'
import type { Resultado, Estado, TipoSesion } from '@/dominio/resultados'
import type { NivelDeCalidad } from '@/dominio/calidad'

/**
 * El lead.
 *
 * María no es «un lead con dos oportunidades»: María ES la oportunidad de
 * venta. Las llamadas que hagan falta para cerrarla —una, dos o tres— cuelgan
 * de ella y no la multiplican. Esa capa de más era lo que hacía que la misma
 * persona apareciera tres veces en una lista de «leads».
 *
 * Cuando un lead perdido se vuelve a abrir, es EL MISMO lead con un ciclo más.
 * Partirlo en dos registros perdería la historia justo cuando la historia es lo
 * que sirve — y además hay que saber quién lo reflotó, porque esa repesca se
 * cobra.
 */

// ── Alta ────────────────────────────────────────────────────────────────────

/**
 * Lo mínimo para crear un lead.
 *
 * A propósito corto. Todo lo demás —la calificación, el diagnóstico, la
 * plata— se carga después en su pestaña de la ficha, por la persona que lo
 * sabe y en el momento en que lo sabe. Un alta de doce campos obligatorios se
 * completa con datos inventados.
 */
export type DatosDeLead = {
  nombre: string
  email?: string | null
  telefono?: string | null
  pais?: string | null
  empresa?: string | null
  industria?: string | null
  fuenteId?: number | null
  funnelId?: number | null
  setterId?: number | null
  closerId?: number | null
  fechaSesion?: string | null
  horaSesion?: string | null
  tipoSesion?: TipoSesion
  valorPotencial?: number | null
  moneda?: string | null
}

export const CAMPOS_EDITABLES = [
  { clave: 'nombre', etiqueta: 'Nombre', columna: 'nombre', tipo: 'texto' },
  { clave: 'email', etiqueta: 'Email', columna: 'email', tipo: 'texto' },
  { clave: 'telefono', etiqueta: 'Teléfono', columna: 'telefono', tipo: 'texto' },
  { clave: 'pais', etiqueta: 'País', columna: 'pais', tipo: 'texto' },
  { clave: 'empresa', etiqueta: 'Empresa', columna: 'empresa', tipo: 'texto' },
  { clave: 'industria', etiqueta: 'Industria', columna: 'industria', tipo: 'texto' },
  { clave: 'fuenteId', etiqueta: 'Fuente', columna: 'fuente_id', tipo: 'opcion' },
  { clave: 'funnelId', etiqueta: 'Funnel', columna: 'funnel_id', tipo: 'opcion' },
  { clave: 'setterId', etiqueta: 'Setter', columna: 'setter_id', tipo: 'opcion' },
  { clave: 'fechaSesion', etiqueta: 'Fecha de la reunión', columna: 'fecha_sesion', tipo: 'fecha' },
  { clave: 'horaSesion', etiqueta: 'Hora', columna: 'hora_sesion', tipo: 'texto' },
  { clave: 'tipoSesion', etiqueta: 'Tipo de sesión', columna: 'tipo_sesion', tipo: 'texto' },
  { clave: 'valorPotencial', etiqueta: 'Valor potencial', columna: 'valor_potencial', tipo: 'numero' },
  { clave: 'moneda', etiqueta: 'Moneda', columna: 'moneda', tipo: 'texto' },
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
  resultado: Resultado
  creadoEn: string
}

/**
 * Antes de crear un lead, buscar si ya está.
 *
 * Tres señales, de la más fuerte a la más débil: mismo email, mismo teléfono,
 * nombre parecido. El nombre parecido **no** decide nada: se informa y decide
 * la persona que está cargando.
 *
 * Y hay un caso que importa más que el duplicado: que el que ya está sea un
 * lead PERDIDO. Ahí no se crea uno nuevo, se reflota —y la repesca la cobra
 * quien la hizo—. Por eso viene el resultado en la respuesta.
 */
export async function posiblesDuplicados(datos: DatosDeLead): Promise<PosibleDuplicado[]> {
  const email = emailPlegado(datos.email)
  const tel = colaDelTelefono(datos.telefono)
  const pleg = plegar(datos.nombre)

  const f = await filas<{
    id: number; nombre: string; email: string | null; telefono: string | null
    creado_en: Date; porque: string; resultado: Resultado
  }>(
    `select id, nombre, email, telefono, creado_en, resultado,
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
    porque: x.porque as PosibleDuplicado['porque'], resultado: x.resultado,
    creadoEn: x.creado_en.toISOString(),
  }))
}

// ── Crear ───────────────────────────────────────────────────────────────────

export async function crearLead(datos: DatosDeLead, usuarioId: number): Promise<number> {
  const nombre = clave(datos.nombre)
  if (nombre === '') throw new Error('El lead necesita un nombre.')

  return enTransaccion(async (cx) => {
    const creado = await escribirDevolviendo<{ id: number }>(
      `insert into leads
         (nombre, nombre_clave, nombre_pleg, email, email_pleg, telefono, telefono_pleg,
          pais, empresa, industria, fuente_id, funnel_id, setter_id,
          closer_id, closer_inicial_id, fecha_sesion, hora_sesion, tipo_sesion,
          valor_potencial, moneda, creado_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$16,$17,$18,$19,$20)
       returning id`,
      [
        nombre, nombre, plegar(nombre),
        oNulo(datos.email), emailPlegado(datos.email),
        oNulo(datos.telefono), soloDigitos(datos.telefono),
        oNulo(datos.pais), oNulo(datos.empresa), oNulo(datos.industria),
        datos.fuenteId ?? null, datos.funnelId ?? null, datos.setterId ?? null,
        datos.closerId ?? null,
        oNulo(datos.fechaSesion), oNulo(datos.horaSesion), datos.tipoSesion ?? 'primera',
        datos.valorPotencial ?? null, datos.moneda ?? 'USD',
        usuarioId,
      ],
      cx,
    )

    await anotar([{ entidad: 'lead', entidadId: creado.id, campo: 'alta', anterior: null, nuevo: nombre }],
      usuarioId, cx)
    return creado.id
  })
}

// ── Repesca ─────────────────────────────────────────────────────────────────

/**
 * Volver a abrir un lead perdido.
 *
 * No se crea otro registro: se le suma un ciclo al mismo, se vuelve a poner en
 * juego y queda escrito quién lo reflotó. Eso último es lo que hace que la
 * comisión de repesca se pueda pagar sin discutir; suele ser el setter, y hoy
 * no queda rastro de que fue él.
 */
export async function reflotarLead(
  leadId: number,
  usuarioId: number,
  datos: { closerId?: number | null; fechaSesion?: string | null; horaSesion?: string | null; motivo?: string | null },
): Promise<number> {
  const antes = await fila<{ ciclo: number; resultado: Resultado }>(
    'select ciclo, resultado from leads where id = $1 and borrado_en is null', [leadId],
  )
  if (!antes) throw new Error('Ese lead no existe.')

  const ciclo = antes.ciclo + 1

  await enTransaccion(async (cx) => {
    await escribir(
      `update leads
          set ciclo = $1, reflotado_por = $2, reflotado_en = now(),
              estado = 'agendado', resultado = 'pendiente', hubo_oferta = false,
              motivo_perdida = null, tipo_sesion = 'seguimiento',
              closer_id = coalesce($3, closer_id),
              fecha_sesion = $4, hora_sesion = $5, actualizado_en = now()
        where id = $6 and borrado_en is null`,
      [ciclo, usuarioId, datos.closerId ?? null,
       oNulo(datos.fechaSesion), oNulo(datos.horaSesion), leadId],
      { esperadas: 1, cliente: cx },
    )
    // Al reflotar, el lead sale del pipeline de seguimientos: está otra vez en
    // agenda, no en cadencia.
    await escribir(
      `update seguimiento_estado set situacion = 'fuera', salio_en = current_date, actualizado_en = now()
        where lead_id = $1 and situacion <> 'fuera'`,
      [leadId], { esperadas: 'cualquiera', cliente: cx },
    )
    await anotar([{
      entidad: 'lead', entidadId: leadId, campo: 'repesca',
      anterior: `ciclo ${antes.ciclo} · ${antes.resultado}`, nuevo: `ciclo ${ciclo}`,
      motivo: datos.motivo ?? null,
    }], usuarioId, cx)
  })

  return ciclo
}

// ── Editar ──────────────────────────────────────────────────────────────────

type FilaLead = Record<string, unknown> & { id: number }

/**
 * Editar un lead ya creado.
 *
 * Nunca se borra y se vuelve a crear. Se cambia el campo, queda el histórico y
 * todo lo que cuelga del lead —llamadas, notas, seguimiento— se queda donde
 * estaba.
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
    const nuevo = campo.tipo === 'opcion' || campo.tipo === 'numero'
      ? (crudo === null || crudo === '' ? null : Number(String(crudo).replace(/\./g, '').replace(',', '.')))
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

// ── Reasignar closer ────────────────────────────────────────────────────────

/**
 * Cambiar el closer de un lead.
 *
 * El caso que el sistema anterior obligaba a resolver borrando y recreando: si
 * el lead era de Kevin y ahora va a Braian, se cambia la asignación y queda el
 * histórico. El closer INICIAL no se pisa nunca: sin él no se puede repartir
 * un cierre que tocaron dos personas.
 */
export async function reasignarCloser(
  leadId: number,
  closerId: number | null,
  usuarioId: number,
  motivo: string | null,
): Promise<void> {
  const antes = await fila<{ closer_id: number | null; nombre: string | null }>(
    `select l.closer_id, c.nombre
       from leads l left join closers c on c.id = l.closer_id
      where l.id = $1 and l.borrado_en is null`,
    [leadId],
  )
  if (!antes) throw new Error('Ese lead no existe.')
  if (antes.closer_id === closerId) return

  const despues = closerId === null ? null
    : await fila<{ nombre: string }>('select nombre from closers where id = $1', [closerId])

  await enTransaccion(async (cx) => {
    await escribir(
      `update leads
          set closer_id = $1,
              closer_inicial_id = coalesce(closer_inicial_id, $1),
              actualizado_en = now()
        where id = $2 and borrado_en is null`,
      [closerId, leadId], { esperadas: 1, cliente: cx },
    )
    await anotar([{
      entidad: 'lead', entidadId: leadId, campo: 'closer',
      anterior: antes.nombre, nuevo: despues?.nombre ?? null, motivo,
    }], usuarioId, cx)
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
  estado?: Estado
  desde?: string
  hasta?: string
  soloAbiertos?: boolean
  soloSinCargar?: boolean
  /** Los que todavía no tienen fecha de reunión: no entran a ninguna métrica. */
  sinFecha?: boolean
}

export type LeadEnLista = {
  id: number
  nombre: string
  empresa: string | null
  fuente: string | null
  setter: string | null
  funnel: string | null
  closer: string | null
  fechaSesion: string | null
  horaSesion: string | null
  estado: Estado
  resultado: Resultado
  ciclo: number
  proximoContacto: string | null
  valorPotencial: number | null
  moneda: string
  calidadScore: number | null
  calidadNivel: NivelDeCalidad | null
  llamadas: number
  /** La última llamada registrada, para poder subirle la transcripción. */
  llamadaId: number | null
  tieneTranscripcion: boolean
  /** La nota de la última llamada analizada. */
  notaLlamada: number | null
  creadoEn: string
}

const SELECT_LISTA = `
  select l.id, l.nombre, l.empresa, l.fecha_sesion, l.hora_sesion, l.estado, l.resultado, l.ciclo,
         l.proximo_contacto, l.valor_potencial, l.moneda, l.creado_en,
         fu.nombre as fuente, fn.nombre as funnel, s.nombre as setter, c.nombre as closer,
         q.score as calidad_score, q.nivel as calidad_nivel,
         (select count(*) from llamadas x where x.lead_id = l.id) as llamadas,
         ll.id as llamada_id, ll.tiene_transcripcion, ll.score as nota_llamada
    from leads l
    left join lateral (
         select x.id,
                exists (select 1 from transcripciones t where t.llamada_id = x.id) as tiene_transcripcion,
                (select cs.score from call_scores cs
                   join analisis a on a.id = cs.analisis_id
                  where a.llamada_id = x.id and cs.vigente
                  order by cs.creado_en desc limit 1) as score
           from llamadas x
          where x.lead_id = l.id
          order by x.fecha desc nulls last, x.id desc
          limit 1
    ) ll on true
    left join fuentes fu on fu.id = l.fuente_id
    left join funnels fn on fn.id = l.funnel_id
    left join setters s  on s.id  = l.setter_id
    left join closers c  on c.id  = l.closer_id
    left join lateral (select score, nivel from lead_quality q2
                        where q2.lead_id = l.id order by q2.creado_en desc, q2.id desc limit 1) q on true`

function aLeadEnLista(x: Record<string, any>): LeadEnLista {
  return {
    id: x.id, nombre: x.nombre, empresa: x.empresa,
    fuente: x.fuente, setter: x.setter, funnel: x.funnel, closer: x.closer,
    fechaSesion: x.fecha_sesion, horaSesion: x.hora_sesion,
    estado: x.estado, resultado: x.resultado, ciclo: Number(x.ciclo),
    proximoContacto: x.proximo_contacto,
    valorPotencial: x.valor_potencial === null ? null : Number(x.valor_potencial),
    moneda: x.moneda,
    calidadScore: x.calidad_score === null || x.calidad_score === undefined ? null : Number(x.calidad_score),
    calidadNivel: x.calidad_nivel ?? null,
    llamadas: Number(x.llamadas),
    llamadaId: x.llamada_id ?? null,
    tieneTranscripcion: x.tiene_transcripcion ?? false,
    notaLlamada: x.nota_llamada === null || x.nota_llamada === undefined ? null : Number(x.nota_llamada),
    creadoEn: x.creado_en.toISOString(),
  }
}

export async function listarLeads(
  alcance: Alcance,
  filtros: FiltrosDeLead = {},
  limite = 300,
): Promise<LeadEnLista[]> {
  if (sinEquipoAsignado(alcance)) return []

  const condiciones = ['l.borrado_en is null']
  const valores: unknown[] = []

  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id' }, valores.length + 1)
  if (alc.parametro !== null) valores.push(alc.parametro)
  condiciones.push(alc.condicion)

  if (filtros.texto) {
    valores.push(`%${plegar(filtros.texto)}%`)
    condiciones.push(`(l.nombre_pleg like $${valores.length} or l.email_pleg like $${valores.length}
                      or l.telefono_pleg like $${valores.length})`)
  }
  for (const [campo, columna] of [
    ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'], ['setterId', 'l.setter_id'],
    ['closerId', 'l.closer_id'], ['resultado', 'l.resultado'], ['estado', 'l.estado'],
  ] as const) {
    const v = filtros[campo]
    if (v !== undefined) { valores.push(v); condiciones.push(`${columna} = $${valores.length}`) }
  }
  if (filtros.desde) { valores.push(filtros.desde); condiciones.push(`l.fecha_sesion >= $${valores.length}`) }
  if (filtros.hasta) { valores.push(filtros.hasta); condiciones.push(`l.fecha_sesion <= $${valores.length}`) }
  // Sin fecha de reunión el lead no entra a ninguna métrica: el embudo entero
  // cuenta sobre las reuniones del período. Por eso se puede pedir la lista de
  // los que quedaron sueltos, en vez de que desaparezcan en silencio.
  if (filtros.sinFecha) condiciones.push('l.fecha_sesion is null')
  if (filtros.soloAbiertos) condiciones.push(`l.resultado in ('pendiente', 'seguimiento', 'sena')`)
  // Lo que la reunión ya pasó y nadie cargó. Es el trabajo pendiente del día.
  if (filtros.soloSinCargar) {
    condiciones.push(`l.fecha_sesion is not null and l.fecha_sesion <= current_date
                      and l.estado = 'agendado' and l.resultado = 'pendiente'`)
  }

  valores.push(limite)

  const f = await filas<Record<string, any>>(
    `${SELECT_LISTA}
      where ${condiciones.join(' and ')}
      order by coalesce(l.fecha_sesion, l.creado_en::date) desc, l.id desc
      limit $${valores.length}`,
    valores,
  )
  return f.map(aLeadEnLista)
}

/** La agenda de un día. La usa el Tracker. */
export async function leadsDelDia(dia: string, alcance: Alcance): Promise<LeadEnLista[]> {
  return listarLeads(alcance, { desde: dia, hasta: dia }, 200)
}

// ── Ver uno ─────────────────────────────────────────────────────────────────

export type Lead = {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
  pais: string | null
  empresa: string | null
  industria: string | null
  fuenteId: number | null
  fuente: string | null
  funnelId: number | null
  funnel: string | null
  setterId: number | null
  setter: string | null
  closerId: number | null
  closer: string | null
  closerInicial: string | null
  fechaSesion: string | null
  horaSesion: string | null
  tipoSesion: TipoSesion
  estado: Estado
  resultado: Resultado
  huboOferta: boolean
  motivoPerdida: string | null
  valorPotencial: number | null
  moneda: string
  proximoContacto: string | null
  proximoPaso: string | null
  observaciones: string | null
  ciclo: number
  reflotadoPor: string | null
  reflotadoEn: string | null
  links: string | null
  infoNegocio: string | null
  infoExtra: string | null
  creadoEn: string
  venta: { importe: number; moneda: string; fecha: string; programa: string | null } | null
  sena: { id: number; importe: number; moneda: string; fecha: string; saldo: number | null
          comprometida: string | null; estado: string } | null
  cobrado: number
}

export async function verLead(leadId: number): Promise<Lead | null> {
  const x = await fila<Record<string, any>>(
    `select l.*, fu.nombre as fuente, fn.nombre as funnel, s.nombre as setter,
            c.nombre as closer, ci.nombre as closer_inicial, u.nombre as reflotador,
            v.importe as venta_importe, v.moneda as venta_moneda, v.fecha as venta_fecha,
            v.programa as venta_programa, v.id as venta_id,
            sn.id as sena_id, sn.importe as sena_importe, sn.moneda as sena_moneda,
            sn.fecha as sena_fecha, sn.saldo_pendiente as sena_saldo,
            sn.fecha_comprometida as sena_comprometida, sn.estado as sena_estado,
            coalesce((select sum(p.importe) from pagos p
                       join ventas v2 on v2.id = p.venta_id and v2.borrado_en is null
                      where v2.lead_id = l.id and p.borrado_en is null and p.estado = 'cobrado'), 0) as cobrado
       from leads l
       left join fuentes fu on fu.id = l.fuente_id
       left join funnels fn on fn.id = l.funnel_id
       left join setters s  on s.id  = l.setter_id
       left join closers c  on c.id  = l.closer_id
       left join closers ci on ci.id = l.closer_inicial_id
       left join usuarios u on u.id  = l.reflotado_por
       left join lateral (select * from ventas vx where vx.lead_id = l.id and vx.borrado_en is null
                           order by vx.fecha desc, vx.id desc limit 1) v on true
       left join lateral (select * from senias sx where sx.lead_id = l.id and sx.borrado_en is null
                           order by sx.fecha desc, sx.id desc limit 1) sn on true
      where l.id = $1 and l.borrado_en is null`,
    [leadId],
  )
  if (!x) return null

  return {
    id: x.id, nombre: x.nombre, email: x.email, telefono: x.telefono, pais: x.pais,
    empresa: x.empresa, industria: x.industria,
    fuenteId: x.fuente_id, fuente: x.fuente, funnelId: x.funnel_id, funnel: x.funnel,
    setterId: x.setter_id, setter: x.setter,
    closerId: x.closer_id, closer: x.closer, closerInicial: x.closer_inicial,
    fechaSesion: x.fecha_sesion, horaSesion: x.hora_sesion, tipoSesion: x.tipo_sesion,
    estado: x.estado, resultado: x.resultado, huboOferta: x.hubo_oferta,
    motivoPerdida: x.motivo_perdida,
    valorPotencial: x.valor_potencial === null ? null : Number(x.valor_potencial),
    moneda: x.moneda,
    proximoContacto: x.proximo_contacto, proximoPaso: x.proximo_paso,
    observaciones: x.observaciones,
    ciclo: Number(x.ciclo), reflotadoPor: x.reflotador,
    reflotadoEn: x.reflotado_en ? x.reflotado_en.toISOString() : null,
    links: x.links, infoNegocio: x.info_negocio, infoExtra: x.info_extra,
    creadoEn: x.creado_en.toISOString(),
    venta: x.venta_importe === null || x.venta_importe === undefined ? null
      : { importe: Number(x.venta_importe), moneda: x.venta_moneda, fecha: x.venta_fecha,
          programa: x.venta_programa },
    sena: x.sena_importe === null || x.sena_importe === undefined ? null
      : { id: x.sena_id, importe: Number(x.sena_importe), moneda: x.sena_moneda, fecha: x.sena_fecha,
          saldo: x.sena_saldo === null ? null : Number(x.sena_saldo),
          comprometida: x.sena_comprometida, estado: x.sena_estado },
    cobrado: Number(x.cobrado),
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
  const columna = 'setterId' in alcance ? 'setter_id' : 'closer_id'
  const valor = 'setterId' in alcance ? alcance.setterId : alcance.closerId
  return (await fila(
    `select 1 from leads where id = $1 and ${columna} = $2 and borrado_en is null`, [leadId, valor],
  )) !== null
}

/** Exigirlo, para no repetir el mismo `if` en cada acción. */
export async function exigirAccesoAlLead(leadId: number, alcance: Alcance): Promise<void> {
  if (!(await puedeVerLead(leadId, alcance))) throw new Error('No tenés acceso a ese lead.')
}

/**
 * Qué cuelga de un lead.
 *
 * Se consulta antes de dar de baja, para poder decir qué se está llevando
 * puesto. «¿Seguro?» sin decir qué hay adentro no es una pregunta: es un
 * trámite que todo el mundo aprueba sin leer.
 */
export type LoQueCuelga = {
  llamadas: number
  notas: number
  seguimientos: number
  /** Si hay plata cargada, la baja deja de ser una corrección y pasa a ser otra cosa. */
  tieneVenta: boolean
  tieneSena: boolean
  importe: number
  moneda: string
}

export async function loQueCuelgaDelLead(leadId: number): Promise<LoQueCuelga> {
  const f = await fila<Record<string, any>>(
    `select (select count(*) from llamadas where lead_id = $1)                       as llamadas,
            (select count(*) from notas where lead_id = $1)                          as notas,
            (select count(*) from seguimiento_interacciones where lead_id = $1)      as seguimientos,
            (select count(*) from ventas where lead_id = $1 and borrado_en is null)  as ventas,
            (select count(*) from senias where lead_id = $1 and borrado_en is null)  as senas,
            coalesce((select sum(importe) from ventas
                       where lead_id = $1 and borrado_en is null), 0)                as importe,
            (select moneda from leads where id = $1)                                 as moneda`,
    [leadId],
  )
  return {
    llamadas: Number(f?.llamadas ?? 0),
    notas: Number(f?.notas ?? 0),
    seguimientos: Number(f?.seguimientos ?? 0),
    tieneVenta: Number(f?.ventas ?? 0) > 0,
    tieneSena: Number(f?.senas ?? 0) > 0,
    importe: Number(f?.importe ?? 0),
    moneda: f?.moneda ?? 'USD',
  }
}

/**
 * Dar de baja un lead.
 *
 * NO lo borra: le pone `borrado_en`, y todas las consultas ya filtran por eso.
 * Un borrado de verdad se llevaría además sus llamadas, sus notas y su
 * historial, y eso no se puede deshacer cuando alguien se equivoca de fila.
 *
 * El motivo es obligatorio. Una baja sin motivo, tres meses después, es un lead
 * que desapareció y nadie sabe por qué: queda la sospecha de que se perdió
 * información, que es peor que el lead de menos.
 */
export async function borrarLead(leadId: number, usuarioId: number, motivo: string): Promise<void> {
  const razon = oNulo(motivo)
  if (razon === null) throw new Error('Poné por qué se da de baja. Sin motivo, dentro de tres meses esto es un lead que desapareció.')

  await enTransaccion(async (cx: PoolClient) => {
    await escribir(
      'update leads set borrado_en = now() where id = $1 and borrado_en is null',
      [leadId], { esperadas: 1, cliente: cx },
    )
    // Si estaba en la cadencia, sale: perseguir a alguien dado de baja es el
    // tipo de error que hace que el equipo deje de confiar en el pipeline.
    await escribir(
      `update seguimiento_estado set situacion = 'fuera', salio_en = current_date, actualizado_en = now()
        where lead_id = $1 and situacion <> 'fuera'`,
      [leadId], { esperadas: 'cualquiera', cliente: cx },
    )
    await anotar([{ entidad: 'lead', entidadId: leadId, campo: 'baja',
                    anterior: 'activo', nuevo: 'dado de baja', motivo: razon }], usuarioId, cx)
  })
}

/** Volver a ponerlo en juego. Lo que estaba cargado sigue estando. */
export async function restaurarLead(leadId: number, usuarioId: number): Promise<void> {
  await enTransaccion(async (cx: PoolClient) => {
    await escribir(
      'update leads set borrado_en = null, actualizado_en = now() where id = $1 and borrado_en is not null',
      [leadId], { esperadas: 1, cliente: cx },
    )
    await anotar([{ entidad: 'lead', entidadId: leadId, campo: 'baja',
                    anterior: 'dado de baja', nuevo: 'activo' }], usuarioId, cx)
  })
}

export type LeadDeBaja = {
  id: number
  nombre: string
  empresa: string | null
  closer: string | null
  setter: string | null
  resultado: Resultado
  fechaSesion: string | null
  borradoEn: string
  /** Quién lo dio de baja y por qué, del historial. */
  porQuien: string | null
  motivo: string | null
}

/**
 * Los leads dados de baja.
 *
 * Existen en una pantalla porque, si no, «dado de baja» y «se perdió» se ven
 * igual. Poder mirarlos es lo que hace que dar de baja sea una corrección y no
 * una apuesta.
 */
export async function listarBorrados(alcance: Alcance, limite = 100): Promise<LeadDeBaja[]> {
  if (sinEquipoAsignado(alcance)) return []

  const valores: unknown[] = []
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id' }, 1)
  if (alc.parametro !== null) valores.push(alc.parametro)
  valores.push(limite)

  const f = await filas<Record<string, any>>(
    `select l.id, l.nombre, l.empresa, l.resultado, l.fecha_sesion, l.borrado_en,
            c.nombre as closer, s.nombre as setter,
            b.usuario as por_quien, b.motivo
       from leads l
       left join closers c on c.id = l.closer_id
       left join setters s on s.id = l.setter_id
       left join lateral (
            select u.nombre as usuario, x.motivo
              from cambios x left join usuarios u on u.id = x.usuario_id
             where x.entidad = 'lead' and x.entidad_id = l.id
               and x.campo = 'baja' and x.valor_nuevo = 'dado de baja'
             order by x.creado_en desc limit 1
       ) b on true
      where l.borrado_en is not null and ${alc.condicion}
      order by l.borrado_en desc
      limit $${valores.length}`,
    valores,
  )

  return f.map((x) => ({
    id: x.id, nombre: x.nombre, empresa: x.empresa, closer: x.closer, setter: x.setter,
    resultado: x.resultado, fechaSesion: x.fecha_sesion,
    borradoEn: x.borrado_en.toISOString(),
    porQuien: x.por_quien, motivo: x.motivo,
  }))
}

/** ¿Este usuario puede tocar este lead, aunque esté dado de baja? */
export async function puedeVerLeadDeBaja(leadId: number, alcance: Alcance): Promise<boolean> {
  if (alcance.todo) {
    return (await fila('select 1 from leads where id = $1', [leadId])) !== null
  }
  if ('nada' in alcance) return false
  const columna = 'setterId' in alcance ? 'setter_id' : 'closer_id'
  const valor = 'setterId' in alcance ? alcance.setterId : alcance.closerId
  return (await fila(`select 1 from leads where id = $1 and ${columna} = $2`, [leadId, valor])) !== null
}
