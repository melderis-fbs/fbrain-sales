import 'server-only'
import { fila, filas } from '@/lib/db'
import { tasa } from '@/motor/embudo'
import { cierreAjustado, type Ajustado, type MezclaDeLeads } from '@/motor/ajuste'
import type { Rango } from '@/motor/periodos'
import type { NivelDeCalidad } from '@/dominio/calidad'

/**
 * Cómo viene cada persona del equipo.
 *
 * Lo importante de este archivo no son los conteos: es el cierre AJUSTADO por
 * Lead Quality. Sin él, la tabla de closers ordena por un número que depende
 * tanto de quién trabajó mejor como de a quién le tocaron mejores leads, y en
 * un equipo chico eso se nota enseguida — el mejor closer aprende a pelear por
 * los leads buenos en vez de por las llamadas difíciles.
 *
 * El nivel de calidad que se usa es el CONGELADO al asignar el lead, con el
 * vigente como respaldo. Si se usara el vigente a secas, bastaría con bajarle
 * la calidad a un lead después de perderlo para mejorar el propio número.
 */

/** El nivel de calidad de cada lead, resuelto una vez y con su respaldo. */
const NIVEL = `
  coalesce(
    (select q.nivel from lead_quality q where q.lead_id = l.id and q.congelado
      order by q.creado_en desc limit 1),
    (select q.nivel from lead_quality q where q.lead_id = l.id
      order by q.creado_en desc limit 1),
    'sin_calificar'
  )`

/**
 * Las tasas de cierre de TODA la operación, abiertas por nivel de lead.
 *
 * Son la vara. Se calculan sobre una ventana más larga que el período que se
 * está mirando: con las asistencias de un mes, la tasa de «lead alto» la
 * definen doce llamadas y el ajuste se vuelve ruido.
 */
export async function tasasGenerales(hasta: string, meses = 6): Promise<{
  porNivel: Record<string, number>; general: number; asistencias: number
}> {
  const f = await filas<{ nivel: string; asistencias: number; ventas: number }>(
    `select ${NIVEL} as nivel,
            count(*) as asistencias,
            count(*) filter (where l.resultado = 'venta') as ventas
       from leads l
      where l.borrado_en is null and l.estado = 'asistio'
        and l.fecha_sesion between ($1::date - ($2 || ' months')::interval) and $1::date
      group by 1`,
    [hasta, String(meses)],
  )

  const totales = f.reduce((s, x) => ({
    asistencias: s.asistencias + Number(x.asistencias),
    ventas: s.ventas + Number(x.ventas),
  }), { asistencias: 0, ventas: 0 })

  const general = totales.asistencias === 0 ? 0 : totales.ventas / totales.asistencias
  const porNivel: Record<string, number> = {}
  for (const x of f) {
    const n = Number(x.asistencias)
    // Cada nivel también se suaviza contra la tasa general: un nivel con seis
    // asistencias no define una vara para nadie.
    porNivel[x.nivel] = n === 0 ? general : (Number(x.ventas) + general * 10) / (n + 10)
  }
  return { porNivel, general, asistencias: totales.asistencias }
}

export type FilaDeCloser = {
  id: number
  nombre: string
  activo: boolean
  agendadas: number
  asistencias: number
  asistenciaPct: number | null
  ofertas: number
  ofertaPct: number | null
  senas: number
  /**
   * Los cierres de las reuniones DE ESTE PERÍODO. Es el numerador del cierre,
   * y por eso va contra sus propias asistencias.
   */
  ventas: number
  /**
   * Los cierres FIRMADOS en este período, venga la reunión del mes que venga.
   *
   * Es lo que el closer quiere decir con «este mes cerré tres», y es el número
   * que va arriba en las pantallas. Sale de la fecha de venta, igual que la
   * facturación: contarlo por la fecha de la llamada dejaba a alguien con la
   * facturación bien y los cierres mal en la misma fila.
   */
  cerradas: number
  cierrePct: number | null
  cierreSobreOfertaPct: number | null
  /** El cierre puesto en contexto de los leads que recibió. */
  ajuste: Ajustado
  /** Lead quality promedio de lo que le tocó. */
  calidadPromedio: number | null
  facturacion: number
  cash: number
  ticketPromedio: number | null
  /** Nota promedio de sus llamadas analizadas, si hay. */
  notaLlamadas: number | null
  llamadasAnalizadas: number
}

