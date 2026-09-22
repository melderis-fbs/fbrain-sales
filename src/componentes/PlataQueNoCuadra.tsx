'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { anularPlataAccion } from '@/app/(app)/leads/acciones'
import { NOMBRE_DE_RESULTADO, type Resultado } from '@/dominio/resultados'
import { plata } from './Piezas'

/**
 * El aviso de plata fantasma, con el botón para sacarla.
 *
 * Aparece cuando el resultado del lead y la plata cargada dicen cosas
 * distintas: un lead «Perdido» con una venta activa sigue sumando a la
 * facturación del mes, y hasta ahora no había manera de arreglarlo desde la
 * aplicación.
 *
 * Dice el número y el mes que está inflando antes de ofrecer el botón, porque
 * un aviso que no dice cuánta plata hay en juego se aprueba sin leer. Y pide el
 * motivo: plata que desaparece de un mes cerrado hay que poder explicarla.
 */
function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
            style={{ background: 'var(--rojo)', borderColor: 'var(--rojo)' }}>
      {pending ? 'Anulando…' : 'Sí, anular'}
    </button>
  )
}

export function PlataQueNoCuadra({
  leadId, que, resultado, importe, moneda, fecha, puedeConPlata,
}: {
  leadId: number
  que: 'venta' | 'sena'
  resultado: Resultado
  importe: number
  moneda: string
  fecha: string | null
  puedeConPlata: boolean
}) {
  const [error, accion] = useActionState<string | null, FormData>(anularPlataAccion, null)
  const [confirmando, setConfirmando] = useState(false)

  const mes = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    : null
  const cosa = que === 'venta' ? 'una venta' : 'una seña'

  return (
    <div className="aviso problema">
      <strong>
        Este lead dice «{NOMBRE_DE_RESULTADO[resultado]}» pero tiene {cosa} de{' '}
        {plata(importe, moneda)} cargada.
      </strong>{' '}
      {que === 'venta'
        ? <>Esa plata está contando en la facturación{mes ? ` de ${mes}` : ''} aunque nunca entró.</>
        : <>Esa seña sigue figurando como compromiso abierto.</>}{' '}
      {puedeConPlata
        ? 'Si el resultado es el correcto, anulala. Si la venta fue real, corregí el resultado.'
        : 'Anularla la hace dirección. Si el resultado está mal cargado, corregilo desde Resultado.'}

      {error ? <div style={{ marginTop: 8 }}><strong>{error}</strong></div> : null}

      {!puedeConPlata ? null : !confirmando ? (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="secundario" onClick={() => setConfirmando(true)}
                  style={{ color: 'var(--rojo)', borderColor: '#EEDCDA' }}>
            Anular {que === 'venta' ? 'la venta' : 'la seña'}
          </button>
        </div>
      ) : (
        <form action={accion} style={{ marginTop: 10 }}>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="que" value={que} />
          <div className="campo">
            <label htmlFor="motivo-anular">¿Por qué se anula?</label>
            <input id="motivo-anular" name="motivo" required autoFocus
                   placeholder="Se cargó en el lead equivocado, el cliente se arrepintió…" />
          </div>
          <div className="fila">
            <Boton />
            <button type="button" className="sutil" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  )
}
