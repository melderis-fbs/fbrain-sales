import 'server-only'
import { fila, filas } from '@/lib/db'
import { condicionDeAlcance, sinEquipoAsignado, type Alcance } from '@/lib/permisos'
import { embudo, tasa, redondear, type Conteos, type Etapa } from '@/motor/embudo'
import type { Rango } from '@/motor/periodos'
import type { Resultado } from '@/dominio/resultados'

/**
 * Las métricas. Todas. Definidas UNA vez.
 *
 * Éste es el archivo que evita el problema que trajo el sistema anterior: el
 * Dashboard decía 111% de cierre y el Tracker 11% para el mismo mes. Ninguno
 * estaba roto — contaban sobre universos distintos. Las ventas salían de la
 * tabla de ventas por fecha de venta, y las asistencias de las reuniones del
 * mes, y dividir una cosa por la otra da un número que no significa nada.
 *
 * La regla acá es una sola y es la que pidió el equipo: cada número sale de un
 * solo lugar, y el lugar está escrito. Por eso:
 *
 *  - Todo lo del EMBUDO —agendadas, asistencias, ofertas, señas, ventas— se
 *    cuenta sobre el mismo universo: los leads cuya reunión cayó en el período.
 *    El cierre es ventas de ese universo sobre asistencias de ese universo, y
 *    por construcción no puede pasar de 100%.
 *  - La PLATA se cuenta por su propia fecha: una venta en el mes que se firmó,
 *    un cobro en el mes que entró. Una llamada de septiembre cobrada en octubre
 *    es agenda de septiembre y cash de octubre. Están en universos distintos a
 *    propósito, y la pantalla lo dice.
 *
 * Ninguna pantalla hace su propia cuenta. Si hace falta un número nuevo, entra
 * acá.
 */

export type FiltrosDeMetricas = {
  closerId?: number
  setterId?: number
  fuenteId?: number
  funnelId?: number
}

export type Medidas = {
  // El embudo, todo sobre los leads con reunión en el período.
  agendadas: number
  asistencias: number
  noShows: number
  cancelados: number
  reagendados: number
  ofertas: number
  senas: number
  ventas: number
  perdidos: number
  enSeguimiento: number
  pendientesDeCargar: number

  /**
   * La asistencia que además calificaba.
   *
   * Vino a la reunión y era alguien a quien se le podía vender. Separarla de la
   * asistencia a secas es lo que deja ver si un mes malo fue del closer o del
   * filtro: cerrar 2 de 10 asistencias válidas y cerrar 2 de 10 asistencias
   * donde 6 no calificaban son dos problemas distintos, y se arreglan en
   * lugares distintos.
   */
  asistenciasValidas: number
  noCalificadas: number
  /** Segundas sesiones: se agendan y se asiste distinto que a una primera. */
  segundas: number
  segundasAsistidas: number

  asistenciaPct: number | null
  noShowPct: number | null
  cancelacionPct: number | null
  ofertaPct: number | null
  senaPct: number | null
  /** Ventas sobre asistencias, del mismo universo. Nunca puede pasar de 100. */
  cierrePct: number | null
  cierreSobreOfertaPct: number | null
  asistenciaValidaPct: number | null
  noCalificadasPct: number | null
  segundaAsistenciaPct: number | null
  /** Cierre sobre lo que de verdad era vendible. */
  cierreSobreValidaPct: number | null

  // La plata, por su propia fecha.
  facturacion: number
  cashCollected: number
  senasImporte: number
  ticketPromedio: number | null
  /** Valor potencial de lo que sigue abierto. No es forecast. */
  valorEnJuego: number
  /**
   * Cash por reunión. No es un porcentaje aunque se pida así: es plata dividida
   * por cantidad, y darlo como «%» sería un número sin unidad que nadie puede
   * comparar contra nada.
   */
  cashPorAgenda: number | null
  cashPorAsistencia: number | null

  moneda: string
  /** Lo que está en otra moneda y NO se sumó. */
  otrasMonedas: { moneda: string; importe: number }[]
}

export type Metricas = { medidas: Medidas; etapas: Etapa[]; rango: Rango }

