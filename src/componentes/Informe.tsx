import type { AnalisisCompleto } from '@/datos/analisis'
import { Tarjeta, Pildora } from './Piezas'
import { comoSeLee } from '@/dominio/rubrica'
import { NOMBRE_DE_RESULTADO, COLOR_DE_RESULTADO } from '@/dominio/resultados'
import { fechaCorta } from './Piezas'
import { NOMBRE_DE_EJECUCION, COLOR_DE_EJECUCION } from '@/dominio/fases'
import {
  NOMBRE_DE_TECHO, NOMBRE_DE_APROVECHAMIENTO, COLOR_DE_APROVECHAMIENTO,
} from '@/dominio/informe'

/**
 * El informe de una llamada.
 *
 * El orden importa y es lo que cambió: lo PRIMERO que se lee no es la nota,
 * es con qué jugó el closer. Un informe que abre con «4,5 · mala» sobre una
 * llamada donde el prospecto no tenía plata ni decidía solo no entrena a
 * nadie: entrena a no abrir el informe. Después vienen los números, después
 * el guion fase por fase, y al final el detalle de la rúbrica para el que
 * quiera discutir una nota.
 *
 * Todo lo que afirma tiene su cita al lado. Es la regla que hace que esto se
 * pueda mirar junto al closer en vez de mandárselo.
 */
