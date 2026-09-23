'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { FasesDelPlaybook } from './FasesDelPlaybook'
import { useCampos } from './campos'
import { guardarPlaybookAccion } from '@/app/(app)/llamadas/acciones'
import type { Fase } from '@/dominio/fases'

export type PlaybookVigente = {
  closerId: number
  nombre: string
  oferta: string | null
  script: string
  fases: Fase[]
}

function Guardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{ marginTop: 12 }}>
      {pending ? 'Guardando…' : 'Guardar como versión nueva'}
    </button>
  )
}

/**
 * Cargar o actualizar el playbook de un closer.
 *
 * El selector de closer vive acá adentro, y no suelto en el formulario, por un
 * motivo concreto: las fases y el guion que se ven tienen que ser los de ESE
 * closer. Antes el formulario mostraba siempre el playbook vigente del primero
 * de la lista, así que el segundo closer que entraba a cargar el suyo veía las
 * fases del primero y las guardaba a su nombre sin enterarse.
 *
 * Todo pasa por `useCampos` y no por el DOM, por lo que está explicado allá:
 * React limpia el formulario apenas termina la acción y los `<select>` no se
 * reponen solos. Acá eso era peor que perder lo escrito: el desplegable volvía
 * al primer closer de la lista mientras React seguía creyendo que estaba el
 * elegido, así que un guardado fallido y un segundo intento guardaban el
 * playbook a nombre de otra persona, en silencio y sin que nada se viera raro.
 */
export function PlaybookDelCloser({
  closers, vigentes, closerPorDefecto,
}: {
  closers: { id: number; nombre: string }[]
  vigentes: PlaybookVigente[]
  closerPorDefecto: number | null
}) {
  const [guardado, accion] = useActionState(guardarPlaybookAccion, null)

  const inicial = closerPorDefecto ?? closers[0]?.id ?? null
  const deInicio = vigentes.find((p) => p.closerId === inicial)

  const { campo, valores, setValores, form } = useCampos({
    closerId: inicial === null ? '' : String(inicial),
    nombre: deInicio?.nombre ?? 'Playbook',
    oferta: deInicio?.oferta ?? '',
    script: deInicio?.script ?? '',
  }, guardado, 'pb')

  /**
   * Una cuenta de closer sin su persona vinculada en Configuración.
   *
   * No es un caso teórico: pasa siempre que se crea el usuario antes que la
   * persona. Lo que había antes era un desplegable vacío y obligatorio, o sea
   * un formulario que no se puede enviar y no dice por qué.
   */
  if (closers.length === 0) {
    return (
      <div className="aviso atencion">
        <strong>Tu cuenta todavía no está vinculada a un closer.</strong>
        <p style={{ margin: '6px 0 0', fontSize: 13 }}>
          Por eso no podés cargar tu playbook: el sistema no sabe a nombre de quién guardarlo.
          Se vincula en Configuración, en «El equipo». Mientras tanto tus llamadas se analizan
          igual, midiéndolas contra las fases de la casa.
        </p>
      </div>
    )
  }

  const actual = vigentes.find((p) => String(p.closerId) === valores.closerId) ?? null

  // Cambiar de closer trae LO SUYO. Editar arriba de lo que dejó otro es
  // exactamente el problema que esta pantalla tenía.
  const cambiarDeCloser = (id: string) => {
    const suyo = vigentes.find((p) => String(p.closerId) === id)
    setValores({
      closerId: id,
      nombre: suyo?.nombre ?? 'Playbook',
      oferta: suyo?.oferta ?? '',
      script: suyo?.script ?? '',
    })
  }

  return (
    <form action={accion} ref={form}>
      {guardado ? (
        <div className={guardado.ok ? 'aviso dato' : 'aviso problema'} style={{ marginBottom: 10 }}>
          {guardado.mensaje}
        </div>
      ) : null}

      <div className="campo">
        <label htmlFor="pb-closerId">Closer</label>
        <select {...campo('closerId')} required
                onChange={(e) => cambiarDeCloser(e.target.value)}>
          {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div className="nota">
          {actual
            ? 'Tiene un playbook cargado: abajo está el vigente. Guardar crea la versión siguiente.'
            : 'Todavía no tiene playbook. Abajo están las fases de la casa, para editarlas.'}
        </div>
      </div>

      <div className="campo">
        <label htmlFor="pb-nombre">Nombre</label>
        <input {...campo('nombre')} required />
      </div>
      <div className="campo">
        <label htmlFor="pb-oferta">Qué se ofrece</label>
        <input {...campo('oferta')} placeholder="Programa, precio, promesa" />
      </div>
      <div className="campo">
        <label htmlFor="pb-script">El guion</label>
        <textarea {...campo('script')} required style={{ minHeight: 200 }} />
        <div className="nota">
          El guion completo, para que el analizador sepa qué se vende y cómo. Las fases
          de abajo son las que se miden una por una.
        </div>
      </div>

      <div className="separador" />
      {/* El `key` es lo que hace que cambiar de closer vuelva a dibujar las
          fases con las suyas, en vez de dejar las del anterior. */}
      <FasesDelPlaybook key={valores.closerId} iniciales={actual?.fases} />

      <Guardar />
    </form>
  )
}
