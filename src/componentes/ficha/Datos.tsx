'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Lead, LoQueCuelga } from '@/datos/leads'
import type { Opcion } from '@/datos/catalogos'
import { Tarjeta } from '../Piezas'
import { DarDeBaja } from '../DarDeBaja'
import { editarLeadAccion } from '@/app/(app)/leads/acciones'
import { TIPOS_SESION, NOMBRE_DE_TIPO } from '@/dominio/resultados'

/**
 * Editar los datos del lead.
 *
 * Todos. El problema declarado del sistema anterior era que una vez registrado
 * un lead no se podía corregir; acá la lista de lo editable y la lista de lo
 * que tiene un lead son la misma lista. Nada se borra y se vuelve a crear:
 * cambia el campo y queda el histórico.
 *
 * Y CONTESTA. Antes se apretaba «Guardar los cambios» y la pantalla quedaba
 * igual, que es indistinguible de que no se guardó. El caso real fue peor: un
 * lead subido por planilla tenía «no tiene» en el email, el navegador
 * consideraba inválido ese campo y bloqueaba el envío del formulario entero.
 * El botón no hacía literalmente nada y no había forma de saber por qué. Por
 * eso el email ya no es `type="email"`: un dato viejo no puede dejar sin
 * guardar el resto de la ficha, y lo que haya que decir del email se dice
 * arriba, con el resto ya guardado.
 */
function Guardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar los cambios'}
    </button>
  )
}

export function Datos({ lead, catalogos, cuelga, puedeBorrar, puedeConPlata }: {
  lead: Lead
  catalogos: { fuentes: Opcion[]; funnels: Opcion[]; setters: Opcion[] }
  cuelga: LoQueCuelga
  puedeBorrar: boolean
  puedeConPlata: boolean
}) {
  const [guardado, accion] = useActionState(editarLeadAccion, null)

  return (
    <div style={{ maxWidth: 820 }}>
      <form action={accion}>
        <input type="hidden" name="leadId" value={lead.id} />
        {guardado ? (
          <div className={guardado.ok ? 'aviso dato' : 'aviso problema'} style={{ marginBottom: 10 }}>
            {guardado.mensaje}
          </div>
        ) : null}

        <Tarjeta titulo="Quién es">
          <div className="dos">
            <Campo id="nombre" etiqueta="Nombre y apellido" valor={lead.nombre} requerido />
            <Campo id="empresa" etiqueta="Empresa" valor={lead.empresa} />
            <Campo id="email" etiqueta="Email" valor={lead.email} />
            <Campo id="telefono" etiqueta="Teléfono" valor={lead.telefono} />
            <Campo id="pais" etiqueta="País" valor={lead.pais} />
            <Campo id="industria" etiqueta="Industria" valor={lead.industria} />
          </div>
        </Tarjeta>

        <div style={{ height: 10 }} />

        <Tarjeta titulo="De dónde viene y quién lo lleva">
          <div className="dos">
            <Select id="fuenteId" etiqueta="Fuente" valor={lead.fuenteId} opciones={catalogos.fuentes} />
            <Select id="funnelId" etiqueta="Funnel" valor={lead.funnelId} opciones={catalogos.funnels} />
            <Select id="setterId" etiqueta="Setter" valor={lead.setterId} opciones={catalogos.setters} />
            <div className="campo">
              <label htmlFor="tipoSesion">Tipo de sesión</label>
              <select id="tipoSesion" name="tipoSesion" defaultValue={lead.tipoSesion}>
                {TIPOS_SESION.map((t) => <option key={t} value={t}>{NOMBRE_DE_TIPO[t]}</option>)}
              </select>
            </div>
          </div>
          <p className="ayuda">
            El closer se cambia desde la pestaña Resultado: ese cambio pide un motivo
            porque es el que después hay que poder explicar.
          </p>
        </Tarjeta>

        <div style={{ height: 10 }} />

        <Tarjeta titulo="La reunión y el valor">
          <div className="dos">
            <Campo id="fechaSesion" etiqueta="Fecha" valor={lead.fechaSesion} tipo="date" />
            <Campo id="horaSesion" etiqueta="Hora" valor={lead.horaSesion?.slice(0, 5) ?? null} tipo="time" />
            <Campo id="valorPotencial" etiqueta="Valor potencial"
                   valor={lead.valorPotencial === null ? null : String(lead.valorPotencial)} />
            <div className="campo">
              <label htmlFor="moneda">Moneda</label>
              <select id="moneda" name="moneda" defaultValue={lead.moneda}>
                <option value="USD">USD</option><option value="ARS">ARS</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </Tarjeta>

        <div style={{ height: 10 }} />

        <Tarjeta titulo="Contexto">
          <div className="campo">
            <label htmlFor="links">Links</label>
            <textarea id="links" name="links" defaultValue={lead.links ?? ''}
                      placeholder="Web, redes, grabación de la llamada…" />
          </div>
          <div className="campo">
            <label htmlFor="infoNegocio">Información del negocio</label>
            <textarea id="infoNegocio" name="infoNegocio" defaultValue={lead.infoNegocio ?? ''} />
          </div>
          <div className="campo">
            <label htmlFor="infoExtra">Información adicional</label>
            <textarea id="infoExtra" name="infoExtra" defaultValue={lead.infoExtra ?? ''} />
          </div>
          <div className="campo">
            <label htmlFor="motivo">Motivo del cambio</label>
            <input id="motivo" name="motivo" placeholder="Opcional · queda en el historial" />
          </div>
          <Guardar />
        </Tarjeta>
      </form>

      {puedeBorrar ? (
        <>
          <div style={{ height: 10 }} />
          <Tarjeta titulo="Dar de baja"
                   ayuda="Para un duplicado, una prueba o algo cargado por error. Nada se borra: se puede volver a poner en juego.">
            <DarDeBaja leadId={lead.id} nombre={lead.nombre} cuelga={cuelga}
                       puedeConPlata={puedeConPlata} />
          </Tarjeta>
        </>
      ) : null}
    </div>
  )
}

function Campo({ id, etiqueta, valor, tipo, requerido }: {
  id: string; etiqueta: string; valor: string | null; tipo?: string; requerido?: boolean
}) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} name={id} type={tipo ?? 'text'} defaultValue={valor ?? ''} required={requerido} />
    </div>
  )
}

function Select({ id, etiqueta, valor, opciones }: {
  id: string; etiqueta: string; valor: number | null; opciones: Opcion[]
}) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} name={id} defaultValue={valor ?? ''}>
        <option value="">Sin cargar</option>
        {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
      </select>
    </div>
  )
}
