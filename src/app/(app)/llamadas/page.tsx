import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { listarLlamadas } from '@/datos/llamadas'
import { distribucion, modeloVigente } from '@/datos/analisis'
import { todosLosPlaybooks } from '@/datos/playbooks'
import { catalogos } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Tarjeta, Encabezado, Pildora, Barra, Vacio, fechaCorta, Numero } from '@/componentes/Piezas'
import { comoSeLee, DIMENSIONES } from '@/dominio/rubrica'
import { guardarPlaybookAccion } from './acciones'

type Busqueda = Promise<Record<string, string | undefined>>

const PESTANAS = [
  { clave: 'llamadas', texto: 'Llamadas' },
  { clave: 'rubrica', texto: 'La rúbrica' },
  { clave: 'playbooks', texto: 'Playbooks' },
] as const

/**
 * Las llamadas y el analizador.
 *
 * La diferencia con el analizador anterior no se ve acá sino en cómo se saca la
 * nota: al modelo no se le pide un número, se le pide en qué nivel de conducta
 * cae la llamada y con qué frase lo sostiene. La nota la calcula el motor con
 * los pesos, los topes y las penalizaciones. Por eso dos análisis de la misma
 * llamada dan lo mismo, y por eso recalibrar no cuesta una llamada al modelo.
 */
