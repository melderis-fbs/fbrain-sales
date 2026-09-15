'use client'

import { useState } from 'react'
import { cargarResultadoAccion, reasignarCloserAccion, nuevaOportunidadAccion } from '@/app/(app)/leads/acciones'
import type { OportunidadDelLead } from '@/datos/oportunidades'
import type { CloserOpcion } from '@/datos/catalogos'
import { Pildora, plata, fechaCorta } from './Piezas'
import {
  ESTADOS, RESULTADOS, TIPOS_SESION, MOTIVOS_PERDIDA,
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, NOMBRE_DE_TIPO, NOMBRE_DE_MOTIVO,
  COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
} from '@/dominio/resultados'

export function Oportunidades({ leadId, oportunidades, closers, permisos }: {
  leadId: number
  oportunidades: OportunidadDelLead[]
  closers: CloserOpcion[]
  permisos: { cargarResultado: boolean; reasignar: boolean; editarLead: boolean }
}) {
  const [nueva, setNueva] = useState(false)

  return (
    <div className="apilado">
      {permisos.editarLead ? (
        nueva ? (
          <form className="tarjeta" action={nuevaOportunidadAccion} onSubmit={() => setNueva(false)}>
            <h2>Nueva sesión</h2>
            <input type="hidden" name="leadId" value={leadId} />
            <div className="dos">
              <div className="campo">
                <label htmlFor="n-tipo">Tipo</label>
                <select id="n-tipo" name="tipoSesion" defaultValue="segunda">
                  {TIPOS_SESION.map((t) => <option key={t} value={t}>{NOMBRE_DE_TIPO[t]}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="n-closer">Closer</label>
                <select id="n-closer" name="closerId" defaultValue="">
                  <option value="">Sin asignar</option>
                  {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="n-fecha">Fecha</label>
                <input id="n-fecha" name="fechaAgenda" type="date" />
              </div>
              <div className="campo">
                <label htmlFor="n-hora">Hora</label>
                <input id="n-hora" name="horaAgenda" type="time" />
              </div>
              <div className="campo">
                <label htmlFor="n-valor">Valor potencial</label>
                <input id="n-valor" name="valorPotencial" inputMode="decimal" />
              </div>
              <div className="campo">
                <label htmlFor="n-moneda">Moneda</label>
                <select id="n-moneda" name="moneda" defaultValue="USD">
                  <option>USD</option><option>ARS</option><option>EUR</option>
                </select>
              </div>
            </div>
            <div className="fila">
              <button type="submit">Agendar</button>
              <button type="button" className="secundario" onClick={() => setNueva(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <button type="button" className="secundario" onClick={() => setNueva(true)} style={{ alignSelf: 'flex-start' }}>
            + Agendar otra sesión
          </button>
        )
      ) : null}

      {oportunidades.length === 0 ? (
        <div className="tarjeta">
          <div className="vacio">Este lead todavía no tiene ninguna sesión agendada.</div>
        </div>
      ) : (
        oportunidades.map((o) => (
          <Oportunidad key={o.id} oportunidad={o} closers={closers} permisos={permisos} />
        ))
      )}
    </div>
  )
}

function Oportunidad({ oportunidad: o, closers, permisos }: {
  oportunidad: OportunidadDelLead
  closers: CloserOpcion[]
  permisos: { cargarResultado: boolean; reasignar: boolean }
}) {
  const [abierto, setAbierto] = useState<'no' | 'resultado' | 'closer'>('no')
  const [resultado, setResultado] = useState(o.resultado)
  const pideImporte = resultado === 'venta' || resultado === 'sena'

  return (
    <section className="tarjeta">
      <div className="entre">
        <div>
          <div className="etiqueta">Sesión {o.numero} · {NOMBRE_DE_TIPO[o.tipoSesion]}</div>
          <div className="fila" style={{ marginTop: 4 }}>
            <strong style={{ fontSize: 16 }}>
              {o.fechaAgenda ? fechaCorta(o.fechaAgenda) : 'sin fecha'}
              {o.horaAgenda ? ` · ${o.horaAgenda.slice(0, 5)}` : ''}
            </strong>
            <Pildora color={COLOR_DE_ESTADO[o.estado]}>{NOMBRE_DE_ESTADO[o.estado]}</Pildora>
            <Pildora color={COLOR_DE_RESULTADO[o.resultado]}>{NOMBRE_DE_RESULTADO[o.resultado]}</Pildora>
            {o.huboOferta ? <Pildora color="gris">hubo oferta</Pildora> : null}
          </div>
        </div>
        <div className="fila">
          {permisos.cargarResultado ? (
            <button type="button" className="secundario" style={{ fontSize: 13, padding: '5px 13px' }}
                    onClick={() => setAbierto(abierto === 'resultado' ? 'no' : 'resultado')}>
              Cargar resultado
            </button>
          ) : null}
          {permisos.reasignar ? (
            <button type="button" className="secundario" style={{ fontSize: 13, padding: '5px 13px' }}
                    onClick={() => setAbierto(abierto === 'closer' ? 'no' : 'closer')}>
              Cambiar closer
            </button>
          ) : null}
        </div>
      </div>

      <div className="rejilla g4" style={{ marginTop: 12 }}>
        <Dato etiqueta="Closer" valor={o.closer} />
        <Dato etiqueta="Closer inicial" valor={o.closerInicial} />
        <Dato etiqueta="Valor potencial" valor={o.valorPotencial ? plata(o.valorPotencial, o.moneda) : null} />
        <Dato etiqueta="Próximo contacto" valor={o.proximoContacto ? fechaCorta(o.proximoContacto) : null} />
      </div>

      {o.venta ? (
        <div className="aviso" style={{ marginTop: 12, background: 'var(--verde-suave)', borderColor: '#c9e6d6' }}>
          <strong>Venta · {plata(o.venta.importe, o.venta.moneda)}</strong> el {fechaCorta(o.venta.fecha)}
        </div>
      ) : null}

      {o.sena ? <AvisoDeSena sena={o.sena} /> : null}

      {o.motivoPerdida ? (
        <div className="contra" style={{ marginTop: 10 }}>
          Motivo de la pérdida: <strong>{NOMBRE_DE_MOTIVO[o.motivoPerdida as keyof typeof NOMBRE_DE_MOTIVO] ?? o.motivoPerdida}</strong>
        </div>
      ) : null}

      {o.proximoPaso ? <div className="contra" style={{ marginTop: 6 }}>Próximo paso: {o.proximoPaso}</div> : null}
      {o.observaciones ? (
        <div className="contra" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{o.observaciones}</div>
      ) : null}

      {abierto === 'closer' ? (
        <form action={reasignarCloserAccion} style={{ marginTop: 14, borderTop: '1px solid var(--borde)', paddingTop: 14 }}
              onSubmit={() => setAbierto('no')}>
          <input type="hidden" name="oportunidadId" value={o.id} />
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--gris)' }}>
            No se borra ni se recrea nada: cambia la asignación y queda el histórico.
            El closer inicial no se pisa.
          </p>
          <div className="dos">
            <div className="campo">
              <label htmlFor={`rc-${o.id}`}>Nuevo closer</label>
              <select id={`rc-${o.id}`} name="closerId" defaultValue={o.closerId ?? ''}>
                <option value="">Sin asignar</option>
                {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor={`rm-${o.id}`}>Motivo</label>
              <input id={`rm-${o.id}`} name="motivo" placeholder="Reasignación manual" />
            </div>
          </div>
          <button type="submit">Guardar el cambio</button>
        </form>
      ) : null}

      {abierto === 'resultado' ? (
        <form action={cargarResultadoAccion} style={{ marginTop: 14, borderTop: '1px solid var(--borde)', paddingTop: 14 }}
              onSubmit={() => setAbierto('no')}>
          <input type="hidden" name="oportunidadId" value={o.id} />
          <div className="dos">
            <div className="campo">
              <label htmlFor={`e-${o.id}`}>Qué pasó con la reunión</label>
              <select id={`e-${o.id}`} name="estado" defaultValue={o.estado}>
                {ESTADOS.map((e) => <option key={e} value={e}>{NOMBRE_DE_ESTADO[e]}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor={`r-${o.id}`}>Qué pasó con la venta</label>
              <select id={`r-${o.id}`} name="resultado" value={resultado}
                      onChange={(ev) => setResultado(ev.target.value as typeof resultado)}>
                {RESULTADOS.map((r) => <option key={r} value={r}>{NOMBRE_DE_RESULTADO[r]}</option>)}
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input type="checkbox" name="huboOferta" defaultChecked={o.huboOferta} style={{ width: 'auto' }} />
            Se presentó la oferta
          </label>

          {pideImporte ? (
            <div className="dos">
              <div className="campo">
                <label htmlFor={`i-${o.id}`}>Importe {resultado === 'sena' ? 'de la seña' : 'de la venta'} *</label>
                <input id={`i-${o.id}`} name="importe" inputMode="decimal" required />
              </div>
              <div className="campo">
                <label htmlFor={`mo-${o.id}`}>Moneda</label>
                <select id={`mo-${o.id}`} name="moneda" defaultValue={o.moneda}>
                  <option>USD</option><option>ARS</option><option>EUR</option>
                </select>
              </div>
              <div className="campo">
                <label htmlFor={`f-${o.id}`}>Fecha *</label>
                <input id={`f-${o.id}`} name="fecha" type="date" required />
              </div>
              {resultado === 'venta' ? (
                <div className="campo">
                  <label htmlFor={`pr-${o.id}`}>Programa</label>
                  <input id={`pr-${o.id}`} name="programa" />
                </div>
              ) : (
                <>
                  <div className="campo">
                    <label htmlFor={`sp-${o.id}`}>Saldo pendiente</label>
                    <input id={`sp-${o.id}`} name="saldoPendiente" inputMode="decimal" />
                  </div>
                  <div className="campo">
                    <label htmlFor={`fc-${o.id}`}>Fecha comprometida de pago</label>
                    <input id={`fc-${o.id}`} name="fechaComprometida" type="date" />
                  </div>
                </>
              )}
            </div>
          ) : null}

          {resultado === 'perdida' ? (
            <div className="campo">
              <label htmlFor={`mp-${o.id}`}>Por qué se perdió *</label>
              <select id={`mp-${o.id}`} name="motivoPerdida" defaultValue={o.motivoPerdida ?? ''} required>
                <option value="">Elegí uno</option>
                {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{NOMBRE_DE_MOTIVO[m]}</option>)}
              </select>
            </div>
          ) : null}

          <div className="dos">
            <div className="campo">
              <label htmlFor={`pc-${o.id}`}>Próximo contacto</label>
              <input id={`pc-${o.id}`} name="proximoContacto" type="date" defaultValue={o.proximoContacto ?? ''} />
            </div>
            <div className="campo">
              <label htmlFor={`pp-${o.id}`}>Próximo paso</label>
              <input id={`pp-${o.id}`} name="proximoPaso" defaultValue={o.proximoPaso ?? ''} />
            </div>
          </div>

          <div className="campo">
            <label htmlFor={`ob-${o.id}`}>Observaciones</label>
            <textarea id={`ob-${o.id}`} name="observaciones" defaultValue={o.observaciones ?? ''} />
          </div>

          <button type="submit">Guardar resultado</button>
        </form>
      ) : null}
    </section>
  )
}

/**
 * La seña, explicada según en qué estado está.
 *
 * Es lo que más se malinterpreta de todo el tablero, así que el cartel dice en
 * cada caso qué cuenta y qué no. Una seña convertida ya no «sigue abierta», y
 * su plata sí entró al cash: repetir el texto de la abierta sería mentir.
 */
function AvisoDeSena({ sena }: { sena: NonNullable<OportunidadDelLead['sena']> }) {
  const explicacion: Record<string, string> = {
    abierta: 'No cuenta como venta ni entra al cash cobrado. Sigue abierta hasta convertirse o perderse.',
    convertida: `Se convirtió en venta. Sus ${plata(sena.importe, sena.moneda)} se cuentan como el primer pago de esa venta, una sola vez.`,
    perdida: 'La oportunidad se perdió después de la seña.',
    vencida: 'Pasó la fecha comprometida de pago y todavía no se convirtió.',
  }

  return (
    <div className="aviso" style={{ marginTop: 12, background: 'var(--sena-suave)', borderColor: '#e2d8c0' }}>
      <strong>Seña · {plata(sena.importe, sena.moneda)}</strong> el {fechaCorta(sena.fecha)}
      {sena.estado === 'abierta' && sena.saldo !== null ? ` · saldo ${plata(sena.saldo, sena.moneda)}` : ''}
      {sena.estado === 'abierta' && sena.comprometida
        ? ` · se comprometió a pagar el ${fechaCorta(sena.comprometida)}` : ''}
      <div style={{ fontSize: 13, marginTop: 4 }}>
        {explicacion[sena.estado] ?? sena.estado}
      </div>
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div>
      <div className="etiqueta">{etiqueta}</div>
      <div style={{ fontSize: 14 }}>{valor ?? <span className="sindato">sin cargar</span>}</div>
    </div>
  )
}
