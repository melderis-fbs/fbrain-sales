'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'

/**
 * Que un formulario no se vacíe cuando la acción devuelve un error.
 *
 * React limpia los campos apenas termina una acción de servidor. Para la clave
 * está bien que se borre; para todo lo demás es perder lo que la persona acaba
 * de escribir justo cuando le estamos pidiendo que corrija algo. En el alta de
 * un lead eran doce campos: se avisaba de un posible duplicado y, para poder
 * decir «es otra persona», había que cargarlo todo de nuevo.
 *
 * La solución es tener los valores del lado de React. Esto es eso, en una
 * función, para no escribir doce `useState`.
 *
 * Y hay una trampa que cuesta ver: los `<input>` controlados se restauran solos
 * en el render siguiente, pero los `<select>` NO. Como su valor en React no
 * cambió, React no ve nada que actualizar y el desplegable se queda en el
 * «Sin cargar» que le dejó la limpieza del navegador. Por eso hay que
 * reponerlos a mano, y por eso esto devuelve un `form` para colgar del
 * formulario.
 */
export function useCampos<T extends Record<string, string>>(iniciales: T, reintento?: unknown) {
  const [valores, setValores] = useState<T>(iniciales)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const elemento = form.current
    if (!elemento) return
    for (const [nombre, valor] of Object.entries(valores)) {
      const campo = elemento.elements.namedItem(nombre)
      if (campo instanceof HTMLSelectElement && campo.value !== valor) campo.value = valor
    }
    // A propósito depende sólo del reintento: se repone cuando la acción
    // volvió, no cada vez que alguien toca una tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reintento])

  const campo = (nombre: keyof T & string) => ({
    name: nombre,
    id: nombre,
    value: valores[nombre] ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValores((v) => ({ ...v, [nombre]: e.target.value })),
  })

  return { campo, valores, form }
}
