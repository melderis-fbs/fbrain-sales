'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { borrarLeadAccion } from '@/app/(app)/leads/acciones'
import type { LoQueCuelga } from '@/datos/leads'
import { plata } from './Piezas'

/**
 * Dar de baja un lead.
 *
 * Con dos frenos y ninguno de adorno:
 *
 *  - Dice QUÉ se lleva puesto antes de preguntar. «¿Seguro?» sin decir qué hay
 *    adentro no es una pregunta: es un trámite que todo el mundo aprueba sin
 *    leer.
 *  - Pide el motivo. Una baja sin motivo, tres meses después, es un lead que
 *    desapareció y nadie sabe por qué — y eso deja la sospecha de que se perdió
 *    información, que es peor que el lead de menos.
 *
 * Y no borra: el lead sale de las listas y de las métricas, y se puede volver a
 * poner en juego con todo lo que tenía.
 */
function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
            style={{ background: 'var(--rojo)', borderColor: 'var(--rojo)' }}>
      {pending ? 'Dando de baja…' : 'Sí, dar de baja'}
    </button>
  )
}

export function DarDeBaja({
  leadId, nombre, cuelga, puedeConPlata,
}: { leadId: number; nombre: string; cuelga: LoQueCuelga; puedeConPlata: boolean }) {
  const [error, accion] = useActionState<string | null, FormData>(borrarLeadAccion, null)
  const [confirmando, setConfirmando] = useState(false)

  const conPlata = cuelga.tieneVenta || cuelga.tieneSena
  const lista = [
    cuelga.llamadas > 0 ? `${cuelga.llamadas} ${cuelga.llamadas === 1 ? 'llamada' : 'llamadas'}` : null,
    cuelga.notas > 0 ? `${cuelga.notas} ${cuelga.notas === 1 ? 'nota' : 'notas'}` : null,
    cuelga.seguimientos > 0 ? `${cuelga.seguimientos} toques de seguimiento` : null,
  ].filter(Boolean)

  return (
    <div>
      {conPlata ? (
        <div className="aviso atencion">
          <strong>
            Este lead tiene {cuelga.tieneVenta ? 'una venta' : 'una seña'} cargada
            {cuelga.importe > 0 ? ` de ${plata(cuelga.importe, cuelga.moneda)}` : ''}.
          </strong>{' '}
          Darlo de baja la saca de los números del mes.{' '}
          {puedeConPlata
            ? 'Si el resultado está mal cargado, corregilo desde la pestaña Resultado en vez de dar de baja el lead.'
            : 'Eso lo hace dirección. Si el resultado está mal, corregilo desde la pestaña Resultado.'}
        </div>
      ) : null}

      <p className="ayuda" style={{ marginBottom: 10 }}>
        No se borra nada: el lead sale de las listas y de las métricas, y dirección lo puede volver
        a poner en juego con todo lo que tenía.
        {lista.length > 0 ? <> Se va con {lista.join(', ')}.</> : null}
      </p>

      {error ? <div className="aviso problema">{error}</div> : null}

      {!confirmando ? (
        <button type="button" className="secundario"
                disabled={conPlata && !puedeConPlata}
                onClick={() => setConfirmando(true)}
                style={conPlata && !puedeConPlata ? undefined : { color: 'var(--rojo)', borderColor: '#EEDCDA' }}>
          Dar de baja este lead
        </button>
      ) : (
        <form action={accion}>
          <input type="hidden" name="leadId" value={leadId} />
          <div className="campo">
            <label htmlFor="motivo-baja">¿Por qué se da de baja {nombre}?</label>
            <input id="motivo-baja" name="motivo" required autoFocus
                   placeholder="Duplicado, prueba, cargado por error…" />
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
