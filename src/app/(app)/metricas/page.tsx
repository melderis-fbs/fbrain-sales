import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { metricas, apertura, porDia, DEFINICIONES } from '@/datos/metricas'
import { config } from '@/datos/catalogos'
import { rango, rangoAnterior, hoyEn, variacion, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Tarjeta, Encabezado, Barra, Pildora, plata, porcentaje } from '@/componentes/Piezas'
import { Embudo } from '@/componentes/Embudo'
import { NOMBRE_DE_MOTIVO, type MotivoPerdida } from '@/dominio/resultados'

type Busqueda = Promise<Record<string, string | undefined>>

const APERTURAS = [
  { clave: 'closer', nombre: 'Closer' },
  { clave: 'setter', nombre: 'Setter' },
  { clave: 'fuente', nombre: 'Fuente' },
  { clave: 'funnel', nombre: 'Funnel' },
] as const

/**
 * Métricas: el mismo mes, mirado por abajo.
 *
 * El Dashboard contesta «cómo venimos». Esta pantalla contesta «por qué», que
 * es otra pregunta y necesita otra forma: aperturas completas, la caída etapa
 * por etapa, y el período contra el anterior en cada número.
 *
 * Sale del mismo módulo de métricas que el Dashboard y el Tracker. Si esta
 * pantalla dijera algo distinto de aquéllas, las tres dejarían de usarse.
 */
