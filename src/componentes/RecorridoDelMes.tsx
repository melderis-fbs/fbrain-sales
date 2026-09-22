import Link from 'next/link'
import type { RecorridoDeCloser } from '@/datos/metricas'
import { plata } from './Piezas'

/**
 * Cómo viene cada closer en el mes.
 *
 * Una fila por persona y el recorrido completo de izquierda a derecha:
 * agendó → asistió → ofertó → cerró. Se lee como se trabaja, y el escalón
 * donde cae la barra dice dónde se pierde sin tener que calcular nada.
 *
 * Las dos mitades están separadas y con el nombre puesto, porque son universos
 * distintos y mezclarlas era lo que hacía que la pantalla dijera «0 cierres»
 * al lado de «USD 4.000 facturados»:
 *
 *   CIERRE   de las reuniones de este mes, cuántas terminaron en venta. Es un
 *            porcentaje y por eso no puede pasar de 100.
 *   VENDIDO  la plata que se firmó este mes, venga la reunión del mes que
 *            venga. Una reunión de agosto cerrada en septiembre entra acá.
 */
function Barra({ recorrido }: { recorrido: RecorridoDeCloser }) {
  const total = Math.max(recorrido.agendadas, 1)
  const tramos = [
    { n: recorrido.agendadas, clase: 'agendadas' },
    { n: recorrido.asistencias, clase: 'asistencias' },
    { n: recorrido.ofertas, clase: 'ofertas' },
    { n: recorrido.cerradas, clase: 'cerradas' },
  ]
  return (
    <div className="recorrido" aria-hidden>
      {tramos.map((t, i) => (
        <div key={i} className={`tramo ${t.clase}`} style={{ width: `${(t.n / total) * 100}%` }} />
      ))}
    </div>
  )
}

export function RecorridoDelMes({
  filas, etiqueta, verPlata, soloUno,
}: {
  filas: RecorridoDeCloser[]
  etiqueta: string
  verPlata: boolean
  /** Un closer mirando lo suyo: sobra la comparación con el resto. */
  soloUno: boolean
}) {
  if (filas.length === 0) {
    return <p className="ayuda">No hay reuniones ni ventas en {etiqueta}.</p>
  }

  const total = filas.reduce((a, f) => ({
    agendadas: a.agendadas + f.agendadas,
    asistencias: a.asistencias + f.asistencias,
    ofertas: a.ofertas + f.ofertas,
    cerradas: a.cerradas + f.cerradas,
    ventasDelMes: a.ventasDelMes + f.ventasDelMes,
    facturacion: a.facturacion + f.facturacion,
    cash: a.cash + f.cash,
    sinCargar: a.sinCargar + f.sinCargar,
  }), { agendadas: 0, asistencias: 0, ofertas: 0, cerradas: 0, ventasDelMes: 0, facturacion: 0, cash: 0, sinCargar: 0 })

  const cierre = (cerradas: number, asistencias: number) =>
    asistencias === 0 ? null : Math.round((cerradas / asistencias) * 1000) / 10

  const Fila = ({ f, esTotal }: { f: typeof total & { id?: number | null; nombre?: string }; esTotal?: boolean }) => {
    const pct = cierre(f.cerradas, f.asistencias)
    return (
      <tr className={esTotal ? 'total' : undefined}>
        <td>
          {esTotal ? <strong>Todo el equipo</strong>
            : f.id === null ? <span className="sindato">Sin closer</span>
            : <Link href={`/tracker?closer=${f.id}`} style={{ fontWeight: 650 }}>{f.nombre}</Link>}
          {f.sinCargar > 0 ? (
            <div className="falta">{f.sinCargar} sin cargar</div>
          ) : null}
        </td>
        <td className="paso">
          <div className="pasos">
            <span><b>{f.agendadas}</b> agendó</span>
            <span><b>{f.asistencias}</b> asistió</span>
            <span><b>{f.ofertas}</b> ofertó</span>
            <span><b>{f.cerradas}</b> cerró</span>
          </div>
          <Barra recorrido={f as RecorridoDeCloser} />
        </td>
        <td className="num cierre">
          {pct === null ? <span className="sindato">—</span> : <>{pct}<span className="chiquito">%</span></>}
          <div className="bajo">de sus asistencias</div>
        </td>
        {verPlata ? (
          <>
            <td className="num">
              <strong>{plata(f.facturacion)}</strong>
              <div className="bajo">
                {f.ventasDelMes === 0 ? 'sin ventas firmadas'
                  : `${f.ventasDelMes} ${f.ventasDelMes === 1 ? 'venta firmada' : 'ventas firmadas'}`}
              </div>
            </td>
            <td className="num">
              {plata(f.cash)}
              <div className="bajo">cobrado</div>
            </td>
          </>
        ) : null}
      </tr>
    )
  }

  return (
    <div className="tabla-scroll">
      <table className="recorridos">
        <thead>
          <tr>
            <th>{soloUno ? 'Vos' : 'Closer'}</th>
            <th>Su recorrido en {etiqueta}</th>
            <th className="num">Cierre</th>
            {verPlata ? <><th className="num">Vendido</th><th className="num">Cobrado</th></> : null}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => <Fila key={f.id ?? 'sin'} f={f as never} />)}
          {filas.length > 1 ? <Fila f={total as never} esTotal /> : null}
        </tbody>
      </table>
      {verPlata ? (
        <p className="ayuda" style={{ marginTop: 8 }}>
          <strong>Cierre</strong> es sobre las reuniones de {etiqueta}: de los que asistieron,
          cuántos compraron. <strong>Vendido</strong> es la plata firmada en {etiqueta}, venga la
          reunión del mes que venga — una reunión de agosto cerrada ahora entra acá y no en el
          cierre de acá. Son dos cosas distintas y las dos son ciertas.
        </p>
      ) : null}
    </div>
  )
}
