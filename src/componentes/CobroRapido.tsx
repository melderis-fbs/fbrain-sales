'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { cobrarRapidoAccion } from '@/app/(app)/leads/acciones'
import { plata } from './Piezas'

/**
 * Cargar lo que entró de una venta, desde la misma lista donde se ve que falta.
 *
 * Existe porque el cash collected sólo sabe lo que alguien cargó, y lo que hay
 * que ir a buscar a otra pantalla no se carga: la venta quedaba marcada y el
 * cobro «para después». El número terminaba mintiendo hacia abajo, que es peor
 * que no tenerlo, porque igual se mira y igual se decide con él.
 *
 * Importe y fecha, nada más. La fecha viene puesta en la de la venta —que es
 * el caso normal, se cobra al firmar— y se cambia cuando entró otro día,
 * porque el cash se cuenta el mes en que entró la plata.
 */
function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="chico secundario" disabled={pending}>
      {pending ? '…' : 'Cobrar'}
    </button>
  )
}

export function CobroRapido({
  leadId, moneda, fecha, cobrado, importe,
}: {
  leadId: number
  moneda: string
  /** La fecha de la venta: el cobro suele ser ese día. */
  fecha: string
  cobrado: number
  importe: number
}) {
  const [error, accion] = useActionState<string | null, FormData>(cobrarRapidoAccion, null)
  const falta = importe - cobrado

  return (
    <form action={accion} className="carga" style={{ justifyContent: 'flex-end' }}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="moneda" value={moneda} />
      {cobrado > 0
        ? <span style={{ fontSize: 12.5, fontWeight: 650 }}>{plata(cobrado, moneda)}</span>
        : null}
      <label className="oculto" htmlFor={`cob-${leadId}`}>Cuánto entró</label>
      <input id={`cob-${leadId}`} name="importe" inputMode="decimal" required
             placeholder={falta > 0 ? String(falta) : '0'} style={{ width: 92 }} />
      <label className="oculto" htmlFor={`cobf-${leadId}`}>Fecha del cobro</label>
      <input id={`cobf-${leadId}`} name="fecha" type="date" defaultValue={fecha}
             style={{ width: 140 }} />
      <Boton />
      {error ? <span className="carga-error">{error}</span> : null}
    </form>
  )
}
