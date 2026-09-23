import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { opcion } from '@/lib/busqueda'
import { alcanceDe, puede } from '@/lib/permisos'
import { restaurarLeadAccion } from './acciones'
import { cuando } from '@/componentes/Piezas'
import { listarLeads, listarBorrados } from '@/datos/leads'
import { catalogos } from '@/datos/catalogos'
import { hoyEn } from '@/motor/periodos'
import { Pildora, Tarjeta, Encabezado, plata, fechaCorta, Vacio } from '@/componentes/Piezas'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
  RESULTADOS, ESTADOS, type Resultado, type Estado,
} from '@/dominio/resultados'
import { COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL } from '@/dominio/calidad'
import { FiltroDeCloser } from '@/componentes/FiltroDeCloser'
import { Cargado, cargoElSetter, cargoElCloser } from '@/componentes/Cargado'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * La lista de leads.
 *
 * Una fila por persona, no una por llamada. María con tres llamadas es una
 * fila: es una sola oportunidad de venta, y verla tres veces hacía que la lista
 * no se pudiera contar de un vistazo.
 */
export default async function Leads({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const hoy = hoyEn()
  const verPlata = puede(usuario, 'verDinero')

  // Los dados de baja viven en su propia vista. Si se mezclaran con los
  // activos, «dado de baja» y «perdido» se leerían igual — y son cosas
  // distintas: uno es un resultado comercial, el otro es una corrección.
  if (q.baja === '1') return <Bajas />

  const [leads, cats] = await Promise.all([
    listarLeads(alcance, {
      texto: q.q,
      fuenteId: q.fuente ? Number(q.fuente) : undefined,
      funnelId: q.funnel ? Number(q.funnel) : undefined,
      setterId: q.setter ? Number(q.setter) : undefined,
      closerId: q.closer ? Number(q.closer) : undefined,
      resultado: opcion<Resultado>(q.resultado),
      estado: opcion<Estado>(q.estado),
      desde: q.desde,
      hasta: q.hasta,
      soloAbiertos: q.abiertos === '1',
      sinFecha: q.sinfecha === '1',
    }),
    catalogos(),
  ])

  const abiertos = leads.filter((l) => l.resultado === 'pendiente' || l.resultado === 'seguimiento' || l.resultado === 'sena').length

  // Cambiar un filtro sin perder los otros.
  const con = (cambio: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...q, ...cambio })) if (v) u.set(k, v)
    const t = u.toString()
    return t === '' ? '/leads' : `/leads?${t}`
  }

  return (
    <div className="apilado">
      <Encabezado kicker="Leads" titulo={`${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`}
                  bajada={`${abiertos} ${abiertos === 1 ? 'sigue abierto' : 'siguen abiertos'} · cada lead es una oportunidad de venta`}>
        {puede(usuario, 'borrarLead') ? (
          <Link className="boton secundario" href="/leads?baja=1">Dados de baja</Link>
        ) : null}
        <Link className="boton secundario" href="/leads/importar">Cargar histórico</Link>
        <Link className="boton" href="/leads/nuevo">Registrar lead</Link>
      </Encabezado>

      {q.ajeno ? (
        <div className="aviso dato">
          <strong>Se creó «{q.ajeno}»</strong>, pero quedó asignado a otra persona, así que no
          aparece en tu lista. No se perdió: lo ve quien lo tenga asignado y dirección.
        </div>
      ) : null}

      {q.sinfecha === '1' ? (
        <div className="aviso atencion">
          Estos leads <strong>no tienen fecha de reunión</strong>, así que no entran a ninguna
          métrica del Dashboard ni del Tracker. Se les pone fecha desde la pestaña Datos de cada
          ficha, o de a varios en el{' '}
          <Link href="/tracker" style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>Tracker</Link>.
        </div>
      ) : null}

      <FiltroDeCloser closers={cats.closers} actual={q.closer}
                      href={(closer) => con({ closer })} />

      <form className="filtros" method="get">
        <div className="campo" style={{ minWidth: 210 }}>
          <label htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={q.q ?? ''} placeholder="Nombre, email o teléfono" />
        </div>
        {/* El closer se elige arriba, en las pastillas: es el filtro que el
            equipo usa todo el día y no puede costar tres pasos. Viaja igual
            acá adentro para que filtrar por fuente no lo borre. */}
        {q.closer ? <input type="hidden" name="closer" value={q.closer} /> : null}
        {([
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
        <div className="campo">
          <label htmlFor="f-estado">Reunión</label>
          <select id="f-estado" name="estado" defaultValue={q.estado ?? ''}>
            <option value="">Todas</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{NOMBRE_DE_ESTADO[e]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="f-resultado">Resultado</label>
          <select id="f-resultado" name="resultado" defaultValue={q.resultado ?? ''}>
            <option value="">Todos</option>
            {RESULTADOS.map((r) => <option key={r} value={r}>{NOMBRE_DE_RESULTADO[r]}</option>)}
          </select>
        </div>
        <button type="submit" className="secundario">Filtrar</button>
        <Link className="boton sutil" href="/leads">Limpiar</Link>
      </form>

      <Tarjeta>
        {leads.length === 0 ? (
          <Vacio>
            No hay leads con esos filtros.{' '}
            <Link href="/leads/nuevo" style={{ color: 'var(--acento)', fontWeight: 650 }}>Registrar el primero →</Link>
          </Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Quality</th><th>Fuente</th><th>Setter</th>
                  <th>Closer</th><th>Reunión</th><th>Estado</th><th>Resultado</th>
                  <th>Próximo contacto</th>
                  {verPlata ? <th className="num">Plata</th> : null}
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const vencido = l.proximoContacto !== null && l.proximoContacto < hoy
                  return (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                        {l.ciclo > 1 ? (
                          <span className="pildora acento" style={{ marginLeft: 6 }}>ciclo {l.ciclo}</span>
                        ) : null}
                        {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                      </td>
                      <td>
                        {l.calidadNivel
                          ? <Pildora color={COLOR_DE_CALIDAD[l.calidadNivel]} titulo={`Lead quality ${l.calidadScore}`}>
                              {NOMBRE_DE_NIVEL[l.calidadNivel]} · {l.calidadScore}
                            </Pildora>
                          : <span className="sindato">sin calificar</span>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{l.fuente ?? <span className="sindato">—</span>}</td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        <Cargado quien="setter" hecho={cargoElSetter(l)} />
                        {l.setter ?? <span className="sindato">—</span>}
                      </td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        <Cargado quien="closer" hecho={cargoElCloser(l)} />
                        {l.closer ?? <span className="sindato">sin asignar</span>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{fechaCorta(l.fechaSesion)}</td>
                      <td><Pildora color={COLOR_DE_ESTADO[l.estado]}>{NOMBRE_DE_ESTADO[l.estado]}</Pildora></td>
                      <td><Pildora color={COLOR_DE_RESULTADO[l.resultado]}>{NOMBRE_DE_RESULTADO[l.resultado]}</Pildora></td>
                      <td style={{ fontSize: 12.5 }}>
                        {l.proximoContacto
                          ? (vencido
                              ? <Pildora color="rojo">{fechaCorta(l.proximoContacto)} · vencido</Pildora>
                              : fechaCorta(l.proximoContacto))
                          : <span className="sindato">—</span>}
                      </td>
                      {/* Lo firmado gana sobre lo estimado: una venta de 5.000
                          se veía como su estimación, o como «—» si nadie la
                          había estimado. */}
                      {verPlata ? (
                        <td className="num">
                          {l.vendido !== null ? (
                            <>
                              <strong>{plata(l.vendido, l.moneda)}</strong>
                              <div style={{ fontSize: 11, color: 'var(--gris)', fontWeight: 500 }}>
                                {l.cobrado > 0 ? `${plata(l.cobrado, l.moneda)} cobrado` : 'sin cobrar'}
                              </div>
                            </>
                          ) : l.senado !== null ? (
                            <>
                              <strong>{plata(l.senado, l.moneda)}</strong>
                              <div style={{ fontSize: 11, color: 'var(--gris)', fontWeight: 500 }}>seña</div>
                            </>
                          ) : l.valorPotencial ? (
                            <span style={{ color: 'var(--gris)' }}>
                              {plata(l.valorPotencial, l.moneda)}
                              <div style={{ fontSize: 11, color: 'var(--gris-claro)', fontWeight: 500 }}>estimado</div>
                            </span>
                          ) : <span className="sindato">—</span>}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {/* La leyenda de los puntos, una sola vez y acá abajo. Repetirla en cada
          fila es lo que convierte una tabla en un cartel. */}
      <p className="ayuda">
        El punto al lado de cada nombre dice si esa persona ya cargó lo suyo:{' '}
        <Cargado quien="setter" hecho /> el setter, la calificación;{' '}
        <Cargado quien="closer" hecho /> el closer, el resultado de la llamada.
        Hueco quiere decir que falta.
      </p>
    </div>
  )
}

/**
 * Los leads dados de baja.
 *
 * Existe esta pantalla porque, si no, «dado de baja» y «se perdió» se ven
 * igual: un lead que desaparece sin dejar rastro hace dudar de todo el resto de
 * los números. Acá está quién lo dio de baja, cuándo y por qué, y —para quien
 * ve la operación entera— el botón para volver a ponerlo en juego.
 */
async function Bajas() {
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const borrados = await listarBorrados(alcance)

  return (
    <div className="apilado">
      <Encabezado kicker="Leads" titulo={`${borrados.length} dados de baja`}
                  bajada="Nada se borró: salieron de las listas y de las métricas, y se pueden volver a poner en juego.">
        <Link className="boton secundario" href="/leads">Volver a los activos</Link>
      </Encabezado>

      <Tarjeta>
        {borrados.length === 0 ? (
          <Vacio>No hay ningún lead dado de baja.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Closer</th><th>Setter</th><th>Resultado</th>
                    <th>Cuándo</th><th>Quién</th><th>Por qué</th><th></th></tr>
              </thead>
              <tbody>
                {borrados.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>
                      {l.nombre}
                      {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">—</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{l.setter ?? <span className="sindato">—</span>}</td>
                    <td><Pildora color={COLOR_DE_RESULTADO[l.resultado]}>{NOMBRE_DE_RESULTADO[l.resultado]}</Pildora></td>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{cuando(l.borradoEn)}</td>
                    <td style={{ fontSize: 12.5 }}>{l.porQuien ?? <span className="sindato">—</span>}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                      {l.motivo ?? <span className="sindato">sin motivo</span>}
                    </td>
                    <td className="num">
                      {puede(usuario, 'restaurarLead') ? (
                        <form action={restaurarLeadAccion}>
                          <input type="hidden" name="leadId" value={l.id} />
                          <button type="submit" className="sutil" style={{ fontSize: 11.5 }}>
                            Volver a ponerlo
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {!puede(usuario, 'restaurarLead') ? (
        <p className="ayuda">
          Volver a poner un lead en juego lo hace dirección. Es a propósito: si el que se equivocó
          pudiera deshacerlo solo, el error no dejaría rastro — y el punto de que esto sea
          reversible es que el error se vea, no que se tape.
        </p>
      ) : null}
    </div>
  )
}
