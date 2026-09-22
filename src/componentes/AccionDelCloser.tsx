'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { cargarRapidoAccion } from '@/app/(app)/leads/acciones'
import { MOTIVOS_PERDIDA, NOMBRE_DE_MOTIVO, type Estado, type Resultado } from '@/dominio/resultados'
import { Iconos } from './Iconos'

/**
 * Lo que el closer toca apenas corta.
 *
 * Cinco botones grandes con lo que puede pasar, y nada más. Hasta acá, cargar
 * un resultado era abrir la ficha, encontrar una pestaña y completar un
 * formulario con catorce campos — y eso queda «para después», que es como el
 * tablero termina siempre incompleto.
 *
 * Los que no necesitan nada más se guardan de una. Los que sí —una venta sin
 * importe no se puede facturar, una pérdida sin motivo no se puede contar—
 * abren el campo que falta y nada más que ése. La diferencia entre pedir un
 * dato y pedir un formulario es si se carga o no.
 */

type Accion = {
  clave: Resultado | 'no_show'
  texto: string
  color: 'verde' | 'acento' | 'ambar' | 'rojo' | 'gris'
  icono: keyof typeof Iconos
  estado: Estado
  resultado: Resultado
  /** Qué hace falta además del botón. */
  pide: 'plata' | 'motivo' | null
  ayuda: string
}

const ACCIONES: Accion[] = [
  { clave: 'venta', texto: 'Venta', color: 'verde', icono: 'casos',
    estado: 'asistio', resultado: 'venta', pide: 'plata',
    ayuda: 'Cerró. El importe entra a facturación con esta fecha.' },
  { clave: 'sena', texto: 'Seña', color: 'acento', icono: 'comisiones',
    estado: 'asistio', resultado: 'sena', pide: 'plata',
    ayuda: 'Comprometió plata pero no cerró. NO entra a facturación ni a cash hasta que se convierta.' },
  { clave: 'seguimiento', texto: 'Seguimiento', color: 'ambar', icono: 'seguimientos',
    estado: 'asistio', resultado: 'seguimiento', pide: null,
    ayuda: 'Queda abierto. Entra solo al pipeline de 12 toques.' },
  { clave: 'no_show', texto: 'No Show', color: 'rojo', icono: 'tracker',
    estado: 'no_show', resultado: 'pendiente', pide: null,
    ayuda: 'No vino. La reunión queda cargada y no aparece más como pendiente.' },
  { clave: 'perdida', texto: 'Perdido', color: 'gris', icono: 'metricas',
    estado: 'asistio', resultado: 'perdida', pide: 'motivo',
    ayuda: 'Se cayó. El motivo es lo que después dice dónde se pierde el equipo.' },
]

function Boton({ texto }: { texto: string }) {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Guardando…' : texto}</button>
}

export function AccionDelCloser({
  leadId, moneda, hoy, resultadoActual,
}: { leadId: number; moneda: string; hoy: string; resultadoActual: Resultado }) {
  const [error, accion] = useActionState<string | null, FormData>(cargarRapidoAccion, null)
  const [elegida, setElegida] = useState<Accion | null>(null)

  return (
    <section className="acciones-closer">
      <div className="kicker" style={{ marginBottom: 10 }}>Acción del closer</div>

      <div className="botonera">
        {ACCIONES.map((a) => {
          const puesta = resultadoActual === a.resultado && a.clave !== 'no_show'
          return (
            <button key={a.clave} type="button"
                    className={`accion ${a.color} ${elegida?.clave === a.clave ? 'elegida' : ''} ${puesta ? 'puesta' : ''}`}
                    aria-pressed={elegida?.clave === a.clave}
                    onClick={() => setElegida(elegida?.clave === a.clave ? null : a)}>
              {(() => { const I = Iconos[a.icono]; return <I /> })()}
              <span>{a.texto}</span>
            </button>
          )
        })}
      </div>

      {elegida ? (
        <form action={accion} className="confirmar">
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="estado" value={elegida.estado} />
          <input type="hidden" name="resultado" value={elegida.resultado} />
          <input type="hidden" name="moneda" value={moneda} />

          <p className="ayuda" style={{ margin: '0 0 10px' }}>{elegida.ayuda}</p>
          {error ? <div className="aviso problema">{error}</div> : null}

          <div className="fila" style={{ alignItems: 'flex-end' }}>
            {elegida.pide === 'plata' ? (
              <>
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label htmlFor="importe">Importe ({moneda})</label>
                  <input id="importe" name="importe" inputMode="decimal" required autoFocus
                         placeholder="0" style={{ width: 150 }} />
                </div>
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label htmlFor="fecha">Fecha</label>
                  <input id="fecha" name="fecha" type="date" defaultValue={hoy} style={{ width: 160 }} />
                </div>
              </>
            ) : <input type="hidden" name="fecha" value={hoy} />}

            {elegida.pide === 'motivo' ? (
              <div className="campo" style={{ marginBottom: 0, minWidth: 230 }}>
                <label htmlFor="motivoPerdida">¿Por qué se perdió?</label>
                <select id="motivoPerdida" name="motivoPerdida" required defaultValue="" autoFocus>
                  <option value="" disabled>Elegí el motivo</option>
                  {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{NOMBRE_DE_MOTIVO[m]}</option>)}
                </select>
              </div>
            ) : null}

            <Boton texto={`Confirmar ${elegida.texto.toLowerCase()}`} />
            <button type="button" className="sutil" onClick={() => setElegida(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <p className="ayuda" style={{ margin: 0 }}>
          Tocá lo que pasó. Si hubo plata o si se perdió, te pide ese dato y nada más;
          el resto se completa después.
        </p>
      )}
    </section>
  )
}