/**
 * De dónde sale cada número, en palabras.
 *
 * Está en el código porque la pantalla lo muestra. Una definición que vive en
 * un documento aparte se desactualiza el primer día; ésta no puede, porque es
 * la misma que usa la consulta de abajo.
 */
export const DEFINICIONES: Record<string, { nombre: string; formula: string; universo: string }> = {
  agendadas:    { nombre: 'Agendadas', formula: 'Leads con fecha de reunión en el período.', universo: 'reunión' },
  asistencias:  { nombre: 'Asistencias', formula: 'De esos, los que quedaron en «asistió».', universo: 'reunión' },
  noShows:      { nombre: 'No shows', formula: 'De esos, los que quedaron en «no show».', universo: 'reunión' },
  ofertas:      { nombre: 'Ofertas', formula: 'De esos, los que tienen marcado que hubo oferta.', universo: 'reunión' },
  senas:        { nombre: 'Señas', formula: 'De esos, los que tienen una seña cargada.', universo: 'reunión' },
  ventas:       { nombre: 'Ventas', formula: 'De esos, los que quedaron en «venta».', universo: 'reunión' },
  cierrePct:    { nombre: 'Cierre', formula: 'Ventas ÷ asistencias, las dos del mismo universo.', universo: 'reunión' },
  asistenciasValidas: { nombre: 'Asistencias válidas', formula: 'Asistencias que no quedaron en «no calificado».', universo: 'reunión' },
  noCalificadas:{ nombre: 'No calificadas', formula: 'De los que asistieron, los que quedaron en «no calificado».', universo: 'reunión' },
  cancelados:   { nombre: 'Canceladas', formula: 'De los agendados, los que quedaron en «cancelado».', universo: 'reunión' },
  reagendados:  { nombre: 'Reagendadas', formula: 'De los agendados, los que quedaron en «reagendado».', universo: 'reunión' },
  segundas:     { nombre: 'Segundas llamadas', formula: 'Reuniones del período marcadas como segunda sesión.', universo: 'reunión' },
  segundasAsistidas: { nombre: 'Asistencia a segunda', formula: 'De las segundas sesiones, las que quedaron en «asistió».', universo: 'reunión' },
  asistenciaValidaPct: { nombre: '% Asistencia válida', formula: 'Asistencias válidas ÷ agendadas.', universo: 'reunión' },
  noCalificadasPct: { nombre: '% No calificadas', formula: 'No calificadas ÷ asistencias.', universo: 'reunión' },
  segundaAsistenciaPct: { nombre: '% Asistencia a segunda', formula: 'Asistencias a segunda ÷ segundas agendadas.', universo: 'reunión' },
  cierreSobreValidaPct: { nombre: '% Cierre / asistencia válida', formula: 'Ventas ÷ asistencias válidas.', universo: 'reunión' },
  cierreSobreOfertaPct: { nombre: '% Cierre / oferta', formula: 'Ventas ÷ ofertas hechas.', universo: 'reunión' },
  cashPorAgenda:{ nombre: 'Cash por agenda', formula: 'Cash collected del período ÷ agendadas del período. No es un porcentaje: es plata por reunión, y los dos números salen de universos distintos.', universo: 'mezcla' },
  cashPorAsistencia: { nombre: 'Cash por asistencia', formula: 'Cash collected del período ÷ asistencias del período. Tampoco es un porcentaje.', universo: 'mezcla' },
  facturacion:  { nombre: 'Facturación', formula: 'Suma de las ventas con fecha de venta en el período.', universo: 'venta' },
  cashCollected:{ nombre: 'Cash collected', formula: 'Suma de los pagos cobrados con fecha en el período. La seña convertida entra acá, una sola vez.', universo: 'cobro' },
  senasImporte: { nombre: 'Señas comprometidas', formula: 'Suma de las señas del período. No es facturación ni cash.', universo: 'reunión' },
  ticketPromedio:{ nombre: 'Ticket promedio', formula: 'Facturación ÷ cantidad de ventas del período de venta.', universo: 'venta' },
  valorEnJuego: { nombre: 'Valor en juego', formula: 'Valor potencial de los leads que siguen abiertos.', universo: 'abierto' },
}

// ── La consulta base ────────────────────────────────────────────────────────

