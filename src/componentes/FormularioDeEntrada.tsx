'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { entrarAccion } from '@/app/login/acciones'
import { useCampos } from './campos'

function Boton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} style={{ width: '100%' }}>{pending ? 'Entrando…' : 'Entrar'}</button>
}

export function FormularioDeEntrada() {
  const [error, accion] = useActionState(entrarAccion, null)
  // El email se conserva entre intentos; la clave no, y eso es a propósito.
  const { campo } = useCampos({ email: '' })

  return (
    <form action={accion}>
      <div className="campo">
        <label htmlFor="email">Email</label>
        <input {...campo('email')} type="email" autoComplete="username" autoFocus required />
      </div>
      <div className="campo">
        <label htmlFor="clave">Clave</label>
        <input id="clave" name="clave" type="password" autoComplete="current-password" required />
      </div>
      {error ? <div className="aviso problema">{error}</div> : null}
      <Boton />
    </form>
  )
}
