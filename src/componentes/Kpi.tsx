import type { ReactNode } from 'react'
import { Iconos, type NombreDeIcono } from './Iconos'

/**
 * Una tarjeta de número, de las que se leen de un vistazo.
 *
 * Etiqueta chica arriba, número grande, y debajo lo único que hace falta para
 * entenderlo: contra qué se calcula. El ícono va en su cuadradito de color a
 * la derecha y no aporta información —aporta reconocimiento: en una fila de
 * diez tarjetas, la forma es lo que deja encontrar «ventas» sin leer.
 *
 * El COLOR es el que hace el trabajo real. Verde entró, rojo se perdió, ámbar
 * hay que hacer algo, azul es volumen. Nunca es decoración: significa siempre
 * lo mismo, así que una pantalla en verde se lee como un buen mes sin leer un
 * solo número.
 *
 * Y `null` no es cero: dice «sin datos». «0% de cierre» sobre cero asistencias
 * es una afirmación falsa con apariencia de dato.
 */
export type Tono = 'verde' | 'rojo' | 'ambar' | 'azul' | 'neutro'

export function Kpi({
  etiqueta, valor, tono = 'neutro', icono, contra, comoSeCalcula, destacada,
}: {
  etiqueta: string
  valor: ReactNode
  tono?: Tono
  icono: NombreDeIcono
  contra?: ReactNode
  comoSeCalcula?: string
  /** La que se mira primero. Ocupa dos columnas y respira más. */
  destacada?: boolean
}) {
  const Icono = Iconos[icono]
  return (
    <div className={`kpi ${tono}${destacada ? ' destacada' : ''}`} title={comoSeCalcula}>
      <div className="kpi-arriba">
        <div className="kpi-etiqueta">{etiqueta}</div>
        <div className="kpi-icono"><Icono /></div>
      </div>
      <div className="kpi-valor">
        {valor === null || valor === undefined ? <span className="kpi-sindato">sin datos</span> : valor}
      </div>
      {contra ? <div className="kpi-contra">{contra}</div> : null}
    </div>
  )
}

/** El porcentaje que acompaña a un número, o «sin datos» si no hay con qué dividir. */
export function conPct(v: number | null, sufijo: string): ReactNode {
  return v === null ? <span className="kpi-sindato">sin datos</span> : `${v.toLocaleString('es-AR')}% ${sufijo}`
}
