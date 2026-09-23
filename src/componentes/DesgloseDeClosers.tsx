import Link from 'next/link'
import type { RecorridoDeCloser } from '@/datos/metricas'
import { plata } from './Piezas'

/**
 * El desglose por closer.
 *
 * Una fila por persona, de izquierda a derecha en el orden en que se trabaja:
 * llamadas → asistió → ofertó → vendió → CIERRE → la plata. El cierre va en el
 * medio y más grande porque es el número que se mira primero, y era el que
 * antes quedaba del mismo tamaño que «reagendadas».
 *
 * Abajo, el total. Dirección mira la última fila; cada closer mira la suya, y
 * la encuentra por el círculo con sus iniciales sin leer la tabla entera.
 *
 * Las dos columnas de plata dicen cosas distintas a propósito:
 *
 *   CIERRES    las ventas FIRMADAS en el período, por fecha de venta.
 *   FACTURADO  la plata de esas mismas ventas. Son las dos la misma columna
 *              de la base, así que no pueden discrepar.
 *   CIERRE %   de las reuniones DE ESTE período, cuántas terminaron en venta.
 *              Es otra pregunta y por eso está aparte: sale de las
 *              asistencias de este mes, y así no puede pasar de 100%.
 *
 * Mezclarlas es lo que hacía que la pantalla dijera «0 cierres · USD 4.000»
 * —y, después, que un closer con tres llamadas del mes pasado firmadas este
 * mes apareciera con cinco cierres teniendo ocho—.
 */
function Inicial({ nombre }: { nombre: string }) {
  const letras = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase()
  return <div className="inicial">{letras || '—'}</div>
}

export function DesgloseDeClosers({
  filas, verPlata, soloUno,
}: {
  filas: RecorridoDeCloser[]
  verPlata: boolean
  /** Un closer mirando lo suyo: sin comparación ni «top». */
  soloUno: boolean
}) {
  if (filas.length === 0) {
    return <p className="ayuda" style={{ margin: 0 }}>Todavía no hay reuniones ni ventas en este período.</p>
  }

  const total = filas.reduce((a, f) => ({
    agendadas: a.agendadas + f.agendadas, asistencias: a.asistencias + f.asistencias,
    ofertas: a.ofertas + f.ofertas, ventas: a.ventas + f.ventas,
    cerradas: a.cerradas + f.cerradas,
    facturacion: a.facturacion + f.facturacion, cash: a.cash + f.cash,
  }), { agendadas: 0, asistencias: 0, ofertas: 0, ventas: 0, cerradas: 0, facturacion: 0, cash: 0 })

  const tasa = (parte: number, sobre: number) => (sobre === 0 ? null : Math.round((parte / sobre) * 1000) / 10)
  const ticket = (facturado: number, ventas: number) => (ventas === 0 ? null : Math.round(facturado / ventas))
  const mejor = soloUno ? null
    : filas.reduce<RecorridoDeCloser | null>((m, f) => (f.facturacion > (m?.facturacion ?? 0) ? f : m), null)

  const Numero = ({ n }: { n: number }) => n === 0 ? <span className="apagado">0</span> : <>{n}</>
  const Plata = ({ n }: { n: number }) =>
    n === 0 ? <span className="apagado">—</span> : <>{plata(n)}</>

  return (
    <div className="tabla-scroll">
      <table className="desglose">
        <thead>
          <tr>
            <th>{soloUno ? 'Vos' : 'Closer'}</th>
            <th>Llamadas</th><th>Asistió</th><th>Ofertas</th>
            <th title="Ventas firmadas en el período, por fecha de venta.">Cierres</th>
            <th title="De las reuniones de este período, cuántas terminaron en venta, sobre sus asistencias.">Cierre / asist.</th>
            {verPlata ? <><th>Facturado</th><th>Cash</th><th>Ticket</th></> : null}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const pct = tasa(f.ventas, f.asistencias)
            const t = ticket(f.facturacion, f.cerradas)
            return (
              <tr key={f.id ?? 'sin'}>
                <td>
                  <div className="quien">
                    <Inicial nombre={f.nombre} />
                    <div>
                      <div className="nombre">
                        {f.id === null ? <span className="apagado">Sin closer</span>
                          : soloUno ? f.nombre
                          : <Link href={`/tracker?closer=${f.id}`}>{f.nombre}</Link>}
                      </div>
                      {mejor && f.id === mejor.id && mejor.facturacion > 0
                        ? <div className="falta">Top del período</div>
                        : f.sinCargar > 0
                          ? <div className="falta">{f.sinCargar} sin cargar</div>
                          : null}
                    </div>
                  </div>
                </td>
                <td><Numero n={f.agendadas} /></td>
                <td><Numero n={f.asistencias} /></td>
                <td><Numero n={f.ofertas} /></td>
                <td><Numero n={f.cerradas} /></td>
                <td className="cierre">
                  {pct === null ? <span className="apagado">—</span> : <>{pct}%</>}
                </td>
                {verPlata ? (
                  <>
                    <td><Plata n={f.facturacion} /></td>
                    <td><Plata n={f.cash} /></td>
                    <td>{t === null ? <span className="apagado">—</span> : plata(t)}</td>
                  </>
                ) : null}
              </tr>
            )
          })}
          {filas.length > 1 ? (
            <tr className="total">
              <td><div className="quien"><div style={{ width: 34 }} /><div className="nombre">Total</div></div></td>
              <td>{total.agendadas}</td><td>{total.asistencias}</td><td>{total.ofertas}</td>
              <td>{total.cerradas}</td>
              <td className="cierre">
                {tasa(total.ventas, total.asistencias) === null
                  ? <span className="apagado">—</span>
                  : <>{tasa(total.ventas, total.asistencias)}%</>}
              </td>
              {verPlata ? (
                <>
                  <td>{plata(total.facturacion)}</td>
                  <td>{plata(total.cash)}</td>
                  <td>{ticket(total.facturacion, total.cerradas) === null
                    ? <span className="apagado">—</span> : plata(ticket(total.facturacion, total.cerradas)!)}</td>
                </>
              ) : null}
            </tr>
          ) : null}
        </tbody>
      </table>
      {verPlata ? (
        <p className="ayuda" style={{ marginTop: 12 }}>
          <strong>Cierres</strong> y <strong>Facturado</strong> son lo firmado en el período,
          por fecha de venta: una llamada del mes pasado que se cierra este mes cuenta acá.{' '}
          <strong>Cierre / asist.</strong> es otra pregunta —de las reuniones de ESTE período, de
          los que asistieron, cuántos compraron— y por eso nunca pasa de 100%.
        </p>
      ) : null}
    </div>
  )
}
