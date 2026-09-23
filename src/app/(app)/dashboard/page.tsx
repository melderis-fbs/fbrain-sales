import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import {
  metricas, apertura, objetivoDe, logradoDe, senasAbiertas, sinCargar, sinFechaDeReunion,
  plataFantasma, DEFINICIONES,
  NOMBRE_DE_OBJETIVO, type TipoDeObjetivo,
} from '@/datos/metricas'
import { pipelineDeSeguimientos } from '@/datos/seguimientos'
import { catalogos, config } from '@/datos/catalogos'
import { rango, rangoAnterior, hoyEn, variacion, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { ritmo, diasHabilesTranscurridos } from '@/motor/objetivo'
import { Numero, Tarjeta, Encabezado, plata, porcentaje, fechaCorta } from '@/componentes/Piezas'
import { NOMBRE_DE_RESULTADO } from '@/dominio/resultados'
import { Embudo } from '@/componentes/Embudo'
import { Objetivo } from '@/componentes/Objetivo'
import { NOMBRE_DE_MOTIVO, type MotivoPerdida } from '@/dominio/resultados'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * El Dashboard: la foto del mes.
 *
 * Contesta una sola pregunta —«cómo venimos»— y por eso no tiene filtros de
 * detalle ni tablas largas. Lo que hay que trabajar hoy está en el Tracker; lo
 * que hay que perseguir, en Seguimientos. Un tablero que contesta cuatro
 * preguntas a la vez no contesta ninguna.
 *
 * Todos los números salen de `datos/metricas`, el mismo módulo que usa el
 * Tracker. Esa es la razón de que existan: antes el Dashboard decía 111% de
 * cierre y el Tracker 11% para el mismo mes, cada uno contando sobre su propio
 * universo.
 */
export default async function Dashboard({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)

  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const hoy = hoyEn()
  const r = rango(periodo, hoy)
  const previo = rangoAnterior(periodo, r)
  const monedaBase = await config<string>('moneda_base', 'USD')
  const tipoObjetivo = (q.objetivo ?? 'facturacion') as TipoDeObjetivo

  const filtros = {
    closerId: q.closer ? Number(q.closer) : undefined,
    setterId: q.setter ? Number(q.setter) : undefined,
    fuenteId: q.fuente ? Number(q.fuente) : undefined,
    funnelId: q.funnel ? Number(q.funnel) : undefined,
  }

  const [ahora, antes, objetivo, cats, porFuente, porMotivo, senas, pendientes, sueltos, seguimientos,
         fantasmas] =
    await Promise.all([
      metricas(r, alcance, filtros, monedaBase),
      metricas(previo, alcance, filtros, monedaBase),
      objetivoDe(r, tipoObjetivo),
      catalogos(),
      apertura('fuente', r, alcance, filtros, monedaBase),
      apertura('motivo_perdida', r, alcance, filtros, monedaBase),
      senasAbiertas(alcance, hoy),
      sinCargar(alcance, hoy, 6),
      sinFechaDeReunion(alcance),
      pipelineDeSeguimientos(alcance, hoy, monedaBase),
      plataFantasma(alcance),
    ])

  const m = ahora.medidas
  const p = antes.medidas
  const habiles = diasHabilesTranscurridos(r.desde, hoy, r.hasta)
  const totalHabiles = diasHabilesTranscurridos(r.desde, r.hasta, r.hasta)
  const elRitmo = ritmo(objetivo, logradoDe(tipoObjetivo, m), habiles, totalHabiles)
  const verPlata = puede(usuario, 'verDinero')

  const con = (cambio: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...q, ...cambio })) if (v) u.set(k, v)
    return `/dashboard?${u.toString()}`
  }

  return (
    <div className="apilado">
      <Encabezado kicker="Founders Sales OS" titulo={`Dashboard · ${r.etiqueta}`}
                  bajada={`${fechaCorta(r.desde)} a ${fechaCorta(r.hasta)} · comparado contra ${fechaCorta(previo.desde)} a ${fechaCorta(previo.hasta)}`} />

      <div className="chips">
        {PERIODOS.map((x) => (
          <Link key={x.clave} href={con({ periodo: x.clave })}
                className={periodo === x.clave ? 'activo' : ''}>{x.etiqueta}</Link>
        ))}
      </div>

      <form className="filtros" method="get">
        <input type="hidden" name="periodo" value={periodo} />
        <input type="hidden" name="objetivo" value={tipoObjetivo} />
        {([
          ['closer', 'Closer', cats.closers],
          ['setter', 'Setter', cats.setters],
          ['fuente', 'Fuente', cats.fuentes],
          ['funnel', 'Funnel', cats.funnels],
        ] as const).map(([nombre, etiqueta, opciones]) => (
          <div className="campo" key={nombre}>
            <label htmlFor={`f-${nombre}`}>{etiqueta}</label>
            <select id={`f-${nombre}`} name={nombre} defaultValue={q[nombre] ?? ''}>
              <option value="">Todos</option>
              {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
        ))}
        <button type="submit" className="secundario">Filtrar</button>
      </form>

      {verPlata && fantasmas.length > 0 ? (
        <div className="aviso problema">
          <strong>
            {fantasmas.length === 1
              ? 'Hay un lead cuya plata contradice su resultado.'
              : `Hay ${fantasmas.length} leads cuya plata contradice su resultado.`}
          </strong>{' '}
          Está contando en los números de abajo aunque el lead diga otra cosa. Suele ser una venta
          cargada en el lead equivocado: se anula desde su ficha y sale del mes.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {fantasmas.map((f) => (
              <li key={`${f.que}-${f.leadId}-${f.fecha}`}>
                <Link href={`/leads/${f.leadId}`}
                      style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>
                  {f.lead}
                </Link>{' '}
                dice «{NOMBRE_DE_RESULTADO[f.resultado]}» y tiene {f.que === 'venta' ? 'una venta' : 'una seña'} de{' '}
                {plata(f.importe, f.moneda)} del {fechaCorta(f.fecha)}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {m.otrasMonedas.length > 0 ? (
        <div className="aviso atencion">
          Hay importes en otra moneda que <strong>no están sumados</strong> arriba:{' '}
          {m.otrasMonedas.map((x) => plata(x.importe, x.moneda)).join(' · ')}.
          Sumarlos con una cotización inventada daría un número que parece correcto y no lo es.
        </div>
      ) : null}

      {m.pendientesDeCargar > 0 ? (
        <div className="aviso atencion">
          <strong>{m.pendientesDeCargar}</strong>{' '}
          {m.pendientesDeCargar === 1 ? 'reunión ya pasó y no tiene resultado cargado' :
            'reuniones ya pasaron y no tienen resultado cargado'}.
          Hasta que se carguen, todos los números de abajo están incompletos.{' '}
          <Link href="/tracker?pendientes=1" style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>
            Cargarlas →
          </Link>
        </div>
      ) : null}

      {sueltos > 0 ? (
        <div className="aviso atencion">
          Hay <strong>{sueltos}</strong> {sueltos === 1 ? 'lead sin fecha de reunión' : 'leads sin fecha de reunión'}.
          No entran a ninguno de los números de abajo: el embudo entero cuenta sobre las reuniones
          del período.{' '}
          <Link href="/tracker" style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>
            Agendarlos →
          </Link>
        </div>
      ) : null}

      <div className="rejilla g4">
        <Numero etiqueta="Agendadas" valor={m.agendadas}
                comoSeCalcula={DEFINICIONES.agendadas!.formula}
                tendencia={{ valor: variacion(m.agendadas, p.agendadas), sufijo: '%' }} />
        <Numero etiqueta="Asistencias" valor={m.asistencias}
                contra={`${porcentaje(m.asistenciaPct)} de las agendadas`}
                comoSeCalcula={DEFINICIONES.asistencias!.formula}
                tendencia={{ valor: variacion(m.asistencias, p.asistencias), sufijo: '%' }} />
        <Numero etiqueta="No shows" valor={m.noShows} contra={porcentaje(m.noShowPct)}
                comoSeCalcula={DEFINICIONES.noShows!.formula}
                tendencia={{ valor: variacion(m.noShows, p.noShows), mejorEsMas: false, sufijo: '%' }} />
        <Numero etiqueta="Ofertas" valor={m.ofertas}
                contra={`${porcentaje(m.ofertaPct)} de las asistencias`}
                comoSeCalcula={DEFINICIONES.ofertas!.formula} />
        <Numero etiqueta="Ventas" valor={m.ventasCerradas}
                contra={verPlata ? <Link href="/tracker#ventas">ver cuáles →</Link> : undefined}
                comoSeCalcula={DEFINICIONES.ventasCerradas!.formula}
                tendencia={{ valor: variacion(m.ventasCerradas, p.ventasCerradas), sufijo: '%' }} />
        <Numero etiqueta="Tasa de cierre" valor={m.cierrePct} unidad="%"
                contra={`${m.ventas} ventas sobre ${m.asistencias} asistencias`}
                comoSeCalcula={DEFINICIONES.cierrePct!.formula}
                tendencia={{ valor: variacion(m.cierrePct ?? 0, p.cierrePct ?? 0), sufijo: '%' }} />
        <Numero etiqueta="Señas" valor={m.senas}
                contra={verPlata ? `${plata(m.senasImporte, monedaBase)} comprometidos` : undefined}
                comoSeCalcula={DEFINICIONES.senasImporte!.formula} />
        {verPlata ? (
          <>
            <Numero etiqueta="Facturación" valor={plata(m.facturacion, monedaBase)} chico
                    contra={<>vendido · <Link href="/tracker#ventas">ver cuáles →</Link></>}
                    comoSeCalcula={DEFINICIONES.facturacion!.formula}
                    tendencia={{ valor: variacion(m.facturacion, p.facturacion), sufijo: '%' }} />
            <Numero etiqueta="Cash collected" valor={plata(m.cashCollected, monedaBase)} chico
                    contra={`${porcentaje(m.cobranzaPct)} de la venta nueva`}
                    comoSeCalcula={DEFINICIONES.cashCollected!.formula}
                    tendencia={{ valor: variacion(m.cashCollected, p.cashCollected), sufijo: '%' }} />
          </>
        ) : null}
      </div>

      {verPlata ? (
        <div className="rejilla g2">
          <Objetivo ritmo={elRitmo} moneda={monedaBase}
                    titulo={`Objetivo · ${NOMBRE_DE_OBJETIVO[tipoObjetivo]}`}
                    enPlata={tipoObjetivo === 'facturacion' || tipoObjetivo === 'cash'} />
          <Tarjeta titulo="Ticket promedio">
            <div className="numero">
              {m.ticketPromedio === null ? <span className="sindato">sin ventas</span>
                : plata(m.ticketPromedio, monedaBase)}
            </div>
            <p className="ayuda" style={{ marginTop: 6 }}>
              {DEFINICIONES.ticketPromedio!.formula}
            </p>
            <div className="separador" />
            <div className="entre">
              <span className="etiqueta">Valor en juego</span>
              <strong>{plata(m.valorEnJuego, monedaBase)}</strong>
            </div>
            <p className="ayuda" style={{ marginTop: 4 }}>
              Valor potencial de lo que sigue abierto. No es forecast: nadie lo prometió.
            </p>
          </Tarjeta>
        </div>
      ) : null}

      <div className="rejilla g2">
        <Tarjeta titulo="Embudo" ayuda="Cada porcentaje es contra la etapa anterior, que es lo que dice dónde se pierde.">
          <Embudo etapas={ahora.etapas} />
        </Tarjeta>

        <div className="apilado">
          <Tarjeta titulo="Seguimientos"
                   accion={<Link href="/seguimientos" style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Ver el pipeline →</Link>}>
            <div className="rejilla g3" style={{ gap: 8 }}>
              <div>
                <div className="etiqueta">En cadencia</div>
                <div className="numero chico">{seguimientos.resumen.enCadencia}</div>
              </div>
              <div>
                <div className="etiqueta">Vencidos</div>
                <div className="numero chico">{seguimientos.resumen.vencidos}</div>
              </div>
              <div>
                <div className="etiqueta">Tocan hoy</div>
                <div className="numero chico">{seguimientos.resumen.hoy}</div>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo={`Señas abiertas (${senas.length})`}>
            {senas.length === 0 ? (
              <p className="ayuda">No hay señas pendientes de convertir.</p>
            ) : (
              <table>
                <tbody>
                  {senas.slice(0, 6).map((s) => (
                    <tr key={s.leadId}>
                      <td><Link href={`/leads/${s.leadId}`}>{s.lead}</Link></td>
                      <td className="num">{plata(s.importe, s.moneda)}</td>
                      <td className="num" style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                        {s.comprometida
                          ? (s.vencida ? <span className="pildora rojo">venció {fechaCorta(s.comprometida)}</span>
                                       : `paga ${fechaCorta(s.comprometida)}`)
                          : 'sin fecha'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Tarjeta>
        </div>
      </div>

      <div className="rejilla g2">
        <Tarjeta titulo="Por fuente" ayuda="La suma de las filas da el total de arriba: sale de la misma consulta.">
          {porFuente.length === 0 ? <p className="ayuda">Sin datos en el período.</p> : (
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>Fuente</th><th className="num">Agendadas</th><th className="num">Asistencias</th>
                      <th className="num">Ventas</th><th className="num">Cierre</th></tr>
                </thead>
                <tbody>
                  {porFuente.map((f) => (
                    <tr key={f.nombre}>
                      <td>{f.nombre}</td>
                      <td className="num">{f.agendadas}</td>
                      <td className="num">{f.asistencias}</td>
                      <td className="num">{f.ventas}</td>
                      <td className="num">{porcentaje(f.cierrePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Por qué se pierde"
                 ayuda="Lista cerrada a propósito: «no le interesó» escrito de nueve maneras no se puede contar.">
          {porMotivo.length === 0 ? <p className="ayuda">No hay pérdidas cargadas en el período.</p> : (
            <table>
              <tbody>
                {porMotivo.map((x) => (
                  <tr key={x.nombre}>
                    <td>{NOMBRE_DE_MOTIVO[x.nombre as MotivoPerdida] ?? x.nombre}</td>
                    <td className="num">{x.agendadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
      </div>

      {pendientes.length > 0 ? (
        <Tarjeta titulo="Reuniones sin cargar"
                 accion={<Link href="/tracker?pendientes=1" style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Ver todas →</Link>}>
          <table>
            <tbody>
              {pendientes.map((x) => (
                <tr key={x.leadId}>
                  <td><Link href={`/leads/${x.leadId}`} style={{ fontWeight: 600 }}>{x.lead}</Link></td>
                  <td style={{ color: 'var(--gris)', fontSize: 12.5 }}>{x.closer ?? 'sin closer'}</td>
                  <td className="num" style={{ fontSize: 12.5 }}>{fechaCorta(x.fecha)}</td>
                  <td className="num"><span className="pildora ambar">{x.dias} d</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      ) : null}

      <p className="ayuda">
        Todo lo de esta pantalla sale de un solo módulo de métricas, el mismo que usa el Tracker.
        El embudo cuenta sobre las reuniones del período; la facturación y el cash, por la fecha
        de la venta y la del cobro. Son universos distintos a propósito y por eso no se dividen entre sí.
      </p>
    </div>
  )
}
