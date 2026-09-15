'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { crearLeadAccion, type EstadoDeAlta } from '@/app/(app)/leads/acciones'
import { NOMBRE_DE_TIPO, TIPOS_SESION } from '@/dominio/resultados'
import type { Opcion, CloserOpcion } from '@/datos/catalogos'

function Boton({ confirmar }: { confirmar: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : confirmar ? 'Crear igual, es otra persona' : 'Registrar lead'}
    </button>
  )
}

export function LeadNuevo({ catalogos }: {
  catalogos: { fuentes: Opcion[]; funnels: Opcion[]; setters: Opcion[]; closers: CloserOpcion[] }
}) {
  const [estado, accion] = useActionState<EstadoDeAlta, FormData>(crearLeadAccion, null)
  const hayDuplicados = estado?.tipo === 'duplicados'

  return (
    <form action={accion} className="apilado">
      {estado?.tipo === 'error' ? <div className="aviso problema">{estado.mensaje}</div> : null}

      {hayDuplicados ? (
        <div className="aviso atencion">
          <strong>{estado.mensaje}</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {estado.duplicados.map((d) => (
              <li key={d.id}>
                <Link href={`/leads/${d.id}`} style={{ fontWeight: 650 }}>{d.nombre}</Link>
                {' '}— {d.porque}
              </li>
            ))}
          </ul>
          <p style={{ margin: '8px 0 0', fontSize: 13 }}>
            Si es la misma persona, abrí la ficha que ya está y cargale una sesión nueva.
            Si es otra, seguí abajo.
          </p>
          {/* Sólo con esto puesto el servidor crea el lead pese al parecido. */}
          <input type="hidden" name="confirmado" value="1" />
        </div>
      ) : null}

      <section className="tarjeta">
        <h2>La persona</h2>
        <div className="dos">
          <div className="campo">
            <label htmlFor="nombre">Nombre *</label>
            <input id="nombre" name="nombre" required autoFocus />
          </div>
          <div className="campo">
            <label htmlFor="empresa">Empresa</label>
            <input id="empresa" name="empresa" />
          </div>
          <div className="campo">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" />
          </div>
          <div className="campo">
            <label htmlFor="telefono">Teléfono</label>
            <input id="telefono" name="telefono" />
          </div>
          <div className="campo">
            <label htmlFor="pais">País</label>
            <input id="pais" name="pais" />
          </div>
        </div>
      </section>

      <section className="tarjeta">
        <h2>De dónde viene</h2>
        <div className="dos">
          {([
            ['fuenteId', 'Fuente', catalogos.fuentes],
            ['funnelId', 'Funnel', catalogos.funnels],
            ['setterId', 'Setter', catalogos.setters],
          ] as const).map(([nombre, etiqueta, opciones]) => (
            <div className="campo" key={nombre}>
              <label htmlFor={nombre}>{etiqueta}</label>
              <select id={nombre} name={nombre} defaultValue="">
                <option value="">Sin cargar</option>
                {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="tarjeta">
        <h2>La primera sesión</h2>
        <p style={{ marginTop: -6, fontSize: 13, color: 'var(--gris)' }}>
          Opcional. Si todavía no hay reunión agendada, se carga después desde la ficha.
        </p>
        <div className="dos">
          <div className="campo">
            <label htmlFor="closerId">Closer</label>
            <select id="closerId" name="closerId" defaultValue="">
              <option value="">Sin asignar</option>
              {catalogos.closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="tipoSesion">Tipo de sesión</label>
            <select id="tipoSesion" name="tipoSesion" defaultValue="primera">
              {TIPOS_SESION.map((t) => <option key={t} value={t}>{NOMBRE_DE_TIPO[t]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fechaAgenda">Fecha de la reunión</label>
            <input id="fechaAgenda" name="fechaAgenda" type="date" />
          </div>
          <div className="campo">
            <label htmlFor="horaAgenda">Hora</label>
            <input id="horaAgenda" name="horaAgenda" type="time" />
          </div>
          <div className="campo">
            <label htmlFor="valorPotencial">Valor potencial</label>
            <input id="valorPotencial" name="valorPotencial" inputMode="decimal" placeholder="3000" />
          </div>
          <div className="campo">
            <label htmlFor="moneda">Moneda</label>
            <select id="moneda" name="moneda" defaultValue="USD">
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Lo que sabemos</h2>
        {([
          ['notas', 'Notas del setter'],
          ['infoNegocio', 'Información del negocio'],
          ['links', 'Links'],
          ['infoExtra', 'Información adicional'],
        ] as const).map(([nombre, etiqueta]) => (
          <div className="campo" key={nombre}>
            <label htmlFor={nombre}>{etiqueta}</label>
            <textarea id={nombre} name={nombre} />
          </div>
        ))}
      </section>

      <div className="fila">
        <Boton confirmar={hayDuplicados} />
        <Link className="boton secundario" href="/leads">Cancelar</Link>
      </div>
    </form>
  )
}
