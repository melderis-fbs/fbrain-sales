'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { crearPrimerUsuarioAccion } from '@/app/instalacion/acciones'
import { useCampos } from './campos'

function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{ width: '100%' }}>
      {pending ? 'Creando…' : 'Crear y entrar'}
    </button>
  )
}

export function PrimerUsuario() {
  const [error, accion] = useActionState(crearPrimerUsuarioAccion, null)
  const { campo } = useCampos({ nombre: '', email: '' })

  return (
    <form action={accion}>
      <div className="campo">
        <label htmlFor="nombre">Tu nombre</label>
        <input {...campo('nombre')} autoFocus required />
      </div>
      <div className="campo">
        <label htmlFor="email">Email</label>
        <input {...campo('email')} type="email" autoComplete="username" required />
      </div>
      <div className="campo">
        <label htmlFor="clave">Clave</label>
        <input id="clave" name="clave" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="campo">
        <label htmlFor="repetida">Repetila</label>
        <input id="repetida" name="repetida" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {error ? <div className="aviso problema">{error}</div> : null}
      <Boton />
    </form>
  )
}