export async function performanceDeClosers(
  rango: Rango,
  monedaBase = 'USD',
  soloActivos = true,
): Promise<FilaDeCloser[]> {
  const [base, mezclas, generales] = await Promise.all([
    filas<Record<string, any>>(
      `select c.id, c.nombre, c.activo,
              count(l.id)                                        as agendadas,
              count(l.id) filter (where l.estado = 'asistio')     as asistencias,
              count(l.id) filter (where l.hubo_oferta)            as ofertas,
              count(l.id) filter (where exists (select 1 from senias s
                                   where s.lead_id = l.id and s.borrado_en is null)) as senas,
              count(l.id) filter (where l.resultado = 'venta')    as ventas,
              avg((select q.score from lead_quality q where q.lead_id = l.id
                    order by q.congelado desc, q.creado_en desc limit 1)) as calidad,
              -- Los cierres del mes van por FECHA DE VENTA, como la
              -- facturación. Van en subconsulta y no en un filter sobre el
              -- join de arriba porque el join ya está acotado a las reuniones
              -- del período: una venta de este mes cuya llamada fue el mes
              -- pasado no está en esas filas.
              (select count(*) from ventas vc
                 join leads lc on lc.id = vc.lead_id and lc.borrado_en is null
                where lc.closer_id = c.id and vc.borrado_en is null
                  and vc.fecha between $1 and $2)                 as cerradas,
              coalesce((select sum(v.importe) from ventas v
                         join leads lv on lv.id = v.lead_id
                        where lv.closer_id = c.id and v.borrado_en is null and v.moneda = $3
                          and v.fecha between $1 and $2), 0)      as facturacion,
              coalesce((select sum(p.importe) from pagos p
                         join ventas v2 on v2.id = p.venta_id and v2.borrado_en is null
                         join leads lp on lp.id = v2.lead_id
                        where lp.closer_id = c.id and p.borrado_en is null
                          and p.estado = 'cobrado' and p.moneda = $3
                          and (p.n_cuota is null or p.n_cuota <= 1)
                          and v2.fecha between $1 and $2), 0)     as cash,
              (select avg(cs.score) from call_scores cs
                 join analisis a on a.id = cs.analisis_id
                 join llamadas ll on ll.id = a.llamada_id
                where ll.closer_id = c.id and cs.vigente
                  and ll.fecha between $1 and $2)                 as nota,
              (select count(*) from call_scores cs2
                 join analisis a2 on a2.id = cs2.analisis_id
                 join llamadas l2 on l2.id = a2.llamada_id
                where l2.closer_id = c.id and cs2.vigente
                  and l2.fecha between $1 and $2)                 as analizadas
         from closers c
         left join leads l on l.closer_id = c.id and l.borrado_en is null
                          and l.fecha_sesion between $1 and $2
        ${soloActivos ? 'where c.activo' : ''}
        group by c.id, c.nombre, c.activo
        order by c.nombre`,
      [rango.desde, rango.hasta, monedaBase],
    ),
    filas<{ closer_id: number; nivel: string; asistencias: number; ventas: number }>(
      `select l.closer_id, ${NIVEL} as nivel,
              count(*) as asistencias,
              count(*) filter (where l.resultado = 'venta') as ventas
         from leads l
        where l.borrado_en is null and l.estado = 'asistio'
          and l.closer_id is not null and l.fecha_sesion between $1 and $2
        group by 1, 2`,
      [rango.desde, rango.hasta],
    ),
    tasasGenerales(rango.hasta),
  ])

  return base.map((x) => {
    const agendadas = Number(x.agendadas)
    const asistencias = Number(x.asistencias)
    const ofertas = Number(x.ofertas)
    const ventas = Number(x.ventas)
    const cerradas = Number(x.cerradas)
    const facturacion = Number(x.facturacion)
    const mezcla: MezclaDeLeads[] = mezclas
      .filter((m) => m.closer_id === x.id)
      .map((m) => ({
        nivel: m.nivel as NivelDeCalidad | 'sin_calificar',
        asistencias: Number(m.asistencias), ventas: Number(m.ventas),
      }))

    return {
      id: x.id, nombre: x.nombre, activo: x.activo,
      agendadas, asistencias,
      asistenciaPct: tasa(asistencias, agendadas),
      ofertas, ofertaPct: tasa(ofertas, asistencias),
      senas: Number(x.senas),
      // LA REGLA: cierres del período ÷ asistencias del período. Los cierres
      // van por fecha de venta, igual que la facturación de al lado; las
      // asistencias son las reuniones de este mes a las que el lead vino.
      ventas, cerradas, cierrePct: tasa(cerradas, asistencias),
      cierreSobreOfertaPct: tasa(cerradas, ofertas),
      ajuste: cierreAjustado(mezcla, generales.porNivel, generales.general),
      calidadPromedio: x.calidad === null ? null : Math.round(Number(x.calidad)),
      facturacion, cash: Number(x.cash),
      // Ticket = facturación ÷ cierres, las dos cosas por fecha de venta.
      // Dividir la facturación del mes por los cierres de las reuniones del
      // mes son dos universos distintos, y el resultado no es el ticket de
      // nada.
      ticketPromedio: cerradas === 0 ? null : Math.round(facturacion / cerradas),
      notaLlamadas: x.nota === null ? null : Math.round(Number(x.nota) * 10) / 10,
      llamadasAnalizadas: Number(x.analizadas),
    }
  })
}