/** El WHERE compartido. Todo el embudo pasa por acá, y por eso no puede discrepar. */
function donde(
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeMetricas,
  extra: string[] = [],
): { sql: string; valores: unknown[] } {
  const valores: unknown[] = [rango.desde, rango.hasta]
  const condiciones = ['l.borrado_en is null', 'l.fecha_sesion between $1 and $2', ...extra]

  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id' }, valores.length + 1)
  if (alc.parametro !== null) valores.push(alc.parametro)
  condiciones.push(alc.condicion)

  for (const [campo, columna] of [
    ['closerId', 'l.closer_id'], ['setterId', 'l.setter_id'],
    ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'],
  ] as const) {
    const v = filtros[campo]
    if (v !== undefined) { valores.push(v); condiciones.push(`${columna} = $${valores.length}`) }
  }

  return { sql: condiciones.join(' and '), valores }
}

/**
 * Los conteos del embudo. `$MONEDA` se reemplaza por el marcador que le toque,
 * que es lo único que cambia entre llamadas.
 */
const CONTEOS = `
  count(*)                                                     as agendadas,
  count(*) filter (where l.estado = 'asistio')                 as asistencias,
  count(*) filter (where l.estado = 'no_show')                 as no_shows,
  count(*) filter (where l.estado = 'cancelado')               as cancelados,
  count(*) filter (where l.estado = 'reagendado')              as reagendados,
  count(*) filter (where l.resultado = 'no_calificado')        as no_calificadas,
  count(*) filter (where l.estado = 'asistio'
                     and l.resultado <> 'no_calificado')       as asistencias_validas,
  count(*) filter (where l.tipo_sesion = 'segunda')            as segundas,
  count(*) filter (where l.tipo_sesion = 'segunda'
                     and l.estado = 'asistio')                 as segundas_asistidas,
  count(*) filter (where l.hubo_oferta)                        as ofertas,
  count(*) filter (where exists (select 1 from senias s
                     where s.lead_id = l.id and s.borrado_en is null)) as senas,
  count(*) filter (where l.resultado = 'venta')                as ventas,
  count(*) filter (where l.resultado = 'perdida')              as perdidos,
  count(*) filter (where l.resultado = 'seguimiento')          as en_seguimiento,
  count(*) filter (where l.estado = 'agendado' and l.resultado = 'pendiente'
                     and l.fecha_sesion <= current_date)       as pendientes,
  coalesce(sum(l.valor_potencial) filter (
    where l.resultado in ('pendiente','seguimiento','sena') and l.moneda = $MONEDA), 0) as valor_en_juego`

type FilaDeConteos = Record<string, number>

