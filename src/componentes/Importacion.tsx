'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { importarAccion, type EstadoDeImportacion } from '@/app/(app)/leads/acciones'
import { COLUMNAS_QUE_ENTIENDE } from '@/dominio/importacion'
import { NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO } from '@/dominio/resultados'
import { fechaCorta, plata } from './Piezas'

/**
 * Cargar el histórico pegando la planilla.
 *
 * Cargar un mes de llamadas de a un formulario por vez no se hace: se empieza,
 * se abandona a la mitad, y el tablero queda con la mitad de los datos, que es
 * peor que con ninguno porque igual se mira.
 *
 * Dos pasos, siempre, aunque no haya un solo error:
 *
 *  1. VISTA PREVIA. Cada fila con lo que se entendió —la fecha en letras, el
 *     importe con su moneda, el closer por su nombre—. Es donde se ve que
 *     05/08 se leyó como 5 de agosto y no como 8 de mayo, que es la clase de
 *     error que después no se encuentra nunca.
 *  2. CONFIRMAR. Recién ahí escribe.
 *
 * Y nada de «se importaron 47 de 60». Las que no entran se listan con su
 * número de línea y por qué, para ir a la planilla y arreglarlas.
 */
function Boton({ texto, esperando }: { texto: string; esperando: string }) {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? esperando : texto}</button>
}

const EJEMPLO = [
  ['Nombre', 'Email', 'Teléfono', 'Fecha', 'Closer', 'Estado', 'Resultado', 'Importe', 'Cobrado'],
  ['María Fernández', 'maria@ejemplo.com', '1155551234', '05/08/2026', 'Braian', 'Asistió', 'Venta', '3500', '1500'],
  ['Pedro Gómez', 'pedro@ejemplo.com', '1144442222', '06/08/2026', 'Braian', 'No show', '', '', ''],
  ['Ana López', '', '1133331111', '07/08/2026', 'Braian', 'Asistió', 'Perdido', '', ''],
].map((f) => f.join('\t')).join('\n')

