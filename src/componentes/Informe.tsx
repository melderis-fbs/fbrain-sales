import type { AnalisisCompleto } from '@/datos/analisis'
import { Tarjeta, Pildora } from './Piezas'
import { comoSeLee } from '@/dominio/rubrica'
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
      {/* ── Cómo le fue con lo que tenía ─────────────────────────────── */}
      {a.lecturaJusta ? (
        <Tarjeta titulo="Cómo le fue con lo que tenía"
                 ayuda="Un closer no elige el lead que le toca. Esto se lee antes que la nota.">
          <div className="fila" style={{ marginBottom: 10 }}>
            <Pildora color="gris">{NOMBRE_DE_TECHO[a.lecturaJusta.techo]}</Pildora>
            <Pildora color={COLOR_DE_APROVECHAMIENTO[a.lecturaJusta.aprovecho]}>
              {NOMBRE_DE_APROVECHAMIENTO[a.lecturaJusta.aprovecho]}
            </Pildora>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{a.lecturaJusta.insight}</p>
          <div className="separador" />
          <div className="dos">
            <div>
              <div className="etiqueta">Qué lead le tocó</div>
              <p style={{ margin: '3px 0 0', fontSize: 13 }}>{a.lecturaJusta.queRecibio}</p>
            </div>
            <div>
              <div className="etiqueta">Por qué ése era el techo</div>
              <p style={{ margin: '3px 0 0', fontSize: 13 }}>{a.lecturaJusta.porQueEseTecho}</p>
            </div>
          </div>
        </Tarjeta>
      ) : null}

      {/* ── Los tres números ──────────────────────────────────────────── */}
      <div className="rejilla g3">
        <Tarjeta titulo="Calidad comercial">
          <div className="escala">{a.score === null ? '—' : a.score.toFixed(1)}</div>
          <div className="contra">
            {a.score === null ? 'sin nota' : `${comoSeLee(a.score)} · sobre 10`}
          </div>
        </Tarjeta>
        <Tarjeta titulo="Adherencia al guion">
          <div className="escala">
            {a.adherenciaPct === null ? '—' : `${a.adherenciaPct}%`}
          </div>
          <div className="contra">cuánto del guion se ejecutó</div>
        </Tarjeta>
        <Tarjeta titulo="Ejecución del guion">
          <div className="escala">{a.notaFases === null ? '—' : a.notaFases.toFixed(1)}</div>
          <div className="contra">qué tan bien se hizo lo que se hizo</div>
        </Tarjeta>
      </div>

      {/* ── El guion, fase por fase ───────────────────────────────────── */}
      {a.fases.length > 0 ? (
        <>
          <Tarjeta titulo="Puntuación por fase"
                   ayuda="«Adherencia» es si el paso se hizo; «nota» es qué tan bien. Son dos preguntas.">
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
            <div className="apilado" style={{ gap: 18 }}>
              {a.fases.map((f, i) => (
                <div key={f.clave} className="fase">
                  <div className="entre" style={{ alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 14 }}>{i + 1}. {f.nombre}</strong>
                    <span style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                      {f.nota === null ? 'sin nota' : `${f.nota.toFixed(1)}/10`} ·{' '}
                      {NOMBRE_DE_EJECUCION[f.ejecucion].toLowerCase()}
                    </span>
                  </div>
                  {f.loQueHizo ? (
                    <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                      <strong>Lo que hizo:</strong> {f.loQueHizo}
                    </p>
                  ) : null}
                  {f.cita ? <p className="cita">«{f.cita}»</p> : null}
                  {f.loQueDebia ? (
                    <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                      <strong>Lo que decía el guion:</strong> {f.loQueDebia}
                    </p>
                  ) : null}
                  {f.analisis ? (
                    <p style={{ margin: '6px 0 0', fontSize: 13 }}>{f.analisis}</p>
                  ) : null}
                  {f.seDejoPasar ? (
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--gris)' }}>
                      <strong>Lo que se dejó pasar:</strong> {f.seDejoPasar}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Tarjeta>
        </>
      ) : null}

      {/* ── Lo que costó y qué hacer ──────────────────────────────────── */}
      {a.erroresCriticos.length > 0 ? (
        <Tarjeta titulo="Los errores que costaron">
          <div className="apilado" style={{ gap: 12 }}>
            {a.erroresCriticos.map((e, i) => (
              <div key={i}>
                <strong style={{ fontSize: 13.5 }}>{i + 1}. {e.titulo}</strong>
                <p style={{ margin: '3px 0 0', fontSize: 13 }}>{e.detalle}</p>
              </div>
            ))}
          </div>
        </Tarjeta>
      ) : null}

      {a.recomendaciones.length > 0 ? (
        <Tarjeta titulo="Para la próxima">
          <div className="apilado" style={{ gap: 12 }}>
            {a.recomendaciones.map((r, i) => (
              <div key={i}>
                <strong style={{ fontSize: 13.5 }}>{i + 1}. {r.titulo}</strong>
                <p style={{ margin: '3px 0 0', fontSize: 13 }}>{r.detalle}</p>
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
               ayuda="La venta consultiva, aparte del guion. Cada nivel con la frase que lo sostiene: sin cita, el nivel no entra al cálculo.">
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

      <Tarjeta titulo="Cuánto habló cada uno"
               ayuda="Se cuenta en código, no se le pregunta al modelo: contar palabras es aritmética.">
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
