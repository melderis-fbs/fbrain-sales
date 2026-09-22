import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { listarLeads } from '@/datos/leads'
import { sinCargar } from '@/datos/metricas'
import { catalogos } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Numero, Tarjeta, Encabezado, Pildora, Vacio, plata, fechaCorta, hora } from '@/componentes/Piezas'
import { CargaRapida } from '@/componentes/CargaRapida'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
} from '@/dominio/resultados'
import { COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL } from '@/dominio/calidad'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * Llamadas: la pantalla del closer.
 *
 * Antes esta pantalla y el Analizador mostraban casi lo mismo —dos listas de
 * llamadas— y ninguna de las dos servía para lo que el closer hace todo el día,
 * que es cargar qué pasó. Ahora se dividen por trabajo y no por entidad:
 *
 *   LLAMADAS    lo que tengo hoy y qué pasó en cada una  (el closer)
 *   ANALIZADOR  cómo estuvieron esas llamadas            (el closer y el coach)
 *
 * De acá se entra a la llamada —no al lead entero— y todo lo que se carga
 * escribe sobre el mismo lead: no hay copia ni registro paralelo.
 */
export default async function Llamadas({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const hoy = hoyEn()

  const periodo = (q.periodo ?? 'hoy') as NombreDePeriodo
  const r = q.dia ? { desde: q.dia, hasta: q.dia, etiqueta: fechaCorta(q.dia) } : rango(periodo, hoy)

  const [leads, atrasadas, cats] = await Promise.all([
    listarLeads(alcance, {
      desde: r.desde, hasta: r.hasta,
      closerId: q.closer ? Number(q.closer) : undefined,
    }, 300),
    sinCargar(alcance, hoy, 100),
    catalogos(),
  ])

  const paraCargar = leads.filter(
    (l) => l.estado === 'agendado' && l.resultado === 'pendiente'
      && l.fechaSesion !== null && l.fechaSesion <= hoy,
  )
  const porVenir = leads.filter(
    (l) => l.fechaSesion !== null && l.fechaSesion > hoy,
  )
  const cargadas = leads.filter((l) => !paraCargar.includes(l) && !porVenir.includes(l))
  const deOtrosDias = atrasadas.filter((a) => !paraCargar.some((l) => l.id === a.leadId))

  const con = (cambio: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...q, ...cambio })) if (v) u.set(k, v)
    return `/llamadas?${u.toString()}`
  }

  return (
    <div className="apilado">
      <Encabezado kicker="Llamadas" titulo={r.etiqueta}
                  bajada="Tus reuniones y qué pasó en cada una. Lo que cargues acá es lo mismo que ve el Tracker.">
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

      <div className="rejilla g4">
        <Numero etiqueta="Reuniones" valor={leads.length} />
        <Numero etiqueta="Para cargar" valor={paraCargar.length}
                contra={paraCargar.length > 0 ? 'ya pasaron y no dicen qué pasó' : 'todo al día'} />
        <Numero etiqueta="Por venir" valor={porVenir.length} />
        <Numero etiqueta="Cargadas" valor={cargadas.length} />
      </div>

      {deOtrosDias.length > 0 ? (
        <div className="aviso atencion">
          Fuera de este período hay <strong>{deOtrosDias.length}</strong>{' '}
          {deOtrosDias.length === 1 ? 'reunión' : 'reuniones'} sin cargar.{' '}
          <Link href={con({ periodo: 'mes', dia: undefined })}
                style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>
            Ver el mes →
          </Link>
        </div>
      ) : null}

      <Tarjeta titulo={`Para cargar (${paraCargar.length})`}
               ayuda="Qué pasó con la reunión y qué pasó con la venta. El importe se pide sólo si hubo venta o seña; el motivo, sólo si se perdió.">
        {paraCargar.length === 0 ? (
          <Vacio>No hay reuniones pendientes de cargar en este período.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla-carga">
              <thead>
                <tr><th>Hora</th><th>Lead</th><th>Quality</th><th>Qué pasó</th><th></th></tr>
              </thead>
              <tbody>
                {paraCargar.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {fechaCorta(l.fechaSesion)}<br />{hora(l.horaSesion)}
                    </td>
                    <td>
                      <Link href={`/llamadas/${l.id}`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                      {l.empresa ? (
                        <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div>
                      ) : null}
                    </td>
                    <td>
                      {l.calidadNivel
                        ? <Pildora color={COLOR_DE_CALIDAD[l.calidadNivel]}>
                            {NOMBRE_DE_NIVEL[l.calidadNivel]}
                          </Pildora>
                        : <span className="sindato">sin calificar</span>}
                    </td>
                    <td>
                      <CargaRapida leadId={l.id} estado={l.estado} resultado={l.resultado}
                                   moneda={l.moneda} hoy={hoy} />
                    </td>
                    <td className="num">
                      <Link href={`/llamadas/${l.id}`}
                            style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                        Abrir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {porVenir.length > 0 ? (
        <Tarjeta titulo={`Por venir (${porVenir.length})`}
                 ayuda="Entrá a la llamada antes de la reunión: ahí está lo que averiguó el setter.">
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Cuándo</th><th>Lead</th><th>Quality</th><th>Setter</th><th></th></tr></thead>
              <tbody>
                {porVenir.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {fechaCorta(l.fechaSesion)} {hora(l.horaSesion)}
                    </td>
                    <td>
                      <Link href={`/llamadas/${l.id}`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                      {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                    </td>
                    <td>
                      {l.calidadNivel
                        ? <Pildora color={COLOR_DE_CALIDAD[l.calidadNivel]}>
                            {NOMBRE_DE_NIVEL[l.calidadNivel]} · {l.calidadScore}
                          </Pildora>
                        : <span className="sindato">sin calificar</span>}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.setter ?? <span className="sindato">—</span>}</td>
                    <td className="num">
                      <Link href={`/llamadas/${l.id}`}
                            style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                        Prepararla →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ) : null}

      {cargadas.length > 0 ? (
        <Tarjeta titulo={`Ya cargadas (${cargadas.length})`}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Cuándo</th><th>Lead</th><th>Reunión</th><th>Resultado</th>
                    <th className="num">Valor</th><th></th></tr>
              </thead>
              <tbody>
                {cargadas.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fechaCorta(l.fechaSesion)}</td>
                    <td>
                      <Link href={`/llamadas/${l.id}`} style={{ fontWeight: 600 }}>{l.nombre}</Link>
                      {l.empresa ? <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>{l.empresa}</div> : null}
                    </td>
                    <td><Pildora color={COLOR_DE_ESTADO[l.estado]}>{NOMBRE_DE_ESTADO[l.estado]}</Pildora></td>
                    <td><Pildora color={COLOR_DE_RESULTADO[l.resultado]}>{NOMBRE_DE_RESULTADO[l.resultado]}</Pildora></td>
                    <td className="num">{l.valorPotencial ? plata(l.valorPotencial, l.moneda) : '—'}</td>
                    <td className="num">
                      <Link href={`/llamadas/${l.id}`}
                            style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Abrir →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ) : null}

      {cats.closers.length > 1 ? (
        <form className="filtros" method="get">
          <input type="hidden" name="periodo" value={periodo} />
          <div className="campo">
            <label htmlFor="f-closer">Ver las de</label>
            <select id="f-closer" name="closer" defaultValue={q.closer ?? ''}>
              <option value="">Todo el equipo</option>
              {cats.closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <button type="submit" className="secundario">Filtrar</button>
        </form>
      ) : null}
    </div>
  )
}
