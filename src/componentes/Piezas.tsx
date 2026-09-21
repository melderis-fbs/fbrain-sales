import type { ReactNode } from 'react'
import type { Color } from '@/dominio/resultados'

/**
 * Un número con su unidad y contra qué se compara.
 *
 * Nunca un número solo: «28%» no dice nada, «28% de cierre · 24% el mes
 * anterior» sí. Y `null` no es cero — cuando no hay con qué calcular dice
 * «sin datos» en vez de mentir un 0%.
 *
 * El número va siempre en negro. Un tablero donde cada cifra tiene su color es
 * un tablero donde ninguna resalta; el color va en la tendencia, chiquito, que
 * es lo único que hay que mirar de reojo.
 */
export function Numero({
  etiqueta, valor, unidad, contra, tendencia, chico, comoSeCalcula,
}: {
  etiqueta: string
  valor: number | string | null
  unidad?: string
  contra?: ReactNode
  tendencia?: { valor: number | null; mejorEsMas?: boolean; sufijo?: string }
  chico?: boolean
  comoSeCalcula?: string
}) {
  return (
    <div className="tarjeta">
      <div className="etiqueta" title={comoSeCalcula}>{etiqueta}</div>
      {valor === null ? (
        <div className="sindato" style={{ marginTop: 6 }}>sin datos</div>
      ) : (
        <div className={chico ? 'numero chico' : 'numero'}>
          {typeof valor === 'number' ? valor.toLocaleString('es-AR') : valor}
          {unidad ? <span style={{ fontSize: '.5em', fontWeight: 650, marginLeft: 2 }}>{unidad}</span> : null}
        </div>
      )}
      {tendencia ? <Tendencia {...tendencia} /> : null}
      {contra ? <div className="contra">{contra}</div> : null}
    </div>
  )
}

/**
 * La diferencia contra el período anterior.
 *
 * `mejorEsMas` existe porque no siempre subir es bueno: más no-shows es peor, y
 * pintarlo de verde por haber subido sería exactamente al revés.
 */
export function Tendencia({
  valor, mejorEsMas = true, sufijo = '',
}: { valor: number | null; mejorEsMas?: boolean; sufijo?: string }) {
  if (valor === null) return <div className="contra">sin período anterior</div>
  if (valor === 0) return <div className="tendencia igual" style={{ marginTop: 3 }}>= igual</div>
  const bueno = valor > 0 === mejorEsMas
  return (
    <div className={`tendencia ${bueno ? 'sube' : 'baja'}`} style={{ marginTop: 3 }}>
      {valor > 0 ? '↑' : '↓'} {Math.abs(valor).toLocaleString('es-AR')}{sufijo} vs. anterior
    </div>
  )
}

/** Un color siempre con su palabra al lado. Un color solo no se puede leer. */
export function Pildora({ color, children, titulo }: { color: Color; children: ReactNode; titulo?: string }) {
  return <span className={`pildora ${color}`} title={titulo}>{children}</span>
}

export function Barra({ porcentaje, color }: { porcentaje: number; color?: Color }) {
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

export function Tarjeta({
  titulo, accion, ayuda, plana, children,
}: {
  titulo?: string
  accion?: ReactNode
  ayuda?: string
  plana?: boolean
  children: ReactNode
}) {
  return (
    <section className={plana ? 'tarjeta plana' : 'tarjeta'}>
      {titulo || accion ? (
        <div className="entre" style={{ marginBottom: ayuda ? 4 : 12 }}>
          {titulo ? <h2 style={{ margin: 0 }}>{titulo}</h2> : <span />}
          {accion}
        </div>
      ) : null}
      {ayuda ? <p className="ayuda" style={{ marginBottom: 12 }}>{ayuda}</p> : null}
      {children}
    </section>
  )
}

/** El encabezado de una pantalla. Mismo lugar, mismo tamaño, en todas. */
export function Encabezado({
  kicker, titulo, bajada, children,
}: { kicker: string; titulo: string; bajada?: string; children?: ReactNode }) {
  return (
    <div className="entre">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{titulo}</h1>
        {bajada ? <p className="ayuda">{bajada}</p> : null}
      </div>
      {children ? <div className="fila">{children}</div> : null}
    </div>
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

export function fechaLarga(iso: string | null): string {
  if (!iso) return '—'
  const f = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  return f.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export function cuando(iso: string | null): string {
  if (!iso) return '—'
  const f = new Date(iso)
  return f.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit',
                                     hour: '2-digit', minute: '2-digit' })
}

export function hora(h: string | null): string {
  return h ? h.slice(0, 5) : '—'
}