export type FilaDeSetter = {
  id: number
  nombre: string
  activo: boolean
  agendas: number
  objetivo: number | null
  cumplimiento: number | null
  asistencias: number
  asistenciaPct: number | null
  noShows: number
  ofertas: number
  /** Cierres de las agendas de este período: el numerador de su cierre. */
  ventas: number
  /** Cierres firmados en este período, de agendas suyas de cualquier mes. */
  cerradas: number
  cierrePct: number | null
  /** Lead quality promedio de lo que agendó. Es el número del setter. */
  calidadPromedio: number | null
  calificados: number
  sinCalificar: number
  facturacionOriginada: number
  repescas: number
}

/**
 * La performance de los setters.
 *
 * El número propio del setter no es «cuántas agendó»: es la CALIDAD de lo que
 * agendó. Agendar veinte llamadas con gente que no puede pagar es trabajo que
 * le cuesta plata a la empresa, y una tabla que sólo cuenta agendas lo premia.
 *
 * El objetivo sale de la tabla `objetivos`, no de una constante. Un setter sin
 * objetivo cargado muestra `null`, no cero: no es lo mismo «no llegó» que
 * «nadie le puso objetivo».
 */
export async function performanceDeSetters(
  rango: Rango,
  monedaBase = 'USD',
  soloActivos = true,
): Promise<FilaDeSetter[]> {
  const f = await filas<Record<string, any>>(
    `select s.id, s.nombre, s.activo,
            count(l.id)                                       as agendas,
            count(l.id) filter (where l.estado = 'asistio')    as asistencias,
            count(l.id) filter (where l.estado = 'no_show')    as no_shows,
            count(l.id) filter (where l.hubo_oferta)           as ofertas,
            count(l.id) filter (where l.resultado = 'venta')   as ventas,
            avg((select q.score from lead_quality q where q.lead_id = l.id
                  order by q.congelado desc, q.creado_en desc limit 1)) as calidad,
            count(l.id) filter (where exists (
                  select 1 from lead_quality q2 where q2.lead_id = l.id))    as calificados,
            count(l.id) filter (where l.ciclo > 1)             as repescas,
            -- Los cierres del mes, por fecha de venta: es la misma fecha con
            -- la que se suma la facturación que originó, así que la cuenta y
            -- la plata no pueden discrepar.
            (select count(*) from ventas vc
               join leads lc on lc.id = vc.lead_id and lc.borrado_en is null
              where lc.setter_id = s.id and vc.borrado_en is null
                and vc.fecha between $1 and $2)                as cerradas,
            (select valor from objetivos ob
              where ob.ambito = 'setter' and ob.ambito_id = s.id and ob.tipo = 'agendas'
                and ob.desde <= $1 and ob.hasta >= $2
              order by ob.desde desc limit 1)                  as objetivo,
            coalesce((select sum(v.importe) from ventas v
                       join leads lv on lv.id = v.lead_id
                      where lv.setter_id = s.id and v.borrado_en is null and v.moneda = $3
                        and v.fecha between $1 and $2), 0)     as facturacion
       from setters s
       left join leads l on l.setter_id = s.id and l.borrado_en is null
                        and l.fecha_sesion between $1 and $2
      ${soloActivos ? 'where s.activo' : ''}
      group by s.id, s.nombre, s.activo
      order by s.nombre`,
    [rango.desde, rango.hasta, monedaBase],
  )

  return f.map((x) => {
    const agendas = Number(x.agendas)
    const asistencias = Number(x.asistencias)
    const ventas = Number(x.ventas)
    const objetivo = x.objetivo === null ? null : Number(x.objetivo)
    const calificados = Number(x.calificados)
    return {
      id: x.id, nombre: x.nombre, activo: x.activo,
      agendas, objetivo,
      cumplimiento: objetivo === null || objetivo === 0 ? null : tasa(agendas, objetivo),
      asistencias, asistenciaPct: tasa(asistencias, agendas),
      noShows: Number(x.no_shows),
      ofertas: Number(x.ofertas), ventas, cerradas: Number(x.cerradas),
      // La misma regla que para los closers.
      cierrePct: tasa(Number(x.cerradas), asistencias),
      calidadPromedio: x.calidad === null ? null : Math.round(Number(x.calidad)),
      calificados, sinCalificar: agendas - calificados,
      facturacionOriginada: Number(x.facturacion),
      repescas: Number(x.repescas),
    }
  })
}

