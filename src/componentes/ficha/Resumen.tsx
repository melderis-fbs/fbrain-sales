import Link from 'next/link'
import type { Lead } from '@/datos/leads'
import type { Calidad } from '@/motor/calidad'
import type { Nota } from '@/datos/notas'
import type { EstadoDelLead } from '@/datos/seguimientos'
import { Tarjeta, Pildora, plata, fechaCorta, hora, cuando } from '../Piezas'
import { NOMBRE_DE_TIPO, NOMBRE_DE_MOTIVO, type MotivoPerdida } from '@/dominio/resultados'
import { CAMPOS_QUE_PUNTUAN, CAMPOS_LIBRES, COMPLETITUD_MINIMA } from '@/dominio/calidad'
import { NOMBRE_DE_URGENCIA, COLOR_DE_URGENCIA } from '@/motor/toques'

/**
 * El resumen del lead.
 *
 * Todo lo que hace falta para entrar a la llamada, en una pantalla y sin
 * navegar: de dónde vino, cuándo es, cuánto vale, qué averiguó el setter y qué
 * se anotó. Lo que se corrige vive en otras pestañas; esto es para leer.
 */
export function Resumen({
  lead, calidad, respuestas, notas, seguimiento, verPlata,
}: {
  lead: Lead
  calidad: Calidad
  respuestas: Record<string, string | null>
  notas: Nota[]
  seguimiento: EstadoDelLead | null
  verPlata: boolean
}) {
  const contestadas = CAMPOS_QUE_PUNTUAN
    .map((c) => ({ etiqueta: c.etiqueta, valor: c.opciones.find((o) => o.valor === respuestas[c.clave])?.etiqueta }))
    .filter((x) => x.valor !== undefined)
  const libres = CAMPOS_LIBRES
    .map((c) => ({ etiqueta: c.etiqueta, valor: respuestas[c.clave] }))
    .filter((x) => x.valor !== null && x.valor !== '')

  const DATOS: [string, React.ReactNode][] = [
    ['Setter', lead.setter],
    ['Fuente', lead.fuente],
    ['Funnel', lead.funnel],
    ['Tipo de sesión', NOMBRE_DE_TIPO[lead.tipoSesion]],
    ['Fecha de sesión', lead.fechaSesion
      ? [fechaCorta(lead.fechaSesion), lead.horaSesion ? hora(lead.horaSesion) : null].filter(Boolean).join(' · ')
      : null],
    ['Próximo contacto', lead.proximoContacto ? fechaCorta(lead.proximoContacto) : null],
    ...(verPlata
      ? [['Valor potencial', lead.valorPotencial ? plata(lead.valorPotencial, lead.moneda) : null]] as [string, React.ReactNode][]
      : []),
    ['Industria', lead.industria],
    ['Empresa', lead.empresa],
    ['País', lead.pais],
  ]

  return (
    <div className="rejilla g2">
      <div className="apilado">
        <Tarjeta titulo="Información del lead">
          <div className="dos" style={{ rowGap: 14 }}>
            {DATOS.map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <div className="etiqueta">{etiqueta}</div>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 1 }}>
                  {valor ?? <span className="sindato">—</span>}
                </div>
              </div>
            ))}
          </div>

          {lead.motivoPerdida ? (
            <>
              <div className="separador" />
              <div className="etiqueta">Por qué se perdió</div>
              <div style={{ marginTop: 4 }}>
                <Pildora color="rojo">
                  {NOMBRE_DE_MOTIVO[lead.motivoPerdida as MotivoPerdida] ?? lead.motivoPerdida}
                </Pildora>
              </div>
            </>
          ) : null}

          {lead.proximoPaso || lead.observaciones ? (
            <>
              <div className="separador" />
              {lead.proximoPaso ? (
                <div style={{ marginBottom: 8 }}>
                  <div className="etiqueta">Próximo paso</div>
                  <div style={{ fontSize: 13.5 }}>{lead.proximoPaso}</div>
                </div>
              ) : null}
              {lead.observaciones ? (
                <div>
                  <div className="etiqueta">Observaciones de la llamada</div>
                  <p style={{ margin: '2px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{lead.observaciones}</p>
                </div>
              ) : null}
            </>
          ) : null}
        </Tarjeta>

        <Tarjeta titulo={`Notas (${notas.length})`}
                 accion={<Link href={`/leads/${lead.id}?pestana=notas`}
                               style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                           Escribir una →
                         </Link>}>
          {notas.length === 0 ? (
            <p className="ayuda">Todavía no hay notas.</p>
          ) : (
            <div className="apilado" style={{ gap: 10 }}>
              {notas.slice(0, 5).map((n, i) => (
                <div key={n.id}>
                  {i > 0 ? <div className="separador" /> : null}
                  <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>
                    <strong style={{ color: 'var(--negro)' }}>{n.autor ?? 'Alguien'}</strong>
                    {' · '}{cuando(n.cuando)}
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{n.texto}</p>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>

      <div className="apilado">
        <Tarjeta titulo="Lo que averiguó el setter"
                 accion={<Link href={`/leads/${lead.id}?pestana=calificacion`}
                               style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                           Completar →
                         </Link>}
                 ayuda="Es lo que después permite comparar closers con justicia: no es lo mismo cerrar 20% con leads buenos que con leads flojos.">
          {calidad.score === null ? (
            <div className="aviso atencion" style={{ marginBottom: 0 }}>
              <strong>Sin calificar.</strong> Va {calidad.completitud}% de la ficha y hacen falta
              {' '}{COMPLETITUD_MINIMA}% para que el número diga algo. Con menos, «bajo» no
              significaría que el lead es malo: significaría que nadie preguntó.
            </div>
          ) : (
            <>
              {libres.map((x) => (
                <div key={x.etiqueta} style={{ marginBottom: 10 }}>
                  <div className="etiqueta">{x.etiqueta}</div>
                  <p style={{ margin: '2px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{x.valor}</p>
                </div>
              ))}
              <table>
                <tbody>
                  {contestadas.map((x) => (
                    <tr key={x.etiqueta}>
                      <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{x.etiqueta}</td>
                      <td className="num" style={{ fontSize: 12.5, fontWeight: 600 }}>{x.valor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {calidad.faltan.length > 0 ? (
                <p className="ayuda" style={{ marginTop: 10 }}>
                  Sin preguntar: {calidad.faltan.join(' · ')}.
                </p>
              ) : null}
            </>
          )}
        </Tarjeta>

        {verPlata && (lead.venta || lead.sena || lead.valorPotencial) ? (
          <Tarjeta titulo="La plata">
            <div className="tres">
              <div>
                <div className="etiqueta">Valor potencial</div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {lead.valorPotencial ? plata(lead.valorPotencial, lead.moneda) : '—'}
                </div>
              </div>
              <div>
                <div className="etiqueta">Vendido</div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {lead.venta ? plata(lead.venta.importe, lead.venta.moneda) : '—'}
                </div>
              </div>
              <div>
                <div className="etiqueta">Cobrado</div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {lead.cobrado > 0 ? plata(lead.cobrado, lead.moneda) : '—'}
                </div>
              </div>
            </div>
            {lead.sena ? (
              <div className="aviso dato" style={{ marginTop: 10, marginBottom: 0 }}>
                <strong>Seña de {plata(lead.sena.importe, lead.sena.moneda)}</strong>
                {lead.sena.estado === 'convertida'
                  ? ' · ya se convirtió en venta, y su importe entró como el primer cobro.'
                  : <> · no entra a facturación ni a cash hasta que se convierta
                      {lead.sena.comprometida ? `. Paga el ${fechaCorta(lead.sena.comprometida)}` : ''}.</>}
              </div>
            ) : null}
          </Tarjeta>
        ) : null}

        {seguimiento && seguimiento.situacion !== 'fuera' ? (
          <Tarjeta titulo="En el pipeline de seguimientos"
                   accion={<Link href="/seguimientos"
                                 style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                             Ver el pipeline →
                           </Link>}>
            <div className="fila">
              <Pildora color={COLOR_DE_URGENCIA[seguimiento.urgencia]}>
                {NOMBRE_DE_URGENCIA[seguimiento.urgencia]}
              </Pildora>
              <span style={{ fontSize: 13.5 }}>
                {seguimiento.situacion === 'largo'
                  ? <>Seguimiento largo · vuelve el {fechaCorta(seguimiento.fechaLarga)}</>
                  : <>Toque {seguimiento.toque}
                      {seguimiento.toqueNombre ? ` · ${seguimiento.toqueNombre}` : ''} ·{' '}
                      toca el {fechaCorta(seguimiento.fecha)}</>}
              </span>
            </div>
          </Tarjeta>
        ) : null}
      </div>
    </div>
  )
}
