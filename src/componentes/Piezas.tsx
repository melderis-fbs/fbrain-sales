import type { ReactNode } from 'react'
import type { Color } from '@/dominio/resultados'

/**
 * Un número con su unidad y contra qué se compara.
 *
 * Nunca un número solo: «28%» no dice nada, «28% de cierre · 24% el mes pasado»
 * sí. Y `null` no es cero: cuando no hay con qué calcular, dice «sin datos» en
 * vez de mentir un 0%.
 */
export function Numero({
  etiqueta, valor, unidad, contra, color, chico,
}: {
  etiqueta: string
  valor: number | string | null
  unidad?: string
  contra?: ReactNode
  color?: Color
  chico?: boolean
}) {
  return (
    <div className="tarjeta">
      <div className="etiqueta">{etiqueta}</div>
      {valor === null ? (
        <div className="sindato" style={{ marginTop: 6 }}>sin datos</div>
      ) : (
        <div className={chico ? 'numero chico' : 'numero'} style={color ? { color: `var(--${color})` } : undefined}>
          {typeof valor === 'number' ? valor.toLocaleString('es-AR') : valor}
          {unidad ? <span style={{ fontSize: '.55em', fontWeight: 700, marginLeft: 2 }}>{unidad}</span> : null}
        </div>
      )}
      {contra ? <div className="contra">{contra}</div> : null}
    </div>
  )
}

/** Un color siempre con su palabra al lado. Un color solo no se puede leer. */
export function Pildora({ color, children }: { color: Color; children: ReactNode }) {
  return <span className={`pildora ${color}`}>{children}</span>
}

export function Barra({ porcentaje, color }: { porcentaje: number; color?: 'verde' | 'amarillo' | 'rojo' }) {
  const ancho = Math.max(0, Math.min(100, porcentaje))
  return (
    <div className={`barra ${color ?? ''}`}>
      <i style={{ width: `${ancho}%` }} />
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>
}

export function Tarjeta({ titulo, accion, children }: { titulo?: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="tarjeta">
      {titulo || accion ? (
        <div className="entre" style={{ marginBottom: 12 }}>
          {titulo ? <h2 style={{ margin: 0 }}>{titulo}</h2> : <span />}
          {accion}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Plata. Siempre con su moneda: una suma sin moneda no se puede leer. */
export function plata(importe: number, moneda = 'USD'): string {
  return `${moneda} ${Math.round(importe).toLocaleString('es-AR')}`
}

/** Un porcentaje, o «sin datos». Nunca 0% cuando el denominador era cero. */
export function porcentaje(valor: number | null): string {
  return valor === null ? '—' : `${valor}%`
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a?.slice(2)}`
}
