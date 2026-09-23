'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useCampos } from './campos'
import { Iconos } from './Iconos'
import { reportarAccion } from '@/app/(app)/llamadas/acciones'
import {
  SALIDAS, MOTIVOS_PERDIDA, PROGRAMAS, MEDIOS_DE_PAGO, MAXIMO_DE_CUOTAS,
  NOMBRE_DE_SALIDA, NOMBRE_DE_MOTIVO, NOMBRE_DE_MEDIO, NOMBRE_DE_ESTADO,
  nombreDeCuota, salidaDe,
  type Estado, type Salida, type MotivoPerdida, type Color,
} from '@/dominio/resultados'
import {
  PIDE_DE_SALIDA, pasosQueAplican, textoParaSlack, NOMBRE_DE_PASO, AYUDA_DE_PASO,
} from '@/dominio/reporte'

/**
 * El reporte de una llamada, en una sola pantalla.
 *
 * El closer sale de una reunión y tiene otra en diez minutos. Hasta acá,
 * reportar bien esa llamada eran tres viajes: el resultado en una pestaña de
 * la ficha, la nota en otra y la transcripción en una tercera pantalla. En la
 * práctica se hacía el primero, y el tablero quedaba con el resultado cargado
 * y sin una línea de qué pasó.
 *
 * Acá son cinco preguntas en el orden en que pasaron las cosas y un solo
 * botón de guardar. Y cada pregunta depende de la anterior: al que no vino no
 * se le pregunta si mostró el precio, y al que se perdió no se le pide el
 * importe. Un campo que no aplica no se deja vacío: se completa con cualquier
 * cosa para poder seguir, y eso ensucia el número.
 */

type LeadParaReportar = {
  id: number
  nombre: string
  empresa: string | null
  closer: string | null
  moneda: string
  fechaSesion: string | null
  estado: Estado
  resultado: import('@/dominio/resultados').Resultado
  huboOferta: boolean
  seguimientoLargo: string | null
  motivoPerdida: MotivoPerdida | null
  venta: { importe: number; fecha: string; programa: string | null; cuotas: number | null } | null
  /** Lo que ya está cargado del plan de pagos, para abrir mostrándolo. */
  plan: { n: number; importe: number; fecha: string; medio: string | null; pagado: boolean }[]
}

/** Cómo se ve cada resultado en la botonera. El color ya es el del resultado. */
const ICONO_DE_SALIDA: Record<Salida, keyof typeof Iconos> = {
  pendiente: 'metricas', venta: 'casos', sena: 'comisiones', segunda: 'agenda',
  seguimiento_largo: 'seguimientos', seguimiento_cadencia: 'seguimientos',
  perdida: 'metricas', no_calificado: 'metricas',
}

const COLOR_DE_SALIDA: Record<Salida, Color> = {
  pendiente: 'gris', venta: 'verde', sena: 'acento', segunda: 'acento',
  seguimiento_largo: 'ambar', seguimiento_cadencia: 'ambar',
  perdida: 'rojo', no_calificado: 'gris',
}

/** Las que el closer elige al reportar. «Todavía no se sabe» no es un reporte. */
const ELEGIBLES = SALIDAS.filter((s) => s !== 'pendiente')

/** Vino, no vino, o la reunión ni siquiera pasó. */
const ASISTENCIAS: { clave: Estado; color: Color; icono: keyof typeof Iconos }[] = [
  { clave: 'asistio', color: 'verde', icono: 'casos' },
  { clave: 'no_show', color: 'rojo', icono: 'tracker' },
  { clave: 'cancelado', color: 'gris', icono: 'metricas' },
  { clave: 'reagendado', color: 'ambar', icono: 'agenda' },
]

function Guardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar el reporte'}
    </button>
  )
}

function Paso({ n, paso, children }: {
  n: number; paso: keyof typeof NOMBRE_DE_PASO; children: React.ReactNode
}) {
  return (
    <section className="paso">
      <div className="orden">{n}</div>
      <div style={{ minWidth: 0 }}>
        <div className="cabeza">
          <strong>{NOMBRE_DE_PASO[paso]}</strong>
          <span>{AYUDA_DE_PASO[paso]}</span>
        </div>
        {children}
      </div>
    </section>
  )
}

