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
/**
 * El campo que no se elige: queda en el nombre de quien está cargando.
 *
 * Se muestra igual, apagado, en vez de esconderse. Un campo que desaparece
 * deja la duda de a quién le quedó el lead; uno que dice «Kevin (vos)» la
 * contesta.
 */
function Mio({ nombre, campo, id }: { nombre: string; campo: string; id: number }) {
  return (
    <>
      <input type="hidden" name={campo} value={id} />
      <div className="fijo">{nombre} <span className="sindato">(vos)</span></div>
    </>
  )
}

function Boton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Registrar lead'}</button>
}

/**
 * Quién carga.
 *
 * Un closer y un setter ven sólo lo suyo, así que el campo que decide de quién
 * es el lead no puede ser un desplegable con todo el equipo: elegir a otro es
 * perder el lead de vista para siempre. Para ellos queda fijo en su nombre.
 */
export type QuienCarga =
  | { tipo: 'todo' }
  | { tipo: 'closer'; id: number; nombre: string }
  | { tipo: 'setter'; id: number; nombre: string }
  | { tipo: 'nadie' }

export function AltaDeLead({ catalogos, yo }: {
  catalogos: { fuentes: Opcion[]; funnels: Opcion[]; setters: Opcion[]; closers: CloserOpcion[] }
  yo: QuienCarga
}) {
  const [estado, accion] = useActionState<EstadoDeAlta, FormData>(crearLeadAccion, null)
  // Los valores viven del lado de React: si la acción vuelve con un aviso de
  // duplicado, lo escrito sigue ahí. Sin esto había que cargar todo de nuevo
  // justo cuando le estamos pidiendo a alguien que revise algo.
  const { campo, form } = useCampos({
    nombre: '', email: '', telefono: '', pais: '', empresa: '', industria: '',
    fuenteId: '', funnelId: '',
    setterId: yo.tipo === 'setter' ? String(yo.id) : '',
    closerId: yo.tipo === 'closer' ? String(yo.id) : '',
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
                  <td>
                    {d.tuyo
                      ? <Link href={`/leads/${d.id}`} style={{ fontWeight: 650 }}>{d.nombre}</Link>
                      : <strong>{d.nombre}</strong>}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{d.porque}</td>
                  <td style={{ fontSize: 12.5 }}>{d.resultado}</td>
                  <td className="num">
                    {!d.tuyo ? (
                      <span className="sindato">
                        {d.sinAsignar ? 'sin asignar · pedí que te lo pasen' : 'de otro · no lo ves'}
                      </span>
                    ) : d.cerrado ? (
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
            {estado.duplicados.some((d) => !d.tuyo) ? (
              <> Los que no podés abrir están a nombre de otra persona del equipo, o sin asignar.
              Si es el mismo cliente, pedí que te lo pasen en vez de crear otra ficha: si creás
              otra, la historia queda partida en dos y ninguna de las dos está completa.</>
            ) : null}
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
            {yo.tipo === 'setter' ? (
              <Mio nombre={yo.nombre} campo="setterId" id={yo.id} />
            ) : (
              <select {...campo('setterId')}>
                <option value="">Sin cargar</option>
                {catalogos.setters.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            )}
          </div>
          <div className="campo">
            <label htmlFor="closerId">Closer</label>
            {yo.tipo === 'closer' ? (
              <Mio nombre={yo.nombre} campo="closerId" id={yo.id} />
            ) : (
              <select {...campo('closerId')}>
                <option value="">Sin asignar</option>
                {catalogos.closers.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            )}
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
