import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { performanceDeClosers, verCloser, motivosDePerdida } from '@/datos/equipo'
import { metricas, objetivoDe, logradoDe } from '@/datos/metricas'
import { distribucion, listarAnalisis } from '@/datos/analisis'
import { playbooksDe } from '@/datos/playbooks'
import { config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { ritmo, diasHabilesTranscurridos } from '@/motor/objetivo'
import { comoSeLeeElIndice } from '@/motor/ajuste'
import { comoSeLee } from '@/dominio/rubrica'
import { NOMBRE_DE_MOTIVO, type MotivoPerdida } from '@/dominio/resultados'
import { NOMBRE_DE_NIVEL, type NivelDeCalidad } from '@/dominio/calidad'
import {
  Numero, Tarjeta, Encabezado, Pildora, Barra, plata, porcentaje, fechaCorta, Vacio,
} from '@/componentes/Piezas'
import { Embudo } from '@/componentes/Embudo'
import { Objetivo } from '@/componentes/Objetivo'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * La ficha de un closer.
 *
 * Dirección la usa para ver a cualquiera; un closer la usa para verse a sí
 * mismo. Es la misma pantalla porque es la misma información, y que el closer
 * vea exactamente lo que ve dirección es lo que hace que la conversación sobre
 * su desempeño no empiece discutiendo los números.
 */
export default async function FichaDeCloser({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Busqueda }) {
  const { id } = await params
  const q = await searchParams
  const closerId = Number(id)
  if (!Number.isInteger(closerId)) notFound()

  const usuario = await exigirUsuario()
  // Un closer entra a la suya; los demás roles, sólo si ven toda la operación.
  if (!puede(usuario, 'verTodo') && usuario.closerId !== closerId) notFound()

  const closer = await verCloser(closerId)
  if (!closer) notFound()

  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const hoy = hoyEn()
  const r = rango(periodo, hoy)
  const monedaBase = await config<string>('moneda_base', 'USD')
  const verPlata = puede(usuario, 'verDinero')

  const [todos, datos, objetivo, motivos, tramos, analisis, playbooks] = await Promise.all([
    performanceDeClosers(r, monedaBase, false),
    metricas(r, { todo: true }, { closerId }, monedaBase),
    objetivoDe(r, 'facturacion', 'closer', closerId),
    motivosDePerdida(r, { closerId }),
    distribucion(r.desde, r.hasta, closerId),
    listarAnalisis({ todo: true }, { closerId, desde: r.desde, hasta: r.hasta }, 15),
    playbooksDe(closerId),
  ])

  const suyo = todos.find((c) => c.id === closerId)
  const m = datos.medidas
  const habiles = diasHabilesTranscurridos(r.desde, hoy, r.hasta)
  const totalHabiles = diasHabilesTranscurridos(r.desde, r.hasta, r.hasta)
  const elRitmo = ritmo(objetivo, logradoDe('facturacion', m), habiles, totalHabiles)
  const totalTramos = tramos.reduce((s, t) => s + t.cantidad, 0)

  return (
    <div className="apilado">
      <Encabezado kicker="Closer" titulo={closer.nombre} bajada={r.etiqueta}>
        <Link className="boton secundario" href="/closers">Ver a todos</Link>
      </Encabezado>

      <div className="chips">
        {PERIODOS.map((p) => (
          <Link key={p.clave} href={`/closers/${closerId}?periodo=${p.clave}`}
                className={periodo === p.clave ? 'activo' : ''}>{p.etiqueta}</Link>
        ))}
      </div>

      <div className="rejilla g4">
        <Numero etiqueta="Agendadas" valor={m.agendadas} />
        <Numero etiqueta="Asistencias" valor={m.asistencias} contra={porcentaje(m.asistenciaPct)} />
        <Numero etiqueta="Ofertas" valor={m.ofertas} contra={`${porcentaje(m.ofertaPct)} de las asistencias`} />
        {/* Cierres por FECHA DE VENTA, igual que la facturación de abajo.
            Por fecha de llamada, esta fila mostraba dos números que no se
            pueden mirar juntos. */}
        <Numero etiqueta="Cierres" valor={m.ventasCerradas} contra="firmados en el período" />
        <Numero etiqueta="Cierre" valor={porcentaje(m.cierrePct)}
                contra={`${m.ventasCerradas} ${m.ventasCerradas === 1 ? 'cierre' : 'cierres'} de ${m.asistencias} ${m.asistencias === 1 ? 'asistencia' : 'asistencias'}`} />
        <Numero etiqueta="Cierre sobre oferta" valor={m.cierreSobreOfertaPct} unidad="%"
                contra="de los que vieron el precio" />
        <Numero etiqueta="Lead quality recibido" valor={suyo?.calidadPromedio ?? null}
                contra="promedio de lo que le tocó" />
        {verPlata ? (
          <>
            <Numero etiqueta="Facturación" valor={plata(m.facturacion, monedaBase)} chico />
            <Numero etiqueta="Ticket promedio" valor={m.ticketPromedio === null ? null : plata(m.ticketPromedio, monedaBase)} chico />
          </>
        ) : null}
      </div>

      {suyo ? (
        <Tarjeta titulo="Cierre ajustado por Lead Quality"
                 ayuda="Lo que cerró, contra lo que cerraría cualquiera con los leads que recibió.">
          {suyo.ajuste.indice === null ? (
            <p className="ayuda">{suyo.ajuste.porque}</p>
          ) : (
            <>
              <div className="rejilla g3">
                <div>
                  <div className="etiqueta">Cerró</div>
                  <div className="numero chico">{porcentaje(suyo.ajuste.bruto)}</div>
                </div>
                <div>
                  <div className="etiqueta">Era esperable</div>
                  <div className="numero chico">{porcentaje(suyo.ajuste.esperado)}</div>
                </div>
                <div>
                  <div className="etiqueta">Índice</div>
                  <div className="numero chico">{suyo.ajuste.indice.toFixed(2)}</div>
                  <div className="contra">{comoSeLeeElIndice(suyo.ajuste.indice)}</div>
                </div>
              </div>

              <div className="separador" />
              <h3>Con qué leads</h3>
              <table>
                <thead>
                  <tr><th>Calidad del lead</th><th className="num">Asistencias</th>
                      <th className="num">Ventas</th>
                      <th className="num" title="Ventas ÷ asistencias de ese nivel de lead.">Cierre / asist.</th></tr>
                </thead>
                <tbody>
                  {suyo.ajuste.mezcla.map((x) => (
                    <tr key={x.nivel}>
                      <td>{x.nivel === 'sin_calificar' ? 'Sin calificar'
                        : NOMBRE_DE_NIVEL[x.nivel as NivelDeCalidad]}</td>
                      <td className="num">{x.asistencias}</td>
                      <td className="num">{x.ventas}</td>
                      <td className="num">
                        {x.asistencias === 0 ? '—' : `${Math.round((x.ventas / x.asistencias) * 1000) / 10}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Tarjeta>
      ) : null}

      <div className="rejilla g2">
        <Tarjeta titulo="Embudo"><Embudo etapas={datos.etapas} /></Tarjeta>
        <div className="apilado">
          {verPlata ? <Objetivo ritmo={elRitmo} moneda={monedaBase} titulo="Objetivo propio del período" /> : null}
          <Tarjeta titulo="Por qué pierde"
                   ayuda="La pregunta que cambia un entrenamiento: no cuánto pierde, sino en qué parte.">
            {motivos.length === 0 ? <p className="ayuda">No hay pérdidas cargadas en el período.</p> : (
              <table>
                <tbody>
                  {motivos.map((x) => (
                    <tr key={x.motivo ?? 'sin'}>
                      <td>{x.motivo ? NOMBRE_DE_MOTIVO[x.motivo as MotivoPerdida] ?? x.motivo
                        : <span className="sindato">sin motivo cargado</span>}</td>
                      <td className="num">{x.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Tarjeta>
        </div>
      </div>

      <div className="rejilla g2">
        <Tarjeta titulo="Cómo le va en las llamadas"
                 ayuda="Si todas las notas cayeran en el mismo tramo, el analizador no estaría midiendo nada.">
          {totalTramos === 0 ? (
            <p className="ayuda">Todavía no hay llamadas analizadas en el período.</p>
          ) : (
            <div className="apilado" style={{ gap: 7 }}>
              {tramos.map((t) => (
                <div key={t.tramo}>
                  <div className="entre" style={{ marginBottom: 2 }}>
                    <span style={{ fontSize: 12.5 }}>{t.tramo}</span>
                    <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{t.cantidad}</span>
                  </div>
                  <Barra porcentaje={(t.cantidad / totalTramos) * 100} color="acento" />
                </div>
              ))}
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Últimas llamadas analizadas"
                 accion={<Link href={`/llamadas?closer=${closerId}`} style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Ver todas →</Link>}>
          {analisis.length === 0 ? (
            <Vacio>Sin análisis en el período.</Vacio>
          ) : (
            <table>
              <tbody>
                {analisis.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/analizador/${a.llamadaId}`}>{a.lead}</Link></td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{fechaCorta(a.fecha)}</td>
                    <td className="num">
                      {a.score === null ? <span className="sindato">{a.estado}</span>
                        : <Pildora color={a.score >= 8 ? 'verde' : a.score >= 6 ? 'ambar' : 'rojo'}>
                            {a.score.toFixed(1)} · {comoSeLee(a.score)}
                          </Pildora>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Su playbook"
               ayuda="Cada closer carga su propio guion y lo va corrigiendo. El analizador lo usa como contexto de qué se ofrece."
               accion={<Link href="/analizador?pestana=playbooks" style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Editar →</Link>}>
        {playbooks.length === 0 ? (
          <p className="ayuda">Todavía no cargó ninguno. Sin playbook el análisis funciona igual,
            pero pierde el contexto de qué programa se está vendiendo.</p>
        ) : (
          <table>
            <tbody>
              {playbooks.slice(0, 5).map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>versión {p.version}</td>
                  <td style={{ fontSize: 12.5 }}>{fechaCorta(p.creadoEn)}</td>
                  <td className="num">{p.vigente ? <Pildora color="verde">vigente</Pildora> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </div>
  )
}