export default async function Metricas({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const hoy = hoyEn()
  const r = rango(periodo, hoy)
  const previo = rangoAnterior(periodo, r)
  const monedaBase = await config<string>('moneda_base', 'USD')
  const verPlata = puede(usuario, 'verDinero')

  const [ahora, antes, dias, porMotivo, ...aperturas] = await Promise.all([
    metricas(r, alcance, {}, monedaBase),
    metricas(previo, alcance, {}, monedaBase),
    porDia(r, alcance),
    apertura('motivo_perdida', r, alcance, {}, monedaBase),
    ...APERTURAS.map((a) => apertura(a.clave, r, alcance, {}, monedaBase)),
  ])

  const m = ahora.medidas
  const p = antes.medidas
  const perdidos = porMotivo.reduce((s, x) => s + x.agendadas, 0)
  const picoDia = Math.max(1, ...dias.map((d) => d.agendadas))

  const COMPARABLES: { etiqueta: string; ahora: number | null; antes: number | null
                       unidad?: string; mejorEsMas?: boolean; como?: string }[] = [
    { etiqueta: 'Agendadas', ahora: m.agendadas, antes: p.agendadas, como: DEFINICIONES.agendadas!.formula },
    { etiqueta: 'Asistencias', ahora: m.asistencias, antes: p.asistencias },
    { etiqueta: 'Tasa de asistencia', ahora: m.asistenciaPct, antes: p.asistenciaPct, unidad: '%' },
    { etiqueta: 'No shows', ahora: m.noShows, antes: p.noShows, mejorEsMas: false },
    { etiqueta: 'Cancelados', ahora: m.cancelados, antes: p.cancelados, mejorEsMas: false },
    { etiqueta: 'Ofertas', ahora: m.ofertas, antes: p.ofertas },
    { etiqueta: 'Tasa de oferta', ahora: m.ofertaPct, antes: p.ofertaPct, unidad: '%' },
    { etiqueta: 'Señas', ahora: m.senas, antes: p.senas },
    { etiqueta: 'Cierres', ahora: m.ventasCerradas, antes: p.ventasCerradas,
      como: DEFINICIONES.ventasCerradas!.formula },
    { etiqueta: 'Cierres de las asistencias del período', ahora: m.ventas, antes: p.ventas,
      como: 'De las reuniones a las que el lead ASISTIÓ en este período, cuántas terminaron en venta. Es el numerador del % de cierre.' },
    { etiqueta: 'Cierre', ahora: m.cierrePct, antes: p.cierrePct, unidad: '%', como: DEFINICIONES.cierrePct!.formula },
    { etiqueta: 'Cierre sobre oferta', ahora: m.cierreSobreOfertaPct, antes: p.cierreSobreOfertaPct, unidad: '%' },
    { etiqueta: 'En seguimiento', ahora: m.enSeguimiento, antes: p.enSeguimiento },
    { etiqueta: 'Perdidos', ahora: m.perdidos, antes: p.perdidos, mejorEsMas: false },
    ...(verPlata ? [
      { etiqueta: 'Facturación', ahora: m.facturacion, antes: p.facturacion, como: DEFINICIONES.facturacion!.formula },
      { etiqueta: 'Cash collected', ahora: m.cashCollected, antes: p.cashCollected, como: DEFINICIONES.cashCollected!.formula },
      { etiqueta: 'Ticket promedio', ahora: m.ticketPromedio, antes: p.ticketPromedio },
    ] : []),
  ]

  return (
    <div className="apilado">
      <Encabezado kicker="Métricas" titulo={`El detalle de ${r.etiqueta.toLowerCase()}`}
                  bajada={`Contra ${previo.etiqueta.toLowerCase()} · del mismo módulo que el Dashboard y el Tracker`} />

      <div className="chips">
        {PERIODOS.map((x) => (
          <Link key={x.clave} href={`/metricas?periodo=${x.clave}`}
                className={periodo === x.clave ? 'activo' : ''}>{x.etiqueta}</Link>
        ))}
      </div>

      <div className="rejilla g2">
        <Tarjeta titulo="Todo el período, contra el anterior">
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Métrica</th><th className="num">Ahora</th><th className="num">Antes</th><th className="num">Variación</th></tr>
              </thead>
              <tbody>
                {COMPARABLES.map((c) => {
                  const v = c.ahora === null || c.antes === null ? null : variacion(c.ahora, c.antes)
                  const bueno = v === null || v === 0 ? null : (v > 0) === (c.mejorEsMas ?? true)
                  return (
                    <tr key={c.etiqueta}>
                      <td title={c.como}>{c.etiqueta}</td>
                      <td className="num">
                        <strong>{c.ahora === null ? '—' : c.ahora.toLocaleString('es-AR')}{c.unidad ?? ''}</strong>
                      </td>
                      <td className="num" style={{ color: 'var(--gris)' }}>
                        {c.antes === null ? '—' : c.antes.toLocaleString('es-AR')}{c.unidad ?? ''}
                      </td>
                      <td className="num">
                        {v === null ? <span className="sindato">—</span>
                          : v === 0 ? <span style={{ color: 'var(--gris-claro)' }}>=</span>
                          : <span className={`tendencia ${bueno ? 'sube' : 'baja'}`}>
                              {v > 0 ? '↑' : '↓'} {Math.abs(v)}%
                            </span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {verPlata && m.otrasMonedas.length > 0 ? (
            <p className="ayuda" style={{ marginTop: 10 }}>
              Sin sumar, en otra moneda: {m.otrasMonedas.map((x) => plata(x.importe, x.moneda)).join(' · ')}.
            </p>
          ) : null}
        </Tarjeta>

        <div className="apilado">
          <Tarjeta titulo="Dónde se cae el embudo"
                   ayuda="Cada porcentaje es contra la etapa anterior: es lo que dice dónde se pierde.">
            <Embudo etapas={ahora.etapas} />
          </Tarjeta>

          <Tarjeta titulo={`Por qué se pierde (${perdidos})`}
                   ayuda="Lista cerrada: «no le interesó» escrito de nueve maneras no se puede contar.">
            {porMotivo.length === 0 ? (
              <p className="ayuda">No hay pérdidas cargadas en el período.</p>
            ) : (
              <div className="apilado" style={{ gap: 7 }}>
                {porMotivo.map((x) => (
                  <div key={x.nombre}>
                    <div className="entre" style={{ marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5 }}>
                        {NOMBRE_DE_MOTIVO[x.nombre as MotivoPerdida] ?? x.nombre}
                      </span>
                      <span style={{ fontSize: 12.5 }}>
                        {x.agendadas} · {Math.round((x.agendadas / Math.max(1, perdidos)) * 100)}%
                      </span>
                    </div>
                    <Barra porcentaje={(x.agendadas / Math.max(1, perdidos)) * 100} color="rojo" />
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>
        </div>
      </div>

      {APERTURAS.map((a, i) => {
        const filas = aperturas[i] ?? []
        if (filas.length === 0) return null
        return (
          <Tarjeta key={a.clave} titulo={`Por ${a.nombre.toLowerCase()}`}
                   ayuda="Las filas suman el total de arriba: salen de la misma consulta.">
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{a.nombre}</th>
                    <th className="num">Agendadas</th><th className="num">Asistencias</th><th className="num">%</th>
                    <th className="num">Ofertas</th><th className="num">Cierres</th>
                    <th className="num" title="Ventas ÷ asistencias del período.">Cierre / asist.</th>
                    {verPlata ? <th className="num">Facturación</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.nombre}>
                      <td>{f.nombre}</td>
                      <td className="num">{f.agendadas}</td>
                      <td className="num">{f.asistencias}</td>
                      <td className="num">{porcentaje(f.asistenciaPct)}</td>
                      <td className="num">{f.ofertas}</td>
                      {/* Cierres por fecha de venta; el % de cierre, sobre las
                          asistencias del período. */}
                      <td className="num">{f.cerradas}</td>
                      <td className="num">{porcentaje(f.cierrePct)}</td>
                      {verPlata ? <td className="num">{plata(f.facturacion, monedaBase)}</td> : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{m.agendadas}</td>
                    <td className="num">{m.asistencias}</td>
                    <td className="num">{porcentaje(m.asistenciaPct)}</td>
                    <td className="num">{m.ofertas}</td>
                    <td className="num">{m.ventasCerradas}</td>
                    <td className="num">{porcentaje(m.cierrePct)}</td>
                    {verPlata ? <td className="num">{plata(m.facturacion, monedaBase)}</td> : null}
                  </tr>
                </tfoot>
              </table>
            </div>
          </Tarjeta>
        )
      })}

      <Tarjeta titulo="Día por día"
               ayuda="El ritmo, no sólo el total: un mes bueno con tres días muertos se arregla distinto que uno parejo.">
        {dias.length === 0 ? <p className="ayuda">Sin reuniones en el período.</p> : (
          <div className="apilado" style={{ gap: 6 }}>
            {dias.map((d) => (
              <div key={d.dia} className="fila" style={{ flexWrap: 'nowrap', gap: 10 }}>
                <span style={{ fontSize: 12, width: 72, color: 'var(--gris)', flex: '0 0 72px' }}>
                  {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
                </span>
                <div style={{ flex: 1 }}>
                  <Barra porcentaje={(d.agendadas / picoDia) * 100} color="acento" />
                </div>
                <span style={{ fontSize: 12, width: 130, textAlign: 'right', flex: '0 0 130px',
                               fontVariantNumeric: 'tabular-nums' }}>
                  {/* Las agendas y las asistencias son las reuniones de ese
                      día; los cierres, los que se firmaron ese día. */}
                  {d.agendadas} ag · {d.asistencias} as
                  {d.cerradas > 0 ? <Pildora color="verde"> {d.cerradas} c</Pildora> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </Tarjeta>
    </div>
  )
}
