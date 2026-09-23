import type { Estado, Resultado } from '@/dominio/resultados'

/**
 * Qué parte del lead está cargada, y de quién es esa parte.
 *
 * Un lead lo llenan dos personas y en dos momentos: el setter antes de la
 * llamada —la agenda y la calificación— y el closer después —qué pasó—. La
 * lista mostraba los dos nombres y nada más, así que para saber si faltaba
 * algo había que abrir el lead, y para saber de quién era lo que faltaba,
 * acordarse de quién carga qué.
 *
 * El punto va pegado al nombre de cada uno: lleno si su parte está, hueco si
 * falta. Sin una palabra más en la fila, porque la fila ya tiene once
 * columnas y lo que se agrega en una tabla llena no se lee, se saltea.
 */
export function Cargado({ quien, hecho }: { quien: 'setter' | 'closer'; hecho: boolean }) {
  const que = quien === 'setter' ? 'la calificación' : 'el resultado de la llamada'
  return (
    <i className={`cargado ${quien} ${hecho ? 'hecho' : 'falta'}`}
       title={hecho ? `Cargó ${que}` : `Falta ${que}`} />
  )
}

/** El setter cumplió cuando el lead está calificado. */
export function cargoElSetter(l: { calidadScore: number | null }): boolean {
  return l.calidadScore !== null
}

/**
 * El closer cumplió cuando reportó la llamada.
 *
 * «Agendado y pendiente» es exactamente el estado de un lead que nadie tocó
 * después de la reunión: cualquiera de las dos cosas movida ya es un reporte.
 */
export function cargoElCloser(l: { estado: Estado; resultado: Resultado }): boolean {
  return l.estado !== 'agendado' || l.resultado !== 'pendiente'
}
