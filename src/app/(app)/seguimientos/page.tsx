import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { pipelineDeSeguimientos, type Tarjeta as Ficha } from '@/datos/seguimientos'
import { config } from '@/datos/catalogos'
import { hoyEn } from '@/motor/periodos'
import type { Toque, Urgencia } from '@/motor/toques'
import { Numero, Tarjeta, Encabezado, Pildora, plata, fechaCorta, Vacio } from '@/componentes/Piezas'
import { ESTADOS_TOQUE, NOMBRE_DE_TOQUE, NOMBRE_DE_SITUACION } from '@/dominio/seguimientos'
import { COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL } from '@/dominio/calidad'
import { registrarToqueAccion, volverAlPipelineAccion } from './acciones'

/**
 * El pipeline de seguimientos.
 *
 * Dos vistas de lo mismo, y las dos hacen falta:
 *
 *  - LA PISTA arriba: los doce toques como una línea de tiempo, con cuánta
 *    gente hay parada en cada uno. Contesta «dónde se traba la cadencia», que
 *    es una pregunta de dirección.
 *  - LAS TARJETAS abajo: un lead por tarjeta, con su progreso sobre los doce
 *    pasos y el día que le toca. Contesta «qué hago ahora», que es la pregunta
 *    del closer.
 *
 * Las tarjetas van ordenadas por URGENCIA, no por toque. Un tablero ordenado
 * por etapa obliga a recorrer doce columnas para juntar el trabajo del día;
 * ordenado por urgencia, el trabajo del día son las primeras tarjetas.
 *
 * Esto NO es una lista aparte de leads: es una vista de los leads que quedaron
 * en seguimiento. Si fuera una lista propia se desincronizaría —un lead ya
 * vendido seguiría apareciendo para perseguir— y nadie sabría cuál de las dos
 * pantallas tiene razón.
 */
export default async function Seguimientos() {
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const hoy = hoyEn()
  const monedaBase = await config<string>('moneda_base', 'USD')

  const { columnas, largos, fuera, resumen } = await pipelineDeSeguimientos(alcance, hoy, monedaBase)
  const cadencia = columnas.map((c) => c.toque)
  const activas = columnas.flatMap((c) => c.tarjetas)

  // Por urgencia, que es el orden en que se trabaja.
  const TANDAS: { urgencia: Urgencia; titulo: string; ayuda: string }[] = [
    { urgencia: 'vencido', titulo: 'Vencidos', ayuda: 'El toque tenía que haberse hecho y no se hizo. Va primero.' },
    { urgencia: 'hoy', titulo: 'Tocan hoy', ayuda: 'El trabajo del día.' },
    { urgencia: 'proximo', titulo: 'En los próximos dos días', ayuda: 'Para preparar lo que viene.' },
    { urgencia: 'espera', titulo: 'En espera', ayuda: 'Ya se tocaron: les falta para el siguiente.' },
  ]

  return (
    <div className="apilado">
      <Encabezado kicker="Seguimientos" titulo="Pipeline de 12 toques"
                  bajada="Cada toque se cuenta desde el último toque real, no desde que el lead entró." />

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

      <Tarjeta titulo="La cadencia"
               ayuda="Cuánta gente hay parada en cada toque. Donde se amontona es donde la cadencia se traba.">
        <div className="pista">
          {columnas.map((c) => {
            const vencidos = c.tarjetas.filter((t) => t.urgencia === 'vencido').length
            const clases = [
              'nodo',
              c.tarjetas.length > 0 ? 'conGente' : '',
              vencidos > 0 ? 'conVencidos' : '',
            ].filter(Boolean).join(' ')
            return (
              <div key={c.toque.orden} className={clases}
                   title={`${c.toque.nombre} · día ${c.toque.dias}`}>
                <span className="bolita">{c.toque.orden}</span>
                <span className="dia">DÍA {c.toque.dias}</span>
                <span className={`cuantos ${c.tarjetas.length === 0 ? 'ninguno' : ''}`}>
                  {c.tarjetas.length === 0 ? '—' : c.tarjetas.length}
                  {vencidos > 0 ? <span style={{ color: 'var(--rojo)' }}> ({vencidos})</span> : null}
                </span>
                <span className="nombre-toque">{c.toque.nombre}</span>
              </div>
            )
          })}
        </div>
        <p className="ayuda" style={{ marginTop: 12 }}>
          El número grande de cada nodo es su orden; abajo, cuántos leads están parados ahí y
          —entre paréntesis y en rojo— cuántos de esos están vencidos.
        </p>
      </Tarjeta>

      {resumen.enCadencia === 0 && largos.length === 0 ? (
        <Tarjeta>
          <Vacio>
            No hay nadie en la cadencia. Un lead entra solo cuando el closer marca el resultado
            como «Seguimiento» en su ficha.
          </Vacio>
        </Tarjeta>
      ) : null}

      {TANDAS.map((tanda) => {
        const suyas = activas
          .filter((t) => t.urgencia === tanda.urgencia)
          .sort((a, b) => b.atraso - a.atraso || a.nombre.localeCompare(b.nombre))
        if (suyas.length === 0) return null
        return (
          <section className="tanda" key={tanda.urgencia}>
            <h3>
              {tanda.titulo}
              <span className="cuenta">{suyas.length}</span>
              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--gris)' }}>{tanda.ayuda}</span>
            </h3>
            <div className="tarjetas">
              {suyas.map((t) => <FichaDeLead key={t.leadId} t={t} cadencia={cadencia} />)}
            </div>
          </section>
        )
      })}

      {largos.length > 0 ? (
        <section className="tanda">
          <h3>
            Seguimiento largo
            <span className="cuenta">{largos.length}</span>
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--gris)' }}>
              Pidieron que los llamemos en una fecha puntual. Salen de la cadencia y vuelven ese día.
            </span>
          </h3>
          <div className="tarjetas">
            {largos.map((t) => <FichaDeLead key={t.leadId} t={t} cadencia={cadencia} />)}
          </div>
        </section>
      ) : null}

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
 * Lo que tiene que contestar sin que nadie haga clic: por dónde va, qué toque
 * le toca, y qué día. Por eso la barra de progreso está antes que cualquier
 * texto: doce segmentos, los hechos en negro y el actual resaltado.
 */
