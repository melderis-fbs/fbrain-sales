import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { opcion } from '@/lib/busqueda'
import { alcanceDe } from '@/lib/permisos'
import { listarLeads } from '@/datos/leads'
import { metricas, sinCargar } from '@/datos/metricas'
import { catalogos } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Numero, Tarjeta, Encabezado, Pildora, Vacio, fechaCorta, hora } from '@/componentes/Piezas'
import { abrirTranscripcionAccion } from './acciones'
import { comoSeLee } from '@/dominio/rubrica'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
  NOMBRE_DE_TIPO, RESULTADOS, type Resultado,
} from '@/dominio/resultados'
import { COLOR_DE_CALIDAD } from '@/dominio/calidad'
import { Reportar } from '@/componentes/Reportar'
import { Cargado, cargoElCloser } from '@/componentes/Cargado'
import type { LeadEnLista } from '@/datos/leads'

/**
 * De lo que la lista sabe del lead a lo que el reporte necesita.
 *
 * Está acá y no dentro del componente para que la pantalla sea la que decide
 * qué le pasa: el reporte no consulta nada por su cuenta, y una lista de
 * cuarenta llamadas no dispara cuarenta consultas para dibujar cuarenta
 * botones.
 */
function paraReportar(l: LeadEnLista) {
  return {
    id: l.id, nombre: l.nombre, empresa: l.empresa, closer: l.closer,
    tipoSesion: l.tipoSesion, fuente: l.fuente,
    moneda: l.moneda, fechaSesion: l.fechaSesion,
    estado: l.estado, resultado: l.resultado,
    huboOferta: l.huboOferta, seguimientoLargo: l.seguimientoLargo,
    motivoPerdida: l.motivoPerdida,
    venta: l.vendido !== null && l.ventaFecha !== null
      ? { importe: l.vendido, fecha: l.ventaFecha,
          programa: l.ventaPrograma, cuotas: l.ventaCuotas }
      : null,
    plan: l.plan,
  }
}

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * Mis llamadas.
 *
 * La pantalla del closer: lo que tiene hoy, cómo le fue, y un clic para entrar
 * a cargar. El nombre del lead abre su ficha —donde están los cinco botones de
 * acción— y no una lista intermedia.
 *
 * Llamadas y Analizador se dividen por TRABAJO y no por entidad: acá se carga
 * qué pasó, allá se mira cómo estuvo la llamada.
 */
