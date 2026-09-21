'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { crearLeadAccion, type EstadoDeAlta } from '@/app/(app)/leads/acciones'
import { useCampos } from './campos'
import { TIPOS_SESION, NOMBRE_DE_TIPO } from '@/dominio/resultados'
import type { Opcion, CloserOpcion } from '@/datos/catalogos'

/**
 * El alta de un lead.
 *
 * Corta a propósito. Lo que hace falta para que exista y se lo pueda llamar; el
 * resto —la calificación, el diagnóstico, la plata— se carga en la ficha, por
 * quien lo sepa y cuando lo sepa. Un formulario de alta con doce campos
 * obligatorios se completa con datos inventados, y después esos datos son los
 * que alimentan las métricas.
 */
function Boton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Registrar lead'}</button>
}

export function AltaDeLead({ catalogos }: {
  catalogos: { fuentes: Opcion[]; funnels: Opcion[]; setters: Opcion[]; closers: CloserOpcion[] }
}) {
  const [estado, accion] = useActionState<EstadoDeAlta, FormData>(crearLeadAccion, null)
  // Los valores viven del lado de React: si la acción vuelve con un aviso de
  // duplicado, lo escrito sigue ahí. Sin esto había que cargar todo de nuevo
  // justo cuando le estamos pidiendo a alguien que revise algo.
  const { campo, form } = useCampos({
    nombre: '', email: '', telefono: '', pais: '', empresa: '', industria: '',
    fuenteId: '', funnelId: '', setterId: '', closerId: '',
    fechaSesion: '', horaSesion: '', tipoSesion: 'primera', valorPotencial: '', moneda: 'USD',
  }, estado)

  const hayDuplicados = estado?.tipo === 'duplicados'

  return (
    <form action={accion} ref={form}>
      {estado?.tipo === 'error' ? <div className="aviso problema">{estado.mensaje}</div> : null}

      {hayDuplicados ? (
        <div className="aviso atencion">
          <strong>{estado.mensaje}</strong>
          <table style={{ marginTop: 8 }}>
            <tbody>
              {estado.duplicados.map((d) => (
                <tr key={d.id}>
                  <td><Link href={`/leads/${d.id}`} style={{ fontWeight: 650 }}>{d.nombre}</Link></td>
                  <td style={{ fontSize: 12.5 }}>{d.porque}</td>
                  <td style={{ fontSize: 12.5 }}>{d.resultado}</td>
                  <td className="num">
                    {d.cerrado ? (
                      <Link href={`/leads/${d.id}?pestana=resultado`} style={{ fontWeight: 650, color: 'var(--acento)' }}>
                        Reflotarlo →
                      </Link>
                    ) : (
                      <Link href={`/leads/${d.id}`} style={{ fontWeight: 650, color: 'var(--acento)' }}>Abrir →</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', fontSize: 12.5 }}>
            Si uno de esos está cerrado y es la misma persona, <strong>reflotalo</strong> en vez de crear
            otra ficha: así no se parte la historia y queda registrado que la repesca la hiciste vos.
            Si es otra persona, seguí abajo.
          </p>
        </div>
      ) : null}

      <div className="tarjeta" style={{ marginBottom: 12 }}>
        <h3>Quién es</h3>
        <div className="dos">
          <div className="campo">
            <label htmlFor="nombre">Nombre y apellido *</label>
            <input {...campo('nombre')} autoFocus required />
          </div>
          <div className="campo">
            <label htmlFor="empresa">Empresa</label>
            <input {...campo('empresa')} />
          </div>
          <div className="campo">
            <label htmlFor="email">Email</label>
            <input {...campo('email')} type="email" />
          </div>
          <div className="campo">
            <label htmlFor="telefono">Teléfono</label>
            <input {...campo('telefono')} />
          </div>
          <div className="campo">
            <label htmlFor="pais">País</label>
            <input {...campo('pais')} />
          </div>
          <div className="campo">
            <label htmlFor="industria">Industria</label>
            <input {...campo('industria')} />
          </div>
        </div>
      </div>

      <div className="tarjeta" style={{ marginBottom: 12 }}>
        <h3>De dónde viene</h3>
        <div className="dos">
          <div className="campo">
            <label htmlFor="fuenteId">Fuente</label>
            <select {...campo('fuenteId')}>
              <option value="">Sin cargar</option>
              {catalogos.fuentes.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="funnelId">Funnel</label>
            <select {...campo('funnelId')}>
              <option value="">Sin cargar</option>
              {catalogos.funnels.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="setterId">Setter</label>
            <select {...campo('setterId')}>
              <option value="">Sin cargar</option>
              {catalogos.setters.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="closerId">Closer</label>
            <select {...campo('closerId')}>
              <option value="">Sin asignar</option>
              {catalogos.closers.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="tarjeta" style={{ marginBottom: 12 }}>
        <h3>La reunión</h3>
        <p className="ayuda" style={{ marginBottom: 10 }}>
          Si todavía no está agendada, dejalo vacío y cargalo después desde la ficha.
        </p>
        <div className="dos">
          <div className="campo">
            <label htmlFor="fechaSesion">Fecha</label>
            <input {...campo('fechaSesion')} type="date" />
          </div>
          <div className="campo">
            <label htmlFor="horaSesion">Hora</label>
            <input {...campo('horaSesion')} type="time" />
          </div>
          <div className="campo">
            <label htmlFor="tipoSesion">Tipo de sesión</label>
            <select {...campo('tipoSesion')}>
              {TIPOS_SESION.map((t) => <option key={t} value={t}>{NOMBRE_DE_TIPO[t]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="valorPotencial">Valor potencial</label>
            <div className="fila" style={{ flexWrap: 'nowrap' }}>
              <select {...campo('moneda')} style={{ width: 88 }}>
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
                <option value="EUR">EUR</option>
              </select>
              <input {...campo('valorPotencial')} inputMode="decimal" placeholder="0" />
            </div>
          </div>
        </div>
      </div>

      <div className="fila">
        {hayDuplicados ? (
          <>
            <input type="hidden" name="confirmado" value="1" />
            <button type="submit">Es otra persona · crear igual</button>
          </>
        ) : (
          <Boton />
        )}
        <Link className="boton secundario" href="/leads">Cancelar</Link>
      </div>
    </form>
  )
}