export async function metricas(
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeMetricas = {},
  monedaBase = 'USD',
): Promise<Metricas> {
  if (sinEquipoAsignado(alcance)) return { medidas: vacio(monedaBase), etapas: embudo(CERO), rango }

  const d = donde(rango, alcance, filtros)
  const valores = [...d.valores, monedaBase]
  const conteos = CONTEOS.replace('$MONEDA', `$${valores.length}`)

  const c = await fila<FilaDeConteos>(
    `select ${conteos} from leads l where ${d.sql}`, valores,
  )

  // Las señas del período, en su propia tarjeta. No suman a facturación ni a
  // cash: recién impactan cuando se convierten.
  const sena = await fila<{ importe: number }>(
    `select coalesce(sum(s.importe), 0) as importe
       from senias s join leads l on l.id = s.lead_id
      where s.borrado_en is null and s.moneda = $${valores.length} and ${d.sql}`,
    valores,
  )

  const [factura, cash] = await Promise.all([
    dinero('ventas', rango, alcance, filtros, monedaBase),
    dinero('pagos', rango, alcance, filtros, monedaBase),
  ])

  const n = (k: string) => Number(c?.[k] ?? 0)
  const conteo: Conteos = {
    agendadas: n('agendadas'), asistidas: n('asistencias'), ofertas: n('ofertas'),
    senas: n('senas'), ventas: n('ventas'),
  }

  return {
    rango,
    etapas: embudo(conteo),
    medidas: {
      agendadas: conteo.agendadas,
      asistencias: conteo.asistidas,
      noShows: n('no_shows'),
      cancelados: n('cancelados'),
      reagendados: n('reagendados'),
      ofertas: conteo.ofertas,
      senas: conteo.senas,
      ventas: conteo.ventas,
      perdidos: n('perdidos'),
      enSeguimiento: n('en_seguimiento'),
      pendientesDeCargar: n('pendientes'),
      asistenciasValidas: n('asistencias_validas'),
      noCalificadas: n('no_calificadas'),
      segundas: n('segundas'),
      segundasAsistidas: n('segundas_asistidas'),

      asistenciaPct: tasa(conteo.asistidas, conteo.agendadas),
      noShowPct: tasa(n('no_shows'), conteo.agendadas),
      cancelacionPct: tasa(n('cancelados'), conteo.agendadas),
      ofertaPct: tasa(conteo.ofertas, conteo.asistidas),
      senaPct: tasa(conteo.senas, conteo.asistidas),
      cierrePct: tasa(conteo.ventas, conteo.asistidas),
      cierreSobreOfertaPct: tasa(conteo.ventas, conteo.ofertas),
      asistenciaValidaPct: tasa(n('asistencias_validas'), conteo.agendadas),
      noCalificadasPct: tasa(n('no_calificadas'), conteo.asistidas),
      segundaAsistenciaPct: tasa(n('segundas_asistidas'), n('segundas')),
      cierreSobreValidaPct: tasa(conteo.ventas, n('asistencias_validas')),

      facturacion: factura.total,
      cashCollected: cash.total,
      senasImporte: Number(sena?.importe ?? 0),
      ticketPromedio: factura.cantidad === 0 ? null : Math.round(factura.total / factura.cantidad),
      valorEnJuego: Number(c?.valor_en_juego ?? 0),
      // Dividir por cero no da cero: da «sin datos». Un «USD 0 por agenda»
      // cuando no hubo agendas es un número inventado.
      cashPorAgenda: conteo.agendadas === 0 ? null : Math.round(cash.total / conteo.agendadas),
      cashPorAsistencia: conteo.asistidas === 0 ? null : Math.round(cash.total / conteo.asistidas),

      moneda: monedaBase,
      otrasMonedas: juntarMonedas([...factura.otras, ...cash.otras]),
    },
  }
}

/**
 * La plata de un período, por la fecha de la propia plata.
 *
 * Lo que está en otra moneda NO se suma ni se convierte con una cotización
 * inventada: se devuelve aparte para que la pantalla lo diga. Una suma que
 * mezcla pesos y dólares es un número que parece correcto y no lo es.
 */
async function dinero(
  tabla: 'ventas' | 'pagos',
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeMetricas,
  monedaBase: string,
): Promise<{ total: number; cantidad: number; otras: { moneda: string; importe: number }[] }> {
  const union = tabla === 'ventas'
    ? `from ventas m join leads l on l.id = m.lead_id`
    : `from pagos m
       join ventas v on v.id = m.venta_id and v.borrado_en is null
       join leads l on l.id = v.lead_id`

  const valores: unknown[] = [rango.desde, rango.hasta]
  const condiciones = ['m.borrado_en is null', 'l.borrado_en is null', 'm.fecha between $1 and $2']
  if (tabla === 'pagos') condiciones.push(`m.estado = 'cobrado'`)

  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id' }, valores.length + 1)
  if (alc.parametro !== null) valores.push(alc.parametro)
  condiciones.push(alc.condicion)

  for (const [campo, columna] of [
    ['closerId', 'l.closer_id'], ['setterId', 'l.setter_id'],
    ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'],
  ] as const) {
    const v = filtros[campo]
    if (v !== undefined) { valores.push(v); condiciones.push(`${columna} = $${valores.length}`) }
  }

  const f = await filas<{ moneda: string; importe: number; cantidad: number }>(
    `select m.moneda, sum(m.importe) as importe, count(*) as cantidad
       ${union} where ${condiciones.join(' and ')} group by m.moneda`,
    valores,
  )

  const base = f.find((x) => x.moneda === monedaBase)
  return {
    total: Number(base?.importe ?? 0),
    cantidad: Number(base?.cantidad ?? 0),
    otras: f.filter((x) => x.moneda !== monedaBase).map((x) => ({ moneda: x.moneda, importe: Number(x.importe) })),
  }
}

