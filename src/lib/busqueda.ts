/**
 * Un parámetro de la URL que sale de un desplegable.
 *
 * Un `<select>` cuya opción «Todos» vale `""` manda `resultado=` en la URL
 * cuando el formulario se envía. Eso llega a la pantalla como cadena vacía, no
 * como `undefined`, y pasarlo tal cual a un filtro busca lo que tenga ese campo
 * literalmente vacío —o sea, nada—. Elegir «Todos» vaciaba la lista, que es
 * justo lo contrario de lo que promete.
 *
 * Vacío significa SIN FILTRO. Una línea, en un solo lugar, para que no haya que
 * acordarse en cada pantalla.
 */
export function opcion<T extends string>(valor: string | undefined): T | undefined {
  return valor === undefined || valor === '' ? undefined : (valor as T)
}
