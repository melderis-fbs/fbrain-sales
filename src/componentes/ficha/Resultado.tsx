'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Lead } from '@/datos/leads'
import type { CloserOpcion } from '@/datos/catalogos'
import { Tarjeta, plata, fechaCorta } from '../Piezas'
import {
  ESTADOS, SALIDAS, MOTIVOS_PERDIDA, PROGRAMAS, MEDIOS_DE_PAGO, MAXIMO_DE_CUOTAS,
  NOMBRE_DE_ESTADO, NOMBRE_DE_SALIDA, NOMBRE_DE_MOTIVO, NOMBRE_DE_MEDIO,
  salidaDe, nombreDeCuota,
  type Estado, type Salida,
} from '@/dominio/resultados'
import {
  cargarResultadoAccion, reasignarCloserAccion, reflotarLeadAccion, registrarPagoAccion,
} from '@/app/(app)/leads/acciones'

/**
 * Lo que carga el closer el día de la reunión.
 *
 * Tres preguntas siempre, y una sola más: qué pasó con la reunión, qué pasó con
 * la venta, si se llegó a mostrar la oferta — y después el bloque del resultado
 * que se eligió, sin los otros cuatro alrededor.
 *
 * Mostrarlos todos a la vez era lo que hacía que la pantalla se leyera como un
 * formulario de AFIP: quien carga un lead perdido veía importe, fecha de venta,
 * programa, saldo de seña y fecha comprometida, y tenía que adivinar cuáles
 * eran suyos. Lo que hay que adivinar se completa mal, y un dato mal cargado
 * vale menos que ninguno porque se cuenta igual.
 */
function Guardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar el resultado'}
    </button>
  )
}

/** Una moneda es una moneda. Repetirla en tres lugares es repetir el error. */
function Moneda({ valor }: { valor: string }) {
  return (
    <select id="moneda" name="moneda" defaultValue={valor} style={{ width: 88 }}>
      <option value="USD">USD</option><option value="ARS">ARS</option><option value="EUR">EUR</option>
    </select>
  )
}

