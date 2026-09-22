import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { verLlamada, transcripcionDe } from '@/datos/llamadas'
import { puedeVerLead } from '@/datos/leads'
import { verAnalisis } from '@/datos/analisis'
import { fila } from '@/lib/db'
import { Tarjeta, Encabezado, Pildora, Vacio, fechaCorta } from '@/componentes/Piezas'
import { SubirTranscripcion, Analizar } from '@/componentes/SubirTranscripcion'
import { SinClave } from '@/componentes/SinClave'
import { comoSeLee } from '@/dominio/rubrica'
import { NOMBRE_DE_TIPO } from '@/dominio/resultados'

/**
 * Una llamada y su análisis.
 *
 * Todo lo que el análisis afirma viene con la frase de la transcripción que lo
 * sostiene. Es la diferencia entre un informe que se puede discutir con el
 * closer y uno que hay que creerle: cuando el modelo dice que no profundizó el
 * dolor, abajo está la frase donde pasó de largo.
 */
export default async function Llamada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const llamadaId = Number(id)
  if (!Number.isInteger(llamadaId)) notFound()

  const usuario = await exigirUsuario()
  const llamada = await verLlamada(llamadaId)
  if (!llamada) notFound()
  if (!(await puedeVerLead(llamada.leadId, alcanceDe(usuario)))) notFound()

  const [transcripcion, analisis] = await Promise.all([
    transcripcionDe(llamadaId),
    llamada.analisisId ? verAnalisis(llamada.analisisId) : Promise.resolve(null),
  ])

  // Las dimensiones que el modelo no pudo ubicar. No cuentan como cero: salen
  // del promedio, y la pantalla lo dice para que la nota se pueda leer bien.
  const sinEvidencia = analisis?.niveles.filter((n) => n.sinEvidencia).length ?? 0

  const costo = await fila<{ total: number }>(
    `select coalesce(sum(costo_usd), 0) as total from llamadas_modelo where lead_id = $1`,
    [llamada.leadId],
  )

  return (
    <div className="apilado">
      <Encabezado kicker={`Llamada ${llamada.numero} · ${NOMBRE_DE_TIPO[llamada.tipoSesion]}`}
                  titulo={llamada.lead}
                  bajada={`${fechaCorta(llamada.fecha)} · ${llamada.closer ?? 'sin closer'}` +
                          (llamada.duracionSeg ? ` · ${Math.round(llamada.duracionSeg / 60)} min` : '')}>
        <Link className="boton secundario" href={`/llamadas/${llamada.leadId}`}>Ir a la llamada</Link>
        <Link className="boton secundario" href={`/leads/${llamada.leadId}`}>Ver la ficha</Link>
      </Encabezado>

      {!transcripcion ? (
        <div style={{ maxWidth: 780 }}>
          <Tarjeta titulo="Cargar la transcripción"
                   ayuda="Así entra hoy: la reunión se graba en Meet, la transcripción se copia y se pega.">
            <SubirTranscripcion llamadaId={llamadaId} />
          </Tarjeta>
        </div>
      ) : (
        <>
          <SinClave />

          <div className="entre">
            <p className="ayuda">
              Transcripción de {transcripcion.caracteres.toLocaleString('es-AR')} caracteres,
              cargada el {fechaCorta(transcripcion.creadoEn)}.
              {costo && costo.total > 0
                ? ` Lo que se gastó en modelo con este lead: USD ${costo.total.toFixed(3)}.`
                : ''}
            </p>
            <Analizar llamadaId={llamadaId} rehacer={analisis !== null} />
          </div>

          {analisis?.estado === 'error' ? (
            <div className="aviso problema">
              El análisis falló: {analisis.error}. Se puede volver a intentar sin cargar la
              transcripción de nuevo.
            </div>
          ) : null}

          {analisis && analisis.score !== null ? (
            <>
              <div className="rejilla g2">
                <Tarjeta titulo="La nota">
                  <div className="entre">
                    <div>
                      <div className="escala">{analisis.score.toFixed(1)}</div>
                      <div className="contra">{comoSeLee(analisis.score)}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--gris)' }}>
                      <div>Base ponderada: <strong style={{ color: 'var(--negro)' }}>{analisis.base?.toFixed(1)}</strong></div>
                      {analisis.penalizacion !== 0 ? <div>Penalizaciones: {analisis.penalizacion.toFixed(1)}</div> : null}
                      {analisis.bonificacion !== 0 ? <div>Bonificaciones: +{analisis.bonificacion.toFixed(1)}</div> : null}
                      {analisis.topeAplicado !== null ? (
                        <div style={{ color: 'var(--rojo)' }}>Tope aplicado: {analisis.topeAplicado.toFixed(1)}</div>
                      ) : null}
                      <div style={{ marginTop: 4 }}>modelo de scoring {analisis.version ?? '—'}</div>
                    </div>
                  </div>

                  {analisis.topeAplicado !== null ? (
                    <div className="aviso atencion" style={{ marginTop: 10, marginBottom: 0 }}>
                      La nota quedó con techo porque un fundamento quedó por debajo del mínimo.
                      Sin descubrimiento no se puede saber si lo que se vendió servía, y ningún
                      cierre brillante lo compensa.
                    </div>
                  ) : null}

                  {sinEvidencia > 0 ? (
                    <p className="ayuda" style={{ marginTop: 10 }}>
                      {sinEvidencia}{' '}
                      {sinEvidencia === 1 ? 'dimensión quedó' : 'dimensiones quedaron'}{' '}
                      sin evidencia y no cuentan como cero: salen del promedio. Cero diría que se
                      hizo mal; lo que pasa es que en la transcripción no se puede saber.
                    </p>
                  ) : null}
                </Tarjeta>

                <Tarjeta titulo="Cuánto habló cada uno"
                         ayuda="Se cuenta en código, no se le pregunta al modelo: contar palabras es aritmética.">
                  <div className="rejilla g3">
                    <div>
                      <div className="etiqueta">Turnos del closer</div>
                      <div className="numero chico">{analisis.turnosCloser ?? '—'}</div>
                    </div>
                    <div>
                      <div className="etiqueta">Palabras del closer</div>
                      <div className="numero chico">{(analisis.palabrasCloser ?? 0).toLocaleString('es-AR')}</div>
                    </div>
                    <div>
                      <div className="etiqueta">Palabras del prospecto</div>
                      <div className="numero chico">{(analisis.palabrasProspecto ?? 0).toLocaleString('es-AR')}</div>
                    </div>
                  </div>
                  {(analisis.palabrasCloser ?? 0) > (analisis.palabrasProspecto ?? 0) * 1.5 ? (
                    <p className="ayuda" style={{ marginTop: 10 }}>
                      El closer habló bastante más que el prospecto. En una venta consultiva eso
                      suele querer decir que se presentó antes de preguntar.
                    </p>
                  ) : null}
                </Tarjeta>
              </div>

              <Tarjeta titulo="Dimensión por dimensión"
                       ayuda="Cada nivel con la frase que lo sostiene. Sin cita, el nivel no entra al cálculo.">
                <div className="apilado" style={{ gap: 14 }}>
                  {analisis.niveles.map((n) => (
                    <div key={n.dimension}>
                      <div className="entre">
                        <strong style={{ fontSize: 13.5 }}>{n.nombre}</strong>
                        <span style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                          {n.sinEvidencia
                            ? <span className="sindato">sin evidencia</span>
                            : <>nivel {n.nivel} · nota {n.nota?.toFixed(1)} · pesa {n.peso}</>}
                        </span>
                      </div>
                      <div className="nivel">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <i key={i} className={!n.sinEvidencia && n.nivel !== null && i <= n.nivel ? 'lleno' : ''} />
                        ))}
                      </div>
                      {n.justificacion ? (
                        <p style={{ margin: '6px 0 0', fontSize: 13 }}>{n.justificacion}</p>
                      ) : null}
                      {n.cita ? <p className="cita">«{n.cita}»</p> : null}
                    </div>
                  ))}
                </div>
              </Tarjeta>

              {analisis.eventos.length > 0 ? (
                <Tarjeta titulo="Qué pasó, con su cita"
                         ayuda="Vocabulario cerrado y cita obligatoria: sin la frase que lo demuestra, el evento no suma ni resta.">
                  <div className="apilado" style={{ gap: 10 }}>
                    {analisis.eventos.map((e, i) => (
                      <div key={i}>
                        <div className="fila">
                          <Pildora color={e.valor < 0 ? 'rojo' : 'verde'}>
                            {e.valor > 0 ? '+' : ''}{e.valor.toFixed(1)}
                          </Pildora>
                          <strong style={{ fontSize: 13.5 }}>{e.nombre}</strong>
                          {e.momento ? <span className="etiqueta">{e.momento}</span> : null}
                        </div>
                        {e.cita ? <p className="cita">«{e.cita}»</p> : null}
                      </div>
                    ))}
                  </div>
                </Tarjeta>
              ) : null}

              {analisis.objeciones.length > 0 ? (
                <Tarjeta titulo="Las objeciones">
                  <div className="apilado" style={{ gap: 14 }}>
                    {analisis.objeciones.map((o, i) => (
                      <div key={i}>
                        {i > 0 ? <div className="separador" /> : null}
                        <div className="fila">
                          <Pildora color="gris">{o.tipo ?? 'objeción'}</Pildora>
                          {o.objecionReal ? <span style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                            detrás había: {o.objecionReal}</span> : null}
                        </div>
                        {o.textual ? <p className="cita">«{o.textual}»</p> : null}
                        {o.respuesta ? (
                          <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                            <span className="etiqueta">Contestó</span><br />{o.respuesta}
                          </p>
                        ) : null}
                        {o.mejorRespuesta ? (
                          <div className="aviso dato" style={{ marginTop: 8, marginBottom: 0 }}>
                            <strong>La próxima vez:</strong> {o.mejorRespuesta}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Tarjeta>
              ) : null}

              {analisis.feedback ? (
                <div className="rejilla g2">
                  <Tarjeta titulo="Lo que salió bien">
                    {analisis.feedback.loMejor.length === 0 ? <p className="ayuda">—</p> : (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                        {analisis.feedback.loMejor.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}
                      </ul>
                    )}
                  </Tarjeta>
                  <Tarjeta titulo="Lo que costó">
                    {analisis.feedback.loQueCosto.length === 0 ? <p className="ayuda">—</p> : (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                        {analisis.feedback.loQueCosto.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}
                      </ul>
                    )}
                  </Tarjeta>
                </div>
              ) : null}

              {analisis.feedback?.unaSolaCosa ? (
                <Tarjeta titulo="Si sólo se pudiera cambiar una cosa">
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{analisis.feedback.unaSolaCosa}</p>
                  {analisis.feedback.errorPrincipal ? (
                    <>
                      <div className="separador" />
                      <div className="etiqueta">El error que más costó</div>
                      <p style={{ margin: '2px 0 0', fontSize: 13.5 }}>{analisis.feedback.errorPrincipal}</p>
                    </>
                  ) : null}
                  {analisis.feedback.momentoClave ? (
                    <>
                      <div className="separador" />
                      <div className="etiqueta">El momento donde se decidió</div>
                      <p className="cita">«{analisis.feedback.momentoClave}»</p>
                      {analisis.feedback.fraseAlternativa ? (
                        <div className="aviso dato" style={{ marginTop: 8, marginBottom: 0 }}>
                          <strong>En vez de eso:</strong> {analisis.feedback.fraseAlternativa}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {analisis.feedback.queHubieraHecho ? (
                    <>
                      <div className="separador" />
                      <div className="etiqueta">Qué hubiera hecho</div>
                      <p style={{ margin: '2px 0 0', fontSize: 13.5 }}>{analisis.feedback.queHubieraHecho}</p>
                    </>
                  ) : null}
                </Tarjeta>
              ) : null}
            </>
          ) : analisis === null ? (
            <Tarjeta>
              <Vacio>
                La transcripción está cargada y la llamada todavía no se analizó.
              </Vacio>
            </Tarjeta>
          ) : null}

          <Tarjeta titulo="La transcripción">
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--gris)' }}>
                Ver el texto completo
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, marginTop: 10,
                            fontFamily: 'inherit', color: 'var(--tinta)' }}>
                {transcripcion.texto}
              </pre>
            </details>
          </Tarjeta>
        </>
      )}
    </div>
  )
}
