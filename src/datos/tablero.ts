import 'server-only'
import { fila, filas } from '@/lib/db'
import { condicionDeAlcance, sinEquipoAsignado, type Alcance } from '@/lib/permisos'
import { embudo, tasa, type Conteos, type Etapa } from '@/motor/embudo'
import type { Rango } from '@/motor/periodos'

export type FiltrosDeTablero = {
  closerId?: number
  setterId?: number
  fuenteId?: number
  funnelId?: number
}

export type Tarjetas = {
  agendadas: number
  noShows: number
  noShowsPct: number | null
  cancelaciones: number
  cancelacionesPct: number | null
  asistencias: number
  asistenciaPct: number | null
  ofertas: number
  ofertasPct: number | null
  senas: number
  senasImporte: number
  ventas: number
  cierrePct: number | null
  facturacion: number
  cashCollected: number
  /** Importes en una moneda distinta a la base, que NO están sumados arriba. */
  otrasMonedas: { moneda: string; importe: number }[]
}

export type Numeros = { tarjetas: Tarjetas; etapas: Etapa[] }

/**
 * Los números del período.
 *
 * Dos cosas para tener presentes al leer esto:
 *
 *  - Una oportunidad cuenta en el período por su FECHA DE AGENDA; una venta y
 *    un cobro, por SU propia fecha. Una llamada de septiembre que se cobra en
 *    octubre es una agenda de septiembre y cash de octubre, y está bien así.
 *  - La SEÑA no entra a facturación ni a cash. Tiene su tarjeta y su etapa del
 *    embudo, y recién impacta cuando se convierte en venta.
 */
export async function numeros(
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeTablero = {},
  monedaBase = 'USD',
): Promise<Numeros> {
  if (sinEquipoAsignado(alcance)) return vacio()

  const valores: unknown[] = [rango.desde, rango.hasta]
  const condiciones: string[] = ['o.borrado_en is null', 'o.fecha_agenda between $1 and $2']

  const alc = condicionDeAlcance(alcance, { closer: 'o.closer_id', setter: 'l.setter_id' }, valores.length + 1)
  if (alc.parametro !== null) valores.push(alc.parametro)
  condiciones.push(alc.condicion)

  for (const [campo, columna] of [
    ['closerId', 'o.closer_id'], ['setterId', 'l.setter_id'],
    ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'],
  ] as const) {
    const v = filtros[campo]
    if (v !== undefined) { valores.push(v); condiciones.push(`${columna} = $${valores.length}`) }
  }
  const donde = condiciones.join(' and ')

  const conteo = await fila<{
    agendadas: number; no_shows: number; cancelaciones: number; asistencias: number
    ofertas: number; senas: number; ventas: number
  }>(
    `select count(*)                                                as agendadas,
            count(*) filter (where o.estado = 'no_show')            as no_shows,
            count(*) filter (where o.estado = 'cancelada')          as cancelaciones,
            count(*) filter (where o.estado = 'asistida')           as asistencias,
            count(*) filter (where o.hubo_oferta)                   as ofertas,
            count(*) filter (where exists (select 1 from senias s
                              where s.oportunidad_id = o.id and s.borrado_en is null)) as senas,
            count(*) filter (where o.resultado = 'venta')           as ventas
       from oportunidades o join leads l on l.id = o.lead_id
      where ${donde}`,
    valores,
  )

  const c: Conteos = {
    agendadas: Number(conteo?.agendadas ?? 0),
    asistidas: Number(conteo?.asistencias ?? 0),
    ofertas: Number(conteo?.ofertas ?? 0),
    senas: Number(conteo?.senas ?? 0),
    ventas: Number(conteo?.ventas ?? 0),
  }

  // El importe de las señas abiertas del período. Va en su tarjeta y en ningún
  // total: no es facturación y no es cash.
  const sena = await fila<{ importe: number }>(
    `select coalesce(sum(s.importe), 0) as importe
       from senias s join oportunidades o on o.id = s.oportunidad_id join leads l on l.id = o.lead_id
      where s.borrado_en is null and s.moneda = $${valores.length + 1} and ${donde}`,
    [...valores, monedaBase],
  )

  // Facturación: por la fecha de la VENTA, no la de la agenda.
  const factura = await dineroDelPeriodo('ventas', 'v', rango, alcance, filtros, monedaBase)
  // Cash: por la fecha del PAGO. Incluye el pago que vino de una seña
  // convertida, porque ese dinero sí entró.
  const cash = await dineroDelPeriodo('pagos', 'p', rango, alcance, filtros, monedaBase)

  return {
    tarjetas: {
      agendadas: c.agendadas,
      noShows: Number(conteo?.no_shows ?? 0),
      noShowsPct: tasa(Number(conteo?.no_shows ?? 0), c.agendadas),
      cancelaciones: Number(conteo?.cancelaciones ?? 0),
      cancelacionesPct: tasa(Number(conteo?.cancelaciones ?? 0), c.agendadas),
      asistencias: c.asistidas,
      asistenciaPct: tasa(c.asistidas, c.agendadas),
      ofertas: c.ofertas,
      ofertasPct: tasa(c.ofertas, c.asistidas),
      senas: c.senas,
      senasImporte: Number(sena?.importe ?? 0),
      ventas: c.ventas,
      cierrePct: tasa(c.ventas, c.asistidas),
      facturacion: factura.total,
      cashCollected: cash.total,
      otrasMonedas: [...factura.otras, ...cash.otras],
    },
    etapas: embudo(c),
  }
}

