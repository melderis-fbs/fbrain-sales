import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { metricas, apertura, porDia, sinCargar, sinFechaDeReunion } from '@/datos/metricas'
import { listarLeads } from '@/datos/leads'
import { toquesDeHoy } from '@/datos/seguimientos'
import { catalogos, config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Tarjeta, Encabezado, Pildora, plata, porcentaje, fechaCorta, hora, Vacio } from '@/componentes/Piezas'
import { CargaRapida } from '@/componentes/CargaRapida'
import { Tablero } from '@/componentes/Tablero'
import { agendarRapidoAccion } from '../leads/acciones'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO, NOMBRE_DE_TIPO,
} from '@/dominio/resultados'
import { COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL } from '@/dominio/calidad'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * El Tracker: la planilla de trabajo del equipo.
 *
 * Es la pantalla que reemplaza el Excel compartido. La nutren el setter —que
 * carga el lead y la calificación— y los closers —que cargan qué pasó—, y
 * dirección la mira para ver cómo viene el día sin pedirle a nadie que le
 * pase un número.
 *
 * Los totales de arriba salen del mismo módulo que el Dashboard. No puede
 * pasar que esta pantalla y aquélla digan cosas distintas del mismo mes,
 * porque no hay dos cuentas: hay una.
 */
