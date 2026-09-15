import 'server-only'
import { filas } from '@/lib/db'
import { tasa } from '@/motor/embudo'
import type { Rango } from '@/motor/periodos'

export type FilaDeCloser = {
  id: number
  nombre: string
  agendadas: number
  asistencias: number
  asistenciaPct: number | null
  ofertas: number
  ofertaPct: number | null
  senas: number
  senaPct: number | null
  ventas: number
  cierrePct: number | null
  cierreSobreOfertaPct: number | null
  facturacion: number
  cash: number
  ticketPromedio: number | null
}

/**
 * La comparativa de closers.
 *
 * Todavía sin cierre ajustado por Lead Quality: ese número necesita el Lead
 * Quality Score, que entra en la Fase 4. Mostrar sólo el cierre bruto es
 * incompleto y se sabe; inventar un ajuste sin el score sería peor.
 */
export async function performanceDeClosers(rango: Rango, monedaBase = 'USD'): Promise<FilaDeCloser[]> {
  const f = await filas<any>(
    `select c.id, c.nombre,
            count(o.id)                                          as agendadas,
            count(o.id) filter (where o.estado = 'asistida')      as asistencias,
            count(o.id) filter (where o.hubo_oferta)              as ofertas,
            count(o.id) filter (where exists (select 1 from senias s
                                 where s.oportunidad_id = o.id and s.borrado_en is null)) as senas,
            count(o.id) filter (where o.resultado = 'venta')      as ventas,
            coalesce((select sum(v.importe) from ventas v
                       where v.oportunidad_id in (select id from oportunidades o2
                              where o2.closer_id = c.id and o2.borrado_en is null)
                         and v.borrado_en is null and v.moneda = $3
                         and v.fecha between $1 and $2), 0)       as facturacion,
            coalesce((select sum(p.importe) from pagos p
                       join ventas v2 on v2.id = p.venta_id and v2.borrado_en is null
                       where v2.oportunidad_id in (select id from oportunidades o3
                              where o3.closer_id = c.id and o3.borrado_en is null)
                         and p.borrado_en is null and p.estado = 'cobrado' and p.moneda = $3
                         and p.fecha between $1 and $2), 0)       as cash
       from closers c
       left join oportunidades o
              on o.closer_id = c.id and o.borrado_en is null
             and o.fecha_agenda between $1 and $2
      where c.activo
      group by c.id, c.nombre
      order by c.nombre`,
    [rango.desde, rango.hasta, monedaBase],
  )

  return f.map((x) => {
    const agendadas = Number(x.agendadas)
    const asistencias = Number(x.asistencias)
    const ofertas = Number(x.ofertas)
    const ventas = Number(x.ventas)
    const facturacion = Number(x.facturacion)
    return {
      id: x.id, nombre: x.nombre,
      agendadas, asistencias,
      asistenciaPct: tasa(asistencias, agendadas),
      ofertas, ofertaPct: tasa(ofertas, asistencias),
      senas: Number(x.senas), senaPct: tasa(Number(x.senas), asistencias),
      ventas, cierrePct: tasa(ventas, asistencias),
      cierreSobreOfertaPct: tasa(ventas, ofertas),
      facturacion, cash: Number(x.cash),
      ticketPromedio: ventas === 0 ? null : Math.round(facturacion / ventas),
    }
  })
}

export type FilaDeSetter = {
  id: number
  nombre: string
  agendas: number
  objetivo: number | null
  cumplimiento: number | null
  asistencias: number
  asistenciaPct: number | null
  ofertas: number
  senas: number
  ventas: number
  facturacionOriginada: number
}

/**
 * La performance de los setters.
 *
 * El objetivo sale de la tabla `objetivos`, no de una constante: la Parte 11.2
 * pide que se configure desde la app. Un setter sin objetivo cargado muestra
 * `null`, no cero: no es lo mismo «no llegó» que «nadie le puso objetivo».
 */
export async function performanceDeSetters(rango: Rango, monedaBase = 'USD'): Promise<FilaDeSetter[]> {
  const f = await filas<any>(
    `select s.id, s.nombre,
            count(distinct l.id)                                  as agendas,
            count(o.id) filter (where o.estado = 'asistida')       as asistencias,
            count(o.id)                                           as oportunidades,
            count(o.id) filter (where o.hubo_oferta)               as ofertas,
            count(o.id) filter (where exists (select 1 from senias sn
                                 where sn.oportunidad_id = o.id and sn.borrado_en is null)) as senas,
            count(o.id) filter (where o.resultado = 'venta')       as ventas,
            (select valor from objetivos ob
              where ob.ambito = 'setter' and ob.ambito_id = s.id and ob.tipo = 'agendas'
                and ob.desde <= $1 and ob.hasta >= $2
              order by ob.desde desc limit 1)                      as objetivo,
            coalesce((select sum(v.importe) from ventas v
                       join oportunidades o4 on o4.id = v.oportunidad_id
                       join leads l4 on l4.id = o4.lead_id
                      where l4.setter_id = s.id and v.borrado_en is null and v.moneda = $3
                        and v.fecha between $1 and $2), 0)         as facturacion
       from setters s
       left join leads l on l.setter_id = s.id and l.borrado_en is null
                        and l.creado_en::date between $1 and $2
       left join oportunidades o on o.lead_id = l.id and o.borrado_en is null
      where s.activo
      group by s.id, s.nombre
      order by s.nombre`,
    [rango.desde, rango.hasta, monedaBase],
  )

  return f.map((x) => {
    const agendas = Number(x.agendas)
    const objetivo = x.objetivo === null ? null : Number(x.objetivo)
    const oportunidades = Number(x.oportunidades)
    return {
      id: x.id, nombre: x.nombre, agendas, objetivo,
      cumplimiento: objetivo === null || objetivo === 0 ? null : tasa(agendas, objetivo),
      asistencias: Number(x.asistencias),
      asistenciaPct: tasa(Number(x.asistencias), oportunidades),
      ofertas: Number(x.ofertas), senas: Number(x.senas), ventas: Number(x.ventas),
      facturacionOriginada: Number(x.facturacion),
    }
  })
}