/**
 * Suma de dinero de una tabla, en la moneda base.
 *
 * Lo que está en otra moneda NO se suma ni se convierte con una cotización
 * inventada: se devuelve aparte para que la pantalla lo diga. Una suma que
 * mezcla pesos y dólares es un número que parece correcto y no lo es.
 */
async function dineroDelPeriodo(
  tabla: 'ventas' | 'pagos',
  alias: string,
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeTablero,
  monedaBase: string,
): Promise<{ total: number; otras: { moneda: string; importe: number }[] }> {
  const union = tabla === 'ventas'
    ? `from ventas ${alias}
       join oportunidades o on o.id = ${alias}.oportunidad_id
       join leads l on l.id = o.lead_id`
    : `from pagos ${alias}
       join ventas v on v.id = ${alias}.venta_id and v.borrado_en is null
       join oportunidades o on o.id = v.oportunidad_id
       join leads l on l.id = o.lead_id`

  const valores: unknown[] = [rango.desde, rango.hasta]
  const condiciones = [
    `${alias}.borrado_en is null`,
    'o.borrado_en is null',
    `${alias}.fecha between $1 and $2`,
  ]
  if (tabla === 'pagos') condiciones.push(`${alias}.estado = 'cobrado'`)

  const alc = condicionDeAlcance(alcance, { closer: 'o.closer_id', setter: 'l.setter_id' }, valores.length + 1)
  if (alc.parametro !== null) valores.push(alc.parametro)
  condiciones.push(alc.condicion)

  for (const [campo, columna] of [
    ['closerId', 'o.closer_id'], ['setterId', 'l.setter_id'],
    ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'],
  ] as const) {
    const v = filtros[campo]
    if (v !== undefined) { valores.push(v); condiciones.push(`${columna} = $${valores.length}`) }
  }

  const f = await filas<{ moneda: string; importe: number }>(
    `select ${alias}.moneda, sum(${alias}.importe) as importe
       ${union}
      where ${condiciones.join(' and ')}
      group by ${alias}.moneda`,
    valores,
  )

  const base = f.find((x) => x.moneda === monedaBase)
  return {
    total: Number(base?.importe ?? 0),
    otras: f.filter((x) => x.moneda !== monedaBase).map((x) => ({ moneda: x.moneda, importe: Number(x.importe) })),
  }
}

function vacio(): Numeros {
  const c: Conteos = { agendadas: 0, asistidas: 0, ofertas: 0, senas: 0, ventas: 0 }
  return {
    tarjetas: {
      agendadas: 0, noShows: 0, noShowsPct: null, cancelaciones: 0, cancelacionesPct: null,
      asistencias: 0, asistenciaPct: null, ofertas: 0, ofertasPct: null,
      senas: 0, senasImporte: 0, ventas: 0, cierrePct: null,
      facturacion: 0, cashCollected: 0, otrasMonedas: [],
    },
    etapas: embudo(c),
  }
}

// ── El objetivo del período ─────────────────────────────────────────────────

export async function objetivoDe(
  rango: Rango,
  tipo: 'facturacion' | 'cash' | 'ventas' | 'agendas' = 'facturacion',
): Promise<number> {
  const f = await fila<{ valor: number }>(
    `select valor from objetivos
      where ambito = 'empresa' and tipo = $1 and desde <= $2 and hasta >= $3
      order by desde desc limit 1`,
    [tipo, rango.desde, rango.hasta],
  )
  return Number(f?.valor ?? 0)
}

// ── El día de hoy ───────────────────────────────────────────────────────────