export default async function Llamadas({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const r = rango(periodo, hoyEn())
  const cual = (PESTANAS.find((p) => p.clave === q.pestana)?.clave ?? 'llamadas')

  const [llamadas, tramos, cats, modelo, playbooks] = await Promise.all([
    listarLlamadas(alcance, {
      closerId: q.closer ? Number(q.closer) : undefined,
      desde: r.desde, hasta: r.hasta,
      sinAnalizar: q.sinanalizar === '1',
    }, 300),
    distribucion(r.desde, r.hasta, q.closer ? Number(q.closer) : undefined),
    catalogos(),
    modeloVigente(),
    todosLosPlaybooks(),
  ])

  const total = tramos.reduce((s, t) => s + t.cantidad, 0)
  const conTranscripcion = llamadas.filter((l) => l.tieneTranscripcion).length
  const analizadas = llamadas.filter((l) => l.score !== null).length

  return (
    <div className="apilado">
      <Encabezado kicker="Analizador" titulo={`Llamadas · ${r.etiqueta}`}
                  bajada="La nota no la pone el modelo: la calcula el motor sobre los niveles que el modelo cita." />

      <nav className="pestanas">
        {PESTANAS.map((p) => (
          <Link key={p.clave} href={`/llamadas?pestana=${p.clave}&periodo=${periodo}`}
                className={cual === p.clave ? 'activo' : ''}>{p.texto}</Link>
        ))}
      </nav>

      {cual === 'llamadas' ? (
        <>
          <div className="chips">
            {PERIODOS.map((p) => (
              <Link key={p.clave} href={`/llamadas?periodo=${p.clave}${q.closer ? `&closer=${q.closer}` : ''}`}
                    className={periodo === p.clave ? 'activo' : ''}>{p.etiqueta}</Link>
            ))}
          </div>

          <form className="filtros" method="get">
            <input type="hidden" name="periodo" value={periodo} />
            <div className="campo">
              <label htmlFor="f-closer">Closer</label>
              <select id="f-closer" name="closer" defaultValue={q.closer ?? ''}>
                <option value="">Todos</option>
                {cats.closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="f-sa">Sólo sin analizar</label>
              <select id="f-sa" name="sinanalizar" defaultValue={q.sinanalizar ?? ''}>
                <option value="">No</option><option value="1">Sí</option>
              </select>
            </div>
            <button type="submit" className="secundario">Filtrar</button>
          </form>

          <div className="rejilla g4">
            <Numero etiqueta="Llamadas" valor={llamadas.length} />
            <Numero etiqueta="Con transcripción" valor={conTranscripcion} />
            <Numero etiqueta="Analizadas" valor={analizadas} />
            <Numero etiqueta="Modelo de scoring" valor={modelo.version} chico
                    contra="con el que se calcularon las notas vigentes" />
          </div>

          {total > 0 ? (
            <Tarjeta titulo="Distribución de las notas"
                     ayuda="El control de que el analizador sirve: si todo cae entre 7 y 8, no está midiendo, está saludando.">
              <div className="apilado" style={{ gap: 7 }}>
                {tramos.map((t) => (
                  <div key={t.tramo}>
                    <div className="entre" style={{ marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5 }}>{t.tramo}</span>
                      <span style={{ fontSize: 12.5 }}>{t.cantidad} · {Math.round((t.cantidad / total) * 100)}%</span>
                    </div>
                    <Barra porcentaje={(t.cantidad / total) * 100} color="acento" />
                  </div>
                ))}
              </div>
            </Tarjeta>
          ) : null}

          <Tarjeta>
            {llamadas.length === 0 ? (
              <Vacio>
                No hay llamadas en el período. Se registran desde la ficha del lead,
                en la pestaña Llamadas.
              </Vacio>
            ) : (
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr><th>Fecha</th><th>Lead</th><th>Closer</th><th>#</th>
                        <th>Transcripción</th><th>Nota</th><th></th></tr>
                  </thead>
                  <tbody>
                    {llamadas.map((l) => (
                      <tr key={l.id}>
                        <td style={{ fontSize: 12.5 }}>{fechaCorta(l.fecha)}</td>
                        <td><Link href={`/leads/${l.leadId}`} style={{ fontWeight: 600 }}>{l.lead}</Link></td>
                        <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">—</span>}</td>
                        <td style={{ fontSize: 12.5 }}>{l.numero}</td>
                        <td>{l.tieneTranscripcion
                          ? <Pildora color="gris">cargada</Pildora>
                          : <span className="sindato">falta</span>}</td>
                        <td>
                          {l.score !== null
                            ? <Pildora color={l.score >= 8 ? 'verde' : l.score >= 6 ? 'ambar' : 'rojo'}>
                                {l.score.toFixed(1)} · {comoSeLee(l.score)}
                              </Pildora>
                            : l.estadoAnalisis === 'error'
                              ? <Pildora color="rojo">falló</Pildora>
                              : <span className="sindato">sin analizar</span>}
                        </td>
                        <td className="num">
                          <Link href={`/llamadas/${l.id}`}
                                style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Abrir →</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </>
      ) : null}

      {cual === 'rubrica' ? (
        <div style={{ maxWidth: 900 }}>
          <Tarjeta titulo="Con qué se evalúa cada llamada"
                   ayuda="Está acá para que se pueda discutir. Una rúbrica que sólo conoce el que la escribió no entrena a nadie.">
            <p className="ayuda" style={{ marginBottom: 14 }}>
              Al modelo no se le pregunta «del 0 al 10, qué tan bien descubrió». Eso no tiene
              respuesta verificable, y un modelo contesta lo que contestaría una persona amable:
              de ahí salía que todo terminara en 7,4. Se le pregunta en cuál de estas cinco
              descripciones de <strong>conducta observable</strong> cae la llamada, y cuál es la
              frase de la transcripción que lo sostiene. Sin cita, el nivel no entra.
            </p>
            {DIMENSIONES.map((d) => (
              <div key={d.clave} style={{ marginBottom: 18 }}>
                <div className="entre">
                  <h3 style={{ margin: 0 }}>{d.nombre}</h3>
                  <span className="etiqueta">pesa {d.peso} de 100</span>
                </div>
                <ol start={0} style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13 }}>
                  {d.anclas.map((a, i) => (
                    <li key={i} style={{ marginBottom: 2, color: i >= 3 ? 'var(--negro)' : 'var(--gris)' }}>{a}</li>
                  ))}
                </ol>
              </div>
            ))}
            <div className="aviso dato" style={{ marginBottom: 0 }}>
              Los pesos, los topes y las penalizaciones viven en la versión{' '}
              <strong>{modelo.version}</strong> del modelo de scoring, en la base. Cambiarlos y
              recalcular mil análisis no cuesta una sola llamada al modelo: los niveles ya están
              guardados.
            </div>
          </Tarjeta>
        </div>
      ) : null}

      {cual === 'playbooks' ? (
        <div className="rejilla g2">
          <Tarjeta titulo="Playbooks cargados"
                   ayuda="Versionados: una nota de hace tres meses se sacó contra el guion de hace tres meses.">
            {playbooks.length === 0 ? (
              <Vacio>Todavía no hay ninguno cargado.</Vacio>
            ) : (
              <table>
                <tbody>
                  {playbooks.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.closer}</strong></td>
                      <td style={{ fontSize: 12.5 }}>{p.nombre}</td>
                      <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>v{p.version}</td>
                      <td style={{ fontSize: 12.5 }}>{fechaCorta(p.creadoEn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Tarjeta>

          <Tarjeta titulo="Cargar o actualizar un playbook"
                   ayuda="Nunca se edita una versión: se crea la siguiente y la anterior queda.">
            <form action={guardarPlaybookAccion}>
              <div className="campo">
                <label htmlFor="pb-closer">Closer</label>
                <select id="pb-closer" name="closerId"
                        defaultValue={usuario.closerId ?? ''} required
                        disabled={!puede(usuario, 'configurar') && usuario.closerId !== null}>
                  {(puede(usuario, 'configurar')
                    ? cats.closers
                    : cats.closers.filter((c) => c.id === usuario.closerId)
                  ).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="pb-nombre">Nombre</label>
                <input id="pb-nombre" name="nombre" defaultValue="Playbook" required />
              </div>
              <div className="campo">
                <label htmlFor="pb-oferta">Qué se ofrece</label>
                <input id="pb-oferta" name="oferta" placeholder="Programa, precio, promesa" />
              </div>
              <div className="campo">
                <label htmlFor="pb-script">El guion</label>
                <textarea id="pb-script" name="script" required style={{ minHeight: 200 }} />
                <div className="nota">
                  El analizador evalúa contra la venta consultiva, no contra el guion al pie de la
                  letra: el guion es contexto de qué se está vendiendo.
                </div>
              </div>
              <button type="submit">Guardar como versión nueva</button>
            </form>
          </Tarjeta>
        </div>
      ) : null}
    </div>
  )
}
