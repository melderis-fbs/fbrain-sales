import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { listarLeads } from '@/datos/leads'
import { metricas, sinCargar } from '@/datos/metricas'
import { catalogos } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Numero, Tarjeta, Encabezado, Pildora, Vacio, fechaCorta, hora } from '@/componentes/Piezas'
import { CargaRapida } from '@/componentes/CargaRapida'
import { abrirTranscripcionAccion } from './acciones'
import { comoSeLee } from '@/dominio/rubrica'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
  NOMBRE_DE_TIPO, RESULTADOS, type Resultado,
} from '@/dominio/resultados'
import { COLOR_DE_CALIDAD } from '@/dominio/calidad'

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
  const r = q.dia ? { desde: q.dia, hasta: q.dia, etiqueta: fechaCorta(q.dia) } : rango(periodo, hoy)
  const filtros = { closerId: q.closer ? Number(q.closer) : undefined }

  const [datos, leads, atrasadas, cats] = await Promise.all([
    metricas(r, alcance, filtros),
    listarLeads(alcance, {
      desde: r.desde, hasta: r.hasta,
      closerId: filtros.closerId,
      texto: q.q,
      resultado: q.resultado as Resultado | undefined,
    }, 400),
    sinCargar(alcance, hoy, 100),
    catalogos(),
  ])

  const m = datos.medidas
  const paraCargar = leads.filter(
    (l) => l.estado === 'agendado' && l.resultado === 'pendiente'
      && l.fechaSesion !== null && l.fechaSesion <= hoy,
  )
  const deOtrosDias = atrasadas.filter((a) => !paraCargar.some((l) => l.id === a.leadId))

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
                  bajada={`${r.etiqueta} · tus reuniones y qué pasó en cada una`}>
        <Link className="boton secundario" href="/analizador">Analizador</Link>
        <Link className="boton" href="/leads/nuevo">Registrar lead</Link>
      </Encabezado>

      <div className="entre">
        <div className="chips">
          {PERIODOS.map((x) => (
            <Link key={x.clave} href={con({ periodo: x.clave, dia: undefined })}
                  className={!q.dia && periodo === x.clave ? 'activo' : ''}>{x.etiqueta}</Link>
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
          <Link href={con({ periodo: 'anio', dia: undefined })}
                style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>Verlas →</Link>
        </div>
      ) : null}

      {paraCargar.length > 0 ? (
        <Tarjeta titulo={`Para cargar (${paraCargar.length})`}
                 ayuda="Ya pasaron y no dicen qué pasó. Cargalo acá, o tocá el nombre para entrar a la ficha.">
          <div className="tabla-scroll">
            <table className="tabla-carga">
              <thead><tr><th>Cuándo</th><th>Lead</th><th>Closer</th><th>Qué pasó</th><th></th></tr></thead>
              <tbody>
                {paraCargar.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {fechaCorta(l.fechaSesion)}<br />{hora(l.horaSesion)}
                    </td>
                    <td>
                      <Link href={`/leads/${l.id}?volver=llamadas`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                      {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">—</span>}</td>
                    <td><CargaRapida leadId={l.id} estado={l.estado} resultado={l.resultado}
                                     moneda={l.moneda} hoy={hoy} compacto /></td>
                    <td className="num">
                      <Link href={`/leads/${l.id}?volver=llamadas`}
                            style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Abrir →</Link>
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