export type LlamadaDeHoy = {
  oportunidadId: number
  leadId: number
  lead: string
  hora: string | null
  tipoSesion: string
  closer: string | null
  estado: string
  resultado: string
  valorPotencial: number | null
  moneda: string
}

export async function llamadasDe(dia: string, alcance: Alcance): Promise<LlamadaDeHoy[]> {
  if (sinEquipoAsignado(alcance)) return []

  const valores: unknown[] = [dia]
  const alc = condicionDeAlcance(alcance, { closer: 'o.closer_id', setter: 'l.setter_id' }, 2)
  if (alc.parametro !== null) valores.push(alc.parametro)

  const f = await filas<any>(
    `select o.id, o.lead_id, l.nombre as lead, o.hora_agenda, o.tipo_sesion, o.estado, o.resultado,
            o.valor_potencial, o.moneda, c.nombre as closer
       from oportunidades o
       join leads l on l.id = o.lead_id
       left join closers c on c.id = o.closer_id
      where o.borrado_en is null and o.fecha_agenda = $1 and ${alc.condicion}
      order by o.hora_agenda nulls last, l.nombre`,
    valores,
  )

  return f.map((x) => ({
    oportunidadId: x.id, leadId: x.lead_id, lead: x.lead, hora: x.hora_agenda,
    tipoSesion: x.tipo_sesion, closer: x.closer, estado: x.estado, resultado: x.resultado,
    valorPotencial: x.valor_potencial, moneda: x.moneda,
  }))
}

export type Vencido = {
  oportunidadId: number
  leadId: number
  lead: string
  closer: string | null
  proximoContacto: string
  proximoPaso: string | null
  diasVencido: number
  resultado: string
}

/** Seguimientos con fecha pasada. El «18 seguimientos vencidos» de la home. */
export async function seguimientosVencidos(hoy: string, alcance: Alcance, limite = 50): Promise<Vencido[]> {
  if (sinEquipoAsignado(alcance)) return []

  const valores: unknown[] = [hoy]
  const alc = condicionDeAlcance(alcance, { closer: 'o.closer_id', setter: 'l.setter_id' }, 2)
  if (alc.parametro !== null) valores.push(alc.parametro)
  valores.push(limite)

  const f = await filas<any>(
    `select o.id, o.lead_id, l.nombre as lead, c.nombre as closer,
            o.proximo_contacto, o.proximo_paso, o.resultado,
            ($1::date - o.proximo_contacto) as dias
       from oportunidades o
       join leads l on l.id = o.lead_id
       left join closers c on c.id = o.closer_id
      where o.borrado_en is null
        and o.proximo_contacto is not null and o.proximo_contacto < $1
        and o.resultado in ('pendiente', 'seguimiento', 'sena')
        and ${alc.condicion}
      order by o.proximo_contacto
      limit $${valores.length}`,
    valores,
  )

  return f.map((x) => ({
    oportunidadId: x.id, leadId: x.lead_id, lead: x.lead, closer: x.closer,
    proximoContacto: x.proximo_contacto, proximoPaso: x.proximo_paso,
    diasVencido: Number(x.dias), resultado: x.resultado,
  }))
}

/** Señas abiertas con su fecha comprometida. La tarjeta de «3 señas pendientes». */
export async function seniasAbiertas(alcance: Alcance): Promise<{
  oportunidadId: number; leadId: number; lead: string; closer: string | null
  importe: number; moneda: string; saldo: number | null; comprometida: string | null
}[]> {
  if (sinEquipoAsignado(alcance)) return []

  const valores: unknown[] = []
  const alc = condicionDeAlcance(alcance, { closer: 'o.closer_id', setter: 'l.setter_id' }, 1)
  if (alc.parametro !== null) valores.push(alc.parametro)

  const f = await filas<any>(
    `select o.id, o.lead_id, l.nombre as lead, c.nombre as closer,
            s.importe, s.moneda, s.saldo_pendiente, s.fecha_comprometida
       from senias s
       join oportunidades o on o.id = s.oportunidad_id
       join leads l on l.id = o.lead_id
       left join closers c on c.id = o.closer_id
      where s.borrado_en is null and s.estado = 'abierta' and o.borrado_en is null and ${alc.condicion}
      order by s.fecha_comprometida nulls last`,
    valores,
  )

  return f.map((x) => ({
    oportunidadId: x.id, leadId: x.lead_id, lead: x.lead, closer: x.closer,
    importe: Number(x.importe), moneda: x.moneda,
    saldo: x.saldo_pendiente === null ? null : Number(x.saldo_pendiente),
    comprometida: x.fecha_comprometida,
  }))
}
