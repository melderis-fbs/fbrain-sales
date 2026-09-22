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
export function useCampos<T extends Record<string, string>>(
  iniciales: T,
  reintento?: unknown,
  /**
   * Prefijo para los `id`. Hace falta cuando hay dos formularios en la misma
   * pantalla con campos que se llaman igual: dos `id="email"` es HTML inválido
   * y, peor, la etiqueta de uno termina apuntando al campo del otro — así que
   * tocar «Email» pone el foco en el formulario equivocado.
   */
  prefijo?: string,
) {
  const [valores, setValores] = useState<T>(iniciales)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const elemento = form.current
    if (!elemento) return
    for (const [nombre, valor] of Object.entries(valores)) {
      const campo = elemento.elements.namedItem(nombre)
      if (campo instanceof HTMLSelectElement && campo.value !== valor) campo.value = valor
    }
    // A propósito SIN lista de dependencias: corre después de cada render.
    //
    // Antes dependía sólo de `reintento`, y eso alcanzaba mientras la acción
    // devolviera un error distinto cada vez. Con una acción que sale bien y
    // devuelve lo mismo —dar de alta a alguien en Configuración, una persona
    // tras otra— el estado de React y el DOM se separaban en silencio: React
    // creía «setter» y el desplegable mostraba otra cosa, así que la segunda y
    // la tercera persona se creaban con el rol equivocado sin que nadie viera
    // un error. Un dato mal cargado sin mensaje es peor que un error.
    //
    // Correrlo siempre no cuesta nada: es un puñado de `<select>` y, si no hay
    // diferencia, no toca el DOM.
  })

  const campo = (nombre: keyof T & string) => ({
    name: nombre,
    id: prefijo ? `${prefijo}-${nombre}` : nombre,
    value: valores[nombre] ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValores((v) => ({ ...v, [nombre]: e.target.value })),
  })

  // `reintento` se sigue aceptando porque lo pasan las pantallas y documenta
  // qué dispara la reposición, pero ya no gobierna cuándo se repone.
  void reintento

  return { campo, valores, form }
}