export default async function Llamadas({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const hoy = hoyEn()

  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  // Un rango a mano gana sobre el período: es lo que hace falta para cargar un
  // histórico, y para que «Verlas →» muestre reuniones atrasadas de cualquier
  // fecha en vez de saltar a un período fijo que puede no contenerlas.
  const aMano = q.desde ? { desde: q.desde, hasta: q.hasta ?? hoy } : null
  const r = aMano
    ? { ...aMano, etiqueta: `${fechaCorta(aMano.desde)} a ${fechaCorta(aMano.hasta)}` }
    : q.dia ? { desde: q.dia, hasta: q.dia, etiqueta: fechaCorta(q.dia) }
    : rango(periodo, hoy)
  const filtros = { closerId: q.closer ? Number(q.closer) : undefined }

  const [datos, leads, atrasadas, cats] = await Promise.all([
    metricas(r, alcance, filtros),
    listarLeads(alcance, {
      desde: r.desde, hasta: r.hasta,
      closerId: filtros.closerId,
      texto: q.q,
      resultado: opcion<Resultado>(q.resultado),
    }, 400),
    sinCargar(alcance, hoy, 100),
    catalogos(),
  ])

  const m = datos.medidas
  const paraCargar = leads.filter(
    (l) => l.estado === 'agendado' && l.resultado === 'pendiente'
      && l.fechaSesion !== null && l.fechaSesion <= hoy,
  )

  /**
   * Las de hoy, por closer.
   *
   * Es lo primero de la pantalla y es lo único que el closer necesita ver al
   * salir de una reunión. Van las de hoy enteras —reportadas y sin reportar—
   * porque «qué me queda» y «qué ya hice» son la misma pregunta a esta hora
   * del día, y porque un resultado mal cargado se corrige acá mismo.
   */
  const deHoy = leads.filter((l) => l.fechaSesion === hoy)
  const porCloser = [...new Map(
    deHoy.map((l) => [l.closer ?? '', deHoy.filter((x) => (x.closer ?? '') === (l.closer ?? ''))]),
  )].sort((a, b) => (a[0] || 'zz').localeCompare(b[0] || 'zz'))
  const sinReportarHoy = deHoy.filter((l) => !cargoElCloser(l)).length
  // Las que quedaron atrás sin reportar. Separadas de las de hoy a propósito:
  // mezcladas, la lista de hoy crece cada día que alguien no carga y deja de
  // leerse como «lo que tengo ahora».
  const atrasSinReportar = paraCargar.filter((l) => l.fechaSesion !== hoy)
  const deOtrosDias = atrasadas.filter((a) => !paraCargar.some((l) => l.id === a.leadId))
  const masVieja = deOtrosDias.reduce<string | null>(
    (v, x) => (v === null || x.fecha < v ? x.fecha : v), null)

  const conNota = leads.filter((l) => l.notaLlamada !== null)
  const promedio = conNota.length === 0 ? null
    : Math.round((conNota.reduce((s, l) => s + (l.notaLlamada ?? 0), 0) / conNota.length) * 10) / 10
  const conTranscripcion = leads.filter((l) => l.tieneTranscripcion).length

  const con = (cambio: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...q, ...cambio })) if (v) u.set(k, v)
    return `/llamadas?${u.toString()}`
  }

  return (
    <div className="apilado">
      <Encabezado kicker="Llamadas" titulo="Mis llamadas"
                  bajada={`${r.etiqueta} · acá se reporta cada llamada, y de acá salen el tablero y el dashboard`}>
        <Link className="boton secundario" href="/analizador">Analizador</Link>
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

      <div className="rejilla g6">
        <Numero etiqueta="Total llamadas" valor={m.agendadas} />
        <Numero etiqueta="Completadas" valor={m.asistencias} />
        <Numero etiqueta="No shows" valor={m.noShows} />
        <Numero etiqueta="Ventas" valor={m.ventas} contra={`${m.cierrePct ?? 0}% de cierre`} />
        <Numero etiqueta="Call score" valor={promedio}
                contra={promedio === null ? 'sin llamadas analizadas' : `${comoSeLee(promedio)} · ${conNota.length} analizadas`} />
        <Numero etiqueta="Transcripciones" valor={conTranscripcion}
                contra={`de ${leads.length} reuniones`} />
      </div>

      {deOtrosDias.length > 0 ? (
        <div className="aviso atencion">
          Fuera de este período hay <strong>{deOtrosDias.length}</strong>{' '}
          {deOtrosDias.length === 1 ? 'reunión' : 'reuniones'} sin cargar.{' '}
          <Link href={con({ dia: undefined, periodo: undefined, resultado: undefined,
                            desde: masVieja ?? undefined, hasta: hoy })}
                style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>Verlas →</Link>
        </div>
      ) : null}

      {deHoy.length > 0 ? (
        <Tarjeta titulo={`Hoy · ${deHoy.length} ${deHoy.length === 1 ? 'llamada' : 'llamadas'}`}
                 ayuda={sinReportarHoy === 0
                   ? 'Todas reportadas. Se puede volver a entrar para corregir.'
                   : `Faltan reportar ${sinReportarHoy}. «Reportar» abre todo lo que hay que cargar, en orden y de una vez.`}>
          <div className="apilado" style={{ gap: 18 }}>
            {porCloser.map(([quien, suyas]) => (
              <div key={quien || 'sin-closer'}>
                <div className="titulo-seccion">
                  {quien || 'Sin closer asignado'} · {suyas.length}
                </div>
                <div className="agenda">
                  {suyas.map((l) => (
                    <div key={l.id} className="turno">
                      <div className="turno-hora">{hora(l.horaSesion)}</div>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/leads/${l.id}?volver=llamadas`} style={{ fontWeight: 600 }}>
                          <Cargado quien="closer" hecho={cargoElCloser(l)} />{l.nombre}
                        </Link>
                        <div className="turno-detalle">
                          {[l.empresa,
                            l.calidadScore !== null ? `LQ ${l.calidadScore}` : null,
                            l.fuente].filter(Boolean).join(' · ') || 'sin datos del setter'}
                        </div>
                      </div>
                      <div className="turno-estado">
                        {/* Lo que pasó, en una sola pastilla. En un no show el
                            resultado sigue siendo «Pendiente» —y es correcto,
                            no hubo venta que ganar o perder— pero mostrarlo
                            así al lado de un reporte ya hecho se lee como que
                            falta cargarlo. Cuando no hay resultado, lo que
                            pasó es la asistencia. */}
                        {cargoElCloser(l) ? (
                          l.resultado === 'pendiente'
                            ? <Pildora color={COLOR_DE_ESTADO[l.estado]}>
                                {NOMBRE_DE_ESTADO[l.estado]}
                              </Pildora>
                            : <Pildora color={COLOR_DE_RESULTADO[l.resultado]}>
                                {NOMBRE_DE_RESULTADO[l.resultado]}
                              </Pildora>
                        ) : null}
                        <Reportar lead={paraReportar(l)} hoy={hoy} compacto />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Tarjeta>
      ) : null}

      {atrasSinReportar.length > 0 ? (
        <Tarjeta titulo={`Quedaron sin reportar (${atrasSinReportar.length})`}
                 ayuda="De días anteriores. Ya pasaron y no dicen qué pasó.">
          <div className="tabla-scroll">
            <table className="tabla-carga">
              <thead><tr><th>Cuándo</th><th>Lead</th><th>Closer</th><th></th></tr></thead>
              <tbody>
                {atrasSinReportar.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {fechaCorta(l.fechaSesion)}<br />{hora(l.horaSesion)}
                    </td>
                    <td>
                      <Link href={`/leads/${l.id}?volver=llamadas`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                      {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">—</span>}</td>
                    <td className="num">
                      <Reportar lead={paraReportar(l)} hoy={hoy} compacto />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ) : null}

      <form className="filtros" method="get">
        <input type="hidden" name="periodo" value={periodo} />
        <div className="campo" style={{ minWidth: 230 }}>
          <label htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={q.q ?? ''} placeholder="Nombre del lead" />
        </div>
        <div className="campo">
          <label htmlFor="f-resultado">Resultado</label>
          <select id="f-resultado" name="resultado" defaultValue={q.resultado ?? ''}>
            <option value="">Todos los resultados</option>
            {RESULTADOS.map((x) => <option key={x} value={x}>{NOMBRE_DE_RESULTADO[x]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="f-closer">Closer</label>
          <select id="f-closer" name="closer" defaultValue={q.closer ?? ''}>
            <option value="">Todos los closers</option>
            {cats.closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <button type="submit" className="secundario">Filtrar</button>
        <Link className="boton sutil" href="/llamadas">Limpiar</Link>
      </form>

      <Tarjeta>
        {leads.length === 0 ? (
          <Vacio>No hay reuniones en este período.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Lead</th><th>Closer</th><th>Tipo</th><th>Reunión</th>
                  <th>Resultado</th><th className="num">LQ</th><th className="num">Score</th>
                  <th>Transcripción</th><th></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fechaCorta(l.fechaSesion)}</td>
                    <td>
                      <Link href={`/leads/${l.id}?volver=llamadas`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                      {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">—</span>}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{NOMBRE_DE_TIPO.primera}</td>
                    <td><Pildora color={COLOR_DE_ESTADO[l.estado]}>{NOMBRE_DE_ESTADO[l.estado]}</Pildora></td>
                    <td><Pildora color={COLOR_DE_RESULTADO[l.resultado]}>{NOMBRE_DE_RESULTADO[l.resultado]}</Pildora></td>
                    <td className="num">
                      {l.calidadNivel && l.calidadScore !== null
                        ? <strong style={{ color: `var(--${COLOR_DE_CALIDAD[l.calidadNivel]})` }}>
                            {l.calidadScore}
                          </strong>
                        : <span className="sindato">—</span>}
                    </td>
                    <td className="num">
                      {l.notaLlamada !== null
                        ? <Pildora color={l.notaLlamada >= 8 ? 'verde' : l.notaLlamada >= 6 ? 'ambar' : 'rojo'}>
                            {l.notaLlamada.toFixed(1)}
                          </Pildora>
                        : <span className="sindato">—</span>}
                    </td>
                    <td>
                      {l.tieneTranscripcion ? (
                        <Link href={`/analizador/${l.llamadaId}`}
                              style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                          Ver →
                        </Link>
                      ) : (
                        /* Si todavía no hay una llamada registrada, la crea sola:
                           la reunión ya está cargada, así que la llamada existió. */
                        <form action={abrirTranscripcionAccion}>
                          <input type="hidden" name="leadId" value={l.id} />
                          <input type="hidden" name="fecha" value={l.fechaSesion ?? hoy} />
                          <button type="submit" className="secundario chico">Subir</button>
                        </form>
                      )}
                    </td>
                    <td className="num">
                      <Link href={`/leads/${l.id}?volver=llamadas`}
                            style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Abrir →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <p className="ayuda">
        La columna <strong>LQ</strong> es el Lead Quality que cargó el setter antes de la llamada;
        <strong> Score</strong> es la nota que el analizador le puso a la llamada. Son dos cosas
        distintas: la primera dice qué tan bueno era el lead, la segunda qué tan bien se lo trabajó.
      </p>
    </div>
  )
}