export function Reportar({ lead, hoy, compacto }: {
  lead: LeadParaReportar; hoy: string; compacto?: boolean
}) {
  const hoja = useRef<HTMLDialogElement>(null)
  const [guardado, accion] = useActionState(reportarAccion, null)
  const [estado, setEstado] = useState<Estado>(
    lead.estado === 'agendado' ? 'asistio' : lead.estado)
  const [salida, setSalida] = useState<Salida>(
    lead.resultado === 'pendiente' ? 'venta' : salidaDe(lead.resultado, lead.seguimientoLargo !== null))
  const [huboOferta, setHuboOferta] = useState(lead.huboOferta)
  const [copiado, setCopiado] = useState(false)

  // Todos los campos del lado de React: si el guardado falla —una venta sin
  // importe, una transcripción corta— React limpia el formulario, y perder
  // una transcripción recién pegada por un error en otro campo es la clase de
  // cosa que hace que no se vuelva a intentar.
  const iniciales: Record<string, string> = {
    importe: lead.venta?.importe ? String(lead.venta.importe) : '',
    fecha: lead.venta?.fecha ?? hoy,
    programa: lead.venta?.programa ?? '',
    cuotas: String(lead.venta?.cuotas ?? 1),
    saldoPendiente: '',
    fechaComprometida: '',
    fechaSegunda: '',
    horaSegunda: '',
    volverEl: lead.seguimientoLargo ?? '',
    motivoPerdida: lead.motivoPerdida ?? '',
    proximoPaso: '',
    notas: '',
    transcripcion: '',
  }
  for (let n = 1; n <= MAXIMO_DE_CUOTAS; n++) {
    const ya = lead.plan.find((c) => c.n === n)
    iniciales[`cuota${n}Importe`] = ya ? String(ya.importe) : ''
    iniciales[`cuota${n}Fecha`] = ya?.fecha ?? ''
    iniciales[`cuota${n}Medio`] = ya?.medio ?? ''
    iniciales[`cuota${n}Pagado`] = ya?.pagado ? 'si' : 'no'
  }
  const { campo, valores, form } = useCampos(iniciales, guardado, `r${lead.id}`)

  const pasos = pasosQueAplican(estado, salida)
  const pide = estado === 'asistio' ? PIDE_DE_SALIDA[salida] : null
  const cuantasCuotas = Math.min(Math.max(Number(valores.cuotas) || 1, 1), MAXIMO_DE_CUOTAS)

  const paraSlack = textoParaSlack({
    lead: lead.nombre, empresa: lead.empresa, closer: lead.closer,
    fecha: lead.fechaSesion ?? hoy,
    estado, salida, huboOferta,
    importe: pide === 'venta' || pide === 'sena' ? Number(valores.importe) || null : null,
    moneda: lead.moneda,
    motivoPerdida: pide === 'motivo' ? (valores.motivoPerdida || null) as MotivoPerdida | null : null,
    proximoPaso: valores.proximoPaso || null,
    notas: valores.notas || null,
  })

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(paraSlack)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch { /* sin portapapeles se selecciona a mano, que para eso está a la vista */ }
  }

  return (
    <>
      <button type="button" className={compacto ? 'secundario chico' : ''}
              onClick={() => hoja.current?.showModal()}>
        Reportar
      </button>

      <dialog ref={hoja} className="hoja" aria-label={`Reportar la llamada de ${lead.nombre}`}>
        <div className="hoja-cabeza">
          <div style={{ minWidth: 0 }}>
            <strong>{lead.nombre}</strong>
            <div className="meta">
              {[lead.empresa, lead.closer, lead.fechaSesion].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" className="sutil" aria-label="Cerrar"
                  onClick={() => hoja.current?.close()}>✕</button>
        </div>

        <form action={accion} ref={form} className="hoja-cuerpo">
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="moneda" value={lead.moneda} />
          <input type="hidden" name="fechaLlamada" value={lead.fechaSesion ?? hoy} />
          <input type="hidden" name="estado" value={estado} />

          {guardado ? (
            <div className={guardado.ok ? 'aviso dato' : 'aviso problema'}>{guardado.mensaje}</div>
          ) : null}

          {/* ── 1 · Asistencia ─────────────────────────────────────────── */}
          <Paso n={1} paso="asistencia">
            <div className="botonera">
              {ASISTENCIAS.map((a) => (
                <button key={a.clave} type="button"
                        className={`accion ${a.color} ${estado === a.clave ? 'elegida' : ''}`}
                        aria-pressed={estado === a.clave}
                        onClick={() => setEstado(a.clave)}>
                  {(() => { const I = Iconos[a.icono]; return <I /> })()}
                  <span>{NOMBRE_DE_ESTADO[a.clave]}</span>
                </button>
              ))}
            </div>
          </Paso>

          {/* ── 2 · Oferta ─────────────────────────────────────────────── */}
          {pasos.includes('oferta') ? (
            <Paso n={2} paso="oferta">
              <input type="hidden" name="huboOferta" value={huboOferta ? 'on' : 'no'} />
              <div className="fila">
                <button type="button" className={`pastilla ${huboOferta ? 'elegida' : ''}`}
                        aria-pressed={huboOferta} onClick={() => setHuboOferta(true)}>
                  Sí, se presentó
                </button>
                <button type="button" className={`pastilla ${huboOferta ? '' : 'elegida'}`}
                        aria-pressed={!huboOferta} onClick={() => setHuboOferta(false)}>
                  No se llegó
                </button>
              </div>
              <div className="nota">
                Es el denominador del cierre sobre oferta: sin esto no se sabe si se pierde
                antes o después de mostrar el precio.
              </div>
            </Paso>
          ) : null}

          {/* ── 3 · Resultado ──────────────────────────────────────────── */}
          {pasos.includes('resultado') ? (
            <Paso n={3} paso="resultado">
              <input type="hidden" name="salida" value={salida} />
              <div className="botonera">
                {ELEGIBLES.map((s) => (
                  <button key={s} type="button"
                          className={`accion ${COLOR_DE_SALIDA[s]} ${salida === s ? 'elegida' : ''}`}
                          aria-pressed={salida === s}
                          onClick={() => setSalida(s)}>
                    {(() => { const I = Iconos[ICONO_DE_SALIDA[s]]; return <I /> })()}
                    <span>{NOMBRE_DE_SALIDA[s]}</span>
                  </button>
                ))}
              </div>

              {pide === 'venta' || pide === 'sena' ? (
                <div className="dos" style={{ marginTop: 12 }}>
                  <div className="campo">
                    <label htmlFor={`r${lead.id}-importe`}>
                      {pide === 'venta' ? 'Monto de la venta' : 'Monto de la seña'} ({lead.moneda})
                    </label>
                    <input {...campo('importe')} inputMode="decimal" required placeholder="0" />
                  </div>
                  <div className="campo">
                    <label htmlFor={`r${lead.id}-fecha`}>
                      {pide === 'venta' ? 'Fecha de la venta' : 'Fecha de la seña'}
                    </label>
                    <input {...campo('fecha')} type="date" required />
                    {pide === 'venta'
                      ? <div className="nota">La venta se cuenta este día, no el de la llamada.</div>
                      : null}
                  </div>
                </div>
              ) : null}

              {pide === 'venta' ? (
                <>
                  <div className="dos">
                    <div className="campo">
                      <label htmlFor={`r${lead.id}-programa`}>Programa</label>
                      <select {...campo('programa')}>
                        <option value="">Sin definir</option>
                        {PROGRAMAS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>
                    <div className="campo">
                      <label htmlFor={`r${lead.id}-cuotas`}>Cuotas</label>
                      <select {...campo('cuotas')}>
                        {Array.from({ length: MAXIMO_DE_CUOTAS }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{n === 1 ? 'Un pago' : `${n} cuotas`}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {Array.from({ length: cuantasCuotas }, (_, i) => i + 1).map((n) => (
                    <div key={n} className="cuota">
                      <div className="kicker">{nombreDeCuota(n)}</div>
                      <div className="dos">
                        <div className="campo">
                          <label htmlFor={`r${lead.id}-cuota${n}Importe`}>Monto</label>
                          <input {...campo(`cuota${n}Importe`)} inputMode="decimal" placeholder="0" />
                        </div>
                        <div className="campo">
                          <label htmlFor={`r${lead.id}-cuota${n}Fecha`}>Fecha</label>
                          <input {...campo(`cuota${n}Fecha`)} type="date" />
                        </div>
                        <div className="campo">
                          <label htmlFor={`r${lead.id}-cuota${n}Medio`}>Método</label>
                          <select {...campo(`cuota${n}Medio`)}>
                            <option value="">— Elegir —</option>
                            {MEDIOS_DE_PAGO.map((x) => (
                              <option key={x} value={x}>{NOMBRE_DE_MEDIO[x]}</option>
                            ))}
                          </select>
                        </div>
                        <div className="campo">
                          <label htmlFor={`r${lead.id}-cuota${n}Pagado`}>¿Ya entró?</label>
                          <select {...campo(`cuota${n}Pagado`)}>
                            <option value="no">No · todavía se espera</option>
                            <option value="si">Sí · ya se cobró</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="nota">
                    Sólo lo que dice <strong>«Sí · ya se cobró»</strong> suma al cash collected.
                    Lo demás queda escrito con su fecha: es la cobranza que hay que ir a buscar.
                  </div>
                </>
              ) : null}

              {pide === 'sena' ? (
                <div className="dos">
                  <div className="campo">
                    <label htmlFor={`r${lead.id}-saldoPendiente`}>Saldo pendiente</label>
                    <input {...campo('saldoPendiente')} inputMode="decimal" />
                  </div>
                  <div className="campo">
                    <label htmlFor={`r${lead.id}-fechaComprometida`}>Fecha comprometida</label>
                    <input {...campo('fechaComprometida')} type="date" />
                  </div>
                </div>
              ) : null}

              {pide === 'segunda' ? (
                <div className="dos" style={{ marginTop: 12 }}>
                  <div className="campo">
                    <label htmlFor={`r${lead.id}-fechaSegunda`}>¿Cuándo es la segunda?</label>
                    <input {...campo('fechaSegunda')} type="date" required />
                  </div>
                  <div className="campo">
                    <label htmlFor={`r${lead.id}-horaSegunda`}>Hora</label>
                    <input {...campo('horaSegunda')} type="time" />
                  </div>
                </div>
              ) : null}

              {pide === 'volverEl' ? (
                <div className="campo" style={{ marginTop: 12 }}>
                  <label htmlFor={`r${lead.id}-volverEl`}>¿Cuándo se lo vuelve a llamar?</label>
                  <input {...campo('volverEl')} type="date" required />
                  <div className="nota">
                    Sale de la cadencia y vuelve a aparecer ese día. Es para el que pidió que lo
                    llamen después del cierre de su trimestre.
                  </div>
                </div>
              ) : null}

              {pide === 'motivo' ? (
                <div className="campo" style={{ marginTop: 12 }}>
                  <label htmlFor={`r${lead.id}-motivoPerdida`}>¿Por qué se perdió?</label>
                  <select {...campo('motivoPerdida')} required>
                    <option value="" disabled>Elegí el motivo</option>
                    {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{NOMBRE_DE_MOTIVO[m]}</option>)}
                  </select>
                  <div className="nota">
                    Lista cerrada a propósito: «no le interesó» escrito de nueve maneras no se
                    puede contar, y contar por qué se pierde es de lo poco que cambia decisiones.
                  </div>
                </div>
              ) : null}

              {salida === 'seguimiento_cadencia' ? (
                <div className="nota" style={{ marginTop: 12 }}>
                  Entra al pipeline de 12 toques y aparece en Seguimientos el día que toca cada
                  uno. Si lo que pidió fue que lo llamen en una fecha puntual, es
                  «Seguimiento largo» y no esto.
                </div>
              ) : null}

              <div className="campo" style={{ marginTop: 12 }}>
                <label htmlFor={`r${lead.id}-proximoPaso`}>Próximo paso</label>
                <input {...campo('proximoPaso')}
                       placeholder="Mandar la propuesta, hablar con la socia, cobrar la cuota 2…" />
              </div>
            </Paso>
          ) : null}

          {/* ── 4 · Notas ──────────────────────────────────────────────── */}
          <Paso n={pasos.indexOf('notas') + 1} paso="notas">
            <div className="campo">
              <label htmlFor={`r${lead.id}-notas`}>Qué contarle al equipo</label>
              <textarea {...campo('notas')} style={{ minHeight: 80 }}
                        placeholder="Lo que no se ve en los campos: qué objetó, con quién tiene que hablar, qué prometiste." />
            </div>
            <div className="slack">
              <div className="entre" style={{ marginBottom: 6 }}>
                <span className="etiqueta">Así sale al canal</span>
                <button type="button" className="sutil" style={{ fontSize: 11.5 }} onClick={copiar}>
                  {copiado ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
              <pre>{paraSlack}</pre>
            </div>
            <div className="nota">
              La cabecera la arma el sistema para que los tres reporten igual y el canal se
              pueda leer de corrido. Lo de abajo es lo único que el sistema no sabe.
            </div>
          </Paso>

          {/* ── 5 · Transcripción ──────────────────────────────────────── */}
          {pasos.includes('transcripcion') ? (
            <Paso n={pasos.indexOf('transcripcion') + 1} paso="transcripcion">
              <div className="campo">
                <label htmlFor={`r${lead.id}-transcripcion`}>Pegá la transcripción</label>
                <textarea {...campo('transcripcion')} style={{ minHeight: 120 }}
                          placeholder={'Braian: Hola, ¿cómo estás?\nMaría: Bien, acá andamos…'} />
                <div className="nota">
                  Sale de Meet o de Zoom. Se puede dejar vacío y subirla después desde el
                  Analizador: lo que no se puede es analizar la llamada sin ella.
                </div>
              </div>
            </Paso>
          ) : null}

          <div className="hoja-pie">
            <Guardar />
            <button type="button" className="sutil" onClick={() => hoja.current?.close()}>
              {guardado?.ok ? 'Cerrar' : 'Cancelar'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