export function Resultado({
  lead, closers, hoy, verPlata, puedeReasignar,
}: {
  lead: Lead
  closers: CloserOpcion[]
  hoy: string
  verPlata: boolean
  puedeReasignar: boolean
}) {
  const cerrado = lead.resultado === 'perdida' || lead.resultado === 'no_calificado'
  const [salida, setSalida] = useState<Salida>(salidaDe(lead.resultado, lead.seguimientoLargo !== null))
  // Las cuotas dibujan el plan de pagos: una fila por cuota, con su fecha. Sin
  // eso, «3 cuotas» es una nota al pie que no se puede cobrar ni contar.
  const [cuotas, setCuotas] = useState(lead.venta?.cuotas ?? 1)

  return (
    <div className="rejilla g2">
      <Tarjeta titulo="Cargar el resultado">
        <form action={cargarResultadoAccion}>
          <input type="hidden" name="leadId" value={lead.id} />

          <div className="dos">
            <div className="campo">
              <label htmlFor="estado">¿Asistió?</label>
              <select id="estado" name="estado" defaultValue={lead.estado}>
                {ESTADOS.map((e) => <option key={e} value={e}>{NOMBRE_DE_ESTADO[e]}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="salida">Resultado</label>
              <select id="salida" name="salida" value={salida}
                      onChange={(e) => setSalida(e.target.value as Salida)}>
                {SALIDAS.map((s) => <option key={s} value={s}>{NOMBRE_DE_SALIDA[s]}</option>)}
              </select>
            </div>
          </div>

          <div className="campo">
            <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <input type="checkbox" name="huboOferta" defaultChecked={lead.huboOferta} />
              <span>Se presentó la oferta</span>
            </label>
            <div className="nota">Es el denominador del cierre sobre oferta. Sin esto, no se puede saber
              si se pierde antes o después de mostrar el precio.</div>
          </div>

          {salida === 'venta' ? (
            <>
              <div className="separador" />
              <h3>La venta</h3>
              <div className="dos">
                <div className="campo">
                  <label htmlFor="importe">Monto</label>
                  <div className="fila" style={{ flexWrap: 'nowrap' }}>
                    <Moneda valor={lead.venta?.moneda ?? lead.moneda} />
                    <input id="importe" name="importe" inputMode="decimal" required
                           defaultValue={lead.venta?.importe ?? ''} placeholder="0" />
                  </div>
                </div>
                <div className="campo">
                  <label htmlFor="fecha">Fecha de la venta</label>
                  <input id="fecha" name="fecha" type="date" required
                         defaultValue={lead.venta?.fecha ?? hoy} />
                  <div className="nota">La venta se cuenta este día, no el de la llamada.</div>
                </div>
                <div className="campo">
                  <label htmlFor="programa">Programa</label>
                  <select id="programa" name="programa" defaultValue={lead.venta?.programa ?? ''}>
                    <option value="">Sin definir</option>
                    {PROGRAMAS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="cuotas">Cuotas</label>
                  <select id="cuotas" name="cuotas" value={cuotas}
                          onChange={(e) => setCuotas(Number(e.target.value))}>
                    {Array.from({ length: MAXIMO_DE_CUOTAS }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n === 1 ? 'Un pago' : `${n} cuotas`}</option>
                    ))}
                  </select>
                </div>
              </div>

              {Array.from({ length: cuotas }, (_, i) => i + 1).map((n) => {
                const ya = lead.pagos.find((x) => x.nCuota === n)
                return (
                  <div key={n}>
                    <div className="separador" />
                    <div className="kicker" style={{ marginBottom: 8 }}>{nombreDeCuota(n)}</div>
                    <div className="dos">
                      <div className="campo">
                        <label htmlFor={`c${n}i`}>Monto</label>
                        <input id={`c${n}i`} name={`cuota${n}Importe`} inputMode="decimal"
                               defaultValue={ya?.importe ?? ''} placeholder="0" />
                      </div>
                      <div className="campo">
                        <label htmlFor={`c${n}f`}>Fecha</label>
                        <input id={`c${n}f`} name={`cuota${n}Fecha`} type="date"
                               defaultValue={ya?.fecha ?? (n === 1 ? (lead.venta?.fecha ?? hoy) : '')} />
                      </div>
                      <div className="campo">
                        <label htmlFor={`c${n}m`}>Método</label>
                        <select id={`c${n}m`} name={`cuota${n}Medio`} defaultValue={ya?.medio ?? ''}>
                          <option value="">— Elegir —</option>
                          {MEDIOS_DE_PAGO.map((x) => (
                            <option key={x} value={x}>{NOMBRE_DE_MEDIO[x]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="campo">
                        <label htmlFor={`c${n}p`}>¿Ya entró?</label>
                        <select id={`c${n}p`} name={`cuota${n}Pagado`}
                                defaultValue={ya?.estado === 'cobrado' ? 'si' : 'no'}>
                          <option value="no">No · todavía se espera</option>
                          <option value="si">Sí · ya se cobró</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="nota" style={{ marginTop: 8 }}>
                Sólo lo que dice <strong>«Sí · ya se cobró»</strong> suma al cash collected.
                Lo demás queda escrito con su fecha: es la cobranza que hay que ir a buscar,
                y no es plata hasta que entra.
                {lead.cobrado > 0
                  ? <> Cobrado hasta hoy: {plata(lead.cobrado, lead.venta?.moneda ?? lead.moneda)}.</>
                  : null}
              </div>
            </>
          ) : null}

          {salida === 'sena' ? (
            <>
              <div className="separador" />
              <h3>La seña</h3>
              <div className="dos">
                <div className="campo">
                  <label htmlFor="importe">Monto de la seña</label>
                  <div className="fila" style={{ flexWrap: 'nowrap' }}>
                    <Moneda valor={lead.sena?.moneda ?? lead.moneda} />
                    <input id="importe" name="importe" inputMode="decimal" required
                           defaultValue={lead.sena?.importe ?? ''} placeholder="0" />
                  </div>
                </div>
                <div className="campo">
                  <label htmlFor="fecha">Fecha de la seña</label>
                  <input id="fecha" name="fecha" type="date" required
                         defaultValue={lead.sena?.fecha ?? hoy} />
                </div>
                <div className="campo">
                  <label htmlFor="saldoPendiente">Saldo pendiente</label>
                  <input id="saldoPendiente" name="saldoPendiente" inputMode="decimal"
                         defaultValue={lead.sena?.saldo ?? ''} />
                </div>
                <div className="campo">
                  <label htmlFor="fechaComprometida">Fecha comprometida</label>
                  <input id="fechaComprometida" name="fechaComprometida" type="date"
                         defaultValue={lead.sena?.comprometida ?? ''} />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="proximoContacto">Próximo contacto</label>
                <input id="proximoContacto" name="proximoContacto" type="date"
                       defaultValue={lead.proximoContacto ?? ''} />
                <div className="nota">La seña <strong>no cierra</strong> el lead: queda abierto hasta
                  que se convierta en venta, y su plata no es facturación todavía.</div>
              </div>
            </>
          ) : null}

          {salida === 'segunda' ? (
            <>
              <div className="separador" />
              <h3>La segunda llamada</h3>
              <div className="dos">
                <div className="campo">
                  <label htmlFor="fechaSegunda">Fecha</label>
                  <input id="fechaSegunda" name="fechaSegunda" type="date" required />
                </div>
                <div className="campo">
                  <label htmlFor="horaSegunda">Hora</label>
                  <input id="horaSegunda" name="horaSegunda" type="time" />
                </div>
              </div>
              <div className="nota">La reunión de hoy queda cerrada con su fecha y el lead queda
                agendado para la segunda. No entra al pipeline de toques: ya tiene reunión, y
                perseguir a alguien que tiene reunión es ruido. En el tablero las segundas se
                cuentan aparte de las agendas.</div>
            </>
          ) : null}

          {salida === 'seguimiento_largo' ? (
            <>
              <div className="separador" />
              <h3>El seguimiento largo</h3>
              <div className="campo">
                <label htmlFor="volverEl">Fecha del próximo seguimiento</label>
                <input id="volverEl" name="volverEl" type="date" required
                       defaultValue={lead.seguimientoLargo ?? ''} />
                <div className="nota">Sale de la cadencia y vuelve a aparecer ese día. Es para el que
                  pidió que lo llamen después del cierre de su trimestre: meterlo igual en los doce
                  toques llena el pipeline de tarjetas que nadie va a tocar.</div>
              </div>
            </>
          ) : null}

          {salida === 'seguimiento_cadencia' ? (
            <>
              <div className="separador" />
              <h3>El seguimiento</h3>
              <div className="nota">Entra al pipeline de 12 toques y aparece en Seguimientos el día
                que toca cada uno. Si lo que pidió fue que lo llamen en una fecha puntual, es
                «Seguimiento largo» y no esto.</div>
            </>
          ) : null}

          {salida === 'perdida' ? (
            <>
              <div className="separador" />
              <h3>Por qué se perdió</h3>
              <div className="campo">
                <label htmlFor="motivoPerdida">Motivo</label>
                <select id="motivoPerdida" name="motivoPerdida" required
                        defaultValue={lead.motivoPerdida ?? ''}>
                  <option value="" disabled>Elegí uno</option>
                  {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{NOMBRE_DE_MOTIVO[m]}</option>)}
                </select>
                <div className="nota">Lista cerrada a propósito: «no le interesó» escrito de nueve
                  maneras no se puede contar, y contar por qué se pierde es de lo poco que cambia
                  decisiones.</div>
              </div>
            </>
          ) : null}

          {salida === 'no_calificado' ? (
            <>
              <div className="separador" />
              <div className="nota">No calificado no es lo mismo que perdido: no llegó a ser una
                oportunidad. Queda fuera de la tasa de cierre y se cuenta aparte, que es lo que
                después dice si el problema está en el agendamiento.</div>
            </>
          ) : null}

          <div className="separador" />
          <div className="campo">
            <label htmlFor="proximoPaso">Pasos a seguir</label>
            <input id="proximoPaso" name="proximoPaso" defaultValue={lead.proximoPaso ?? ''}
                   placeholder="Mandar la propuesta, hablar con la socia, cobrar la cuota 2…" />
          </div>
          <div className="campo">
            <label htmlFor="observaciones">Observaciones</label>
            <textarea id="observaciones" name="observaciones" defaultValue={lead.observaciones ?? ''} />
          </div>

          <Guardar />
        </form>
      </Tarjeta>

      <div className="apilado">
        {cerrado ? (
          <Tarjeta titulo="Reflotar este lead"
                   ayuda="Se le suma un ciclo al mismo lead, no se crea otro. Queda registrado que la repesca la hiciste vos.">
            <form action={reflotarLeadAccion}>
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="dos">
                <div className="campo">
                  <label htmlFor="r-fecha">Nueva fecha de reunión</label>
                  <input id="r-fecha" name="fechaSesion" type="date" />
                </div>
                <div className="campo">
                  <label htmlFor="r-hora">Hora</label>
                  <input id="r-hora" name="horaSesion" type="time" />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="r-closer">Closer</label>
                <select id="r-closer" name="closerId" defaultValue={lead.closerId ?? ''}>
                  <option value="">Dejar el que tenía</option>
                  {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="r-motivo">Por qué se reflota</label>
                <input id="r-motivo" name="motivo" placeholder="Volvió a escribir, cambió su situación…" />
              </div>
              <button type="submit">Reflotar · pasa al ciclo {lead.ciclo + 1}</button>
            </form>
          </Tarjeta>
        ) : null}

        {puedeReasignar ? (
          <Tarjeta titulo="Cambiar el closer"
                   ayuda="No se borra ni se recrea nada: queda el histórico con quién lo cambió y por qué.">
            <form action={reasignarCloserAccion}>
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="campo">
                <label htmlFor="c-closer">Closer</label>
                <select id="c-closer" name="closerId" defaultValue={lead.closerId ?? ''}>
                  <option value="">Sin asignar</option>
                  {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="c-motivo">Motivo</label>
                <input id="c-motivo" name="motivo" placeholder="Por qué cambia" />
              </div>
              <button type="submit" className="secundario">Guardar el cambio</button>
            </form>
          </Tarjeta>
        ) : null}

        {verPlata && lead.venta ? (
          <Tarjeta titulo="Registrar un cobro"
                   ayuda="Esto —y no la venta— es el cash collected. Facturación y cash no son el mismo número.">
            <p className="ayuda" style={{ marginBottom: 10 }}>
              Vendido {plata(lead.venta.importe, lead.venta.moneda)} el {fechaCorta(lead.venta.fecha)}
              {lead.venta.programa ? ` · ${lead.venta.programa}` : ''}
              {lead.venta.cuotas ? ` · ${lead.venta.cuotas} cuotas` : ''} ·
              cobrado {plata(lead.cobrado, lead.venta.moneda)}.
            </p>
            <form action={registrarPagoAccion}>
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="dos">
                <div className="campo">
                  <label htmlFor="p-importe">Importe</label>
                  <input id="p-importe" name="importe" inputMode="decimal" required />
                </div>
                <div className="campo">
                  <label htmlFor="p-fecha">Fecha del cobro</label>
                  <input id="p-fecha" name="fecha" type="date" defaultValue={hoy} required />
                </div>
                <div className="campo">
                  <label htmlFor="p-moneda">Moneda</label>
                  <select id="p-moneda" name="moneda" defaultValue={lead.venta.moneda}>
                    <option value="USD">USD</option><option value="ARS">ARS</option><option value="EUR">EUR</option>
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="p-cuota">Nº de cuota</label>
                  <input id="p-cuota" name="nCuota" inputMode="numeric" />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="p-medio">Medio</label>
                <input id="p-medio" name="medio" placeholder="Transferencia, Stripe…" />
              </div>
              <button type="submit" className="secundario">Registrar el cobro</button>
            </form>
          </Tarjeta>
        ) : null}
      </div>
    </div>
  )
}