// ── La ficha de una persona ─────────────────────────────────────────────────

export type Persona = { id: number; nombre: string; activo: boolean; usuarioId: number | null }

export async function verCloser(id: number): Promise<Persona | null> {
  return fila<Persona>(
    'select id, nombre, activo, usuario_id as "usuarioId" from closers where id = $1', [id],
  )
}

export async function verSetter(id: number): Promise<Persona | null> {
  return fila<Persona>(
    'select id, nombre, activo, usuario_id as "usuarioId" from setters where id = $1', [id],
  )
}

export type MotivoDePerdida = { motivo: string | null; cantidad: number }

/** Por qué pierde esta persona. Es la pregunta que cambia un entrenamiento. */
export async function motivosDePerdida(
  rango: Rango,
  quien: { closerId?: number; setterId?: number } = {},
): Promise<MotivoDePerdida[]> {
  const valores: unknown[] = [rango.desde, rango.hasta]
  const condiciones = [`l.borrado_en is null`, `l.resultado = 'perdida'`, `l.fecha_sesion between $1 and $2`]
  if (quien.closerId !== undefined) { valores.push(quien.closerId); condiciones.push(`l.closer_id = $${valores.length}`) }
  if (quien.setterId !== undefined) { valores.push(quien.setterId); condiciones.push(`l.setter_id = $${valores.length}`) }

  const f = await filas<{ motivo_perdida: string | null; cantidad: number }>(
    `select l.motivo_perdida, count(*) as cantidad
       from leads l where ${condiciones.join(' and ')}
      group by 1 order by 2 desc`,
    valores,
  )
  return f.map((x) => ({ motivo: x.motivo_perdida, cantidad: Number(x.cantidad) }))
}
