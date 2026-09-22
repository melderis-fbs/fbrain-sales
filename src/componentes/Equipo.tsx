'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  crearPersonaAccion, cambiarClaveAccion, activarPersonaAccion,
  vincularFiguraAccion, cambiarRolAccion, editarCuentaAccion, eliminarCuentaAccion,
} from '@/app/(app)/configuracion/acciones'
import { useCampos } from './campos'
import { NOMBRE_DE_ROL, ROLES, type Rol } from '@/dominio/roles'
import type { Persona, Figura } from '@/datos/personas'
import { Tarjeta, Pildora } from './Piezas'

/**
 * El equipo.
 *
 * Una persona son hasta dos cosas: una CUENTA para entrar y una FIGURA
 * COMERCIAL a cuyo nombre salen los números. No siempre van juntas —un closer
 * que ya no está sigue teniendo sus ventas—, pero el caso del medio rompe: si
 * la cuenta de un closer no apunta a su fila de closers, entra a la aplicación
 * y no ve ninguno de sus leads. Es vacío por permiso, y desde afuera se lee
 * como datos perdidos.
 *
 * Por eso cada fila de closer o setter tiene su selector de figura. Atarlas es
 * explícito y se puede deshacer: una persona cambia de email, o una cuenta se
 * creó con el nombre mal escrito, y hasta ahora la única salida era el SQL.
 */
function Boton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Dando de alta…' : 'Dar de alta'}</button>
}

