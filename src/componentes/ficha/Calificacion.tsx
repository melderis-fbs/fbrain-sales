'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { guardarCalificacionAccion } from '@/app/(app)/leads/acciones'
import { CAMPOS_QUE_PUNTUAN, CAMPOS_LIBRES } from '@/dominio/calidad'
import { useCampos } from '../campos'

/**
 * La ficha del setter.
 *
 * Todo lo que puntúa es de lista cerrada. No es rigidez: «tiene plata» escrito
 * de nueve maneras no se puede contar, y un campo libre no se puede ponderar.
 * Lo que sí va libre es lo que no entra en una lista —el problema en sus
 * palabras—, y eso no puntúa ni pretende hacerlo.
 */
function Boton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar la calificación'}</button>
}

export function Calificacion({
  leadId, respuestas,
}: { leadId: number; respuestas: Record<string, string | null> }) {
  const [mensaje, accion] = useActionState<string | null, FormData>(guardarCalificacionAccion, null)

  const iniciales: Record<string, string> = {}
  for (const c of [...CAMPOS_QUE_PUNTUAN.map((x) => x.clave), ...CAMPOS_LIBRES.map((x) => x.clave)]) {
    iniciales[c] = respuestas[c] ?? ''
  }
  const { campo, form } = useCampos(iniciales, mensaje)

  return (
    <form action={accion} ref={form}>
      <input type="hidden" name="leadId" value={leadId} />
      {mensaje ? <div className="aviso dato">{mensaje}</div> : null}

      <div className="rejilla g2">
        <div className="tarjeta">
          <h3>Lo que puntúa</h3>
          <p className="ayuda" style={{ marginBottom: 12 }}>
            De acá sale el Lead Quality. El peso de cada pregunta está al lado: si
            no puede invertir, no importa lo demás.
          </p>
          {CAMPOS_QUE_PUNTUAN.map((c) => (
            <div className="campo" key={c.clave}>
              <label htmlFor={c.clave}>
                {c.etiqueta}
                <span style={{ color: 'var(--gris-claro)', fontWeight: 500 }}> · pesa {c.peso}</span>
              </label>
              <select {...campo(c.clave)}>
                <option value="">Sin preguntar</option>
                {c.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
              </select>
              {c.ayuda ? <div className="nota">{c.ayuda}</div> : null}
            </div>
          ))}
        </div>

        <div className="tarjeta">
          <h3>Lo que no entra en una lista</h3>
          <p className="ayuda" style={{ marginBottom: 12 }}>
            No puntúa y sirve muchísimo: es lo que el closer lee cinco minutos antes de entrar.
          </p>
          {CAMPOS_LIBRES.map((c) => (
            <div className="campo" key={c.clave}>
              <label htmlFor={c.clave}>{c.etiqueta}</label>
              {c.largo
                ? <textarea {...campo(c.clave)} />
                : <input {...campo(c.clave)} />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}><Boton /></div>
    </form>
  )
}
