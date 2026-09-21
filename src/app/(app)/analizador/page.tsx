import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { listarAnalisis, distribucion, modeloVigente } from '@/datos/analisis'
import { todosLosPlaybooks } from '@/datos/playbooks'
import { catalogos } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Numero, Tarjeta, Encabezado, Pildora, Barra, Vacio, fechaCorta } from '@/componentes/Piezas'
import { comoSeLee, DIMENSIONES, PENALIZACIONES, BONIFICACIONES, TOPES } from '@/dominio/rubrica'
import { guardarPlaybookAccion } from '../llamadas/acciones'

type Busqueda = Promise<Record<string, string | undefined>>

const PESTANAS = [
  { clave: 'analizadas', texto: 'Analizadas' },
  { clave: 'rubrica', texto: 'La rúbrica' },
  { clave: 'playbooks', texto: 'Playbooks' },
] as const

/**
 * El analizador.
 *
 * La diferencia con el analizador anterior no se ve en esta pantalla sino en
 * cómo se saca la nota: al modelo no se le pide un número, se le pide en qué
 * nivel de conducta cae la llamada y con qué frase lo sostiene. La nota la
 * calcula el motor.
 *
 * Por eso la rúbrica está acá a la vista. Una rúbrica que sólo conoce quien la
 * escribió no entrena a nadie, y una nota que no se puede discutir no se usa.
 */
export default async function Analizador({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const r = rango(periodo, hoyEn())
  const cual = PESTANAS.find((p) => p.clave === q.pestana)?.clave ?? 'analizadas'
  const closerId = q.closer ? Number(q.closer) : undefined

  const [analisis, tramos, cats, modelo, playbooks] = await Promise.all([
    listarAnalisis(alcance, { closerId, desde: r.desde, hasta: r.hasta }, 200),
    distribucion(r.desde, r.hasta, closerId),
    catalogos(),
    modeloVigente(),
    todosLosPlaybooks(),
  ])

  const total = tramos.reduce((s, t) => s + t.cantidad, 0)
  const conNota = analisis.filter((a) => a.score !== null)
  const promedio = conNota.length === 0 ? null
    : Math.round((conNota.reduce((s, a) => s + (a.score ?? 0), 0) / conNota.length) * 10) / 10

  return (
    <div className="apilado">
      <Encabezado kicker="Analizador" titulo={`Llamadas analizadas · ${r.etiqueta}`}
                  bajada="La nota no la pone el modelo: la calcula el motor sobre los niveles que el modelo cita.">
        <Link className="boton secundario" href="/llamadas">Ver todas las llamadas</Link>
      </Encabezado>

      <nav className="pestanas">
        {PESTANAS.map((p) => (
          <Link key={p.clave} href={`/analizador?pestana=${p.clave}&periodo=${periodo}`}
                className={cual === p.clave ? 'activo' : ''}>{p.texto}</Link>
        ))}
      </nav>

      {cual === 'analizadas' ? (
        <>
          <div className="chips">
            {PERIODOS.map((p) => (
              <Link key={p.clave} href={`/analizador?periodo=${p.clave}${closerId ? `&closer=${closerId}` : ''}`}
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
            <button type="submit" className="secundario">Filtrar</button>
          </form>

          <div className="rejilla g4">
            <Numero etiqueta="Analizadas" valor={analisis.length} />
            <Numero etiqueta="Nota promedio" valor={promedio}
                    contra={promedio === null ? undefined : comoSeLee(promedio)} />
            <Numero etiqueta="Buenas o mejores" valor={conNota.filter((a) => (a.score ?? 0) >= 7).length}
                    contra="de 7 para arriba" />
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
            {analisis.length === 0 ? (
              <Vacio>
                Todavía no hay llamadas analizadas en el período.{' '}
                <Link href="/llamadas" style={{ color: 'var(--acento)', fontWeight: 650 }}>
                  Ver las llamadas con transcripción →
                </Link>
              </Vacio>
            ) : (
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr><th>Fecha</th><th>Lead</th><th>Closer</th><th>Estado</th><th>Nota</th><th></th></tr>
                  </thead>
                  <tbody>
                    {analisis.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontSize: 12.5 }}>{fechaCorta(a.fecha)}</td>
                        <td><Link href={`/leads/${a.leadId}`} style={{ fontWeight: 600 }}>{a.lead}</Link></td>
                        <td style={{ fontSize: 12.5 }}>{a.closer ?? <span className="sindato">—</span>}</td>
                        <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{a.estado}</td>
                        <td>
                          {a.score === null
                            ? <span className="sindato">—</span>
                            : <Pildora color={a.score >= 8 ? 'verde' : a.score >= 6 ? 'ambar' : 'rojo'}>
                                {a.score.toFixed(1)} · {comoSeLee(a.score)}
                              </Pildora>}
                        </td>
                        <td className="num">
                          <Link href={`/llamadas/${a.llamadaId}`}
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
              frase de la transcripción que lo sostiene. <strong>Sin cita, el nivel no entra.</strong>
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
          </Tarjeta>

          <div style={{ height: 12 }} />

          <div className="rejilla g2">
            <Tarjeta titulo="Lo que resta" ayuda="Vocabulario cerrado y cita obligatoria.">
              <table>
                <tbody>
                  {Object.entries(PENALIZACIONES).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ fontSize: 13 }}>{v.nombre}</td>
                      <td className="num"><Pildora color="rojo">{v.valor.toFixed(1)}</Pildora></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
            <Tarjeta titulo="Lo que suma" ayuda="Sólo por conductas excelentes, y con techo total de +0,5.">
              <table>
                <tbody>
                  {Object.entries(BONIFICACIONES).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ fontSize: 13 }}>{v.nombre}</td>
                      <td className="num"><Pildora color="verde">+{v.valor.toFixed(1)}</Pildora></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          </div>

          <div style={{ height: 12 }} />

          <Tarjeta titulo="Los topes"
                   ayuda="Un techo de la nota final. Es lo que impide que un cierre brillante tape que no se descubrió nada.">
            <table>
              <tbody>
                {TOPES.map((t) => (
                  <tr key={t.dimension}>
                    <td style={{ fontSize: 13 }}>
                      <strong>{DIMENSIONES.find((d) => d.clave === t.dimension)?.nombre ?? t.dimension}</strong>
                      {' '}por debajo de {t.menorA}
                      <div style={{ color: 'var(--gris)', fontSize: 12 }}>{t.porque}</div>
                    </td>
                    <td className="num">la nota no pasa de <strong>{t.tope.toFixed(1)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="aviso dato" style={{ marginTop: 12, marginBottom: 0 }}>
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
                <select id="pb-closer" name="closerId" defaultValue={usuario.closerId ?? ''} required>
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