export function Informe({ a }: { a: AnalisisCompleto }) {
  const sinEvidencia = a.niveles.filter((n) => n.sinEvidencia).length

  return (
    <div className="apilado informe">
      {/* ── El titular: la nota, en qué quedó y de quién es ───────────── */}
      <div className="informe-titulo">
        <div className="informe-nota">
          <b>{a.score === null ? '—' : a.score.toFixed(1)}</b><span>/10</span>
          <div className="contra" style={{ marginTop: 2 }}>
            {a.score === null ? 'sin nota' : comoSeLee(a.score)}
          </div>
        </div>
        <div className="quien">
          <strong>{a.lead}</strong>
          <div className="meta">
            {[a.closer, a.fecha ? fechaCorta(a.fecha) : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="fila">
          <Pildora color={COLOR_DE_RESULTADO[a.resultado]}>
            {NOMBRE_DE_RESULTADO[a.resultado]}
          </Pildora>
          {a.lecturaJusta ? (
            <Pildora color={COLOR_DE_APROVECHAMIENTO[a.lecturaJusta.aprovecho]}>
              {NOMBRE_DE_APROVECHAMIENTO[a.lecturaJusta.aprovecho]}
            </Pildora>
          ) : null}
        </div>
      </div>

      {/* ── Los tres números ──────────────────────────────────────────── */}
      <div className="informe-numeros">
        <div>
          <div className="etiqueta">Calidad comercial</div>
          <div className="valor">{a.score === null ? '—' : a.score.toFixed(1)}</div>
          <div className="contra">sobre 10</div>
        </div>
        <div>
          <div className="etiqueta">Adherencia al guion</div>
          <div className="valor">{a.adherenciaPct === null ? '—' : `${a.adherenciaPct}%`}</div>
          <div className="contra">cuánto se ejecutó</div>
        </div>
        <div>
          <div className="etiqueta">Ejecución del guion</div>
          <div className="valor">{a.notaFases === null ? '—' : a.notaFases.toFixed(1)}</div>
          <div className="contra">qué tan bien se hizo</div>
        </div>
      </div>

      {/* ── Cómo le fue con lo que tenía ─────────────────────────────── */}
      {a.lecturaJusta ? (
        <Tarjeta titulo="Cómo le fue con lo que tenía">
          <div className="fila" style={{ marginBottom: 10 }}>
            <Pildora color="gris">{NOMBRE_DE_TECHO[a.lecturaJusta.techo]}</Pildora>
          </div>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>{a.lecturaJusta.insight}</p>
          <div className="separador" />
          <div className="dos">
            <div className="dato-largo">
              <span className="etiqueta">Qué lead le tocó</span>
              <p>{a.lecturaJusta.queRecibio}</p>
            </div>
            <div className="dato-largo">
              <span className="etiqueta">Por qué ése era el techo</span>
              <p>{a.lecturaJusta.porQueEseTecho}</p>
            </div>
          </div>
        </Tarjeta>
      ) : null}

      {/* ── El guion, fase por fase ───────────────────────────────────── */}
      {a.fases.length > 0 ? (
        <>
          <Tarjeta titulo="Puntuación por fase"
                   ayuda={a.conPlaybook
                     ? '«Adherencia» es si el paso se hizo; la nota, qué tan bien.'
                     : 'Medido contra las fases de la casa: este closer todavía no tiene su ' +
                       'playbook cargado. Cargándolo, se mide contra su guion.'}>
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>Fase</th><th className="num">Peso</th><th className="num">Nota</th><th></th></tr>
                </thead>
                <tbody>
                  {a.fases.map((f) => (
                    <tr key={f.clave}>
                      <td style={{ fontWeight: 600 }}>{f.nombre}</td>
                      <td className="num" style={{ fontSize: 12.5, color: 'var(--gris)' }}>{f.peso}%</td>
                      <td className="num" style={{ fontWeight: 650 }}>
                        {f.nota === null ? <span className="sindato">—</span> : f.nota.toFixed(1)}
                      </td>
                      <td className="num">
                        <Pildora color={COLOR_DE_EJECUCION[f.ejecucion]}>
                          {NOMBRE_DE_EJECUCION[f.ejecucion]}
                        </Pildora>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Fase por fase, con lo que se dijo">
            <div className="apilado" style={{ gap: 16 }}>
              {a.fases.map((f, i) => (
                <div key={f.clave} className="fase">
                  <div className="orden">{i + 1}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="cabeza">
                      <strong>{f.nombre}</strong>
                      <span className="nota">
                        {f.nota === null ? <span className="sindato">sin nota</span> : f.nota.toFixed(1)}
                      </span>
                      <Pildora color={COLOR_DE_EJECUCION[f.ejecucion]}>
                        {NOMBRE_DE_EJECUCION[f.ejecucion]}
                      </Pildora>
                      <span className="peso">pesa {f.peso}%</span>
                    </div>

                    {f.loQueHizo ? (
                      <div className="dato-largo" style={{ marginTop: 8 }}>
                        <span className="etiqueta">Lo que hizo</span>
                        <p>{f.loQueHizo}</p>
                      </div>
                    ) : null}
                    {f.cita ? <p className="cita">«{f.cita}»</p> : null}
                    {f.loQueDebia ? (
                      <div className="dato-largo">
                        <span className="etiqueta">Lo que decía el guion</span>
                        <p>{f.loQueDebia}</p>
                      </div>
                    ) : null}
                    {f.analisis ? (
                      <div className="dato-largo">
                        <span className="etiqueta">La diferencia</span>
                        <p>{f.analisis}</p>
                      </div>
                    ) : null}
                    {f.seDejoPasar ? (
                      <div className="dato-largo">
                        <span className="etiqueta">Lo que se dejó pasar</span>
                        <p>{f.seDejoPasar}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Tarjeta>
        </>
      ) : null}

      {/* ── Lo que costó y qué hacer ──────────────────────────────────── */}
      {a.erroresCriticos.length > 0 ? (
        <Tarjeta titulo="Los errores que costaron">
          <div className="apilado" style={{ gap: 16 }}>
            {a.erroresCriticos.map((e, i) => (
              <div key={i} className="punto">
                <div className="orden malo">{i + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <strong>{e.titulo}</strong>
                  <p>{e.detalle}</p>
                </div>
              </div>
            ))}
          </div>
        </Tarjeta>
      ) : null}

      {a.recomendaciones.length > 0 ? (
        <Tarjeta titulo="Para la próxima">
          <div className="apilado" style={{ gap: 16 }}>
            {a.recomendaciones.map((r, i) => (
              <div key={i} className="punto">
                <div className="orden">{i + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <strong>{r.titulo}</strong>
                  <p>{r.detalle}</p>
                </div>
              </div>
            ))}
          </div>
        </Tarjeta>
      ) : null}

      {a.conclusion ? (
        <Tarjeta titulo="Conclusión">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{a.conclusion}</p>
        </Tarjeta>
      ) : null}

      {/* ── El detalle, para discutir una nota ────────────────────────── */}
      <Tarjeta titulo="Dimensión por dimensión"
               ayuda="La venta consultiva, aparte del guion.">
        <div className="apilado" style={{ gap: 14 }}>
          {a.niveles.map((n) => (
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
              {n.justificacion ? <p style={{ margin: '6px 0 0', fontSize: 13 }}>{n.justificacion}</p> : null}
              {n.cita ? <p className="cita">«{n.cita}»</p> : null}
            </div>
          ))}
        </div>
        <div className="separador" />
        <p className="ayuda" style={{ margin: 0 }}>
          Nota {a.score?.toFixed(1) ?? '—'} · base ponderada {a.base?.toFixed(1) ?? '—'}
          {a.penalizacion !== 0 ? ` · penalizaciones ${a.penalizacion.toFixed(1)}` : ''}
          {a.bonificacion !== 0 ? ` · bonificaciones +${a.bonificacion.toFixed(1)}` : ''}
          {a.topeAplicado !== null ? ` · tope ${a.topeAplicado.toFixed(1)}` : ''}
          {' · '}modelo {a.version ?? '—'}.
          {sinEvidencia > 0 ? ` ${sinEvidencia} ${sinEvidencia === 1 ? 'dimensión quedó' : 'dimensiones quedaron'} sin evidencia y salen del promedio: cero diría que se hizo mal, y lo que pasa es que no se puede saber.` : ''}
        </p>
      </Tarjeta>

      {a.objeciones.length > 0 ? (
        <Tarjeta titulo="Las objeciones">
          <div className="apilado" style={{ gap: 14 }}>
            {a.objeciones.map((o, i) => (
              <div key={i}>
                <div className="fila">
                  <Pildora color="ambar">{o.tipo}</Pildora>
                  {o.objecionReal ? (
                    <span style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                      detrás había: {o.objecionReal}
                    </span>
                  ) : null}
                </div>
                <p className="cita">«{o.textual}»</p>
                {o.respuesta ? (
                  <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                    <strong>Contestó:</strong> {o.respuesta}
                  </p>
                ) : null}
                {o.mejorRespuesta ? (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--acento)' }}>
                    <strong>La próxima:</strong> {o.mejorRespuesta}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Tarjeta>
      ) : null}

      <Tarjeta titulo="Cuánto habló cada uno">
        <div className="rejilla g3">
          <div>
            <div className="etiqueta">Turnos del closer</div>
            <div className="numero chico">{a.turnosCloser ?? '—'}</div>
          </div>
          <div>
            <div className="etiqueta">Palabras del closer</div>
            <div className="numero chico">{(a.palabrasCloser ?? 0).toLocaleString('es-AR')}</div>
          </div>
          <div>
            <div className="etiqueta">Palabras del prospecto</div>
            <div className="numero chico">{(a.palabrasProspecto ?? 0).toLocaleString('es-AR')}</div>
          </div>
        </div>
        {(a.palabrasCloser ?? 0) > (a.palabrasProspecto ?? 0) * 1.5 ? (
          <p className="ayuda" style={{ marginTop: 10 }}>
            El closer habló bastante más que el prospecto. En una venta consultiva eso suele
            querer decir que se presentó antes de preguntar.
          </p>
        ) : null}
      </Tarjeta>
    </div>
  )
}
