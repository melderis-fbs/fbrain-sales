import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { pipelineDeSeguimientos, type Tarjeta as Ficha } from '@/datos/seguimientos'
import { config } from '@/datos/catalogos'
import { hoyEn } from '@/motor/periodos'
import { Numero, Tarjeta, Encabezado, Pildora, plata, fechaCorta, Vacio } from '@/componentes/Piezas'
import { ESTADOS_TOQUE, NOMBRE_DE_TOQUE, NOMBRE_DE_SITUACION } from '@/dominio/seguimientos'
import { COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL } from '@/dominio/calidad'
import { registrarToqueAccion, volverAlPipelineAccion } from './acciones'

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

  const { columnas, largos, fuera, resumen } = await pipelineDeSeguimientos(alcance, hoy, monedaBase)
  const urge = (t: Ficha) => t.urgencia === 'vencido' || t.urgencia === 'hoy'
  const enElTablero = columnas.map((c) => ({
    ...c, tarjetas: soloLoQueToca ? c.tarjetas.filter(urge) : c.tarjetas,
  }))
  const largosEnElTablero = soloLoQueToca ? largos.filter(urge) : largos

  return (
    <div className="apilado">
      <Encabezado kicker="Seguimientos" titulo="Pipeline de 12 toques"
                  bajada="Una columna por toque. Registrar el toque mueve la tarjeta a la siguiente." />

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
            <Link href="/seguimientos" className={soloLoQueToca ? '' : 'activo'}>Todo el tablero</Link>
            <Link href="/seguimientos?solo=toca" className={soloLoQueToca ? 'activo' : ''}>
              Lo que toca ({resumen.vencidos + resumen.hoy})
            </Link>
          </div>
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
        <div className="tablero">
          {enElTablero.map((c) => {
            const tarde = c.tarjetas.filter((t) => t.urgencia === 'vencido').length
            return (
              <div key={c.toque.orden} data-toque={c.toque.orden}
                   className={c.tarjetas.length === 0 ? 'columna vacia' : 'columna'}>
                <div className="cabeza">
                  <span className="orden">{c.toque.orden}</span>
                  <span className="como">
                    <span className="que" title={c.toque.nombre}>{c.toque.nombre}</span>
                    <span className="dia">DÍA {c.toque.dias}</span>
                  </span>
                  <span className="cuantos">
                    {c.tarjetas.length}
                    {tarde > 0 ? <span className="tarde"> · {tarde} tarde</span> : null}
                  </span>
                </div>
                <div className="cuerpo">
                  {c.tarjetas.length === 0
                    ? <div className="nadie">—</div>
                    : c.tarjetas.map((t) => <FichaDeLead key={t.leadId} t={t} />)}
                </div>
              </div>
            )
          })}

          {largos.length > 0 ? (
            <div data-toque="largo" className={largosEnElTablero.length === 0 ? 'columna vacia' : 'columna'}>
              <div className="cabeza">
                <span className="orden">★</span>
                <span className="como">
                  <span className="que">Seguimiento largo</span>
                  <span className="dia">FUERA DE LA CADENCIA</span>
                </span>
                <span className="cuantos">{largosEnElTablero.length}</span>
              </div>
              <div className="cuerpo">
                {largosEnElTablero.length === 0
                  ? <div className="nadie">—</div>
                  : largosEnElTablero.map((t) => <FichaDeLead key={t.leadId} t={t} />)}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {fuera.length > 0 ? (
        <Tarjeta titulo={`Fuera del pipeline (${fuera.length})`}
                 ayuda="Se fueron por «no interesado», porque agendaron, o porque se cerraron. Están acá por si hay que volver a meterlos.">
          <div className="tabla-scroll">
            <table>
              <tbody>
                {fuera.slice(0, 20).map((t) => (
                  <tr key={t.leadId}>
                    <td><Link href={`/leads/${t.leadId}`} style={{ fontWeight: 600 }}>{t.nombre}</Link></td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{t.closer ?? '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                      {t.ultimoEstado ? NOMBRE_DE_TOQUE[t.ultimoEstado] : NOMBRE_DE_SITUACION[t.situacion]}
                    </td>
                    <td className="num">
                      <form action={volverAlPipelineAccion}>
                        <input type="hidden" name="leadId" value={t.leadId} />
                        <button type="submit" className="sutil" style={{ fontSize: 11.5 }}>Volver a meterlo</button>
                      </form>
                    </td>
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

/**
 * Un lead dentro de la cadencia.
 *
 * Sin la barra de doce pasos que tenía antes: la columna en la que está ES el
 * paso, y dibujarlo otra vez en cada tarjeta es tinta que no dice nada nuevo.
 * Lo que queda es lo que no está en la columna: quién es, de quién es, cuándo
 * le tocaba y qué hacer ahora.
 */
function FichaDeLead({ t }: { t: Ficha }) {
  const clase = t.urgencia === 'vencido' ? 'ficha vencida'
    : t.urgencia === 'hoy' ? 'ficha hoy'
    : t.urgencia === 'proximo' ? 'ficha proxima' : 'ficha'

  return (
    <div className={clase}>
      <div className="entre" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/leads/${t.leadId}?pestana=seguimiento&volver=seguimientos`} className="nombre">{t.nombre}</Link>
          <div className="meta">
            {[t.empresa, t.closer ?? 'sin closer'].filter(Boolean).join(' · ')}
          </div>
        </div>
        {t.calidadNivel ? (
          <Pildora color={COLOR_DE_CALIDAD[t.calidadNivel]}>{NOMBRE_DE_NIVEL[t.calidadNivel]}</Pildora>
        ) : null}
      </div>

      <div className="paso">
        {t.situacion === 'largo' ? (
          <>
            <span className="cual">Vuelve</span>
            <span className="cuando">{fechaCorta(t.fechaLarga)}</span>
          </>
        ) : (
          <>
            <span className="cual">
              {t.atraso > 0 ? <span style={{ color: 'var(--rojo)' }}>Tarde</span>
                : t.atraso === 0 ? <span style={{ color: 'var(--acento)' }}>Toca hoy</span>
                : 'Toca'}
            </span>
            <span className="cuando">
              {t.atraso > 0 ? `${t.atraso} ${t.atraso === 1 ? 'día' : 'días'}` : fechaCorta(t.fecha)}
            </span>
          </>
        )}
      </div>

      <form action={registrarToqueAccion} className="acciones">
        <input type="hidden" name="leadId" value={t.leadId} />
        <label className="oculto" htmlFor={`s-${t.leadId}`}>Qué pasó con {t.nombre}</label>
        <select id={`s-${t.leadId}`} name="estado" defaultValue="no_contesto">
          {ESTADOS_TOQUE.map((e) => <option key={e} value={e}>{NOMBRE_DE_TOQUE[e]}</option>)}
        </select>
        <button type="submit" className="chico">Registrar</button>
      </form>
    </div>
  )
}