function juntarMonedas(lista: { moneda: string; importe: number }[]): { moneda: string; importe: number }[] {
  const mapa = new Map<string, number>()
  for (const x of lista) mapa.set(x.moneda, (mapa.get(x.moneda) ?? 0) + x.importe)
  return [...mapa].map(([moneda, importe]) => ({ moneda, importe }))
}

const CERO: Conteos = { agendadas: 0, asistidas: 0, ofertas: 0, senas: 0, ventas: 0 }

function vacio(moneda: string): Medidas {
  return {
    agendadas: 0, asistencias: 0, noShows: 0, cancelados: 0, reagendados: 0,
    ofertas: 0, senas: 0, ventas: 0, perdidos: 0, enSeguimiento: 0, pendientesDeCargar: 0,
    asistenciasValidas: 0, noCalificadas: 0, segundas: 0, segundasAsistidas: 0,
    asistenciaPct: null, noShowPct: null, cancelacionPct: null, ofertaPct: null,
    senaPct: null, cierrePct: null, cierreSobreOfertaPct: null,
    asistenciaValidaPct: null, noCalificadasPct: null, segundaAsistenciaPct: null,
    cierreSobreValidaPct: null,
    facturacion: 0, cashCollected: 0, senasImporte: 0, ticketPromedio: null, valorEnJuego: 0,
    cashPorAgenda: null, cashPorAsistencia: null,
    moneda, otrasMonedas: [],
  }
}

// ── Aperturas ───────────────────────────────────────────────────────────────

export type Apertura = {
  id: number | null
  nombre: string
  agendadas: number
  asistencias: number
  asistenciaPct: number | null
  ofertas: number
  ventas: number
  cierrePct: number | null
  facturacion: number
}

/**
 * El mismo embudo, abierto por lo que se pida.
 *
 * Sale de la misma consulta base, así que la suma de las filas da el total de
 * arriba. Cuando una tabla de detalle no suma el total de la tarjeta, deja de
 * usarse toda la pantalla, no sólo la tabla.
 */
export async function apertura(
  por: 'closer' | 'setter' | 'fuente' | 'funnel' | 'motivo_perdida',
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeMetricas = {},
  monedaBase = 'USD',
): Promise<Apertura[]> {
  if (sinEquipoAsignado(alcance)) return []

  const union = {
    closer: { join: 'left join closers t on t.id = l.closer_id', id: 't.id', nombre: 't.nombre', sin: 'Sin closer' },
    setter: { join: 'left join setters t on t.id = l.setter_id', id: 't.id', nombre: 't.nombre', sin: 'Sin setter' },
    fuente: { join: 'left join fuentes t on t.id = l.fuente_id', id: 't.id', nombre: 't.nombre', sin: 'Sin fuente' },
    funnel: { join: 'left join funnels t on t.id = l.funnel_id', id: 't.id', nombre: 't.nombre', sin: 'Sin funnel' },
    motivo_perdida: { join: '', id: 'null::bigint', nombre: 'l.motivo_perdida', sin: 'Sin motivo' },
  }[por]

  const d = donde(rango, alcance, filtros, por === 'motivo_perdida' ? [`l.resultado = 'perdida'`] : [])
  const valores = [...d.valores, monedaBase]

  const f = await filas<Record<string, any>>(
    `select ${union.id} as id, ${union.nombre} as nombre,
            count(*) as agendadas,
            count(*) filter (where l.estado = 'asistio') as asistencias,
            count(*) filter (where l.hubo_oferta) as ofertas,
            count(*) filter (where l.resultado = 'venta') as ventas,
            coalesce(sum((select sum(v.importe) from ventas v
                           where v.lead_id = l.id and v.borrado_en is null
                             and v.moneda = $${valores.length})), 0) as facturacion
       from leads l ${union.join}
      where ${d.sql}
      group by 1, 2
      order by count(*) desc`,
    valores,
  )

  return f.map((x) => {
    const agendadas = Number(x.agendadas)
    const asistencias = Number(x.asistencias)
    const ventas = Number(x.ventas)
    return {
      id: x.id === null ? null : Number(x.id),
      nombre: x.nombre ?? union.sin,
      agendadas, asistencias,
      asistenciaPct: tasa(asistencias, agendadas),
      ofertas: Number(x.ofertas), ventas,
      cierrePct: tasa(ventas, asistencias),
      facturacion: Number(x.facturacion),
    }
  })
}

