'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { subirTranscripcionAccion, analizarAccion } from '@/app/(app)/llamadas/acciones'

function BotonSubir() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar la transcripción'}</button>
}

export function SubirTranscripcion({ llamadaId }: { llamadaId: number }) {
  const [error, accion] = useActionState<string | null, FormData>(subirTranscripcionAccion, null)
  return (
    <form action={accion}>
      <input type="hidden" name="llamadaId" value={llamadaId} />
      {error ? <div className="aviso problema">{error}</div> : null}
      <div className="campo">
        <label htmlFor="texto">Pegá la transcripción completa</label>
        <textarea id="texto" name="texto" required style={{ minHeight: 220 }}
                  placeholder={'Braian: Hola, ¿cómo estás?\nMaría: Bien, acá andamos…'} />
        <div className="nota">
          Sale de Google Meet o de Zoom. Si trae el formato «Nombre: lo que dijo», se puede contar
          cuánto habló cada uno sin preguntárselo al modelo.
        </div>
      </div>
      <BotonSubir />
    </form>
  )
}

/**
 * El botón de analizar.
 *
 * Tarda: son dos llamadas al modelo, una para leer y otra para evaluar. Que lo
 * diga mientras corre es la diferencia entre esperar y pensar que se colgó.
 */
function BotonAnalizar({ rehacer }: { rehacer: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Analizando… no cierres la pestaña' : rehacer ? 'Volver a analizar' : 'Analizar la llamada'}
    </button>
  )
}

export function Analizar({ llamadaId, rehacer }: { llamadaId: number; rehacer: boolean }) {
  const [error, accion] = useActionState<string | null, FormData>(analizarAccion, null)
  return (
    <form action={accion}>
      <input type="hidden" name="llamadaId" value={llamadaId} />
      {error ? <div className="aviso problema">{error}</div> : null}
      <BotonAnalizar rehacer={rehacer} />
    </form>
  )
}
