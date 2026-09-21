import Link from 'next/link'
import type { Lead } from '@/datos/leads'
import type { Calidad } from '@/motor/calidad'
import type { EstadoDelLead } from '@/datos/seguimientos'
import { Tarjeta, Pildora, plata, fechaCorta, hora, Barra } from '../Piezas'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
  NOMBRE_DE_TIPO, NOMBRE_DE_MOTIVO, type MotivoPerdida,
} from '@/dominio/resultados'
import { COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL, COMPLETITUD_MINIMA } from '@/dominio/calidad'
import { NOMBRE_DE_URGENCIA, COLOR_DE_URGENCIA } from '@/motor/toques'

/** Qué se sabe de este lead, de un vistazo. */
export function Resumen({
  lead, calidad, seguimiento, verPlata,
}: {
  lead: Lead
  calidad: Calidad
  seguimiento: EstadoDelLead | null
  verPlata: boolean
}) {
  return (
    <div className="rejilla g2">
      <div className="apilado">
        <Tarjeta titulo="La reunión">
          <div className="tres">
            <Dato etiqueta="Fecha" valor={fechaCorta(lead.fechaSesion)} />
            <Dato etiqueta="Hora" valor={hora(lead.horaSesion)} />
            <Dato etiqueta="Tipo" valor={NOMBRE_DE_TIPO[lead.tipoSesion]} />
            <Dato etiqueta="Closer" valor={lead.closer ?? 'sin asignar'} />
            <Dato etiqueta="Setter" valor={lead.setter ?? '—'} />
            <Dato etiqueta="Fuente" valor={lead.fuente ?? '—'} />
          </div>

          <div className="separador" />
          <div className="fila">
            <Pildora color={COLOR_DE_ESTADO[lead.estado]}>{NOMBRE_DE_ESTADO[lead.estado]}</Pildora>
            <Pildora color={COLOR_DE_RESULTADO[lead.resultado]}>{NOMBRE_DE_RESULTADO[lead.resultado]}</Pildora>
            {lead.huboOferta ? <Pildora color="gris">Hubo oferta</Pildora> : null}
            {lead.motivoPerdida ? (
              <Pildora color="rojo">
                {NOMBRE_DE_MOTIVO[lead.motivoPerdida as MotivoPerdida] ?? lead.motivoPerdida}
              </Pildora>
            ) : null}
          </div>

          {lead.closerInicial && lead.closerInicial !== lead.closer ? (
            <p className="ayuda" style={{ marginTop: 8 }}>
              Lo empezó <strong>{lead.closerInicial}</strong> y hoy lo lleva{' '}
              <strong>{lead.closer ?? 'nadie'}</strong>. El closer inicial no se pisa nunca:
              sin él no se puede repartir un cierre que tocaron dos personas.
            </p>
          ) : null}

          {lead.ciclo > 1 ? (
            <div className="aviso dato" style={{ marginTop: 10, marginBottom: 0 }}>
              <strong>Ciclo {lead.ciclo}</strong> — este lead se reabrió
              {lead.reflotadoPor ? <>, lo reflotó <strong>{lead.reflotadoPor}</strong></> : null}
              {lead.reflotadoEn ? ` el ${fechaCorta(lead.reflotadoEn)}` : null}.
              Es la misma persona y la misma historia, no una ficha nueva.
            </div>
          ) : null}

          {lead.proximoPaso || lead.proximoContacto ? (
            <>
              <div className="separador" />
              <div className="etiqueta">Próximo paso</div>
              <div style={{ fontSize: 13.5 }}>
                {lead.proximoPaso ?? 'sin definir'}
                {lead.proximoContacto ? ` · ${fechaCorta(lead.proximoContacto)}` : ''}
              </div>
            </>
          ) : null}

          {lead.observaciones ? (
            <>
              <div className="separador" />
              <div className="etiqueta">Observaciones de la llamada</div>
              <p style={{ margin: '2px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{lead.observaciones}</p>
            </>
          ) : null}
        </Tarjeta>

        {seguimiento ? (
          <Tarjeta titulo="En el pipeline de seguimientos"
                   accion={<Link href="/seguimientos" style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Ver el pipeline →</Link>}>
            <div className="fila">
              <Pildora color={COLOR_DE_URGENCIA[seguimiento.urgencia]}>
                {NOMBRE_DE_URGENCIA[seguimiento.urgencia]}
              </Pildora>
              <span style={{ fontSize: 13.5 }}>
                {seguimiento.situacion === 'largo'
                  ? <>Seguimiento largo · vuelve el {fechaCorta(seguimiento.fechaLarga)}</>
                  : seguimiento.situacion === 'fuera'
                    ? 'Fuera del pipeline'
                    : <>Toque {seguimiento.toque}
                        {seguimiento.toqueNombre ? ` · ${seguimiento.toqueNombre}` : ''} ·{' '}
                        {fechaCorta(seguimiento.fecha)}</>}
              </span>
            </div>
          </Tarjeta>
        ) : null}

        <Tarjeta titulo="Contacto">
          <div className="tres">
            <Dato etiqueta="Email" valor={lead.email ?? '—'} />
            <Dato etiqueta="Teléfono" valor={lead.telefono ?? '—'} />
            <Dato etiqueta="País" valor={lead.pais ?? '—'} />
            <Dato etiqueta="Empresa" valor={lead.empresa ?? '—'} />
            <Dato etiqueta="Industria" valor={lead.industria ?? '—'} />
            <Dato etiqueta="Cargado" valor={fechaCorta(lead.creadoEn)} />
          </div>
        </Tarjeta>
      </div>

      <div className="apilado">
        <Tarjeta titulo="Lead Quality"
                 ayuda="Lo que averiguó el setter antes de la llamada. Es lo que después permite comparar closers con justicia.">
          {calidad.score === null ? (
            <>
              <div className="sindato" style={{ fontSize: 15 }}>Sin calificar</div>
              <p className="ayuda" style={{ marginTop: 6 }}>
                Va {calidad.completitud}% de la ficha y hacen falta {COMPLETITUD_MINIMA}% para
                que el número diga algo. Con menos, «bajo» no significaría que el lead es malo:
                significaría que nadie preguntó.
              </p>
              {calidad.faltan.length > 0 ? (
                <p className="ayuda" style={{ marginTop: 6 }}>
                  Falta: {calidad.faltan.join(' · ')}.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="entre">
                <div className="numero">{calidad.score}</div>
                <Pildora color={COLOR_DE_CALIDAD[calidad.nivel!]}>{NOMBRE_DE_NIVEL[calidad.nivel!]}</Pildora>
              </div>
              <div style={{ marginTop: 8 }}>
                <Barra porcentaje={calidad.score} color={COLOR_DE_CALIDAD[calidad.nivel!]} />
              </div>
              <div className="contra">{calidad.completitud}% de la ficha completa</div>

              <div className="separador" />
              <table>
                <tbody>
                  {calidad.aportes.map((a) => (
                    <tr key={a.clave}>
                      <td style={{ fontSize: 12.5 }}>{a.etiqueta}</td>
                      <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                        {a.respuesta ?? <span className="sindato">sin contestar</span>}
                      </td>
                      <td className="num" style={{ fontSize: 12.5 }}>
                        {a.respuesta === null ? '—' : `${a.aporte} / ${a.peso}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="ayuda" style={{ marginTop: 10 }}>
            <Link href="?pestana=calificacion" style={{ color: 'var(--acento)', fontWeight: 650 }}>
              Completar la calificación →
            </Link>
          </p>
        </Tarjeta>

        {verPlata ? (
          <Tarjeta titulo="La plata">
            <div className="tres">
              <Dato etiqueta="Valor potencial"
                    valor={lead.valorPotencial ? plata(lead.valorPotencial, lead.moneda) : '—'} />
              <Dato etiqueta="Vendido"
                    valor={lead.venta ? plata(lead.venta.importe, lead.venta.moneda) : '—'} />
              <Dato etiqueta="Cobrado" valor={lead.cobrado > 0 ? plata(lead.cobrado, lead.moneda) : '—'} />
            </div>
            {lead.sena ? (
              <div className="aviso dato" style={{ marginTop: 10, marginBottom: 0 }}>
                <strong>Seña de {plata(lead.sena.importe, lead.sena.moneda)}</strong>
                {lead.sena.estado === 'convertida'
                  ? ' · ya se convirtió en venta, y su importe entró como el primer cobro.'
                  : <> · {lead.sena.saldo ? `saldo ${plata(lead.sena.saldo, lead.sena.moneda)}` : 'sin saldo cargado'}
                      {lead.sena.comprometida ? `, paga el ${fechaCorta(lead.sena.comprometida)}` : ''}.
                      No entra a facturación ni a cash hasta que se convierta.</>}
              </div>
            ) : null}
            {lead.venta ? (
              <p className="ayuda" style={{ marginTop: 8 }}>
                Vendido el {fechaCorta(lead.venta.fecha)}
                {lead.venta.programa ? ` · ${lead.venta.programa}` : ''}.
                La facturación cuenta por esta fecha; el cash, por la de cada cobro.
              </p>
            ) : null}
          </Tarjeta>
        ) : null}

      </div>
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="etiqueta">{etiqueta}</div>
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>
        {valor === '—' || valor === 'sin asignar' ? <span className="sindato">{valor}</span> : valor}
      </div>
    </div>
  )
}
