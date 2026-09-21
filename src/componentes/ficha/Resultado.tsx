import type { Lead } from '@/datos/leads'
import type { CloserOpcion } from '@/datos/catalogos'
import { Tarjeta, plata, fechaCorta } from '../Piezas'
import {
  ESTADOS, RESULTADOS, MOTIVOS_PERDIDA, NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, NOMBRE_DE_MOTIVO,
} from '@/dominio/resultados'
import {
  cargarResultadoAccion, reasignarCloserAccion, reflotarLeadAccion,
  registrarPagoAccion, seguimientoLargoAccion,
} from '@/app/(app)/leads/acciones'

/**
 * Lo que carga el closer el día de la reunión.
 *
 * Dos ejes separados a propósito: qué pasó con la REUNIÓN y qué pasó con la
 * VENTA. Mezclarlos es lo que hace que después no se pueda contestar «cuántas
 * asistencias hubo» sin discutir.
 */
export function Resultado({
  lead, closers, hoy, verPlata, puedeReasignar,
}: {
  lead: Lead
  closers: CloserOpcion[]
  hoy: string
  verPlata: boolean
  puedeReasignar: boolean
}) {
  const cerrado = lead.resultado === 'perdida' || lead.resultado === 'no_calificado'

  return (
    <div className="rejilla g2">
      <Tarjeta titulo="Cargar el resultado">
        <form action={cargarResultadoAccion}>
          <input type="hidden" name="leadId" value={lead.id} />

          <div className="dos">
            <div className="campo">
              <label htmlFor="estado">¿Qué pasó con la reunión?</label>
              <select id="estado" name="estado" defaultValue={lead.estado}>
                {ESTADOS.map((e) => <option key={e} value={e}>{NOMBRE_DE_ESTADO[e]}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="resultado">¿Qué pasó con la venta?</label>
              <select id="resultado" name="resultado" defaultValue={lead.resultado}>
                {RESULTADOS.map((r) => <option key={r} value={r}>{NOMBRE_DE_RESULTADO[r]}</option>)}
              </select>
              <div className="nota">
                «Seguimiento» lo mete solo en el pipeline de 12 toques.
                La seña <strong>no cierra</strong> el lead: queda abierto hasta que se convierta.
              </div>
            </div>
          </div>

          <div className="campo">
            <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <input type="checkbox" name="huboOferta" defaultChecked={lead.huboOferta} />
              <span>Se presentó la oferta</span>
            </label>
            <div className="nota">Es el denominador del cierre sobre oferta. Sin esto, no se puede saber
              si se pierde antes o después de mostrar el precio.</div>
          </div>

          <div className="separador" />
          <h3>Si se vendió o se señó</h3>
          <div className="dos">
            <div className="campo">
              <label htmlFor="importe">Importe</label>
              <div className="fila" style={{ flexWrap: 'nowrap' }}>
                <select id="moneda" name="moneda" defaultValue={lead.moneda} style={{ width: 88 }}>
                  <option value="USD">USD</option><option value="ARS">ARS</option><option value="EUR">EUR</option>
                </select>
                <input id="importe" name="importe" inputMode="decimal" placeholder="0" />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="fecha">Fecha</label>
              <input id="fecha" name="fecha" type="date" defaultValue={hoy} />
            </div>
            <div className="campo">
              <label htmlFor="programa">Programa</label>
              <input id="programa" name="programa" />
            </div>
            <div className="campo">
              <label htmlFor="saldoPendiente">Saldo pendiente (seña)</label>
              <input id="saldoPendiente" name="saldoPendiente" inputMode="decimal" />
            </div>
            <div className="campo">
              <label htmlFor="fechaComprometida">Fecha comprometida (seña)</label>
              <input id="fechaComprometida" name="fechaComprometida" type="date" />
            </div>
          </div>

          <div className="separador" />
          <h3>Si se perdió</h3>
          <div className="campo">
            <label htmlFor="motivoPerdida">Motivo</label>
            <select id="motivoPerdida" name="motivoPerdida" defaultValue={lead.motivoPerdida ?? ''}>
              <option value="">Sin cargar</option>
              {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{NOMBRE_DE_MOTIVO[m]}</option>)}
            </select>
            <div className="nota">Lista cerrada a propósito: «no le interesó» escrito de nueve maneras
              no se puede contar, y contar por qué se pierde es de lo poco que cambia decisiones.</div>
          </div>

          <div className="separador" />
          <div className="dos">
            <div className="campo">
              <label htmlFor="proximoContacto">Próximo contacto</label>
              <input id="proximoContacto" name="proximoContacto" type="date"
                     defaultValue={lead.proximoContacto ?? ''} />
            </div>
            <div className="campo">
              <label htmlFor="proximoPaso">Próximo paso</label>
              <input id="proximoPaso" name="proximoPaso" defaultValue={lead.proximoPaso ?? ''} />
            </div>
          </div>
          <div className="campo">
            <label htmlFor="observaciones">Observaciones</label>
            <textarea id="observaciones" name="observaciones" defaultValue={lead.observaciones ?? ''} />
          </div>

          <button type="submit">Guardar el resultado</button>
        </form>
      </Tarjeta>

      <div className="apilado">
        {cerrado ? (
          <Tarjeta titulo="Reflotar este lead"
                   ayuda="Se le suma un ciclo al mismo lead, no se crea otro. Queda registrado que la repesca la hiciste vos.">
            <form action={reflotarLeadAccion}>
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="dos">
                <div className="campo">
                  <label htmlFor="r-fecha">Nueva fecha de reunión</label>
                  <input id="r-fecha" name="fechaSesion" type="date" />
                </div>
                <div className="campo">
                  <label htmlFor="r-hora">Hora</label>
                  <input id="r-hora" name="horaSesion" type="time" />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="r-closer">Closer</label>
                <select id="r-closer" name="closerId" defaultValue={lead.closerId ?? ''}>
                  <option value="">Dejar el que tenía</option>
                  {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="r-motivo">Por qué se reflota</label>
                <input id="r-motivo" name="motivo" placeholder="Volvió a escribir, cambió su situación…" />
              </div>
              <button type="submit">Reflotar · pasa al ciclo {lead.ciclo + 1}</button>
            </form>
          </Tarjeta>
        ) : null}

        <Tarjeta titulo="Seguimiento largo"
                 ayuda="Cuando el cliente pide que lo llamen en tres meses. Sale de la cadencia y vuelve a aparecer ese día.">
          <form action={seguimientoLargoAccion}>
            <input type="hidden" name="leadId" value={lead.id} />
            <div className="campo">
              <label htmlFor="sl-fecha">Volver a contactar el</label>
              <input id="sl-fecha" name="fecha" type="date" required />
            </div>
            <div className="campo">
              <label htmlFor="sl-nota">Qué pidió</label>
              <input id="sl-nota" name="nota" placeholder="Pidió que lo llamemos después del cierre de su trimestre" />
            </div>
            <button type="submit" className="secundario">Marcar seguimiento largo</button>
          </form>
        </Tarjeta>

        {puedeReasignar ? (
          <Tarjeta titulo="Cambiar el closer"
                   ayuda="No se borra ni se recrea nada: queda el histórico con quién lo cambió y por qué.">
            <form action={reasignarCloserAccion}>
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="campo">
                <label htmlFor="c-closer">Closer</label>
                <select id="c-closer" name="closerId" defaultValue={lead.closerId ?? ''}>
                  <option value="">Sin asignar</option>
                  {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="c-motivo">Motivo</label>
                <input id="c-motivo" name="motivo" placeholder="Por qué cambia" />
              </div>
              <button type="submit" className="secundario">Guardar el cambio</button>
            </form>
          </Tarjeta>
        ) : null}

        {verPlata && lead.venta ? (
          <Tarjeta titulo="Registrar un cobro"
                   ayuda="Esto —y no la venta— es el cash collected. Facturación y cash no son el mismo número.">
            <p className="ayuda" style={{ marginBottom: 10 }}>
              Vendido {plata(lead.venta.importe, lead.venta.moneda)} el {fechaCorta(lead.venta.fecha)} ·
              cobrado {plata(lead.cobrado, lead.moneda)}.
            </p>
            <form action={registrarPagoAccion}>
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="dos">
                <div className="campo">
                  <label htmlFor="p-importe">Importe</label>
                  <input id="p-importe" name="importe" inputMode="decimal" required />
                </div>
                <div className="campo">
                  <label htmlFor="p-fecha">Fecha del cobro</label>
                  <input id="p-fecha" name="fecha" type="date" defaultValue={hoy} required />
                </div>
                <div className="campo">
                  <label htmlFor="p-moneda">Moneda</label>
                  <select id="p-moneda" name="moneda" defaultValue={lead.venta.moneda}>
                    <option value="USD">USD</option><option value="ARS">ARS</option><option value="EUR">EUR</option>
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="p-cuota">Nº de cuota</label>
                  <input id="p-cuota" name="nCuota" inputMode="numeric" />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="p-medio">Medio</label>
                <input id="p-medio" name="medio" placeholder="Transferencia, Stripe…" />
              </div>
              <button type="submit" className="secundario">Registrar el cobro</button>
            </form>
          </Tarjeta>
        ) : null}
      </div>
    </div>
  )
}
