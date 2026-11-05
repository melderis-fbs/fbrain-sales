import Link from 'next/link'
import type { Toque } from '@/motor/toques'

/**
 * Los doce pasos, todos a la vez, en un solo renglón.
 *
 * Es la respuesta a «no se ven bien los pasos». El tablero en columnas no
 * puede mostrarlos: doce columnas legibles son tres mil píxeles de ancho, así
 * que o se cortan a la derecha —donde nada las anuncia— o envuelven en tres
 * filas y hay que recorrer la pantalla entera para saber dónde se junta la
 * gente. Y esa pregunta —«¿dónde se traba la cadencia?»— es para la que
 * existe el pipeline.
 *
 * Acá cada paso es un bloque chico con su número, cuántos tiene y cuántos
 * están atrasados. Entran los doce en el ancho de la pantalla, se leen de un
 * vistazo, y tocando uno la lista de abajo queda sólo con los suyos.
 *
 * La altura de la barrita es la proporción, no el número: es lo que hace que
 * el amontonamiento se vea antes de leer ninguna cifra.
 */
export type Paso = {
  toque: Toque
  cuantos: number
  tarde: number
}

export function PasosDelPipeline({
  pasos, elegido, href, largos, largosTarde,
}: {
  pasos: Paso[]
  /** El paso que está filtrando, o `null` por todos. `'largo'` es el de afuera. */
  elegido: number | 'largo' | null
  href: (paso: number | 'largo' | null) => string
  largos: number
  largosTarde: number
}) {
  const techo = Math.max(1, ...pasos.map((p) => p.cuantos), largos)

  const bloque = (
    clave: number | 'largo',
    titulo: string,
    nombre: string,
    cuantos: number,
    tarde: number,
  ) => (
    <Link key={clave} href={href(elegido === clave ? null : clave)}
          className={`paso-barra${elegido === clave ? ' activo' : ''}${cuantos === 0 ? ' vacio' : ''}`}
          title={`${titulo} · ${cuantos} ${cuantos === 1 ? 'lead' : 'leads'}${tarde > 0 ? ` · ${tarde} atrasados` : ''}`}>
      <span className="orden">{clave === 'largo' ? '★' : clave}</span>
      <span className="pila" aria-hidden>
        <span className="relleno" style={{ height: `${Math.round((cuantos / techo) * 100)}%` }} />
      </span>
      <span className="cuantos">{cuantos}</span>
      {tarde > 0 ? <span className="tarde">{tarde}</span> : <span className="tarde vacia">·</span>}
      <span className="nombre">{nombre}</span>
    </Link>
  )

  return (
    <div className="pasos">
      {pasos.map((p) => bloque(p.toque.orden, p.toque.nombre, p.toque.nombre, p.cuantos, p.tarde))}
      {largos > 0
        ? bloque('largo', 'Seguimiento largo — fuera de la cadencia', 'Largo', largos, largosTarde)
        : null}
    </div>
  )
}
