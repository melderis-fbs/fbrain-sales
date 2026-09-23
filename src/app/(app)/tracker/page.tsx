import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import {
  metricas, apertura, porDia, sinCargar, sinFechaDeReunion, recorridoPorCloser, ventasDelPeriodo,
  DEFINICIONES,
} from '@/datos/metricas'
import { listarLeads } from '@/datos/leads'
import { toquesDeHoy } from '@/datos/seguimientos'
import { catalogos, config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Numero, Tarjeta, Encabezado, Pildora, plata, porcentaje, fechaCorta, hora, Vacio } from '@/componentes/Piezas'
import { Iconos } from '@/componentes/Iconos'
import { CargaRapida } from '@/componentes/CargaRapida'
import { Tablero } from '@/componentes/Tablero'
import { LoDeHoy } from '@/componentes/LoDeHoy'
import { DesgloseDeClosers } from '@/componentes/DesgloseDeClosers'
import { VentasDelPeriodo } from '@/componentes/VentasDelPeriodo'
import { agendarRapidoAccion } from '../leads/acciones'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO, NOMBRE_DE_TIPO,
} from '@/dominio/resultados'
import { COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL } from '@/dominio/calidad'
import { FiltroDeCloser } from '@/componentes/FiltroDeCloser'

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
  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
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

  // «Hoy» es un bloque fijo: lo que está pasando en comercial ahora no depende
  // del período que se esté mirando abajo.
  const deHoy = { desde: hoy, hasta: hoy, etiqueta: 'hoy' }

  const [datos, leads, dias, porCloser, pendientes, sueltos, sinAgendar, toques, cats,
         agendaDeHoy, hoyMetricas, recorrido, ventas] = await Promise.all([
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
    listarLeads(alcance, { desde: hoy, hasta: hoy, closerId: filtros.closerId }, 60),
    metricas(deHoy, alcance, filtros, monedaBase),
    recorridoPorCloser(r, alcance, hoy, monedaBase),
    ventasDelPeriodo(r, alcance, filtros),
  ])

  const m = datos.medidas
  const verPlata = puede(usuario, 'verDinero')
  // La hora local, para saber qué reunión de hoy ya pasó.
  const ahora = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })

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
  // Atrasadas: las de días ANTERIORES que siguen sin cargar. Las de hoy están
  // arriba, en su agenda, y mostrarlas dos veces en la misma pantalla hace que
  // no se sepa cuál de las dos hay que completar.
  const porCargar = leads.filter(
    (l) => l.estado === 'agendado' && l.resultado === 'pendiente'
      && l.fechaSesion !== null && l.fechaSesion < hoy,
  )

  // Agrupadas por día: un período de dos semanas en una sola tabla se vuelve
  // ilegible, y el corte por día es cómo se trabaja de verdad.
  const atrasadas = pendientes.length - porCargar.length
  const porFecha = new Map<string, typeof leads>()
  for (const l of leads) {
    const clave = l.fechaSesion ?? 'sin fecha'
    porFecha.set(clave, [...(porFecha.get(clave) ?? []), l])
  }

  return (
    <div className="apilado">
      <Encabezado kicker="Tracker" titulo={r.etiqueta}
                  bajada="¿Qué ocurrió comercialmente en este período?">
        <Link className="boton secundario" href="/leads/importar">Cargar histórico</Link>
        <Link className="boton" href="/leads/nuevo">Registrar lead</Link>
      </Encabezado>

      <div className="barra-filtros">
        <div className="arriba">
          <div className="chips">
            {PERIODOS.map((x) => (
              <Link key={x.clave}
                    href={con({ periodo: x.clave, dia: undefined, desde: undefined, hasta: undefined })}
                    className={!q.dia && !aMano && periodo === x.clave ? 'activo' : ''}>{x.etiqueta}</Link>
            ))}
          </div>
          <form method="get" className="selectores">
            <input type="hidden" name="periodo" value={periodo} />
            {/* El closer se elige abajo, en las pastillas. Viaja igual acá
                para que filtrar por setter no lo borre. */}
            {q.closer ? <input type="hidden" name="closer" value={q.closer} /> : null}
            <label className="oculto" htmlFor="f-setter">Setter</label>
            <select id="f-setter" name="setter" defaultValue={q.setter ?? ''}>
              <option value="">Todos los setters</option>
              {cats.setters.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button type="submit" className="secundario chico">Filtrar</button>
          </form>
        </div>

        <FiltroDeCloser closers={cats.closers} actual={q.closer}
                        href={(closer) => con({ closer })} />
        <div className="rango">
          <Iconos.calendario />
          {fechaCorta(r.desde)} — {fechaCorta(r.hasta)}
          <form method="get" className="fila" style={{ marginLeft: 8 }}>
            <input type="hidden" name="periodo" value={periodo} />
            <label className="oculto" htmlFor="f-dia">Ver un día</label>
            <input id="f-dia" type="date" name="dia" defaultValue={q.dia ?? ''}
                   style={{ width: 150, fontSize: 12 }} />
            <button type="submit" className="sutil chico">Ver ese día</button>
          </form>
        </div>
      </div>

      {/* Un solo renglón de pendientes. Antes eran dos avisos apilados arriba de
          todo; un tablero que saluda con dos alertas amarillas todos los días
          enseña a saltearlas, y entonces la que importa tampoco se lee. */}
      {atrasadas > 0 || sueltos > 0 ? (
        <div className="pendiente">
          <span className="pendiente-que">Pendiente</span>
          {atrasadas > 0 ? (
            <Link href={con({ pendientes: '1', dia: undefined, periodo: undefined,
                              desde: masVieja ?? undefined, hasta: hoy })}>
              {atrasadas} {atrasadas === 1 ? 'reunión sin cargar' : 'reuniones sin cargar'} →
            </Link>
          ) : null}
          {sueltos > 0 ? (
            <Link href="/leads?sinfecha=1">
              {sueltos} {sueltos === 1 ? 'lead sin fecha' : 'leads sin fecha'} →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="rejilla g4">
        <Numero etiqueta="Agendas" valor={m.agendadas}
                contra="primeras llamadas del período"
                comoSeCalcula={DEFINICIONES.agendadas!.formula} />
        <Numero etiqueta="Segundas llamadas" valor={m.segundas}
                contra={m.segundas === 0 ? 'ninguna en el período'
                  : `${m.segundasAsistidas} asistidas · no cuentan como agenda`}
                comoSeCalcula={DEFINICIONES.segundas!.formula} />
        <Numero etiqueta="Asistencias" valor={m.asistencias}
                contra={`${porcentaje(m.asistenciaPct)} de las agendas`}
                comoSeCalcula={DEFINICIONES.asistencias!.formula} />
        <Numero etiqueta="No shows" valor={m.noShows} contra={porcentaje(m.noShowPct)} />
        <Numero etiqueta="Ofertas" valor={m.ofertas}
                contra={`${porcentaje(m.ofertaPct)} de las asistencias`} />
        <Numero etiqueta="Cierres" valor={m.ventasCerradas}
                contra={<a href="#ventas">ver cuáles →</a>}
                comoSeCalcula={DEFINICIONES.ventasCerradas!.formula} />
        <Numero etiqueta="Tasa de cierre" valor={m.cierrePct} unidad="%"
                contra={`${m.ventas} de ${m.asistencias} reuniones del período`}
                comoSeCalcula={DEFINICIONES.cierrePct!.formula} />
        <Numero etiqueta="Cierre en segunda" valor={m.cierresEnSegunda}
                contra="de los cierres, en segunda llamada"
                comoSeCalcula={DEFINICIONES.cierresEnSegunda!.formula} />
        <Numero etiqueta="Señas" valor={m.senas}
                contra={verPlata ? `${plata(m.senasImporte, monedaBase)} comprometidos` : undefined} />
        <Numero etiqueta="Sin cargar" valor={m.pendientesDeCargar}
                contra={m.pendientesDeCargar > 0 ? 'los números están incompletos' : 'todo al día'} />
        {verPlata ? (
          <Numero etiqueta="Facturación" valor={plata(m.facturacion, monedaBase)} chico
                  contra={<>vendido · <a href="#ventas">ver cuáles →</a></>}
                  comoSeCalcula={DEFINICIONES.facturacion!.formula} />
        ) : null}
        {verPlata ? (
          <Numero etiqueta="Cash collected" valor={plata(m.cashCollected, monedaBase)} chico
                  contra={`${porcentaje(m.cobranzaPct)} de la venta nueva`}
                  comoSeCalcula={DEFINICIONES.cobranzaPct!.formula} />
        ) : null}
      </div>

      <Tarjeta titulo={alcance.todo ? 'Cómo viene cada closer' : 'Cómo venís'}
               ayuda={alcance.todo
                 ? 'De izquierda a derecha, en el orden en que se trabaja. El total, abajo.'
                 : 'De izquierda a derecha, en el orden en que se trabaja.'}>
        <DesgloseDeClosers filas={recorrido} verPlata={verPlata} soloUno={!alcance.todo} />
      </Tarjeta>

      {verPlata ? (
        <div id="ventas">
          <Tarjeta titulo={`Ventas de ${r.etiqueta} (${ventas.length})`}
                   ayuda="Por fecha de venta, no por la fecha de la reunión: una llamada de septiembre firmada en octubre es una venta de octubre. Tocá el nombre para abrir la ficha, o cargá el cobro acá mismo.">
            <VentasDelPeriodo ventas={ventas} etiqueta={r.etiqueta}
                              puedeCobrar={puede(usuario, 'editarDinero')} />
          </Tarjeta>
        </div>
      ) : null}

      <Tarjeta titulo="Hoy"
               ayuda="La agenda del día, en orden. Lo que ya pasó y nadie cargó está primero, y se carga desde acá sin abrir la ficha.">
        <LoDeHoy leads={agendaDeHoy} hoy={hoy} ahora={ahora}
                 cerradoHoy={hoyMetricas.medidas.facturacion} moneda={monedaBase} verPlata={verPlata} />
      </Tarjeta>

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

      <Tarjeta titulo={`Las métricas de ${r.etiqueta}`}
               ayuda="A la izquierda cuántos; a la derecha qué porcentaje pasa de una etapa a la otra. Sale del mismo módulo que el Dashboard: no hay dos cuentas, hay una.">
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

      <Tarjeta titulo="Día por día"
               ayuda="Las agendas y las asistencias son las reuniones de ese día; los cierres, los que se firmaron ese día.">
          {dias.length === 0 ? <p className="ayuda">Sin reuniones en el período.</p> : (
            <table>
              <thead>
                <tr><th>Día</th><th className="num">Agendadas</th><th className="num">Asistencias</th><th className="num">Cierres</th></tr>
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
                    <td className="num">{d.cerradas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </Tarjeta>
    </div>
  )
}