export default async function Tracker({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)

  const hoy = hoyEn()
  const periodo = (q.periodo ?? 'hoy') as NombreDePeriodo
  // Un rango a mano gana sobre el período. Hace falta para cargar un histórico
  // —«todas las llamadas del mes pasado»— y para que «Verlas →» pueda mostrar
  // reuniones atrasadas de cualquier fecha, que es lo que el aviso promete.
  const aMano = q.desde ? { desde: q.desde, hasta: q.hasta ?? hoy } : null
  const r = aMano
    ? { ...aMano, etiqueta: `${fechaCorta(aMano.desde)} a ${fechaCorta(aMano.hasta)}` }
    : q.dia ? { desde: q.dia, hasta: q.dia, etiqueta: fechaCorta(q.dia) }
    : rango(periodo, hoy)
  const monedaBase = await config<string>('moneda_base', 'USD')
  const soloPendientes = q.pendientes === '1'

  const filtros = { closerId: q.closer ? Number(q.closer) : undefined }

  const [datos, leads, dias, porCloser, pendientes, sueltos, sinAgendar, toques, cats] = await Promise.all([
    metricas(r, alcance, filtros, monedaBase),
    listarLeads(alcance, {
      desde: r.desde, hasta: r.hasta,
      closerId: filtros.closerId,
      soloSinCargar: soloPendientes,
    }, 400),
    porDia(r, alcance, filtros),
    apertura('closer', r, alcance, filtros, monedaBase),
    sinCargar(alcance, hoy, 100),
    sinFechaDeReunion(alcance),
    listarLeads(alcance, { sinFecha: true }, 50),
    toquesDeHoy(alcance, hoy),
    catalogos(),
  ])

  const m = datos.medidas
  const verPlata = puede(usuario, 'verDinero')

  const con = (cambio: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...q, ...cambio })) if (v) u.set(k, v)
    return `/tracker?${u.toString()}`
  }

  // La reunión atrasada más vieja. El aviso de «Verlas →» tiene que llevar a un
  // rango que las contenga a todas: mandar a un período fijo era prometer una
  // lista y mostrar otra —o ninguna—, que es como si el enlace no hiciera nada.
  const masVieja = pendientes.reduce<string | null>(
    (v, x) => (v === null || x.fecha < v ? x.fecha : v), null)

  // Lo que hay que cargar: la reunión ya fue y nadie dijo qué pasó. Va arriba
  // de todo porque es el trabajo pendiente, no un dato de consulta.
  const porCargar = leads.filter(
    (l) => l.estado === 'agendado' && l.resultado === 'pendiente'
      && l.fechaSesion !== null && l.fechaSesion <= hoy,
  )

  // Agrupadas por día: un período de dos semanas en una sola tabla se vuelve
  // ilegible, y el corte por día es cómo se trabaja de verdad.
  const porFecha = new Map<string, typeof leads>()
  for (const l of leads) {
    const clave = l.fechaSesion ?? 'sin fecha'
    porFecha.set(clave, [...(porFecha.get(clave) ?? []), l])
  }

  return (
    <div className="apilado">
      <Encabezado kicker="Tracker" titulo={r.etiqueta}
                  bajada="La planilla del equipo: lo que hay agendado, qué pasó y qué falta cargar.">
        <Link className="boton" href="/leads/nuevo">Registrar lead</Link>
      </Encabezado>

      <div className="entre">
        <div className="chips">
          {PERIODOS.map((x) => (
            <Link key={x.clave}
                href={con({ periodo: x.clave, dia: undefined, desde: undefined, hasta: undefined })}
                  className={!q.dia && !aMano && periodo === x.clave ? 'activo' : ''}>{x.etiqueta}</Link>
          ))}
        </div>
        <form method="get" className="fila">
          <input type="date" name="dia" defaultValue={q.dia ?? ''} style={{ width: 155 }} aria-label="Ver un día" />
          <button type="submit" className="secundario chico">Ver ese día</button>
        </form>
      </div>

      <form className="filtros" method="get">
        <input type="hidden" name="periodo" value={periodo} />
        {q.dia ? <input type="hidden" name="dia" value={q.dia} /> : null}
        <div className="campo">
          <label htmlFor="f-closer">Closer</label>
          <select id="f-closer" name="closer" defaultValue={q.closer ?? ''}>
            <option value="">Todos</option>
            {cats.closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="campo" style={{ minWidth: 0 }}>
          <label htmlFor="f-pend">Sólo sin cargar</label>
          <select id="f-pend" name="pendientes" defaultValue={soloPendientes ? '1' : ''}>
            <option value="">No</option>
            <option value="1">Sí</option>
          </select>
        </div>
        <button type="submit" className="secundario">Filtrar</button>
      </form>

      {pendientes.length > porCargar.length ? (
        <div className="aviso atencion">
          Fuera de este período hay <strong>{pendientes.length - porCargar.length}</strong>{' '}
          {pendientes.length - porCargar.length === 1
            ? 'reunión más que ya pasó sin resultado cargado'
            : 'reuniones más que ya pasaron sin resultado cargado'}.{' '}
          <Link href={con({ pendientes: '1', dia: undefined, periodo: undefined,
                            desde: masVieja ?? undefined, hasta: hoy })}
                style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>Verlas →</Link>
        </div>
      ) : null}

      {sueltos > sinAgendar.length ? (
        <div className="aviso atencion">
          Hay <strong>{sueltos}</strong> leads sin fecha de reunión. No entran a ninguna métrica
          hasta que la tengan.{' '}
          <Link href="/leads?sinfecha=1" style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>
            Verlos →
          </Link>
        </div>
      ) : null}

      {porCargar.length > 0 ? (
        <Tarjeta titulo={`Cargar el resultado de la llamada (${porCargar.length})`}
                 ayuda="Sale de una llamada y carga acá, sin abrir la ficha. El importe se pide sólo si hubo venta o seña; el motivo, sólo si se perdió.">
          <div className="tabla-scroll">
            <table className="tabla-carga">
              <thead>
                <tr><th>Hora</th><th>Lead</th><th>Closer</th><th>Qué pasó</th></tr>
              </thead>
              <tbody>
                {porCargar.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {fechaCorta(l.fechaSesion)} {hora(l.horaSesion)}
                    </td>
                    <td>
                      <Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                      {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">sin asignar</span>}</td>
                    <td>
                      <CargaRapida leadId={l.id} estado={l.estado} resultado={l.resultado}
                                   moneda={l.moneda} hoy={hoy} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ayuda" style={{ marginTop: 10 }}>
            Para el resto —próximo paso, observaciones, saldo de la seña, cobros— está la
            pestaña <strong>Resultado</strong> de la ficha del lead.
          </p>
        </Tarjeta>
      ) : null}

      {sinAgendar.length > 0 ? (
        <Tarjeta titulo={`Sin fecha de reunión (${sinAgendar.length})`}
                 ayuda="Estos leads no entran a ninguna métrica: el embudo entero cuenta sobre las reuniones del período. Ponéles fecha y aparecen.">
          <div className="tabla-scroll">
            <table className="tabla-carga">
              <thead><tr><th>Lead</th><th>Setter</th><th>Closer</th><th>Agendar</th></tr></thead>
              <tbody>
                {sinAgendar.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.nombre}</Link></td>
                    <td style={{ fontSize: 12.5 }}>{l.setter ?? <span className="sindato">—</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">sin asignar</span>}</td>
                    <td>
                      <form action={agendarRapidoAccion} className="carga">
                        <input type="hidden" name="leadId" value={l.id} />
                        <label className="oculto" htmlFor={`f-${l.id}`}>Fecha</label>
                        <input id={`f-${l.id}`} name="fechaSesion" type="date" required style={{ width: 150 }} />
                        <label className="oculto" htmlFor={`h-${l.id}`}>Hora</label>
                        <input id={`h-${l.id}`} name="horaSesion" type="time" style={{ width: 110 }} />
                        <button type="submit" className="chico secundario">Agendar</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ) : null}

      <Tarjeta titulo={`El tablero · ${r.etiqueta}`}
               ayuda="Sale del mismo módulo de métricas que el Dashboard: no hay dos cuentas, hay una. Pasá el mouse por cada número para ver de dónde sale."
               accion={<Link href="/dashboard" style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Ver el Dashboard →</Link>}>
        <Tablero m={m} verPlata={verPlata} />
      </Tarjeta>

      {toques.length > 0 ? (
        <Tarjeta titulo={`Seguimientos que tocan hoy (${toques.length})`}
                 accion={<Link href="/seguimientos" style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Ir al pipeline →</Link>}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Lead</th><th>Closer</th><th>Toque</th><th>Tocaba</th><th className="num">Estado</th></tr>
              </thead>
              <tbody>
                {toques.slice(0, 12).map((t) => (
                  <tr key={t.leadId}>
                    <td><Link href={`/leads/${t.leadId}?pestana=seguimiento`} style={{ fontWeight: 600 }}>{t.nombre}</Link></td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{t.closer ?? '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{t.situacion === 'largo' ? 'Seguimiento largo' : `Toque ${t.toque}`}</td>
                    <td style={{ fontSize: 12.5 }}>{fechaCorta(t.fecha)}</td>
                    <td className="num">
                      {t.atraso > 0
                        ? <Pildora color="rojo">{t.atraso} {t.atraso === 1 ? 'día' : 'días'}</Pildora>
                        : <Pildora color="acento">hoy</Pildora>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ) : null}

      <Tarjeta titulo={`Reuniones (${leads.length})`}
               ayuda="Cada fila es un lead, que es una oportunidad de venta. Las llamadas que haga falta cuelgan de él.">
        {leads.length === 0 ? (
          <Vacio>
            No hay reuniones en este período.{' '}
            <Link href="/leads/nuevo" style={{ color: 'var(--acento)', fontWeight: 650 }}>Registrar un lead →</Link>
          </Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Hora</th><th>Lead</th><th>Quality</th><th>Setter</th><th>Closer</th>
                  <th>Reunión</th><th>Resultado</th>
                  {verPlata ? <th className="num">Valor</th> : null}
                  <th></th>
                </tr>
              </thead>
              {[...porFecha.entries()].map(([dia, delDia]) => (
                <tbody key={dia}>
                  {porFecha.size > 1 ? (
                    <tr>
                      <td colSpan={verPlata ? 9 : 8}
                          style={{ background: 'var(--gris-fondo)', fontSize: 11.5, fontWeight: 650,
                                   color: 'var(--gris)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        {dia === 'sin fecha' ? 'Sin fecha de reunión' : fechaCorta(dia)}
                        {dia === hoy ? ' · hoy' : ''}
                        <span style={{ fontWeight: 500, marginLeft: 8 }}>
                          {delDia.length} {delDia.length === 1 ? 'reunión' : 'reuniones'}
                        </span>
                      </td>
                    </tr>
                  ) : null}
                  {delDia.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{hora(l.horaSesion)}</td>
                      <td>
                        <Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                        {l.ciclo > 1 ? (
                          <span className="pildora acento" style={{ marginLeft: 6 }}>repesca · ciclo {l.ciclo}</span>
                        ) : null}
                        {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                      </td>
                      <td>
                        {l.calidadNivel
                          ? <Pildora color={COLOR_DE_CALIDAD[l.calidadNivel]} titulo={`Lead quality ${l.calidadScore}`}>
                              {NOMBRE_DE_NIVEL[l.calidadNivel]}
                            </Pildora>
                          : <span className="sindato">sin calificar</span>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{l.setter ?? <span className="sindato">—</span>}</td>
                      <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">sin asignar</span>}</td>
                      <td><Pildora color={COLOR_DE_ESTADO[l.estado]}>{NOMBRE_DE_ESTADO[l.estado]}</Pildora></td>
                      <td><Pildora color={COLOR_DE_RESULTADO[l.resultado]}>{NOMBRE_DE_RESULTADO[l.resultado]}</Pildora></td>
                      {verPlata ? (
                        <td className="num">{l.valorPotencial ? plata(l.valorPotencial, l.moneda) : '—'}</td>
                      ) : null}
                      <td className="num">
                        <Link href={`/leads/${l.id}?volver=tracker`}
                              style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                          {l.estado === 'agendado' && l.resultado === 'pendiente' ? 'Cargar →' : 'Abrir →'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Tarjeta>

      <div className="rejilla g2">
        <Tarjeta titulo="Por closer" ayuda="Del mismo período y de la misma consulta que los totales de arriba.">
          {porCloser.length === 0 ? <p className="ayuda">Sin datos en el período.</p> : (
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>Closer</th><th className="num">Agend.</th><th className="num">Asist.</th>
                      <th className="num">Ofertas</th><th className="num">Ventas</th><th className="num">Cierre</th></tr>
                </thead>
                <tbody>
                  {porCloser.map((c) => (
                    <tr key={c.nombre}>
                      <td>{c.id ? <Link href={`/closers/${c.id}`}>{c.nombre}</Link> : c.nombre}</td>
                      <td className="num">{c.agendadas}</td>
                      <td className="num">{c.asistencias}</td>
                      <td className="num">{c.ofertas}</td>
                      <td className="num">{c.ventas}</td>
                      <td className="num">{porcentaje(c.cierrePct)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{m.agendadas}</td>
                    <td className="num">{m.asistencias}</td>
                    <td className="num">{m.ofertas}</td>
                    <td className="num">{m.ventas}</td>
                    <td className="num">{porcentaje(m.cierrePct)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Día por día">
          {dias.length === 0 ? <p className="ayuda">Sin reuniones en el período.</p> : (
            <table>
              <thead>
                <tr><th>Día</th><th className="num">Agendadas</th><th className="num">Asistencias</th><th className="num">Ventas</th></tr>
              </thead>
              <tbody>
                {dias.map((d) => (
                  <tr key={d.dia}>
                    <td>
                      <Link href={con({ dia: d.dia, periodo: undefined })}>{fechaCorta(d.dia)}</Link>
                      {d.dia === hoy ? <span className="pildora acento" style={{ marginLeft: 6 }}>hoy</span> : null}
                    </td>
                    <td className="num">{d.agendadas}</td>
                    <td className="num">{d.asistencias}</td>
                    <td className="num">{d.ventas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
