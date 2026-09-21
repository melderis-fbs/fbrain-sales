'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { crearPersonaAccion, cambiarClaveAccion, activarPersonaAccion } from '@/app/(app)/configuracion/acciones'
import { useCampos } from './campos'
import { NOMBRE_DE_ROL, ROLES, type Rol } from '@/dominio/roles'
import type { Persona } from '@/datos/personas'
import { Tarjeta, Pildora } from './Piezas'

/**
 * El equipo.
 *
 * Una persona son hasta dos cosas: una CUENTA para entrar y una FIGURA
 * COMERCIAL a cuyo nombre salen los números. No siempre van juntas —un closer
 * que ya no está sigue teniendo sus ventas—, pero el caso del medio es el que
 * rompe: si la cuenta de un closer no apunta a su fila de closers, entra a la
 * aplicación y no ve ninguno de sus leads. Es vacío por permiso, y desde afuera
 * se lee como datos perdidos.
 *
 * Por eso el alta resuelve las dos de una, y por eso esta tabla avisa cuando
 * quedó a medias.
 */
function Boton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Dando de alta…' : 'Dar de alta'}</button>
}

export function Equipo({ personas, yo }: { personas: Persona[]; yo: number }) {
  const [error, accion] = useActionState<string | null, FormData>(crearPersonaAccion, null)
  const { campo, valores, form } = useCampos(
    { nombre: '', funcion: 'closer', email: '', clave: '' }, error,
  )
  const comercial = valores.funcion === 'closer' || valores.funcion === 'setter'
  const sinVincular = personas.filter((p) => p.sinVincular)

  return (
    <div className="rejilla g2">
      <Tarjeta titulo={`El equipo (${personas.length})`}>
        {sinVincular.length > 0 ? (
          <div className="aviso atencion">
            {sinVincular.map((p) => p.nombre).join(', ')}{' '}
            {sinVincular.length === 1 ? 'tiene cuenta' : 'tienen cuenta'} de closer o setter pero
            sin su figura comercial asociada: {sinVincular.length === 1 ? 'entra' : 'entran'} a la
            aplicación y no {sinVincular.length === 1 ? 've' : 'ven'} ningún lead. Dalos de alta de
            nuevo con el mismo nombre y se vinculan solos.
          </div>
        ) : null}

        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Nombre</th><th>Rol</th><th>Email</th><th>Función</th><th></th></tr>
            </thead>
            <tbody>
              {personas.map((p, i) => (
                <tr key={`${p.usuarioId ?? 'sin'}-${i}`}>
                  <td style={{ fontWeight: 600 }}>
                    {p.nombre}
                    {!p.activo ? <span className="pildora gris" style={{ marginLeft: 6 }}>sin acceso</span> : null}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {p.rol ? NOMBRE_DE_ROL[p.rol] : <span className="sindato">sin cuenta</span>}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{p.email ?? '—'}</td>
                  <td>
                    <div className="fila" style={{ gap: 4 }}>
                      {p.esCloser ? <Pildora color="acento">closer</Pildora> : null}
                      {p.esSetter ? <Pildora color="gris">setter</Pildora> : null}
                    </div>
                  </td>
                  <td className="num">
                    {p.usuarioId !== null && p.usuarioId !== yo ? (
                      <form action={activarPersonaAccion}>
                        <input type="hidden" name="usuarioId" value={p.usuarioId} />
                        <input type="hidden" name="activo" value={p.activo ? '0' : '1'} />
                        <button type="submit" className="sutil" style={{ fontSize: 11.5 }}>
                          {p.activo ? 'Quitar acceso' : 'Dar acceso'}
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="separador" />
        <h3>Cambiarle la clave a alguien</h3>
        <form action={cambiarClaveAccion} className="fila">
          <select name="usuarioId" required style={{ maxWidth: 200 }}>
            {personas.filter((p) => p.usuarioId !== null).map((p) => (
              <option key={p.usuarioId} value={p.usuarioId!}>{p.nombre}</option>
            ))}
          </select>
          <input name="clave" type="password" placeholder="Clave nueva" required style={{ maxWidth: 190 }} />
          <button type="submit" className="secundario">Cambiar</button>
        </form>
      </Tarjeta>

      <Tarjeta titulo="Dar de alta a alguien">
        <form action={accion} ref={form}>
          {error ? <div className="aviso problema">{error}</div> : null}
          <div className="campo">
            <label htmlFor="nombre">Nombre</label>
            <input {...campo('nombre')} required />
          </div>
          <div className="campo">
            <label htmlFor="funcion">Qué hace</label>
            <select {...campo('funcion')}>
              {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_DE_ROL[r as Rol]}</option>)}
            </select>
          </div>

          {comercial ? (
            <div className="campo">
              <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <input type="checkbox" name="entra" defaultChecked />
                <span>Entra a la aplicación</span>
              </label>
              <div className="nota">
                Sin tildar se crea la figura comercial sin cuenta. Sirve para cargar a alguien
                que ya no está pero cuyas ventas siguen contando.
              </div>
            </div>
          ) : null}

          <div className="campo">
            <label htmlFor="email">Email</label>
            <input {...campo('email')} type="email" />
          </div>
          <div className="campo">
            <label htmlFor="clave">Clave</label>
            <input {...campo('clave')} type="password" />
            <div className="nota">Al menos 8 caracteres.</div>
          </div>
          <Boton />
        </form>
      </Tarjeta>
    </div>
  )
}
