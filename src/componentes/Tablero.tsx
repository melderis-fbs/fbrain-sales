import type { ReactNode } from 'react'
import type { Medidas } from '@/datos/metricas'
import { DEFINICIONES } from '@/datos/metricas'
import { plata } from './Piezas'

/**
 * El mini tablero del Tracker.
 *
 * Las mismas medidas que el Dashboard, apretadas, para mirarlas de un vistazo
 * sin cambiar de pantalla. Sale del MISMO módulo de métricas: no hay una
 * segunda cuenta en ninguna parte, que es lo que hacía que el sistema anterior
 * dijera 111% de cierre acá y 11% allá.
 *
 * Tres bloques, porque son tres preguntas distintas y mezclarlas hace que
 * ninguna se conteste:
 *
 *   VOLUMEN     cuántas reuniones hubo y en qué terminaron
 *   CONVERSIÓN  qué porcentaje pasó de cada etapa a la siguiente
 *   PLATA       cuánto entró, y cuánto por reunión
 *
 * Ningún número va solo: debajo de cada uno está sobre qué se calcula. «28%»
 * no dice nada; «28% de las asistencias» sí. Y `null` no es cero: cuando no
 * hay con qué dividir dice «sin datos» en vez de mentir un 0%.
 */
function Mini({ etiqueta, valor, contra, clave, alerta }: {
  etiqueta: string
  valor: ReactNode
  contra?: string
  /** La clave en DEFINICIONES: pone la fórmula en el title, al alcance del mouse. */
  clave?: string
  /** Un número que pide acción, no uno que se mira. */
  alerta?: boolean
}) {
  return (
    <div className={alerta ? 'mini alerta' : 'mini'}
         title={clave ? DEFINICIONES[clave]?.formula : undefined}>
      <div className="mini-etiqueta">{etiqueta}</div>
      <div className="mini-numero">{valor ?? <span className="sindato">sin datos</span>}</div>
      {contra ? <div className="mini-contra">{contra}</div> : null}
    </div>
  )
}

const pct = (v: number | null): ReactNode =>
  v === null ? null : <>{v.toLocaleString('es-AR')}<span className="mini-unidad">%</span></>

export function Tablero({ m, verPlata }: { m: Medidas; verPlata: boolean }) {
  const de = (n: number, total: number, que: string) =>
    total === 0 ? 'sin agendadas' : `${n} de ${total} ${que}`

  return (
    <div className="tablero">
      <div className="tablero-bloque">
        <div className="tablero-titulo">Volumen</div>
        <div className="minis">
          <Mini etiqueta="Llamadas agendadas" valor={m.agendadas} clave="agendadas"
                contra="con reunión en el período" />
          <Mini etiqueta="Asistencias" valor={m.asistencias} clave="asistencias"
                contra={de(m.asistencias, m.agendadas, 'agendadas')} />
          <Mini etiqueta="Asistencias válidas" valor={m.asistenciasValidas} clave="asistenciasValidas"
                contra={`asistió y calificaba`} />
          <Mini etiqueta="No calificadas" valor={m.noCalificadas} clave="noCalificadas"
                contra="asistió y no calificaba" />
          <Mini etiqueta="No show" valor={m.noShows} clave="noShows"
                contra={de(m.noShows, m.agendadas, 'agendadas')} />
          <Mini etiqueta="Canceladas" valor={m.cancelados} clave="cancelados"
                contra={de(m.cancelados, m.agendadas, 'agendadas')} />
          <Mini etiqueta="Reagendadas" valor={m.reagendados} clave="reagendados"
                contra={de(m.reagendados, m.agendadas, 'agendadas')} />
          <Mini etiqueta="Segundas llamadas" valor={m.segundas} clave="segundas"
                contra="marcadas como segunda sesión" />
          <Mini etiqueta="Asistencia a segunda" valor={m.segundasAsistidas} clave="segundasAsistidas"
                contra={m.segundas === 0 ? 'sin segundas agendadas' : `de ${m.segundas} segundas`} />
          <Mini etiqueta="Ofertas hechas" valor={m.ofertas} clave="ofertas"
                contra={de(m.ofertas, m.asistencias, 'asistencias')} />
          <Mini etiqueta="Reservas" valor={m.senas} clave="senas"
                contra={verPlata ? plata(m.senasImporte, m.moneda) + ' comprometidos' : 'con seña cargada'} />
          <Mini etiqueta="Cierres" valor={m.ventas} clave="ventas"
                contra={de(m.ventas, m.asistencias, 'asistencias')} />
        </div>
      </div>

      <div className="tablero-bloque">
        <div className="tablero-titulo">Conversión</div>
        <div className="minis">
          <Mini etiqueta="% Asistencia" valor={pct(m.asistenciaPct)} contra="sobre agendadas" />
          <Mini etiqueta="% Asistencia válida" valor={pct(m.asistenciaValidaPct)}
                clave="asistenciaValidaPct" contra="sobre agendadas" />
          <Mini etiqueta="% No calificadas" valor={pct(m.noCalificadasPct)}
                clave="noCalificadasPct" contra="sobre asistencias" />
          <Mini etiqueta="% Canceladas" valor={pct(m.cancelacionPct)} contra="sobre agendadas" />
          <Mini etiqueta="% Asistencia a segunda" valor={pct(m.segundaAsistenciaPct)}
                clave="segundaAsistenciaPct" contra="sobre segundas agendadas" />
          <Mini etiqueta="% Ofertas hechas" valor={pct(m.ofertaPct)} contra="sobre asistencias" />
          <Mini etiqueta="% Cierre / asistencia" valor={pct(m.cierrePct)} clave="cierrePct"
                contra="sobre asistencias" />
          <Mini etiqueta="% Cierre / asist. válida" valor={pct(m.cierreSobreValidaPct)}
                clave="cierreSobreValidaPct" contra="sobre asistencias válidas" />
          <Mini etiqueta="% Cierre / oferta" valor={pct(m.cierreSobreOfertaPct)}
                clave="cierreSobreOfertaPct" contra="sobre ofertas hechas" />
        </div>
      </div>

      {verPlata ? (
        <div className="tablero-bloque">
          <div className="tablero-titulo">Plata</div>
          <div className="minis">
            <Mini etiqueta="Cash collected" valor={plata(m.cashCollected, m.moneda)}
                  clave="cashCollected" contra="cobrado de verdad en el período" />
            <Mini etiqueta="Cash por agenda"
                  valor={m.cashPorAgenda === null ? null : plata(m.cashPorAgenda, m.moneda)}
                  clave="cashPorAgenda" contra="cash ÷ agendadas · no es un %" />
            <Mini etiqueta="Cash por asistencia"
                  valor={m.cashPorAsistencia === null ? null : plata(m.cashPorAsistencia, m.moneda)}
                  clave="cashPorAsistencia" contra="cash ÷ asistencias · no es un %" />
            <Mini etiqueta="Facturación" valor={plata(m.facturacion, m.moneda)}
                  clave="facturacion" contra="vendido en el período" />
          </div>
        </div>
      ) : null}

      {m.pendientesDeCargar > 0 ? (
        <p className="ayuda" style={{ marginTop: 10 }}>
          Ojo: hay <strong>{m.pendientesDeCargar}</strong>{' '}
          {m.pendientesDeCargar === 1 ? 'reunión sin resultado cargado' : 'reuniones sin resultado cargado'}
          {' '}en este período. Hasta que se carguen, todo lo de arriba está incompleto.
        </p>
      ) : null}
    </div>
  )
}
