import Link from 'next/link'
import type { VentaDelPeriodo, CierreEnOtroMes } from '@/datos/metricas'
import { plata, fechaCorta, Pildora, Vacio } from './Piezas'
import { CobroRapido } from './CobroRapido'

/**
 * Las ventas del período, una por una.
 *
 * Existe porque un número que no se puede abrir no se puede verificar: «8
 * cierres» sin poder ver cuáles son se discute en una reunión en vez de
 * mirarse. Acá están, con nombre, quién la cerró y cuánto entró.
 *
 * Van por FECHA DE VENTA, no por la fecha de la reunión: una llamada de
 * septiembre que se firma en octubre es una venta de octubre. Es la misma
 * fecha con la que se suma la facturación, así que la lista y el total de
 * arriba no pueden discrepar — y si alguna vez lo hicieran, se ve acá.
 *
 * Y el cobro se carga desde acá, en el mismo renglón donde se ve que falta.
 * Mandar a buscar la ficha de cada venta para poner cuánto entró es lo que
 * hace que el cash collected quede siempre a medio cargar.
 */
export function VentasDelPeriodo({ ventas, etiqueta, puedeCobrar, enOtroMes = [] }: {
  ventas: VentaDelPeriodo[]
  etiqueta: string
  /** Sólo quien puede tocar la plata carga cobros desde la lista. */
  puedeCobrar?: boolean
  /** Reuniones de este período cuya venta quedó fechada en otro mes. */
  enOtroMes?: CierreEnOtroMes[]
}) {
  if (ventas.length === 0 && enOtroMes.length === 0) {
    return <Vacio>No hay ventas firmadas en {etiqueta}.</Vacio>
  }

  const total = ventas.reduce((a, v) => a + v.importe, 0)
  const cobrado = ventas.reduce((a, v) => a + v.cobrado, 0)
  const moneda = ventas[0]?.moneda ?? 'USD'

  /**
   * El aviso que contesta «tengo ocho y la pantalla dice cinco».
   *
   * Las que faltan están acá con sus dos fechas. Casi siempre es una venta
   * que quedó fechada el día de la llamada —entró por planilla sin columna de
   * fecha de cierre, o nadie tocó la fecha al cargarla— y se arregla en la
   * ficha, no en la cuenta.
   */
  const aviso = enOtroMes.length === 0 ? null : (
    <div className="aviso atencion" style={{ marginBottom: 12 }}>
      <strong>
        {enOtroMes.length === 1
          ? 'Hay 1 reunión de este período cuya venta quedó fechada en otro mes'
          : `Hay ${enOtroMes.length} reuniones de este período cuya venta quedó fechada en otro mes`}
      </strong>, así que no cuentan acá: los cierres se cuentan el mes de la
      FECHA DE VENTA. Si alguna cerró en este mes y quedó con la fecha de la
      llamada, se corrige en su ficha.
      <div className="tabla-scroll" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr><th>Lead</th><th>Closer</th><th>Llamada</th><th>Fecha de venta</th>
                <th className="num">Importe</th></tr>
          </thead>
          <tbody>
            {enOtroMes.map((v) => (
              <tr key={`${v.leadId}-${v.fechaVenta}`}>
                <td>
                  <Link href={`/leads/${v.leadId}?pestana=resultado&volver=tracker`}
                        style={{ fontWeight: 650 }}>{v.lead}</Link>
                </td>
                <td style={{ fontSize: 12.5 }}>{v.closer ?? <span className="sindato">—</span>}</td>
                <td style={{ fontSize: 12.5 }}>{fechaCorta(v.fechaSesion)}</td>
                <td style={{ fontSize: 12.5, fontWeight: 650 }}>{fechaCorta(v.fechaVenta)}</td>
                <td className="num">{plata(v.importe, v.moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (ventas.length === 0) {
    return <>{aviso}<Vacio>No hay ventas firmadas en {etiqueta}.</Vacio></>
  }

  return (
    <>
    {aviso}
    {/* La clase distingue esta tabla de la del aviso de arriba, que tiene la
        misma forma y dice otra cosa. */}
    <div className="tabla-scroll lista-cierres">
      <table>
        <thead>
          <tr>
            <th title="El día en que se firmó. Por ésta se cuenta el cierre.">Fecha de venta</th>
            <th title="El día de la reunión. Puede ser de otro mes: una llamada de agosto firmada en septiembre es un cierre de septiembre.">Llamada</th>
            <th>Lead</th><th>Closer</th><th>Setter</th>
            <th className="num">Importe</th><th className="num">Cobrado</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={`${v.leadId}-${v.fecha}-${v.importe}`}>
              <td style={{ fontSize: 12.5, whiteSpace: 'nowrap', fontWeight: 650 }}>
                {fechaCorta(v.fecha)}
              </td>
              {/* Cuando la llamada es de otro mes se marca: es el caso que
                  hace dudar del número, y verlo dicho lo contesta. */}
              <td style={{ fontSize: 12.5, whiteSpace: 'nowrap',
                           color: (v.fechaSesion ?? '').slice(0, 7) !== v.fecha.slice(0, 7)
                             ? 'var(--acento)' : 'var(--gris)' }}>
                {v.fechaSesion === null ? <span className="sindato">—</span> : fechaCorta(v.fechaSesion)}
              </td>
              <td>
                <Link href={`/leads/${v.leadId}?volver=tracker`} style={{ fontWeight: 650 }}>{v.lead}</Link>
                {v.empresa || v.programa || v.enSegunda ? (
                  <div style={{ fontSize: 11.5, color: 'var(--gris)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {[v.empresa, v.programa].filter(Boolean).join(' · ')}
                    {v.enSegunda ? <Pildora color="acento">2ª llamada</Pildora> : null}
                  </div>
                ) : null}
              </td>
              <td style={{ fontSize: 12.5 }}>{v.closer ?? <span className="sindato">sin asignar</span>}</td>
              <td style={{ fontSize: 12.5 }}>{v.setter ?? <span className="sindato">—</span>}</td>
              <td className="num" style={{ fontWeight: 650 }}>{plata(v.importe, v.moneda)}</td>
              <td className="num" style={{ fontSize: 12.5 }}>
                {puedeCobrar ? (
                  <CobroRapido leadId={v.leadId} moneda={v.moneda} fecha={v.fecha}
                               cobrado={v.cobrado} importe={v.importe} />
                ) : v.cobrado === 0
                  ? <span className="sindato">sin cobrar</span>
                  : plata(v.cobrado, v.moneda)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>{ventas.length} {ventas.length === 1 ? 'cierre' : 'cierres'}</td>
            <td className="num">{plata(total, moneda)}</td>
            <td className="num">{plata(cobrado, moneda)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p className="ayuda" style={{ marginTop: 10 }}>
      Los cierres se cuentan por la <strong>fecha de venta</strong>. Cuando la llamada fue en
      otro mes, la columna «Llamada» va en azul: esa venta cuenta acá y no en el mes de su
      reunión.
    </p>
    </>
  )
}
