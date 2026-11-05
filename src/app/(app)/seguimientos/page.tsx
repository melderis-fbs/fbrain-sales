import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { pipelineDeSeguimientos, type Tarjeta as Ficha } from '@/datos/seguimientos'
import { catalogos, config } from '@/datos/catalogos'
import { hoyEn } from '@/motor/periodos'
import { Numero, Tarjeta, Encabezado, Pildora, plata, fechaCorta, Vacio } from '@/componentes/Piezas'
import {
  NOMBRE_DE_TOQUE, NOMBRE_DE_SITUACION, NOMBRE_DE_SALIDA_SEG, type MotivoDeSalida,
} from '@/dominio/seguimientos'
import { FiltroDeCloser } from '@/componentes/FiltroDeCloser'
import { PasosDelPipeline } from '@/componentes/PasosDelPipeline'
import { ListaDeSeguimientos } from '@/componentes/ListaDeSeguimientos'
import { VolverAMeterlo } from '@/componentes/VolverAMeterlo'

/**
 * El pipeline de seguimientos.
 *
 * Es un TABLERO: una columna por toque, y cada lead una tarjeta parada en el
 * toque en el que va. Registrar el toque la mueve a la columna siguiente, que
 * es la única forma de ver de un vistazo dónde se traba la cadencia: si la
 * columna 3 tiene veinte tarjetas y la 4 tiene una, el problema está en el
 * toque 3 y no hay que calcularlo.
 *
 * Antes eran cuatro listas por urgencia y una línea de tiempo aparte arriba.
 * Tenía su lógica —el trabajo del día primero— y no se entendía: el mismo
 * lead aparecía en un lugar distinto según el día, y ninguna de las dos
 * mitades mostraba el recorrido.
 *
 * El trabajo del día no se pierde: el filtro «Lo que toca» deja en el tablero
 * sólo lo vencido y lo de hoy, sin cambiar de pantalla ni de forma.
 *
 * Esto NO es una lista aparte de leads: es una vista de los leads que quedaron
 * en seguimiento. Si fuera una lista propia se desincronizaría —un lead ya
 * vendido seguiría apareciendo para perseguir— y nadie sabría cuál de las dos
 * pantallas tiene razón.
 */
type Busqueda = Promise<Record<string, string | undefined>>