// ── La serie del período ────────────────────────────────────────────────────

export type Dia = {
  dia: string
  agendadas: number
  asistencias: number
  ventas: number
}

/** Día por día. Lo usa el Tracker para ver el ritmo, no sólo el total. */
export async function porDia(
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeMetricas = {},
): Promise<Dia[]> {
  if (sinEquipoAsignado(alcance)) return []
  const d = donde(rango, alcance, filtros)
  const f = await filas<Record<string, any>>(
    `select l.fecha_sesion as dia,
            count(*) as agendadas,
            count(*) filter (where l.estado = 'asistio') as asistencias,
            count(*) filter (where l.resultado = 'venta') as ventas
       from leads l where ${d.sql}
      group by 1 order by 1`,
    d.valores,
  )
  return f.map((x) => ({
    dia: x.dia, agendadas: Number(x.agendadas),
    asistencias: Number(x.asistencias), ventas: Number(x.ventas),
  }))
}

// ── El objetivo del período ─────────────────────────────────────────────────

export type TipoDeObjetivo = 'facturacion' | 'cash' | 'ventas' | 'agendas'

export async function objetivoDe(
  rango: Rango,
  tipo: TipoDeObjetivo = 'facturacion',
  ambito: 'empresa' | 'closer' | 'setter' = 'empresa',
  ambitoId: number | null = null,
): Promise<number> {
  const f = await fila<{ valor: number }>(
    `select valor from objetivos
      where ambito = $1 and (ambito_id is not distinct from $2)
        and tipo = $3 and desde <= $4 and hasta >= $5
      order by desde desc limit 1`,
    [ambito, ambitoId, tipo, rango.desde, rango.hasta],
  )
  return Number(f?.valor ?? 0)
}

/** Qué número del período mide cada tipo de objetivo. Una sola traducción. */
export function logradoDe(tipo: TipoDeObjetivo, m: Medidas): number {
  switch (tipo) {
    case 'facturacion': return m.facturacion
    case 'cash': return m.cashCollected
    case 'ventas': return m.ventas
    case 'agendas': return m.agendadas
  }
}

export const NOMBRE_DE_OBJETIVO: Record<TipoDeObjetivo, string> = {
  facturacion: 'Facturación', cash: 'Cash collected', ventas: 'Ventas', agendas: 'Agendas',
}

// ── Lo que hay que mirar hoy ────────────────────────────────────────────────

export type SenaAbierta = {
  leadId: number
  lead: string
  closer: string | null
  importe: number
  moneda: string
  saldo: number | null
  comprometida: string | null
  vencida: boolean
}

export async function senasAbiertas(alcance: Alcance, hoy: string): Promise<SenaAbierta[]> {
  if (sinEquipoAsignado(alcance)) return []
  const valores: unknown[] = [hoy]
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id' }, 2)
  if (alc.parametro !== null) valores.push(alc.parametro)

  const f = await filas<Record<string, any>>(
    `select l.id, l.nombre, c.nombre as closer, s.importe, s.moneda,
            s.saldo_pendiente, s.fecha_comprometida,
            (s.fecha_comprometida is not null and s.fecha_comprometida < $1) as vencida
       from senias s
       join leads l on l.id = s.lead_id and l.borrado_en is null
       left join closers c on c.id = l.closer_id
      where s.borrado_en is null and s.estado = 'abierta' and ${alc.condicion}
      order by s.fecha_comprometida nulls last`,
    valores,
  )
  return f.map((x) => ({
    leadId: x.id, lead: x.nombre, closer: x.closer,
    importe: Number(x.importe), moneda: x.moneda,
    saldo: x.saldo_pendiente === null ? null : Number(x.saldo_pendiente),
    comprometida: x.fecha_comprometida, vencida: x.vencida,
  }))
}

