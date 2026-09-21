'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { guardarCasoAccion } from '@/app/(app)/casos/acciones'
import { useCampos } from './campos'
import type { Caso } from '@/datos/casos'

function Boton({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : editando ? 'Guardar los cambios' : 'Agregar el caso'}
    </button>
  )
}

/**
 * Cargar un caso de éxito.
 *
 * Los dos campos que hacen que un caso sirva son la **industria** —para
 * encontrar el que le habla a este prospecto— y la **métrica** —porque «le fue
 * muy bien» no convence a nadie y «de 5.000 a 30.000 en cuatro meses» sí—.
 */
export function FormularioDeCaso({ caso }: { caso?: Caso }) {
  const [error, accion] = useActionState<string | null, FormData>(guardarCasoAccion, null)
  const { campo, form } = useCampos({
    titulo: caso?.titulo ?? '',
    cliente: caso?.cliente ?? '',
    industria: caso?.industria ?? '',
    situacion: caso?.situacion ?? '',
    resultado: caso?.resultado ?? '',
    metrica: caso?.metrica ?? '',
    cita: caso?.cita ?? '',
    link: caso?.link ?? '',
    mensaje: caso?.mensaje ?? '',
  }, error)

  return (
    <form action={accion} ref={form}>
      {caso ? <input type="hidden" name="id" value={caso.id} /> : null}
      {error ? <div className="aviso problema">{error}</div> : null}

      <div className="campo">
        <label htmlFor="titulo">Título *</label>
        <input {...campo('titulo')} required placeholder="De 5k a 30k en cuatro meses" />
      </div>
      <div className="dos">
        <div className="campo">
          <label htmlFor="cliente">Cliente</label>
          <input {...campo('cliente')} placeholder="Nombre o «un cliente de…»" />
        </div>
        <div className="campo">
          <label htmlFor="industria">Industria</label>
          <input {...campo('industria')} placeholder="E-commerce, Salud, Inmobiliaria…" />
          <div className="nota">Es lo que después permite encontrar el caso que le sirve a un prospecto.</div>
        </div>
      </div>
      <div className="campo">
        <label htmlFor="metrica">La métrica</label>
        <input {...campo('metrica')} placeholder="De USD 5.000 a USD 30.000 mensuales en 4 meses" />
        <div className="nota">El número del antes y el después. Es lo único que convence.</div>
      </div>
      <div className="campo">
        <label htmlFor="situacion">Cómo estaba antes</label>
        <textarea {...campo('situacion')} />
      </div>
      <div className="campo">
        <label htmlFor="resultado">Qué cambió</label>
        <textarea {...campo('resultado')} />
      </div>
      <div className="campo">
        <label htmlFor="cita">Qué dijo el cliente</label>
        <textarea {...campo('cita')} placeholder="Una frase textual suya" />
      </div>
      <div className="campo">
        <label htmlFor="link">Link</label>
        <input {...campo('link')} placeholder="Video, testimonio, caso escrito" />
      </div>
      <div className="campo">
        <label htmlFor="mensaje">El mensaje listo para mandar</label>
        <textarea {...campo('mensaje')} style={{ minHeight: 110 }}
                  placeholder="El texto tal cual se manda por WhatsApp en el toque 3 de la cadencia." />
        <div className="nota">
          Escrito una vez acá, se copia y se manda. Reescribirlo en cada seguimiento es lo que
          hace que el toque 3 no se haga.
        </div>
      </div>
      <Boton editando={caso !== undefined} />
    </form>
  )
}