function FichaDeLead({ t, cadencia }: { t: Ficha; cadencia: Toque[] }) {
  const clase = t.urgencia === 'vencido' ? 'ficha vencida'
    : t.urgencia === 'hoy' ? 'ficha hoy'
    : t.urgencia === 'proximo' ? 'ficha proxima' : 'ficha'
  const toque = cadencia.find((c) => c.orden === t.toque)
  const largo = t.situacion === 'largo'

  return (
    <div className={clase}>
      <div className="entre" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/leads/${t.leadId}?pestana=seguimiento`} className="nombre">{t.nombre}</Link>
          <div className="meta">
            {[t.empresa, t.closer ?? 'sin closer'].filter(Boolean).join(' · ')}
          </div>
        </div>
        {t.calidadNivel ? (
          <Pildora color={COLOR_DE_CALIDAD[t.calidadNivel]}>{NOMBRE_DE_NIVEL[t.calidadNivel]}</Pildora>
        ) : null}
      </div>

      {largo ? (
        <div className="paso">
          <span className="cual">Seguimiento largo</span>
          <span className="cuando">vuelve el {fechaCorta(t.fechaLarga)}</span>
        </div>
      ) : (
        <>
          <div className="paso">
            <span className="cual">
              Toque {t.toque} de {cadencia.length}
              {toque ? <span style={{ fontWeight: 400, color: 'var(--gris)' }}> · día {toque.dias}</span> : null}
            </span>
            <span className="cuando">
              {t.atraso > 0
                ? <strong style={{ color: 'var(--rojo)' }}>
                    {t.atraso} {t.atraso === 1 ? 'día tarde' : 'días tarde'}
                  </strong>
                : t.atraso === 0 ? <strong style={{ color: 'var(--acento)' }}>toca hoy</strong>
                : fechaCorta(t.fecha)}
            </span>
          </div>

          <div className={`progreso ${t.urgencia === 'vencido' ? 'vencido' : ''}`}
               role="img"
               aria-label={`Toque ${t.toque} de ${cadencia.length}, ${t.toque - 1} hechos`}>
            {cadencia.map((c) => (
              <i key={c.orden}
                 className={c.orden < t.toque ? 'hecho' : c.orden === t.toque ? 'actual' : ''} />
            ))}
          </div>

          <div className="meta" style={{ marginTop: 6 }}>
            {toque?.nombre ?? '—'}
          </div>
        </>
      )}

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
