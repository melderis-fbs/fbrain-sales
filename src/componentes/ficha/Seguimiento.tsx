import Link from 'next/link'
import type { EstadoDelLead, Interaccion } from '@/datos/seguimientos'
import type { Toque } from '@/motor/toques'
import { Tarjeta, Pildora, Vacio, fechaCorta, cuando } from '../Piezas'
import { NOMBRE_DE_URGENCIA, COLOR_DE_URGENCIA } from '@/motor/toques'
import { ESTADOS_TOQUE, NOMBRE_DE_TOQUE, NOMBRE_DE_SITUACION } from '@/dominio/seguimientos'
import {
  registrarToqueAccion, moverToqueAccion, volverAlPipelineAccion, sacarDelPipelineAccion,
} from '@/app/(app)/seguimientos/acciones'

/**
 * El seguimiento de este lead, dentro de su ficha.
 *
 * La misma cadencia que se ve en el pipeline, en la ficha de la persona: es la
 * misma información, no una copia. Un lead que se vendió desaparece de los dos
 * lados a la vez, porque hay un solo estado.
 */
export function Seguimiento({
  leadId, estado, interacciones, cadencia,
}: {
  leadId: number
  estado: EstadoDelLead | null
  interacciones: Interaccion[]
  cadencia: Toque[]
}) {
  if (!estado) {
    return (
      <div style={{ maxWidth: 680 }}>
        <Tarjeta titulo="Este lead no está en el pipeline">
          <p className="ayuda">
            Entra solo cuando el closer marca el resultado como «Seguimiento» en la pestaña
            Resultado. También se puede meter a mano.
          </p>
          <form action={volverAlPipelineAccion} style={{ marginTop: 10 }}>
            <input type="hidden" name="leadId" value={leadId} />
            <button type="submit" className="secundario">Meterlo en la cadencia</button>
          </form>
        </Tarjeta>
      </div>
    )
  }

  const activo = estado.situacion === 'activo'

  return (
    <div className="rejilla g2">
      <div className="apilado">
        <Tarjeta titulo="Dónde está">
          <div className="fila">
            <Pildora color={COLOR_DE_URGENCIA[estado.urgencia]}>{NOMBRE_DE_URGENCIA[estado.urgencia]}</Pildora>
            <Pildora color="gris">{NOMBRE_DE_SITUACION[estado.situacion]}</Pildora>
          </div>
          <div className="numero chico" style={{ marginTop: 8 }}>
            {estado.situacion === 'largo'
              ? <>Vuelve el {fechaCorta(estado.fechaLarga)}</>
              : <>Toque {estado.toque} de {cadencia.length}</>}
          </div>
          {estado.toqueNombre && activo ? (
            <div className="contra">{estado.toqueNombre} · toca el {fechaCorta(estado.fecha)}</div>
          ) : null}
          <p className="ayuda" style={{ marginTop: 10 }}>
            Entró en la cadencia el {fechaCorta(estado.ingresoEn)}. La fecha de cada toque se cuenta
            desde el último toque real, no desde el ingreso: así un atraso corre lo que viene en vez
            de vencerlo todo junto.
          </p>
        </Tarjeta>

        {activo ? (
          <Tarjeta titulo={`Registrar el toque ${estado.toque}`}>
            <form action={registrarToqueAccion}>
              <input type="hidden" name="leadId" value={leadId} />
              <div className="campo">
                <label htmlFor="s-estado">¿Qué pasó?</label>
                <select id="s-estado" name="estado" defaultValue="no_contesto">
                  {ESTADOS_TOQUE.map((e) => <option key={e} value={e}>{NOMBRE_DE_TOQUE[e]}</option>)}
                </select>
                <div className="nota">
                  «Agendó» y «No interesado» lo sacan de la cadencia: el primero porque vuelve a
                  estar en agenda, el segundo porque deja de ocupar lugar.
                </div>
              </div>
              <div className="campo">
                <label htmlFor="s-nota">Nota</label>
                <input id="s-nota" name="nota" placeholder="Qué dijo" />
              </div>
              <button type="submit">Registrar y avanzar</button>
            </form>
          </Tarjeta>
        ) : null}

        <Tarjeta titulo="Moverlo a mano"
                 ayuda="Porque a veces ya se hicieron tres toques por WhatsApp y la tarjeta quedó atrás.">
          <form action={moverToqueAccion} className="fila">
            <input type="hidden" name="leadId" value={leadId} />
            <select name="toque" defaultValue={estado.toque} style={{ maxWidth: 260 }}>
              {cadencia.map((t) => (
                <option key={t.orden} value={t.orden}>{t.orden} · {t.nombre} (día {t.dias})</option>
              ))}
            </select>
            <button type="submit" className="secundario">Mover</button>
          </form>
          {estado.situacion !== 'fuera' ? (
            <form action={sacarDelPipelineAccion} style={{ marginTop: 10 }}>
              <input type="hidden" name="leadId" value={leadId} />
              <button type="submit" className="sutil">Sacarlo del pipeline</button>
            </form>
          ) : (
            <form action={volverAlPipelineAccion} style={{ marginTop: 10 }}>
              <input type="hidden" name="leadId" value={leadId} />
              <button type="submit" className="sutil">Volver a meterlo</button>
            </form>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo={`Interacciones (${interacciones.length})`}
               accion={<Link href="/seguimientos" style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Ver el pipeline →</Link>}>
        {interacciones.length === 0 ? (
          <Vacio>Todavía no se registró ningún toque.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Cuándo</th><th>Toque</th><th>Qué pasó</th><th>Nota</th><th>Quién</th></tr>
              </thead>
              <tbody>
                {interacciones.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{cuando(i.cuando)}</td>
                    <td style={{ fontSize: 12.5 }}>{i.toque}{i.toqueNombre ? ` · ${i.toqueNombre}` : ''}</td>
                    <td>
                      <Pildora color={i.estado === 'no_interesado' ? 'rojo'
                        : i.estado === 'agendo' ? 'verde'
                        : i.estado === 'no_contesto' ? 'gris' : 'acento'}>
                        {NOMBRE_DE_TOQUE[i.estado]}
                      </Pildora>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{i.nota ?? '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{i.usuario ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  )
}
