'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  crearPersonaAccion, cambiarClaveAccion, activarPersonaAccion,
} from '@/app/(app)/configuracion/acciones'
import { NOMBRE_DE_ROL, ROLES, type Rol } from '@/dominio/roles'
import type { Persona } from '@/datos/personas'
import { useCampos } from './campos'
import { Pildora } from './Piezas'

function Boton({ texto }: { texto: string }) {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Guardando…' : texto}</button>
}

export function Equipo({ personas, yo }: { personas: Persona[]; yo: number }) {
  const [error, accion] = useActionState(crearPersonaAccion, null)
  const { campo, valores } = useCampos({ nombre: '', funcion: 'closer', email: '', clave: '' }, error)
  const [entra, setEntra] = useState(true)

  const funcion = valores.funcion as Rol
  const comercial = funcion === 'closer' || funcion === 'setter'
  // Un admin o un head sin cuenta no significa nada: existe para entrar.
  const pideCuenta = !comercial || entra

  return (
    <div className="apilado">
      <section className="tarjeta">
        <h2>El equipo</h2>
        {personas.length === 0 ? (
          <div className="sindato">Todavía no hay nadie más que vos.</div>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Email</th><th>Qué hace</th><th>Acceso</th><th></th></tr>
              </thead>
              <tbody>
                {personas.map((p) => (
                  <Fila key={`${p.usuarioId ?? 'x'}-${p.nombre}`} persona={p} yo={yo} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form className="tarjeta" action={accion}>
        <h3>Sumar a alguien</h3>
        {error ? <div className="aviso problema">{error}</div> : null}

        <div className="rejilla g3">
          <div className="campo">
            <label htmlFor="nombre">Nombre</label>
            <input {...campo('nombre')} required />
          </div>
          <div className="campo">
            <label htmlFor="funcion">Qué hace</label>
            <select {...campo('funcion')}>
              {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_DE_ROL[r]}</option>)}
            </select>
          </div>
        </div>

        {comercial ? (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 14 }}>
            <input type="checkbox" name="entra" checked={entra} style={{ width: 'auto' }}
                   onChange={(e) => setEntra(e.target.checked)} />
            Entra a la aplicación
          </label>
        ) : null}

        {pideCuenta ? (
          <div className="rejilla g3">
            <div className="campo">
              <label htmlFor="email">Email</label>
              <input {...campo('email')} type="email" required />
            </div>
            <div className="campo">
              <label htmlFor="clave">Clave inicial</label>
              <input {...campo('clave')} type="password" minLength={8} required
                     autoComplete="new-password" placeholder="mínimo 8 caracteres" />
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--gris)', marginTop: 0 }}>
            Sin cuenta: no entra a la aplicación, pero los números salen a su nombre.
            Sirve para alguien que ya no está y cuyas ventas siguen contando.
          </p>
        )}

        <Boton texto="Sumar" />
      </form>
    </div>
  )
}

function Fila({ persona: p, yo }: { persona: Persona; yo: number }) {
  const [cambiando, setCambiando] = useState(false)

  return (
    <tr style={p.activo ? undefined : { opacity: 0.55 }}>
      <td style={{ fontWeight: 650 }}>
        {p.nombre}
        {p.usuarioId === yo ? <span style={{ color: 'var(--gris)', fontWeight: 400 }}> · vos</span> : null}
      </td>
      <td style={{ fontSize: 13 }}>{p.email ?? <span className="sindato">sin cuenta</span>}</td>
      <td style={{ fontSize: 13 }}>
        {p.rol ? NOMBRE_DE_ROL[p.rol] : p.esCloser ? 'Closer' : 'Setter'}
        {p.sinVincular ? (
          <div style={{ marginTop: 3 }}>
            <Pildora color="rojo">no ve nada: falta su figura</Pildora>
          </div>
        ) : null}
      </td>
      <td>
        {p.usuarioId === null
          ? <span className="sindato">—</span>
          : <Pildora color={p.activo ? 'verde' : 'gris'}>{p.activo ? 'entra' : 'sin acceso'}</Pildora>}
      </td>
      <td>
        {p.usuarioId === null ? null : cambiando ? (
          <form action={cambiarClaveAccion} className="fila" onSubmit={() => setCambiando(false)}>
            <input type="hidden" name="usuarioId" value={p.usuarioId} />
            <input name="clave" type="password" minLength={8} required placeholder="clave nueva"
                   autoComplete="new-password" style={{ width: 150 }} />
            <button type="submit" style={{ fontSize: 12, padding: '4px 11px' }}>Guardar</button>
            <button type="button" className="secundario" style={{ fontSize: 12, padding: '4px 11px' }}
                    onClick={() => setCambiando(false)}>Cancelar</button>
          </form>
        ) : (
          <div className="fila">
            <button type="button" className="secundario" style={{ fontSize: 12, padding: '4px 11px' }}
                    onClick={() => setCambiando(true)}>Cambiar clave</button>
            {p.usuarioId === yo ? null : (
              <form action={activarPersonaAccion}>
                <input type="hidden" name="usuarioId" value={p.usuarioId} />
                <input type="hidden" name="activo" value={p.activo ? '0' : '1'} />
                <button type="submit" className="secundario" style={{ fontSize: 12, padding: '4px 11px' }}>
                  {p.activo ? 'Quitar acceso' : 'Dar acceso'}
                </button>
              </form>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}
