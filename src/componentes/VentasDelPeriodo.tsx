import Link from 'next/link'
import type { VentaDelPeriodo } from '@/datos/metricas'
import { plata, fechaCorta, Pildora, Vacio } from './Piezas'

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
 */
export function VentasDelPeriodo({ ventas, etiqueta }: {
  ventas: VentaDelPeriodo[]
  etiqueta: string
}) {
  if (ventas.length === 0) {
    return <Vacio>No hay ventas firmadas en {etiqueta}.</Vacio>
  }

  const total = ventas.reduce((a, v) => a + v.importe, 0)
  const cobrado = ventas.reduce((a, v) => a + v.cobrado, 0)
  const moneda = ventas[0]!.moneda

  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Lead</th><th>Closer</th><th>Setter</th>
            <th className="num">Importe</th><th className="num">Cobrado</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={`${v.leadId}-${v.fecha}-${v.importe}`}>
              <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fechaCorta(v.fecha)}</td>
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
                {v.cobrado === 0
                  ? <span className="sindato">sin cobrar</span>
                  : plata(v.cobrado, v.moneda)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>{ventas.length} {ventas.length === 1 ? 'venta' : 'ventas'}</td>
            <td className="num">{plata(total, moneda)}</td>
            <td className="num">{plata(cobrado, moneda)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
