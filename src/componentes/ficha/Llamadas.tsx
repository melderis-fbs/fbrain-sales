import Link from 'next/link'
import type { Llamada } from '@/datos/llamadas'
import { Tarjeta, Pildora, Vacio, fechaCorta } from '../Piezas'
import { TIPOS_SESION, NOMBRE_DE_TIPO } from '@/dominio/resultados'
import { crearLlamadaAccion } from '@/app/(app)/llamadas/acciones'
import { comoSeLee } from '@/dominio/rubrica'

/**
 * Las llamadas de este lead.
 *
 * Una, dos o tres: son llamadas de la misma oportunidad, no tres
 * oportunidades. Cada una puede tener su transcripción y su análisis.
 */
export function Llamadas({ leadId, llamadas, hoy }: { leadId: number; llamadas: Llamada[]; hoy: string }) {
  return (
    <div className="rejilla g2">
      <Tarjeta titulo={`${llamadas.length} ${llamadas.length === 1 ? 'llamada' : 'llamadas'}`}>
        {llamadas.length === 0 ? (
          <Vacio>Todavía no se registró ninguna llamada de este lead.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Duración</th><th>Análisis</th><th></th></tr>
              </thead>
              <tbody>
                {llamadas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.numero}{l.ciclo > 1 ? <span className="pildora acento" style={{ marginLeft: 5 }}>c{l.ciclo}</span> : null}</td>
                    <td style={{ fontSize: 12.5 }}>{fechaCorta(l.fecha)}</td>
                    <td style={{ fontSize: 12.5 }}>{NOMBRE_DE_TIPO[l.tipoSesion]}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {l.duracionSeg === null ? '—' : `${Math.round(l.duracionSeg / 60)} min`}
                    </td>
                    <td>
                      {l.score !== null
                        ? <Pildora color={l.score >= 8 ? 'verde' : l.score >= 6 ? 'ambar' : 'rojo'}>
                            {l.score.toFixed(1)} · {comoSeLee(l.score)}
                          </Pildora>
                        : l.estadoAnalisis === 'error'
                          ? <Pildora color="rojo">falló</Pildora>
                          : l.tieneTranscripcion
                            ? <Pildora color="gris">sin analizar</Pildora>
                            : <span className="sindato">sin transcripción</span>}
                    </td>
                    <td className="num">
                      <Link href={`/llamadas/${l.id}`}
                            style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Abrir →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Registrar una llamada"
               ayuda="Después, en la llamada, se pega la transcripción y se la analiza.">
        <form action={crearLlamadaAccion}>
          <input type="hidden" name="leadId" value={leadId} />
          <div className="dos">
            <div className="campo">
              <label htmlFor="ll-fecha">Fecha</label>
              <input id="ll-fecha" name="fecha" type="date" defaultValue={hoy} />
            </div>
            <div className="campo">
              <label htmlFor="ll-duracion">Duración (minutos)</label>
              <input id="ll-duracion" name="duracionMin" inputMode="numeric" />
            </div>
            <div className="campo">
              <label htmlFor="ll-tipo">Tipo de sesión</label>
              <select id="ll-tipo" name="tipoSesion" defaultValue={llamadas.length === 0 ? 'primera' : 'seguimiento'}>
                {TIPOS_SESION.map((t) => <option key={t} value={t}>{NOMBRE_DE_TIPO[t]}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="ll-asistio">¿Asistió?</label>
              <select id="ll-asistio" name="asistio" defaultValue="si">
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          <button type="submit">Registrar la llamada</button>
        </form>
      </Tarjeta>
    </div>
  )
}