/**
 * Leads sin fecha de reunión.
 *
 * No entran a ninguna métrica —el embudo entero cuenta sobre las reuniones del
 * período— y por eso hay que contarlos aparte. Un lead que no aparece en
 * ninguna pantalla no es un lead prolijo: es un lead perdido, y el que lo cargó
 * cree que está.
 */
export async function sinFechaDeReunion(alcance: Alcance): Promise<number> {
  if (sinEquipoAsignado(alcance)) return 0
  const valores: unknown[] = []
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id' }, 1)
  if (alc.parametro !== null) valores.push(alc.parametro)

  const f = await fila<{ n: number }>(
    `select count(*)::int as n from leads l
      where l.borrado_en is null and l.fecha_sesion is null
        and l.resultado not in ('perdida', 'no_calificado') and ${alc.condicion}`,
    valores,
  )
  return f?.n ?? 0
}

/** Reuniones que ya pasaron y nadie cargó. El trabajo pendiente del equipo. */
export async function sinCargar(alcance: Alcance, hoy: string, limite = 50): Promise<{
  leadId: number; lead: string; closer: string | null; fecha: string; dias: number
}[]> {
  if (sinEquipoAsignado(alcance)) return []
  const valores: unknown[] = [hoy]
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id' }, 2)
  if (alc.parametro !== null) valores.push(alc.parametro)
  valores.push(limite)

  const f = await filas<Record<string, any>>(
    `select l.id, l.nombre, c.nombre as closer, l.fecha_sesion, ($1::date - l.fecha_sesion) as dias
       from leads l left join closers c on c.id = l.closer_id
      where l.borrado_en is null and l.fecha_sesion is not null and l.fecha_sesion < $1
        and l.estado = 'agendado' and l.resultado = 'pendiente' and ${alc.condicion}
      order by l.fecha_sesion
      limit $${valores.length}`,
    valores,
  )
  return f.map((x) => ({
    leadId: x.id, lead: x.nombre, closer: x.closer,
    fecha: x.fecha_sesion, dias: Number(x.dias),
  }))
}

/**
 * Leads cuya plata contradice su resultado.
 *
 * Un lead que dice «Perdido» con una venta activa suma a la facturación del mes
 * igual que una venta real. El error es fácil de cometer —se carga la venta en
 * el lead equivocado, o el cliente se arrepiente— y era imposible de encontrar:
 * el embudo ya no lo mostraba y el número seguía inflado.
 *
 * Que el tablero sepa decir cuáles son es la diferencia entre un número que se
 * corrige y un número en el que se deja de confiar.
 */
export type PlataFantasma = {
  leadId: number
  lead: string
  closer: string | null
  resultado: Resultado
  que: 'venta' | 'sena'
  importe: number
  moneda: string
  fecha: string
}

export async function plataFantasma(alcance: Alcance, limite = 20): Promise<PlataFantasma[]> {
  if (sinEquipoAsignado(alcance)) return []
  const valores: unknown[] = []
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id' }, 1)
  if (alc.parametro !== null) valores.push(alc.parametro)
  valores.push(limite)

  const f = await filas<Record<string, any>>(
    `select l.id, l.nombre, l.resultado, c.nombre as closer,
            'venta' as que, v.importe, v.moneda, v.fecha
       from ventas v
       join leads l on l.id = v.lead_id and l.borrado_en is null
       left join closers c on c.id = l.closer_id
      where v.borrado_en is null and l.resultado <> 'venta' and ${alc.condicion}
     union all
     select l.id, l.nombre, l.resultado, c.nombre as closer,
            'sena' as que, s.importe, s.moneda, s.fecha
       from senias s
       join leads l on l.id = s.lead_id and l.borrado_en is null
       left join closers c on c.id = l.closer_id
      where s.borrado_en is null and s.estado <> 'convertida'
        and l.resultado in ('perdida', 'no_calificado') and ${alc.condicion}
     order by fecha desc
     limit $${valores.length}`,
    valores,
  )
  return f.map((x) => ({
    leadId: x.id, lead: x.nombre, closer: x.closer, resultado: x.resultado as Resultado,
    que: x.que as 'venta' | 'sena', importe: Number(x.importe), moneda: x.moneda, fecha: x.fecha,
  }))
}

export { redondear }
