import 'server-only'
import { fila, filas } from '@/lib/db'
import { condicionDeAlcance, type Alcance } from '@/lib/permisos'
import { embudo, tasa, redondear, type Conteos, type Etapa } from '@/motor/embudo'
import { hoyEn, type Rango } from '@/motor/periodos'
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
  /**
   * Reuniones del período, primeras y segundas juntas. `agendadas` cuenta sólo
   * las primeras: una segunda llamada con el mismo lead no es una agenda nueva.
   */
  reuniones: number
  /** Segundas sesiones: se agendan y se asiste distinto que a una primera. */
  segundas: number
  segundasAsistidas: number
  /** De los cierres, los que cerraron en una segunda llamada. */
  cierresEnSegunda: number

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
  /**
   * Ventas CERRADAS en el período, por fecha de venta.
   *
   * No es lo mismo que `ventas`, y confundirlas es lo que hace que la pantalla
   * diga «0 cierres» al lado de «USD 4.000 facturados»:
   *
   *   ventas          de las reuniones DE ESTE PERÍODO, cuántas terminaron en
   *                   venta. Es el numerador del % de cierre, y por eso no
   *                   puede pasar de 100%.
   *   ventasCerradas  cuántas ventas se firmaron en este período, venga la
   *                   reunión del mes que venga. Es lo que un closer quiere
   *                   decir con «este mes vendí dos».
   *
   * Una reunión de agosto que se cierra en septiembre es asistencia de agosto
   * y venta cerrada de septiembre. Las dos cosas son ciertas y se muestran por
   * separado, con el nombre puesto.
   */
  ventasCerradas: number
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
  /** De lo vendido en el período, cuánto entró: cash ÷ facturación. */
  cobranzaPct: number | null

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
  asistencias:  { nombre: 'Asistencias', formula: 'De esos, los que quedaron en «asistió».', universo: 'reunión' },
  noShows:      { nombre: 'No shows', formula: 'De esos, los que quedaron en «no show».', universo: 'reunión' },
  ofertas:      { nombre: 'Ofertas', formula: 'De esos, los que tienen marcado que hubo oferta.', universo: 'reunión' },
  senas:        { nombre: 'Señas', formula: 'De esos, los que tienen una seña cargada.', universo: 'reunión' },
  ventas:       { nombre: 'Ventas', formula: 'De esos, los que quedaron en «venta».', universo: 'reunión' },
  cierrePct:    { nombre: 'Cierre', formula: 'Ventas ÷ ASISTENCIAS, no sobre las agendadas: al que no vino no se le pudo vender, así que no es del closer. Las dos cifras salen de las reuniones de este período, así que nunca pasa de 100%. No es la cantidad de cierres del mes: ésa va por fecha de venta.', universo: 'reunión' },
  asistenciasValidas: { nombre: 'Asistencias válidas', formula: 'Asistencias que no quedaron en «no calificado».', universo: 'reunión' },
  noCalificadas:{ nombre: 'No calificadas', formula: 'De los que asistieron, los que quedaron en «no calificado».', universo: 'reunión' },
  cancelados:   { nombre: 'Canceladas', formula: 'De los agendados, los que quedaron en «cancelado».', universo: 'reunión' },
  reagendados:  { nombre: 'Reagendadas', formula: 'De los agendados, los que quedaron en «reagendado».', universo: 'reunión' },
  reuniones:    { nombre: 'Reuniones', formula: 'Todas las reuniones del período: primeras y segundas.', universo: 'reunión' },
  cierresEnSegunda: { nombre: 'Cierre en segunda llamada', formula: 'De los cierres del período, los que cerraron en una segunda llamada.', universo: 'reunión' },
  agendadas:    { nombre: 'Agendas', formula: 'Primeras llamadas con reunión en el período. Una segunda llamada con el mismo lead no es una agenda nueva.', universo: 'reunión' },
  segundas:     { nombre: 'Segundas llamadas', formula: 'Reuniones del período marcadas como segunda sesión.', universo: 'reunión' },
  segundasAsistidas: { nombre: 'Asistencia a segunda', formula: 'De las segundas sesiones, las que quedaron en «asistió».', universo: 'reunión' },
  asistenciaValidaPct: { nombre: '% Asistencia válida', formula: 'Asistencias válidas ÷ agendadas.', universo: 'reunión' },
  noCalificadasPct: { nombre: '% No calificadas', formula: 'No calificadas ÷ asistencias.', universo: 'reunión' },
  segundaAsistenciaPct: { nombre: '% Asistencia a segunda', formula: 'Asistencias a segunda ÷ segundas agendadas.', universo: 'reunión' },
  cierreSobreValidaPct: { nombre: '% Cierre / asistencia válida', formula: 'Ventas ÷ asistencias válidas.', universo: 'reunión' },
  cierreSobreOfertaPct: { nombre: '% Cierre / oferta', formula: 'Ventas ÷ ofertas hechas.', universo: 'reunión' },
  cashPorAgenda:{ nombre: 'Cash por agenda', formula: 'Cash collected del período ÷ agendadas del período. No es un porcentaje: es plata por reunión, y los dos números salen de universos distintos.', universo: 'mezcla' },
  cashPorAsistencia: { nombre: 'Cash por asistencia', formula: 'Cash collected del período ÷ asistencias del período. Tampoco es un porcentaje.', universo: 'mezcla' },
  ventasCerradas: { nombre: 'Cierres', formula: 'Ventas firmadas en el período, por FECHA DE VENTA: venga la reunión del mes que venga. Es lo que un closer quiere decir con «este mes cerré tres», y es la misma fecha con la que se suma la facturación. No es el numerador del % de cierre.', universo: 'venta' },
  cobranzaPct:  { nombre: '% Cash sobre venta nueva', formula: 'Cash collected ÷ facturación del período. De lo que se vendió este mes, cuánto entró. Los dos números salen de las mismas ventas, así que no puede pasar de 100%.', universo: 'venta' },
  facturacion:  { nombre: 'Facturación', formula: 'Suma de las ventas con fecha de venta en el período.', universo: 'venta' },
  cashCollected:{ nombre: 'Cash collected', formula: 'Lo cobrado de las ventas del período por la venta misma: el pago de la firma, la seña convertida, el contado. Las cuotas siguientes no entran acá —son cobranza de algo ya vendido— y se ven en la ficha del lead. Comisiones lo cuenta distinto, por fecha del cobro, porque una comisión se paga sobre la plata que entró ese mes.', universo: 'venta' },
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

  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, valores.length + 1)
  valores.push(...alc.parametros)
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
  -- AGENDAS son primeras llamadas. Una segunda con el mismo lead no es una
  -- agenda nueva: contarla infla lo que produjo el setter y ensucia el cierre.
  count(*) filter (where l.tipo_sesion <> 'segunda')           as agendadas,
  count(*)                                                     as reuniones,
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
  -- De los cierres del período, cuáles cerraron en una segunda llamada.
  count(*) filter (where l.resultado = 'venta'
                     and l.tipo_sesion = 'segunda')            as cierres_en_segunda,
  count(*) filter (where l.hubo_oferta)                        as ofertas,
  count(*) filter (where exists (select 1 from senias s
                     where s.lead_id = l.id and s.borrado_en is null)) as senas,
  count(*) filter (where l.resultado = 'venta')                as ventas,
  count(*) filter (where l.resultado = 'perdida')              as perdidos,
  count(*) filter (where l.resultado = 'seguimiento')          as en_seguimiento,
  -- Reuniones que YA PASARON y nadie dijo qué pasó. Sólo de días anteriores:
  -- una reunión de hoy a las seis de la tarde no está «sin cargar» a las
  -- nueve de la mañana, y contarla así pide cargar el resultado de algo que
  -- todavía no ocurrió. Las de hoy tienen su propio bloque, con su hora.
  -- La fecha viene de la aplicación y no de current_date: en la base es UTC,
  -- y desde las nueve de la noche en Argentina eso ya es mañana.
  count(*) filter (where l.estado = 'agendado' and l.resultado = 'pendiente'
                     and l.fecha_sesion < $HOY::date)          as pendientes,
  coalesce(sum(l.valor_potencial) filter (
    where l.resultado in ('pendiente','seguimiento','sena') and l.moneda = $MONEDA), 0) as valor_en_juego`

type FilaDeConteos = Record<string, number>

export async function metricas(
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeMetricas = {},
  monedaBase = 'USD',
): Promise<Metricas> {

  const d = donde(rango, alcance, filtros)
  // Cada consulta lleva EXACTAMENTE los parámetros que usa. Postgres rechaza
  // uno que sobra —«could not determine data type of parameter»— y el error no
  // dice cuál consulta es, así que compartir una lista entre dos sale caro.
  const conteosValores = [...d.valores, hoyEn(), monedaBase]
  const conteos = CONTEOS
    .replace('$HOY', `$${d.valores.length + 1}`)
    .replace('$MONEDA', `$${d.valores.length + 2}`)

  const c = await fila<FilaDeConteos>(
    `select ${conteos} from leads l where ${d.sql}`, conteosValores,
  )

  // Las señas del período, en su propia tarjeta. No suman a facturación ni a
  // cash: recién impactan cuando se convierten.
  const senaValores = [...d.valores, monedaBase]
  const sena = await fila<{ importe: number }>(
    `select coalesce(sum(s.importe), 0) as importe
       from senias s join leads l on l.id = s.lead_id
      where s.borrado_en is null and s.moneda = $${senaValores.length} and ${d.sql}`,
    senaValores,
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
      reuniones: n('reuniones'),
      cierresEnSegunda: n('cierres_en_segunda'),
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

      ventasCerradas: factura.cantidad,
      facturacion: factura.total,
      cashCollected: cash.total,
      senasImporte: Number(sena?.importe ?? 0),
      ticketPromedio: factura.cantidad === 0 ? null : Math.round(factura.total / factura.cantidad),
      valorEnJuego: Number(c?.valor_en_juego ?? 0),
      // Dividir por cero no da cero: da «sin datos». Un «USD 0 por agenda»
      // cuando no hubo agendas es un número inventado.
      cashPorAgenda: conteo.agendadas === 0 ? null : Math.round(cash.total / conteo.agendadas),
      cashPorAsistencia: conteo.asistidas === 0 ? null : Math.round(cash.total / conteo.asistidas),
      cobranzaPct: tasa(cash.total, factura.total),

      moneda: monedaBase,
      otrasMonedas: juntarMonedas([...factura.otras, ...cash.otras]),
    },
  }
}

/**
 * La plata de un período, por la fecha de la VENTA.
 *
 * Las dos —lo facturado y lo cobrado— se cuentan sobre las mismas ventas: las
 * que se firmaron en el período, y sólo lo que entró por esas ventas. Así
 * «cobrado ÷ vendido» es una pregunta que se puede contestar, y la lista de
 * ventas que hay debajo del número suma exactamente lo mismo que el número.
 *
 * Contar el cash por la fecha del cobro era defendible y era peor: una venta
 * de septiembre con la seña cobrada en agosto figuraba cobrada en la lista y
 * no aparecía en el cash de septiembre. Dos números correctos que no cuadran
 * entre sí terminan en que no se cree en ninguno.
 *
 * (La única pantalla que sigue contando por fecha de cobro es Comisiones, y a
 * propósito: una comisión se paga sobre la plata que entró ese mes.)
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
  // El período lo marca la VENTA en los dos casos: en `ventas` es la fila
  // misma, en `pagos` es la venta de la que cuelga el cobro.
  const cuando = tabla === 'ventas' ? 'm.fecha' : 'v.fecha'
  const condiciones = ['m.borrado_en is null', 'l.borrado_en is null', `${cuando} between $1 and $2`]
  if (tabla === 'pagos') {
    condiciones.push(`m.estado = 'cobrado'`)
    // Sólo lo que entró POR LA VENTA NUEVA: el pago de la firma, la seña que
    // se convirtió, el contado. Las cuotas que vienen después no son cash de
    // negocio nuevo —son la cobranza de algo ya vendido— y sumarlas al KPI
    // del mes hace que un mes flojo parezca bueno porque cobró cuotas viejas.
    // El plan completo vive en la ficha del lead, que es donde sirve.
    condiciones.push('(m.n_cuota is null or m.n_cuota <= 1)')
  }

  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, valores.length + 1)
  valores.push(...alc.parametros)
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
    // El CONTEO no depende de la moneda: una venta en pesos es una venta. El
    // importe sí, y por eso lo de otra moneda se informa aparte en vez de
    // sumarse con una cotización inventada.
    cantidad: f.reduce((a, x) => a + Number(x.cantidad), 0),
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
    asistenciasValidas: 0, noCalificadas: 0, reuniones: 0, segundas: 0, segundasAsistidas: 0,
    cierresEnSegunda: 0,
    asistenciaPct: null, noShowPct: null, cancelacionPct: null, ofertaPct: null,
    senaPct: null, cierrePct: null, cierreSobreOfertaPct: null,
    asistenciaValidaPct: null, noCalificadasPct: null, segundaAsistenciaPct: null,
    cierreSobreValidaPct: null, cobranzaPct: null,
    ventasCerradas: 0,
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
  /** Cierres de las reuniones DE ESTE PERÍODO: el numerador del cierre. */
  ventas: number
  /** Cierres FIRMADOS en el período, por fecha de venta. */
  cerradas: number
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

  const union = {
    closer: { join: 'left join closers t on t.id = l.closer_id', id: 't.id', nombre: 't.nombre', sin: 'Sin closer' },
    setter: { join: 'left join setters t on t.id = l.setter_id', id: 't.id', nombre: 't.nombre', sin: 'Sin setter' },
    fuente: { join: 'left join fuentes t on t.id = l.fuente_id', id: 't.id', nombre: 't.nombre', sin: 'Sin fuente' },
    funnel: { join: 'left join funnels t on t.id = l.funnel_id', id: 't.id', nombre: 't.nombre', sin: 'Sin funnel' },
    motivo_perdida: { join: '', id: 'null::bigint', nombre: 'l.motivo_perdida', sin: 'Sin motivo' },
  }[por]

  const d = donde(rango, alcance, filtros, por === 'motivo_perdida' ? [`l.resultado = 'perdida'`] : [])

  const f = await filas<Record<string, any>>(
    `select ${union.id} as id, ${union.nombre} as nombre,
            count(*) as agendadas,
            count(*) filter (where l.estado = 'asistio') as asistencias,
            count(*) filter (where l.hubo_oferta) as ofertas,
            count(*) filter (where l.resultado = 'venta') as ventas
       from leads l ${union.join}
      where ${d.sql}
      group by 1, 2
      order by count(*) desc`,
    d.valores,
  )

  /**
   * Los cierres y la plata, por FECHA DE VENTA y en su propia consulta.
   *
   * No se puede sacar de la de arriba: esa está acotada a las reuniones del
   * período, y una venta firmada este mes cuya llamada fue el mes pasado no
   * está en esas filas. Contándola ahí, el detalle por closer decía menos
   * cierres de los que el mismo closer tenía facturados dos columnas más a la
   * derecha.
   *
   * Un motivo de pérdida no tiene ventas, así que ahí no hay nada que sumar.
   */
  const porVenta = new Map<string, {
    id: number | null; nombre: string; cerradas: number; facturacion: number
  }>()
  if (por !== 'motivo_perdida') {
    const alc = condicionDeAlcance(
      alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 4)
    const vs: unknown[] = [rango.desde, rango.hasta, monedaBase, ...alc.parametros]
    const extra: string[] = []
    for (const [campo, columna] of [
      ['closerId', 'l.closer_id'], ['setterId', 'l.setter_id'],
      ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'],
    ] as const) {
      const valor = filtros[campo]
      if (valor !== undefined) { vs.push(valor); extra.push(`${columna} = $${vs.length}`) }
    }

    const cerradas = await filas<Record<string, any>>(
      `select ${union.id} as id, ${union.nombre} as nombre, count(*) as cerradas,
              coalesce(sum(v.importe), 0) as facturacion
         from ventas v
         join leads l on l.id = v.lead_id and l.borrado_en is null
         ${union.join}
        where v.borrado_en is null and v.fecha between $1 and $2 and v.moneda = $3
          and ${[alc.condicion, ...extra].join(' and ')}
        group by 1, 2`,
      vs,
    )
    for (const x of cerradas) {
      porVenta.set(x.id === null ? 'sin' : String(x.id), {
        id: x.id === null ? null : Number(x.id),
        nombre: x.nombre ?? union.sin,
        cerradas: Number(x.cerradas), facturacion: Number(x.facturacion),
      })
    }
  }

  const clave = (id: unknown) => (id === null || id === undefined ? 'sin' : String(id))

  const salida = f.map((x) => {
    const agendadas = Number(x.agendadas)
    const asistencias = Number(x.asistencias)
    const ventas = Number(x.ventas)
    const suyo = porVenta.get(clave(x.id))
    return {
      id: x.id === null ? null : Number(x.id),
      nombre: x.nombre ?? union.sin,
      agendadas, asistencias,
      asistenciaPct: tasa(asistencias, agendadas),
      ofertas: Number(x.ofertas), ventas,
      cerradas: suyo?.cerradas ?? 0,
      cierrePct: tasa(ventas, asistencias),
      facturacion: suyo?.facturacion ?? 0,
    }
  })

  /**
   * Quien vendió este mes pero no tuvo reuniones este mes aparece igual.
   *
   * Si no, su plata y sus cierres no están en ninguna fila y el detalle deja
   * de sumar el total de arriba. Una tabla de detalle que no suma la tarjeta
   * que tiene encima hace que se deje de mirar la pantalla entera, no sólo la
   * tabla.
   */
  const yaEstan = new Set(salida.map((x) => clave(x.id)))
  for (const [k, v] of porVenta) {
    if (yaEstan.has(k)) continue
    salida.push({
      id: v.id, nombre: v.nombre,
      agendadas: 0, asistencias: 0, asistenciaPct: null,
      ofertas: 0, ventas: 0, cerradas: v.cerradas,
      cierrePct: null, facturacion: v.facturacion,
    })
  }

  return salida
}

// ── La serie del período ────────────────────────────────────────────────────

export type Dia = {
  dia: string
  agendadas: number
  asistencias: number
  /** Cierres de las reuniones de ese día. */
  ventas: number
  /** Cierres FIRMADOS ese día, venga la reunión del día que venga. */
  cerradas: number
}

/** Día por día. Lo usa el Tracker para ver el ritmo, no sólo el total. */
export async function porDia(
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeMetricas = {},
): Promise<Dia[]> {
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

  // Los cierres del día, por FECHA DE VENTA y aparte: una venta firmada hoy
  // de una llamada de la semana pasada es un cierre de hoy. Si se contara con
  // la consulta de arriba, la columna de cierres del día no sumaría el total
  // del mes que está arriba de la misma tabla.
  const alc = condicionDeAlcance(
    alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 3)
  const vs: unknown[] = [rango.desde, rango.hasta, ...alc.parametros]
  const extra: string[] = []
  for (const [campo, columna] of [
    ['closerId', 'l.closer_id'], ['setterId', 'l.setter_id'],
    ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'],
  ] as const) {
    const valor = filtros[campo]
    if (valor !== undefined) { vs.push(valor); extra.push(`${columna} = $${vs.length}`) }
  }
  const cerradas = await filas<{ dia: string; cerradas: string }>(
    `select v.fecha as dia, count(*) as cerradas
       from ventas v
       join leads l on l.id = v.lead_id and l.borrado_en is null
      where v.borrado_en is null and v.fecha between $1 and $2
        and ${[alc.condicion, ...extra].join(' and ')}
      group by 1`,
    vs,
  )
  const porDiaCerradas = new Map(cerradas.map((x) => [String(x.dia), Number(x.cerradas)]))

  // Un día en el que se firmó sin que hubiera reuniones agendadas existe: sin
  // esto, ese cierre no aparece en ninguna fila.
  const dias = new Map<string, Dia>()
  for (const x of f) {
    dias.set(String(x.dia), {
      dia: x.dia, agendadas: Number(x.agendadas),
      asistencias: Number(x.asistencias), ventas: Number(x.ventas),
      cerradas: porDiaCerradas.get(String(x.dia)) ?? 0,
    })
  }
  for (const [dia, cuantas] of porDiaCerradas) {
    if (!dias.has(dia)) {
      dias.set(dia, { dia, agendadas: 0, asistencias: 0, ventas: 0, cerradas: cuantas })
    }
  }
  return [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia))
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
    // Un objetivo de «vender 8 este mes» se cumple con lo que se FIRMA este
    // mes, no con las reuniones de este mes que terminaron en venta. Medirlo
    // por fecha de llamada dejaba el objetivo en 7 el día que se firmaba la
    // octava de una llamada del mes anterior.
    case 'ventas': return m.ventasCerradas
    case 'agendas': return m.agendadas
  }
}

export const NOMBRE_DE_OBJETIVO: Record<TipoDeObjetivo, string> = {
  facturacion: 'Facturación', cash: 'Cash collected', ventas: 'Cierres', agendas: 'Agendas',
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
  const valores: unknown[] = [hoy]
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 2)
  valores.push(...alc.parametros)

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
  const valores: unknown[] = []
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 1)
  valores.push(...alc.parametros)

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
  const valores: unknown[] = [hoy]
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 2)
  valores.push(...alc.parametros)
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
  const valores: unknown[] = []
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 1)
  valores.push(...alc.parametros)
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

/**
 * El recorrido del mes de cada closer.
 *
 * La pregunta que el equipo hace todos los días —«¿cómo viene cada uno?»— y
 * que hasta ahora había que armar mirando cuatro pantallas.
 *
 * Trae las dos mitades y las nombra, porque son universos distintos y
 * mezclarlas es lo que hacía que la pantalla dijera «0 cierres · USD 4.000»:
 *
 *   lo que AGENDÓ y ATENDIÓ   sobre las reuniones que le cayeron en el período
 *   lo que CERRÓ              sobre las ventas que firmó en el período
 *
 * El % de cierre sale de la primera mitad, contra las asistencias de esas
 * mismas reuniones: así no puede pasar de 100%.
 */
export type RecorridoDeCloser = {
  id: number | null
  nombre: string
  // Las reuniones del período.
  agendadas: number
  asistencias: number
  ofertas: number
  /**
   * De esas reuniones, cuántas terminaron en venta. Numerador del cierre, y
   * NADA MÁS que eso.
   *
   * Se llamaba `cerradas`, y por ese nombre terminó dibujada en la columna
   * «Ventas» del desglose del Tracker: un closer con tres llamadas del mes
   * pasado firmadas este mes aparecía con cinco cierres teniendo ocho, al
   * lado de una facturación que sí contaba las ocho. El nombre ahora es el
   * mismo que en el resto del archivo, donde `ventas` siempre es esto.
   */
  ventas: number
  asistenciaPct: number | null
  cierrePct: number | null
  // La plata, por su propia fecha.
  /** Cierres firmados en el período, venga la reunión del mes que venga. */
  cerradas: number
  facturacion: number
  cash: number
  /** Reuniones que ya pasaron y no tienen resultado: su número está incompleto. */
  sinCargar: number
}

export async function recorridoPorCloser(
  rango: Rango,
  alcance: Alcance,
  hoy: string,
  monedaBase = 'USD',
): Promise<RecorridoDeCloser[]> {

  const d = donde(rango, alcance, {})
  const reuniones = await filas<Record<string, any>>(
    `select c.id, c.nombre,
            count(*)                                          as agendadas,
            count(*) filter (where l.estado = 'asistio')      as asistencias,
            count(*) filter (where l.hubo_oferta)             as ofertas,
            count(*) filter (where l.resultado = 'venta')     as cerradas,
            count(*) filter (where l.estado = 'agendado' and l.resultado = 'pendiente'
                               and l.fecha_sesion <= $${d.valores.length + 1}) as sin_cargar
       from leads l left join closers c on c.id = l.closer_id
      where ${d.sql}
      group by 1, 2`,
    [...d.valores, hoy],
  )

  // La plata va por su propia fecha, así que es otra consulta: la reunión pudo
  // ser en agosto y la venta en septiembre.
  const alc = condicionDeAlcance(alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 4)
  const valoresPlata: unknown[] = [rango.desde, rango.hasta, monedaBase]
  valoresPlata.push(...alc.parametros)

  const [ventas, cobros] = await Promise.all([
    filas<Record<string, any>>(
      `select c.id, count(*) as cantidad, coalesce(sum(v.importe), 0) as importe
         from ventas v
         join leads l on l.id = v.lead_id and l.borrado_en is null
         left join closers c on c.id = l.closer_id
        where v.borrado_en is null and v.fecha between $1 and $2 and v.moneda = $3 and ${alc.condicion}
        group by 1`, valoresPlata),
    filas<Record<string, any>>(
      `select c.id, coalesce(sum(p.importe), 0) as importe
         from pagos p
         join ventas v on v.id = p.venta_id and v.borrado_en is null
         join leads l on l.id = v.lead_id and l.borrado_en is null
         left join closers c on c.id = l.closer_id
        where p.borrado_en is null and p.estado = 'cobrado'
          and (p.n_cuota is null or p.n_cuota <= 1)
          and v.fecha between $1 and $2 and p.moneda = $3 and ${alc.condicion}
        group by 1`, valoresPlata),
  ])

  const clave = (id: unknown) => (id === null ? 'sin' : String(id))
  const porVenta = new Map(ventas.map((x) => [clave(x.id), x]))
  const porCobro = new Map(cobros.map((x) => [clave(x.id), x]))

  // Un closer que este mes no tuvo reuniones pero firmó una venta —de una
  // llamada vieja— tiene que aparecer igual: si no, su plata no está en
  // ningún lado.
  const todos = new Map<string, { id: number | null; nombre: string }>()
  for (const r of reuniones) todos.set(clave(r.id), { id: r.id === null ? null : Number(r.id), nombre: r.nombre ?? 'Sin closer' })
  for (const v of [...ventas, ...cobros]) {
    if (!todos.has(clave(v.id))) todos.set(clave(v.id), { id: v.id === null ? null : Number(v.id), nombre: 'Sin closer' })
  }

  const porReunion = new Map(reuniones.map((x) => [clave(x.id), x]))

  return [...todos.entries()].map(([k, quien]) => {
    const r = porReunion.get(k)
    const agendadas = Number(r?.agendadas ?? 0)
    const asistencias = Number(r?.asistencias ?? 0)
    const ventas = Number(r?.cerradas ?? 0)
    return {
      id: quien.id,
      nombre: r?.nombre ?? quien.nombre,
      agendadas, asistencias, ventas,
      ofertas: Number(r?.ofertas ?? 0),
      asistenciaPct: tasa(asistencias, agendadas),
      cierrePct: tasa(ventas, asistencias),
      cerradas: Number(porVenta.get(k)?.cantidad ?? 0),
      facturacion: Number(porVenta.get(k)?.importe ?? 0),
      cash: Number(porCobro.get(k)?.importe ?? 0),
      sinCargar: Number(r?.sin_cargar ?? 0),
    }
  }).sort((a, b) => b.facturacion - a.facturacion || b.agendadas - a.agendadas)
}

/**
 * Las ventas del período, una por una.
 *
 * Por FECHA DE VENTA, no por la fecha de la reunión: una llamada de septiembre
 * que se firma en octubre es una venta de octubre, y recién ahí se cuenta. Es
 * la misma fecha con la que se suma la facturación, así que la lista y el total
 * no pueden discrepar.
 *
 * Existe porque un número que no se puede abrir no se puede verificar: «8
 * ventas» sin poder ver cuáles son se discute en una reunión en vez de
 * mirarse.
 */
export type VentaDelPeriodo = {
  leadId: number
  lead: string
  empresa: string | null
  closer: string | null
  setter: string | null
  fecha: string
  importe: number
  moneda: string
  /**
   * Lo que entró POR ESTA VENTA: el pago de la firma, la seña convertida, el
   * contado. Es exactamente lo que suma la tarjeta de cash de arriba. Las
   * cuotas siguientes se ven en la ficha del lead.
   */
  cobrado: number
  programa: string | null
  /** Si cerró en una segunda llamada. */
  enSegunda: boolean
}

export async function ventasDelPeriodo(
  rango: Rango,
  alcance: Alcance,
  filtros: FiltrosDeMetricas = {},
): Promise<VentaDelPeriodo[]> {
  const valores: unknown[] = [rango.desde, rango.hasta]
  const condiciones = ['v.borrado_en is null', 'l.borrado_en is null', 'v.fecha between $1 and $2']

  const alc = condicionDeAlcance(
    alcance, { closer: 'l.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' },
    valores.length + 1)
  valores.push(...alc.parametros)
  condiciones.push(alc.condicion)

  for (const [campo, columna] of [
    ['closerId', 'l.closer_id'], ['setterId', 'l.setter_id'],
    ['fuenteId', 'l.fuente_id'], ['funnelId', 'l.funnel_id'],
  ] as const) {
    const v = filtros[campo]
    if (v !== undefined) { valores.push(v); condiciones.push(`${columna} = $${valores.length}`) }
  }

  const f = await filas<Record<string, any>>(
    `select l.id, l.nombre, l.empresa, l.tipo_sesion, c.nombre as closer, s.nombre as setter,
            v.fecha, v.importe, v.moneda, v.programa,
            coalesce((select sum(p.importe) from pagos p
                       where p.venta_id = v.id and p.borrado_en is null
                         and p.estado = 'cobrado'
                         and (p.n_cuota is null or p.n_cuota <= 1)), 0) as cobrado
       from ventas v
       join leads l on l.id = v.lead_id
       left join closers c on c.id = l.closer_id
       left join setters s on s.id = l.setter_id
      where ${condiciones.join(' and ')}
      order by v.fecha desc, v.id desc`,
    valores,
  )

  return f.map((x) => ({
    leadId: x.id, lead: x.nombre, empresa: x.empresa,
    closer: x.closer, setter: x.setter,
    fecha: x.fecha, importe: Number(x.importe), moneda: x.moneda,
    cobrado: Number(x.cobrado), programa: x.programa,
    enSegunda: x.tipo_sesion === 'segunda',
  }))
}

export { redondear }
