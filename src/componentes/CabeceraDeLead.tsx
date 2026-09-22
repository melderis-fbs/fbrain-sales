import Link from 'next/link'
import type { Lead } from '@/datos/leads'
import type { Calidad } from '@/motor/calidad'
import { Pildora } from './Piezas'
import { Iconos } from './Iconos'
import { NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO } from '@/dominio/resultados'
import { COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL } from '@/dominio/calidad'

/**
 * La cabecera de la ficha.
 *
 * Lo que hace falta saber antes de tocar nada: quién es, cómo se lo contacta,
 * qué tan bueno es el lead, en qué estado está y de quién es. Cuatro cifras y
 * ni una más — si acá entra todo, no resalta nada.
 */
export function CabeceraDeLead({ lead, calidad }: { lead: Lead; calidad: Calidad }) {
  const Empresa = Iconos.empresa
  const Email = Iconos.email
  const Telefono = Iconos.llamadas
  const Lugar = Iconos.lugar

  const iniciales = lead.nombre
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '').join('')

  return (
    <div className="cabecera-ficha">
      <div className="arriba">
        <span className="iniciales" aria-hidden="true">{iniciales}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{lead.nombre}</h1>
          <div className="contacto">
            {lead.empresa ? <span><Empresa />{lead.empresa}</span> : null}
            {lead.email ? (
              <span><Email /><a href={`mailto:${lead.email}`}>{lead.email}</a></span>
            ) : null}
            {lead.telefono ? (
              <span><Telefono /><a href={`tel:${lead.telefono.replace(/\s/g, '')}`}>{lead.telefono}</a></span>
            ) : null}
            {lead.pais ? <span><Lugar />{lead.pais}</span> : null}
          </div>
        </div>
        <Link className="boton secundario" href={`/leads/${lead.id}?pestana=datos`}>Editar lead</Link>
      </div>

      <div className="cifras">
        <div>
          <div className="etiqueta">Lead Quality</div>
          <div style={{ marginTop: 4 }}>
            {calidad.score === null || calidad.nivel === null ? (
              <span className="sindato">sin calificar</span>
            ) : (
              <span className="fila" style={{ gap: 7 }}>
                <strong style={{ fontSize: 19, color: 'var(--negro)' }}>{calidad.score}</strong>
                <Pildora color={COLOR_DE_CALIDAD[calidad.nivel]}>{NOMBRE_DE_NIVEL[calidad.nivel]}</Pildora>
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="etiqueta">Estado</div>
          <div style={{ marginTop: 6 }}>
            <Pildora color={COLOR_DE_ESTADO[lead.estado]}>{NOMBRE_DE_ESTADO[lead.estado]}</Pildora>
          </div>
        </div>
        <div>
          <div className="etiqueta">Resultado</div>
          <div style={{ marginTop: 6 }}>
            <Pildora color={COLOR_DE_RESULTADO[lead.resultado]}>{NOMBRE_DE_RESULTADO[lead.resultado]}</Pildora>
          </div>
        </div>
        <div>
          <div className="etiqueta">Closer asignado</div>
          <div style={{ marginTop: 4, fontSize: 15, fontWeight: 650, color: 'var(--negro)' }}>
            {lead.closer ?? <span className="sindato">sin asignar</span>}
          </div>
          {lead.ciclo > 1 ? (
            <div className="contra">ciclo {lead.ciclo}{lead.reflotadoPor ? ` · reflotó ${lead.reflotadoPor}` : ''}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
