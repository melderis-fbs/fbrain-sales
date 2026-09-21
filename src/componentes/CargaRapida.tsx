'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { cargarRapidoAccion } from '@/app/(app)/leads/acciones'
import {
  ESTADOS, RESULTADOS, MOTIVOS_PERDIDA,
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, NOMBRE_DE_MOTIVO,
  type Estado, type Resultado,
} from '@/dominio/resultados'

/**
 * Cargar el resultado de una llamada sin salir del Tracker.
 *
 * Los campos que piden algo aparecen sólo cuando hacen falta: el importe cuando
 * hubo venta o seña, el motivo cuando se perdió. Un formulario que muestra
 * catorce campos para cargar un no-show se completa mal, y los datos mal
 * cargados son los que después hacen que nadie crea en el tablero.
 */
function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="chico" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
  )
}

export function CargaRapida({
  leadId, estado, resultado, moneda, hoy, compacto,
}: {
  leadId: number
  estado: Estado
  resultado: Resultado
  moneda: string
  hoy: string
  compacto?: boolean
}) {
  const [error, accion] = useActionState<string | null, FormData>(cargarRapidoAccion, null)
  const [queEstado, setQueEstado] = useState<Estado>(estado)
  const [queResultado, setQueResultado] = useState<Resultado>(resultado)

  const pidePlata = queResultado === 'venta' || queResultado === 'sena'
  const pideMotivo = queResultado === 'perdida'
  // Sin asistencia no hay resultado de venta que cargar: el desplegable queda
  // en «pendiente» y no se pregunta nada más.
  const hubollamada = queEstado === 'asistio'

  return (
    <form action={accion} className="carga">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="fecha" value={hoy} />
      <input type="hidden" name="moneda" value={moneda} />

      <label className="oculto" htmlFor={`e-${leadId}`}>¿Qué pasó con la reunión?</label>
      <select id={`e-${leadId}`} name="estado" value={queEstado}
              onChange={(e) => setQueEstado(e.target.value as Estado)}>
        {ESTADOS.map((x) => <option key={x} value={x}>{NOMBRE_DE_ESTADO[x]}</option>)}
      </select>

      {hubollamada ? (
        <>
          <label className="oculto" htmlFor={`r-${leadId}`}>¿Qué pasó con la venta?</label>
          <select id={`r-${leadId}`} name="resultado" value={queResultado}
                  onChange={(e) => setQueResultado(e.target.value as Resultado)}>
            {RESULTADOS.map((x) => <option key={x} value={x}>{NOMBRE_DE_RESULTADO[x]}</option>)}
          </select>
        </>
      ) : (
        <input type="hidden" name="resultado" value={queResultado} />
      )}

      {hubollamada && pidePlata ? (
        <>
          <label className="oculto" htmlFor={`i-${leadId}`}>Importe</label>
          <input id={`i-${leadId}`} name="importe" inputMode="decimal" required
                 placeholder={`${moneda} 0`} style={{ width: compacto ? 92 : 110 }} />
        </>
      ) : null}

      {hubollamada && pideMotivo ? (
        <>
          <label className="oculto" htmlFor={`m-${leadId}`}>Por qué se perdió</label>
          <select id={`m-${leadId}`} name="motivoPerdida" required defaultValue="">
            <option value="" disabled>¿Por qué?</option>
            {MOTIVOS_PERDIDA.map((x) => <option key={x} value={x}>{NOMBRE_DE_MOTIVO[x]}</option>)}
          </select>
        </>
      ) : null}

      <Boton />
      {error ? <span className="carga-error">{error}</span> : null}
    </form>
  )
}
