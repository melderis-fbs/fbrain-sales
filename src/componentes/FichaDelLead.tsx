'use client'

import { useState } from 'react'
import { editarLeadAccion } from '@/app/(app)/leads/acciones'
import type { Lead } from '@/datos/leads'
import type { Opcion } from '@/datos/catalogos'

/**
 * La ficha, editable en el lugar.
 *
 * El problema declarado del sistema actual es que un lead, una vez cargado, no
 * se podía corregir. Acá TODO campo se edita: se toca, se cambia, se guarda, y
 * queda en el historial quién lo hizo.
 */
export function FichaDelLead({ lead, catalogos, puedeEditar }: {
  lead: Lead
  catalogos: { fuentes: Opcion[]; funnels: Opcion[]; setters: Opcion[] }
  puedeEditar: boolean
}) {
  const campos: { clave: keyof Lead; etiqueta: string; tipo: 'texto' | 'largo' | 'opcion'; opciones?: Opcion[] }[] = [
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { clave: 'empresa', etiqueta: 'Empresa', tipo: 'texto' },
    { clave: 'email', etiqueta: 'Email', tipo: 'texto' },
    { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
    { clave: 'pais', etiqueta: 'País', tipo: 'texto' },
    { clave: 'fuenteId', etiqueta: 'Fuente', tipo: 'opcion', opciones: catalogos.fuentes },
    { clave: 'funnelId', etiqueta: 'Funnel', tipo: 'opcion', opciones: catalogos.funnels },
    { clave: 'setterId', etiqueta: 'Setter', tipo: 'opcion', opciones: catalogos.setters },
    { clave: 'notas', etiqueta: 'Notas del setter', tipo: 'largo' },
    { clave: 'infoNegocio', etiqueta: 'Información del negocio', tipo: 'largo' },
    { clave: 'links', etiqueta: 'Links', tipo: 'largo' },
    { clave: 'infoExtra', etiqueta: 'Información adicional', tipo: 'largo' },
  ]

  return (
    <div className="rejilla g2">
      {campos.map((c) => (
        <CampoEditable
          key={c.clave}
          leadId={lead.id}
          nombre={c.clave}
          etiqueta={c.etiqueta}
          tipo={c.tipo}
          opciones={c.opciones}
          valor={lead[c.clave] === null || lead[c.clave] === undefined ? '' : String(lead[c.clave])}
          puedeEditar={puedeEditar}
        />
      ))}
    </div>
  )
}

function CampoEditable({ leadId, nombre, etiqueta, tipo, opciones, valor, puedeEditar }: {
  leadId: number
  nombre: string
  etiqueta: string
  tipo: 'texto' | 'largo' | 'opcion'
  opciones?: Opcion[]
  valor: string
  puedeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)

  const legible = tipo === 'opcion'
    ? (opciones?.find((o) => String(o.id) === valor)?.nombre ?? '')
    : valor

  if (!editando) {
    return (
      <div className="tarjeta">
        <div className="entre" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div className="etiqueta">{etiqueta}</div>
            <div style={{ marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {legible === '' ? <span className="sindato">sin cargar</span> : legible}
            </div>
          </div>
          {puedeEditar ? (
            <button type="button" className="secundario" style={{ fontSize: 12, padding: '3px 11px' }}
                    onClick={() => setEditando(true)}>
              Editar
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <form className="tarjeta" action={editarLeadAccion} onSubmit={() => setEditando(false)}>
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor={`c-${nombre}`}>{etiqueta}</label>
      {tipo === 'largo' ? (
        <textarea id={`c-${nombre}`} name={nombre} defaultValue={valor} autoFocus />
      ) : tipo === 'opcion' ? (
        <select id={`c-${nombre}`} name={nombre} defaultValue={valor} autoFocus>
          <option value="">Sin cargar</option>
          {opciones?.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      ) : (
        <input id={`c-${nombre}`} name={nombre} defaultValue={valor} autoFocus />
      )}
      <div className="fila" style={{ marginTop: 8 }}>
        <button type="submit" style={{ fontSize: 13, padding: '5px 13px' }}>Guardar</button>
        <button type="button" className="secundario" style={{ fontSize: 13, padding: '5px 13px' }}
                onClick={() => setEditando(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