export function Importacion({ moneda, closers, setters }: {
  moneda: string
  closers: { id: number; nombre: string }[]
  setters: { id: number; nombre: string }[]
}) {
  const nombreDe = (lista: { id: number; nombre: string }[], id: number | null) =>
    id === null ? null : lista.find((x) => x.id === id)?.nombre ?? null
  const [estado, accion] = useActionState<EstadoDeImportacion, FormData>(importarAccion, null)
  const [texto, setTexto] = useState('')
  const [repetidas, setRepetidas] = useState(false)

  if (estado?.tipo === 'hecho') {
    const r = estado.reporte
    return (
      <div className="apilado">
        <div className="aviso dato">
          <strong>
            {r.importadas === 1 ? 'Se importó 1 lead.' : `Se importaron ${r.importadas} leads.`}
          </strong>{' '}
          {r.salteadas > 0
            ? r.salteadas === 1 ? 'Quedó 1 sin importar. ' : `Quedaron ${r.salteadas} sin importar. `
            : ''}
          Ya están en el Tracker, en las métricas y en las llamadas del día que corresponde.
        </div>

        {r.fallidas.length > 0 ? (
          <div className="aviso problema">
            <strong>{r.fallidas.length} no se pudieron escribir.</strong> Arreglalas en la planilla
            y volvé a pegarla entera: las que ya entraron van a salir marcadas como repetidas, así
            que no se duplica nada.
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {r.fallidas.map((f) => (
                <li key={f.linea}>Línea {f.linea} · {f.nombre}: {f.porque}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="fila">
          <Link className="boton" href="/tracker">Ver el Tracker</Link>
          <Link className="boton secundario" href="/leads">Ver los leads</Link>
          <button type="button" className="sutil" onClick={() => location.reload()}>
            Importar otra planilla
          </button>
        </div>
      </div>
    )
  }

  const vista = estado?.tipo === 'vista' ? estado : null

  return (
    <form action={accion} className="apilado">
      <input type="hidden" name="planilla" value={texto} />
      <input type="hidden" name="repetidas" value={repetidas ? '1' : ''} />

      {estado?.tipo === 'error' ? <div className="aviso problema">{estado.mensaje}</div> : null}

      <div className="tarjeta">
        <h3>Pegá la planilla</h3>
        <p className="ayuda" style={{ marginBottom: 10 }}>
          Copiá las filas desde Excel o Google Sheets —<strong>con la fila de encabezados</strong>— y
          pegalas acá. La primera fila dice qué es cada columna; el orden no importa y las columnas
          que no se usen se pueden dejar afuera.
        </p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10}
                  style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, whiteSpace: 'pre' }}
                  placeholder={EJEMPLO} aria-label="Planilla" />
        <div className="fila" style={{ marginTop: 8 }}>
          <button type="button" className="sutil" onClick={() => setTexto(EJEMPLO)}>
            Pegar un ejemplo para ver cómo es
          </button>
        </div>

        <details style={{ marginTop: 10 }}>
          <summary className="ayuda" style={{ cursor: 'pointer' }}>Qué columnas entiende</summary>
          <div className="chips" style={{ marginTop: 8 }}>
            {COLUMNAS_QUE_ENTIENDE.map((c) => <span key={c.columna} className="pildora">{c.como}</span>)}
          </div>
          <p className="ayuda" style={{ marginTop: 8 }}>
            Sólo <strong>nombre</strong> es obligatorio. Los nombres también valen escritos de otra
            manera —«cliente» por nombre, «monto» por importe, «asistió» por estado—. El closer y el
            setter van por su nombre, tal como están en Configuración. Las fechas, como
            05/08/2026 o 2026-08-05. Los importes, con punto o con coma: da igual.
          </p>
        </details>
      </div>

      {vista ? (
        <>
          <div className={vista.conError > 0 ? 'aviso atencion' : 'aviso dato'}>
            <strong>
              {vista.listas === 0 ? 'No hay ninguna fila lista para importar.'
                : vista.listas === 1 ? 'Hay 1 fila lista para importar.'
                : `Hay ${vista.listas} filas listas para importar.`}
            </strong>{' '}
            {vista.conError > 0
              ? vista.conError === 1 ? '1 tiene un error y no se va a importar. '
              : `${vista.conError} tienen un error y no se van a importar. ` : ''}
            {vista.repetidas > 0
              ? `${vista.repetidas} ${vista.repetidas === 1 ? 'parece ya estar cargada' : 'parecen ya estar cargadas'}${repetidas ? ' y se van a crear igual' : ' y se saltean'}. `
              : ''}
            Mirá abajo cómo quedó interpretada cada una antes de confirmar.
            {vista.columnasIgnoradas.length > 0 ? (
              <> No se reconocieron estas columnas y se ignoran:{' '}
                <strong>{vista.columnasIgnoradas.join(' · ')}</strong>.</>
            ) : null}
          </div>

          {vista.repetidas > 0 ? (
            <label className="fila" style={{ gap: 7, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={repetidas} onChange={(e) => setRepetidas(e.target.checked)} />
              <span>
                Crear igual las {vista.repetidas} que parecen repetidas. Dejalo destildado si estás
                volviendo a pegar una planilla que ya importaste en parte.
              </span>
            </label>
          ) : null}

          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Línea</th>
                  <th>Lead</th><th>Reunión</th><th>Closer</th>
                  <th>Qué pasó</th><th>Resultado</th><th className="num">Plata</th>
                  <th>Estado de la fila</th>
                </tr>
              </thead>
              <tbody>
                {vista.filas.map((f) => {
                  const mal = f.errores.length > 0
                  const salteada = !mal && f.yaEstaba !== null && !repetidas
                  return (
                    <tr key={f.linea} style={mal ? { background: 'var(--rojo-suave)' } : undefined}>
                      <td className="num" style={{ fontSize: 12, color: 'var(--gris)' }}>{f.linea}</td>
                      <td>
                        <strong>{f.nombre || <span className="sindato">sin nombre</span>}</strong>
                        {f.email || f.telefono ? (
                          <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>
                            {[f.email, f.telefono].filter(Boolean).join(' · ')}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {f.fechaSesion ? fechaCorta(f.fechaSesion) : <span className="sindato">sin fecha</span>}
                        {f.horaSesion ? <span style={{ color: 'var(--gris)' }}> {f.horaSesion}</span> : null}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {nombreDe(closers, f.closerId) ?? <span className="sindato">sin asignar</span>}
                        {f.setterId !== null ? (
                          <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>
                            agendó {nombreDe(setters, f.setterId)}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {f.estado ? NOMBRE_DE_ESTADO[f.estado] : <span className="sindato">—</span>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {f.resultado ? NOMBRE_DE_RESULTADO[f.resultado] : <span className="sindato">—</span>}
                      </td>
                      <td className="num" style={{ fontSize: 12.5 }}>
                        {f.importe === null ? <span className="sindato">—</span> : plata(f.importe, f.moneda)}
                        {f.cobrado !== null ? (
                          <div style={{ fontSize: 11.5, color: 'var(--gris)' }}>
                            cobrado {plata(f.cobrado, f.moneda)}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ fontSize: 11.5, maxWidth: 320 }}>
                        {mal ? (
                          <span style={{ color: 'var(--rojo)', fontWeight: 600 }}>{f.errores.join(' ')}</span>
                        ) : salteada ? (
                          <>
                            Ya está cargado como{' '}
                            <Link href={`/leads/${f.yaEstaba!.leadId}`} style={{ fontWeight: 600 }}>
                              {f.yaEstaba!.nombre}
                            </Link>{' '}
                            ({f.yaEstaba!.porque === 'email' ? 'mismo email'
                              : f.yaEstaba!.porque === 'telefono' ? 'mismo teléfono' : 'mismo nombre'}).
                            Se saltea.
                          </>
                        ) : (
                          <span style={{ color: 'var(--verde)', fontWeight: 600 }}>Entra</span>
                        )}
                        {f.avisos.length > 0 ? (
                          <div style={{ color: 'var(--gris)', marginTop: 2 }}>{f.avisos.join(' ')}</div>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="fila">
        {vista && vista.listas > 0 ? (
          <>
            <input type="hidden" name="confirmado" value="1" />
            <Boton texto={`Importar ${vista.listas} ${vista.listas === 1 ? 'lead' : 'leads'}`}
                   esperando="Importando…" />
          </>
        ) : (
          <Boton texto="Ver cómo queda" esperando="Leyendo…" />
        )}
        <Link className="boton secundario" href="/leads">Cancelar</Link>
      </div>

      {vista ? (
        <p className="ayuda">
          Todavía no se escribió nada. Si algo quedó mal interpretado, corregilo en la planilla,
          volvé a pegarla y mirá de nuevo. La moneda por defecto es {moneda}.
        </p>
      ) : null}
    </form>
  )
}