export default async function Seguimientos({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const hoy = hoyEn()
  const monedaBase = await config<string>('moneda_base', 'USD')
  // «Lo que toca» es el trabajo del día sin cambiar de pantalla: el tablero
  // sigue siendo el tablero, con menos tarjetas.
  const soloLoQueToca = q.solo === 'toca'
  // Y el closer filtra TODO —tablero y números de arriba—: un filtro que deja
  // el encabezado contando a todo el equipo dice dos cosas a la vez.
  const closerId = q.closer ? Number(q.closer) : undefined

  const [{ columnas, largos, fuera, resumen }, cats] = await Promise.all([
    pipelineDeSeguimientos(alcance, hoy, monedaBase, closerId),
    catalogos(),
  ])
  const urge = (t: Ficha) => t.urgencia === 'vencido' || t.urgencia === 'hoy'
  const enElTablero = columnas.map((c) => ({
    ...c, tarjetas: soloLoQueToca ? c.tarjetas.filter(urge) : c.tarjetas,
  }))
  const largosEnElTablero = soloLoQueToca ? largos.filter(urge) : largos

  // El paso elegido en la barra de arriba. `largo` son los que pidieron que
  // los llamen en una fecha puntual, que no están en ningún toque.
  const paso: number | 'largo' | null =
    q.paso === 'largo' ? 'largo' : q.paso && Number.isInteger(Number(q.paso)) ? Number(q.paso) : null

  /**
   * La lista, ordenada por lo que más atrasado está.
   *
   * Es el orden del trabajo y no el del calendario: con treinta vencidos, lo
   * primero que hay que ver es lo que lleva más tiempo sin que nadie lo
   * toque. Antes el orden era alfabético dentro de cada columna, que no
   * contesta ninguna pregunta.
   */
  const enLaLista = [
    ...(paso === 'largo' ? [] : enElTablero.filter((c) => paso === null || c.toque.orden === paso)
      .flatMap((c) => c.tarjetas)),
    ...(paso === null || paso === 'largo' ? largosEnElTablero : []),
  ].sort((a, b) => b.atraso - a.atraso || a.nombre.localeCompare(b.nombre))

  const nombreDelPaso = paso === 'largo'
    ? 'Seguimiento largo'
    : columnas.find((c) => c.toque.orden === paso)?.toque.nombre
  const titulo = paso === null
    ? (soloLoQueToca ? `Lo que toca (${enLaLista.length})` : `Todos (${enLaLista.length})`)
    : `${paso === 'largo' ? '★' : paso} · ${nombreDelPaso} (${enLaLista.length})`
  const ayuda = 'Lo más atrasado primero. Se pueden marcar varios y resolverlos de una vez.'

  /**
   * Los que recorrieron los doce toques sin decidirse.
   *
   * No son «fuera del pipeline»: el que dijo que no está cerrado, y éstos
   * siguen abiertos y esperando una decisión. Mezclados en la misma lista, la
   * decisión no se toma nunca.
   */
  const agotados = fuera.filter((t) => t.motivoSalida === 'cadencia_agotada')
  const otrosFuera = fuera.filter((t) => t.motivoSalida !== 'cadencia_agotada')

  // Cambiar un filtro sin perder el otro.
  const con = (cambio: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...q, ...cambio })) if (v) u.set(k, v)
    const s = u.toString()
    return s === '' ? '/seguimientos' : `/seguimientos?${s}`
  }

  return (
    <div className="apilado">
      <Encabezado kicker="Seguimientos" titulo="Pipeline de 12 toques"
                  bajada="Los doce pasos arriba, con cuántos hay en cada uno y cuántos están atrasados. Tocá uno para trabajar sólo ése." />

      <div className="rejilla g4">
        <Numero etiqueta="En cadencia" valor={resumen.enCadencia} />
        <Numero etiqueta="Vencidos" valor={resumen.vencidos}
                contra={resumen.vencidos > 0 ? 'hay que ponerse al día' : 'todo al día'} />
        <Numero etiqueta="Tocan hoy" valor={resumen.hoy} />
        <Numero etiqueta="Próximos dos días" valor={resumen.proximos} />
        <Numero etiqueta="Seguimiento largo" valor={resumen.largos}
                contra="pidieron que los llamen más adelante" />
        <Numero etiqueta="Fuera del pipeline" valor={resumen.fuera} />
        <Numero etiqueta="Valor en juego" valor={plata(resumen.valorEnJuego, resumen.moneda)} chico
                contra="de lo que sigue en cadencia · no es forecast" />
      </div>

      <div className="barra-filtros">
        <div className="arriba">
          <div className="chips">
            <Link href={con({ solo: undefined })} className={soloLoQueToca ? '' : 'activo'}>
              Todo el tablero
            </Link>
            <Link href={con({ solo: 'toca' })} className={soloLoQueToca ? 'activo' : ''}>
              Lo que toca ({resumen.vencidos + resumen.hoy})
            </Link>
          </div>
          <FiltroDeCloser closers={cats.closers} actual={q.closer}
                          href={(closer) => con({ closer })} />
        </div>
      </div>

      {resumen.enCadencia === 0 && largos.length === 0 ? (
        <Tarjeta>
          <Vacio>
            No hay nadie en la cadencia. Un lead entra solo cuando el closer marca el resultado
            como «Seguimiento» en su ficha, y entra el día de la reunión: de ahí se cuentan
            los días.
          </Vacio>
        </Tarjeta>
      ) : (
        <>
          {/* Los doce pasos de un vistazo. El tablero en columnas no podía
              mostrarlos: doce columnas legibles son tres mil píxeles. */}
          <PasosDelPipeline
            pasos={enElTablero.map((c) => ({
              toque: c.toque,
              cuantos: c.tarjetas.length,
              tarde: c.tarjetas.filter((t) => t.urgencia === 'vencido').length,
            }))}
            largos={largosEnElTablero.length}
            largosTarde={largosEnElTablero.filter(urge).length}
            elegido={paso}
            href={(x) => con({ paso: x === null ? undefined : String(x) })} />

          <Tarjeta titulo={titulo} ayuda={ayuda}>
            {enLaLista.length === 0 ? (
              <Vacio>
                {soloLoQueToca
                  ? 'No hay nada vencido ni para hoy. La cadencia está al día.'
                  : 'No hay nadie en este paso.'}
              </Vacio>
            ) : (
              <ListaDeSeguimientos fichas={enLaLista} hoy={hoy} />
            )}
          </Tarjeta>
        </>
      )}

      {/* La cadencia se terminó y hay que decidir. Van aparte de «fuera del
          pipeline» porque no son lo mismo: el que dijo que no está cerrado, y
          éstos recorrieron los doce toques sin decidirse y siguen abiertos.
          Mezclados, la decisión no se toma nunca. */}
      {agotados.length > 0 ? (
        <Tarjeta titulo={`Se acabó la cadencia (${agotados.length})`}
                 ayuda="Hicieron los doce toques y no se decidieron. No hay toque que registrarles: hay que decidir si se posponen, se cierran o se vuelven a meter.">
          <div className="tabla-scroll">
            <table>
              <tbody>
                {agotados.map((t) => (
                  <tr key={t.leadId}>
                    <td>
                      <Link href={`/leads/${t.leadId}?pestana=seguimiento&volver=seguimientos`}
                            style={{ fontWeight: 650 }}>{t.nombre}</Link>
                      <div className="meta">{[t.empresa, t.closer ?? 'sin closer'].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                      {t.ultimos.length} {t.ultimos.length === 1 ? 'toque' : 'toques'} ·{' '}
                      {t.ultimoEstado ? NOMBRE_DE_TOQUE[t.ultimoEstado] : '—'}
                    </td>
                    <td className="num"><VolverAMeterlo leadId={t.leadId} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ) : null}

      {otrosFuera.length > 0 ? (
        <Tarjeta titulo={`Fuera del pipeline (${otrosFuera.length})`}
                 ayuda="Se fueron por «no interesado», porque agendaron, o porque se cerraron. Están acá por si hay que volver a meterlos.">
          <div className="tabla-scroll">
            <table>
              <tbody>
                {otrosFuera.slice(0, 20).map((t) => (
                  <tr key={t.leadId}>
                    <td><Link href={`/leads/${t.leadId}`} style={{ fontWeight: 600 }}>{t.nombre}</Link></td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{t.closer ?? '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                      {t.motivoSalida
                        ? NOMBRE_DE_SALIDA_SEG[t.motivoSalida as MotivoDeSalida]
                        : t.ultimoEstado ? NOMBRE_DE_TOQUE[t.ultimoEstado]
                        : NOMBRE_DE_SITUACION[t.situacion]}
                    </td>
                    <td className="num"><VolverAMeterlo leadId={t.leadId} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ) : null}
    </div>
  )
}