export function Equipo({ personas, figuras, yo }: { personas: Persona[]; figuras: Figura[]; yo: number }) {
  const [error, accion] = useActionState<string | null, FormData>(crearPersonaAccion, null)
  const { campo, valores, form } = useCampos(
    { nombre: '', funcion: 'closer', email: '', clave: '' }, error,
  )
  const comercial = valores.funcion === 'closer' || valores.funcion === 'setter'
  const sinVincular = personas.filter((p) => p.sinVincular)

  return (
    <div className="apilado">
      <Tarjeta titulo={`El equipo (${personas.length})`}>
        {sinVincular.length > 0 ? (
          <div className="aviso atencion">
            <strong>
              {sinVincular.map((p) => p.nombre).join(', ')}{' '}
              {sinVincular.length === 1 ? 'entra a la aplicación y no ve ningún lead.'
                : 'entran a la aplicación y no ven ningún lead.'}
            </strong>{' '}
            {sinVincular.length === 1 ? 'Su cuenta' : 'Sus cuentas'} de closer o setter no{' '}
            {sinVincular.length === 1 ? 'está atada' : 'están atadas'} a una figura comercial.
            Elegila en la columna <strong>Figura comercial</strong>, acá abajo. Dar de alta de
            nuevo no la vincula.
          </div>
        ) : null}

        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Nombre</th><th>Rol</th><th>Email</th><th>Figura comercial</th><th></th></tr>
            </thead>
            <tbody>
              {personas.map((p, i) => {
                const esComercial = p.rol === 'closer' || p.rol === 'setter'
                const delTipo = figuras.filter((f) => f.tipo === (p.rol === 'setter' ? 'setter' : 'closer'))
                return (
                  <tr key={`${p.usuarioId ?? 'sin'}-${i}`}>
                    <td style={{ fontWeight: 600 }}>
                      {p.nombre}
                      {!p.activo ? <div><Pildora color="gris">sin acceso</Pildora></div> : null}
                    </td>
                    <td>
                      {p.usuarioId === null ? (
                        <span className="sindato">sin cuenta</span>
                      ) : (
                        <form action={cambiarRolAccion} className="fila"
                              style={{ gap: 4, flexWrap: 'nowrap' }}>
                          <input type="hidden" name="usuarioId" value={p.usuarioId} />
                          <label className="oculto" htmlFor={`rol-${p.usuarioId}`}>Rol de {p.nombre}</label>
                          <select id={`rol-${p.usuarioId}`} name="rol" defaultValue={p.rol ?? ''}
                                  style={{ width: 'auto', maxWidth: 120, fontSize: 12.5, padding: '4px 6px' }}>
                            {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_DE_ROL[r as Rol]}</option>)}
                          </select>
                          <button type="submit" className="sutil"
                                  style={{ fontSize: 11.5, padding: '4px 6px' }}>Cambiar</button>
                        </form>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{p.email ?? '—'}</td>
                    <td>
                      {p.usuarioId === null ? (
                        <Pildora color="gris">{p.esCloser ? 'closer' : 'setter'} sin cuenta</Pildora>
                      ) : esComercial ? (
                        <form action={vincularFiguraAccion} className="fila"
                              style={{ gap: 4, flexWrap: 'nowrap' }}>
                          <input type="hidden" name="usuarioId" value={p.usuarioId} />
                          <label className="oculto" htmlFor={`fig-${p.usuarioId}`}>
                            Figura comercial de {p.nombre}
                          </label>
                          <select id={`fig-${p.usuarioId}`} name="figura" defaultValue={p.figuraId ?? ''}
                                  style={{ width: 'auto', maxWidth: 175, fontSize: 12.5, padding: '4px 6px' }}>
                            <option value="">Sin figura · no ve leads</option>
                            <option value="nueva">Crear una con su nombre</option>
                            {delTipo.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.nombre}
                                {f.usuarioId !== null && f.usuarioId !== p.usuarioId
                                  ? ` — hoy de ${f.usuario}` : ''}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="sutil"
                                  style={{ fontSize: 11.5, padding: '4px 6px' }}>Atar</button>
                        </form>
                      ) : (
                        <span className="sindato">no aplica</span>
                      )}
                    </td>
                    <td className="num">
                      {p.usuarioId !== null && p.usuarioId !== yo ? (
                        <div className="fila" style={{ gap: 2, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <form action={activarPersonaAccion}>
                            <input type="hidden" name="usuarioId" value={p.usuarioId} />
                            <input type="hidden" name="activo" value={p.activo ? '0' : '1'} />
                            <button type="submit" className="sutil" style={{ fontSize: 11.5 }}>
                              {p.activo ? 'Quitar acceso' : 'Dar acceso'}
                            </button>
                          </form>
                          <form action={eliminarCuentaAccion}>
                            <input type="hidden" name="usuarioId" value={p.usuarioId} />
                            <button type="submit" className="sutil"
                                    style={{ fontSize: 11.5, color: 'var(--rojo)' }}
                                    title="Sólo si nunca cargó nada">Borrar</button>
                          </form>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="ayuda" style={{ marginTop: 12 }}>
          Una <strong>figura comercial</strong> apunta a una sola cuenta. Si se la atás a otra,
          se suelta de la anterior — que es lo que hace falta cuando alguien cambia de email.
        </p>

      </Tarjeta>

      <div className="rejilla g3">
        <Tarjeta titulo="Corregir el nombre o el email"
                 ayuda="Es lo que hay que usar cuando alguien cambia de email, en vez de crear otra cuenta: así conserva su figura comercial y su historial.">
          <CorregirCuenta personas={personas} />
        </Tarjeta>

        <Tarjeta titulo="Cambiarle la clave a alguien">
          <form action={cambiarClaveAccion}>
            <div className="campo">
              <label htmlFor="clave-usuarioId">Cuenta</label>
              <select id="clave-usuarioId" name="usuarioId" required>
                {personas.filter((p) => p.usuarioId !== null).map((p) => (
                  <option key={p.usuarioId} value={p.usuarioId!}>{p.nombre} · {p.email}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="clave-nueva">Clave nueva</label>
              <input id="clave-nueva" name="clave" type="password" required />
            </div>
            <button type="submit" className="secundario">Cambiar</button>
          </form>
        </Tarjeta>

      <Tarjeta titulo="Dar de alta a alguien"
               ayuda="Para gente nueva. Si la cuenta ya existe y sólo hay que atarle su figura, usá la columna «Figura comercial».">
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
    </div>
  )
}

/**
 * Corregir el nombre o el email de una cuenta.
 *
 * Es lo primero que hay que poder hacer y faltaba. Una persona cambia de email
 * y, sin esto, lo único posible era crear una cuenta nueva — que entra sin ver
 * ningún lead, porque la figura comercial quedó atada a la vieja. Cambiando el
 * email, la cuenta es la misma y no se pierde nada.
 */
function BotonCorregir() {
  const { pending } = useFormStatus()
  return <button type="submit" className="secundario" disabled={pending}>
    {pending ? 'Guardando…' : 'Corregir'}
  </button>
}

function CorregirCuenta({ personas }: { personas: Persona[] }) {
  const [mensaje, accion] = useActionState<string | null, FormData>(editarCuentaAccion, null)
  const cuentas = personas.filter((p) => p.usuarioId !== null)
  // Con prefijo: el formulario de alta, en la misma pantalla, también tiene
  // campos «nombre» y «email».
  const { campo, form } = useCampos(
    { usuarioId: String(cuentas[0]?.usuarioId ?? ''), nombre: '', email: '' }, mensaje, 'corregir',
  )

  if (cuentas.length === 0) return null

  return (
    <>
      {mensaje ? <div className="aviso problema">{mensaje}</div> : null}
      <form action={accion} ref={form}>
        <div className="campo">
          <label htmlFor="corregir-usuarioId">Cuenta</label>
          <select {...campo('usuarioId')} required>
            {cuentas.map((p) => (
              <option key={p.usuarioId} value={p.usuarioId!}>{p.nombre} · {p.email}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="campo">
            <label htmlFor="corregir-nombre">Nombre</label>
            <input {...campo('nombre')} required placeholder="Cómo se llama" />
          </div>
          <div className="campo">
            <label htmlFor="corregir-email">Email</label>
            <input {...campo('email')} type="email" required placeholder="con qué entra" />
          </div>
        </div>
        <BotonCorregir />
      </form>
    </>
  )
}
