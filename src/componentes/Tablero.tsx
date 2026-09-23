import type { ReactNode } from 'react'
import type { Medidas } from '@/datos/metricas'
import { DEFINICIONES } from '@/datos/metricas'
import { plata } from './Piezas'

/**
 * Las métricas del período, en dos listas.
 *
 * A la izquierda CUÁNTOS —agendadas, asistencias, cierres, plata—; a la
 * derecha QUÉ PORCENTAJE pasa de una etapa a la otra. Son dos preguntas
 * distintas y se leen en dos momentos distintos: una dice cuánto trabajo hubo,
 * la otra dice dónde se pierde.
 *
 * Es una lista y no una grilla de tarjetas porque veinticuatro tarjetas
 * iguales no se comparan con nada: el ojo tiene que saltar de una a otra
 * leyendo etiquetas. En una lista los números quedan alineados en una columna
 * y se recorren de arriba abajo sin leer nada.
 *
 * Ningún número va solo: al lado de cada porcentaje está sobre qué se calcula.
 * «28%» no dice nada; «28% · sobre asistencias» sí. Y donde no hay con qué
 * dividir dice «sin datos», no 0%: un cero inventado se usa igual que uno real.
 */
type Linea = {
  etiqueta: string
  valor: ReactNode
  sobre?: string
  clave?: string
  /** Una línea que se lee más que las otras. */
  fuerte?: boolean
  /** Un corte visual antes de esta línea. */
  corte?: boolean
}

function Lista({ lineas }: { lineas: Linea[] }) {
  return (
    <table className="lista-metrica">
      <tbody>
        {lineas.map((l) => (
          <tr key={l.etiqueta} className={[l.fuerte ? 'fuerte' : '', l.corte ? 'corte' : ''].join(' ').trim() || undefined}>
            <th scope="row" title={l.clave ? DEFINICIONES[l.clave]?.formula : undefined}>
              {l.etiqueta}
              {l.sobre ? <span className="sobre">{l.sobre}</span> : null}
            </th>
            <td>{l.valor ?? <span className="sindato">sin datos</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const pct = (v: number | null): ReactNode =>
  v === null ? null : <>{v.toLocaleString('es-AR')}<span className="unidad">%</span></>

export function Tablero({ m, verPlata }: { m: Medidas; verPlata: boolean }) {
  const cuantos: Linea[] = [
    { etiqueta: 'Llamadas agendadas', valor: m.agendadas, clave: 'agendadas' },
    { etiqueta: 'Asistencias', valor: m.asistencias, clave: 'asistencias' },
    { etiqueta: 'Asistencias válidas', valor: m.asistenciasValidas, clave: 'asistenciasValidas',
      sobre: 'asistió y calificaba' },
    { etiqueta: 'No calificadas', valor: m.noCalificadas, clave: 'noCalificadas' },
    { etiqueta: 'No show', valor: m.noShows, clave: 'noShows' },
    { etiqueta: 'Canceladas', valor: m.cancelados, clave: 'cancelados' },
    { etiqueta: 'Reagendadas', valor: m.reagendados, clave: 'reagendados' },
    { etiqueta: 'Segundas llamadas', valor: m.segundas, clave: 'segundas', corte: true },
    { etiqueta: 'Asistencia a segunda', valor: m.segundasAsistidas, clave: 'segundasAsistidas' },
    { etiqueta: 'Ofertas hechas', valor: m.ofertas, clave: 'ofertas', corte: true },
    { etiqueta: 'Reservas', valor: m.senas, clave: 'senas' },
    // El cierre del período es el que se FIRMÓ en el período. El otro —cuántas
    // de las reuniones de este mes terminaron en venta— es el numerador del %
    // de cierre y queda abajo, con el nombre puesto: son dos preguntas y
    // mezclarlas es lo que hacía que la facturación y los cierres no se
    // pudieran mirar juntos.
    { etiqueta: 'Cierres', valor: m.ventasCerradas, clave: 'ventasCerradas', fuerte: true,
      sobre: 'firmados en el período' },
    { etiqueta: 'Cierres de reuniones del período', valor: m.ventas, clave: 'ventas',
      sobre: 'numerador del % de cierre' },
  ]

  if (verPlata) {
    cuantos.push(
      { etiqueta: 'Facturación', valor: plata(m.facturacion, m.moneda), clave: 'facturacion',
        fuerte: true, corte: true },
      { etiqueta: 'Cash collected', valor: plata(m.cashCollected, m.moneda), clave: 'cashCollected' },
      { etiqueta: 'Cash por agenda', valor: m.cashPorAgenda === null ? null : plata(m.cashPorAgenda, m.moneda),
        clave: 'cashPorAgenda', sobre: 'cash ÷ agendadas' },
      { etiqueta: 'Cash por asistencia', valor: m.cashPorAsistencia === null ? null : plata(m.cashPorAsistencia, m.moneda),
        clave: 'cashPorAsistencia', sobre: 'cash ÷ asistencias' },
    )
  }

  const conversiones: Linea[] = [
    { etiqueta: 'Asistencia', valor: pct(m.asistenciaPct), sobre: 'sobre agendadas' },
    { etiqueta: 'Asistencia válida', valor: pct(m.asistenciaValidaPct), sobre: 'sobre agendadas',
      clave: 'asistenciaValidaPct' },
    { etiqueta: 'No calificadas', valor: pct(m.noCalificadasPct), sobre: 'sobre asistencias',
      clave: 'noCalificadasPct' },
    { etiqueta: 'Canceladas', valor: pct(m.cancelacionPct), sobre: 'sobre agendadas' },
    { etiqueta: 'Asistencia a segunda', valor: pct(m.segundaAsistenciaPct), sobre: 'sobre segundas agendadas',
      clave: 'segundaAsistenciaPct', corte: true },
    { etiqueta: 'Ofertas hechas', valor: pct(m.ofertaPct), sobre: 'sobre asistencias', corte: true },
    { etiqueta: 'Cierre / asistencia', valor: pct(m.cierrePct), sobre: 'sobre asistencias',
      clave: 'cierrePct', fuerte: true },
    { etiqueta: 'Cierre / asistencia válida', valor: pct(m.cierreSobreValidaPct),
      sobre: 'sobre asistencias válidas', clave: 'cierreSobreValidaPct', fuerte: true },
    { etiqueta: 'Cierre / oferta', valor: pct(m.cierreSobreOfertaPct), sobre: 'sobre ofertas hechas',
      clave: 'cierreSobreOfertaPct', fuerte: true },
  ]

  return (
    <div className="dos-listas">
      <div>
        <div className="lista-titulo">Métricas</div>
        <Lista lineas={cuantos} />
      </div>
      <div>
        <div className="lista-titulo">Conversión</div>
        <Lista lineas={conversiones} />
        {m.pendientesDeCargar > 0 ? (
          <p className="ayuda" style={{ marginTop: 10 }}>
            Hay <strong>{m.pendientesDeCargar}</strong>{' '}
            {m.pendientesDeCargar === 1 ? 'reunión sin resultado cargado' : 'reuniones sin resultado cargado'}:
            hasta que se carguen, estos porcentajes están incompletos.
          </p>
        ) : null}
      </div>
    </div>
  )
}
