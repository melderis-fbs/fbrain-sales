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
 * Doce columnas, una por toque, y cada tarjeta se mueve sola a la siguiente
 * cuando el closer registra qué pasó. La franja de color de la izquierda dice
 * si toca hoy, si está vencida o si todavía falta — y es lo único de color de
 * la pantalla, para que se pueda barrer con la vista.
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

  return (
    <div className="apilado">
      <Encabezado kicker="Seguimientos" titulo="Pipeline de 12 toques"
                  bajada="Cada toque cuenta desde el último toque real, no desde que el lead entró." />

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

      {resumen.enCadencia === 0 && largos.length === 0 ? (
        <Tarjeta>
          <Vacio>
            No hay nadie en la cadencia. Un lead entra solo cuando el closer marca el resultado
            como «Seguimiento» en su ficha.
          </Vacio>
        </Tarjeta>
      ) : (
        <div className="pipeline">
          {columnas.map((c) => (
            <div className="columna" key={c.toque.orden}>
              <div className="cabeza">
                <span className="n">Toque {c.toque.orden}</span>
                <span className="dia">día {c.toque.dias}</span>
              </div>
              <div className="titulo">{c.toque.nombre}</div>
              {c.tarjetas.length === 0 ? (
                <div className="ninguna">—</div>
              ) : (
                c.tarjetas.map((t) => <FichaDeLead key={t.leadId} t={t} />)
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rejilla g2">
        <Tarjeta titulo={`Seguimiento largo (${largos.length})`}
                 ayuda="Pidieron que los llamemos en una fecha puntual. Salen de la cadencia y vuelven ese día.">
          {largos.length === 0 ? (
            <p className="ayuda">Ninguno.</p>
          ) : (
            <table>
              <tbody>
                {largos.map((t) => (
                  <tr key={t.leadId}>
                    <td><Link href={`/leads/${t.leadId}?pestana=seguimiento`} style={{ fontWeight: 600 }}>{t.nombre}</Link></td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{t.closer ?? '—'}</td>
                    <td className="num" style={{ fontSize: 12.5 }}>{fechaCorta(t.fechaLarga)}</td>
                    <td className="num">
                      {t.urgencia === 'vencido' || t.urgencia === 'hoy'
                        ? <Pildora color="acento">toca</Pildora>
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>

        <Tarjeta titulo={`Fuera del pipeline (${fuera.length})`}
                 ayuda="Se fueron por «no interesado», porque agendaron, o porque se cerraron. Están acá por si hay que volver a meterlos.">
          {fuera.length === 0 ? (
            <p className="ayuda">Ninguno.</p>
          ) : (
            <table>
              <tbody>
                {fuera.slice(0, 20).map((t) => (
                  <tr key={t.leadId}>
                    <td><Link href={`/leads/${t.leadId}`} style={{ fontWeight: 600 }}>{t.nombre}</Link></td>
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
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Dónde se cae la cadencia"
               ayuda="Cuántos hay parados en cada toque. Un toque donde se amontona todo es un toque que nadie hace.">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>#</th><th>Toque</th><th className="num">En cadencia</th><th className="num">Vencidos</th></tr>
            </thead>
            <tbody>
              {resumen.porToque.map((t) => (
                <tr key={t.orden}>
                  <td>{t.orden}</td>
                  <td>{t.nombre}</td>
                  <td className="num">{t.activos}</td>
                  <td className="num">
                    {t.vencidos > 0 ? <Pildora color="rojo">{t.vencidos}</Pildora> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="num">{resumen.enCadencia}</td>
                <td className="num">{resumen.vencidos}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Tarjeta>
    </div>
  )
}

/**
 * Una tarjeta del pipeline.
 *
 * El desplegable y el botón son un formulario propio: al registrar el toque, la
 * tarjeta se mueve sola a la columna siguiente y la fecha del próximo se cuenta
 * desde hoy.
 */
function FichaDeLead({ t }: { t: Ficha }) {
  const clase = t.urgencia === 'vencido' ? 'ficha vencida'
    : t.urgencia === 'hoy' ? 'ficha hoy'
    : t.urgencia === 'proximo' ? 'ficha proxima' : 'ficha'

  return (
    <div className={clase}>
      <Link href={`/leads/${t.leadId}?pestana=seguimiento`} className="nombre">{t.nombre}</Link>
      <div className="meta">
        {t.closer ?? 'sin closer'} · {fechaCorta(t.fecha)}
        {t.atraso > 0 ? ` · ${t.atraso} ${t.atraso === 1 ? 'día' : 'días'} tarde` : ''}
      </div>
      {t.calidadNivel ? (
        <div style={{ marginTop: 4 }}>
          <Pildora color={COLOR_DE_CALIDAD[t.calidadNivel]}>{NOMBRE_DE_NIVEL[t.calidadNivel]}</Pildora>
        </div>
      ) : null}

      <form action={registrarToqueAccion} className="acciones">
        <input type="hidden" name="leadId" value={t.leadId} />
        <select name="estado" defaultValue="no_contesto" aria-label={`Qué pasó con ${t.nombre}`}
                style={{ flex: 1, minWidth: 0 }}>
          {ESTADOS_TOQUE.map((e) => <option key={e} value={e}>{NOMBRE_DE_TOQUE[e]}</option>)}
        </select>
        <button type="submit" className="chico" style={{ padding: '3px 9px', fontSize: 11.5 }}>✓</button>
      </form>
    </div>
  )
}
