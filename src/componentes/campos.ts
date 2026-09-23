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
  // Lo último que sabe React, para que el listener de `reset` lo lea sin tener
  // que volver a colgarse en cada render.
  const valoresVivos = useRef(valores)
  valoresVivos.current = valores

  useEffect(() => {
    const elemento = form.current
    if (!elemento) return

    /**
     * Reponer los `<select>` DESPUÉS de que React limpie el formulario.
     *
     * Cuando una acción de servidor termina, React llama a `form.reset()`. Los
     * `<input>` controlados se restauran solos en el render siguiente; los
     * `<select>` NO, porque su valor en React no cambió y React no ve nada que
     * actualizar. El desplegable se queda en el «Sin cargar» que le dejó la
     * limpieza mientras React sigue creyendo lo que había, y ahí es donde la
     * segunda persona que se da de alta en Configuración se crea con el rol
     * equivocado sin que nadie vea un error.
     *
     * Escuchar el evento `reset` es lo que hace que esto ocurra EXACTAMENTE
     * cuando hay algo que reponer. Antes corría después de cada render, y eso
     * tenía un costo que no se veía: entre que alguien elegía una opción y que
     * React registraba el cambio podía colarse un render ajeno —la
     * revalidación de otra pantalla, por ejemplo— y la reposición devolvía el
     * desplegable al valor anterior. El arreglo de un problema causaba el
     * mismo problema al revés, y encima sólo a veces.
     *
     * El `reset` es cancelable y se dispara ANTES de que los campos se
     * limpien, así que la reposición va en el tick siguiente: si corriera acá
     * mismo, la limpieza pasaría después y la desharía.
     */
    const reponer = () => {
      const actual = form.current
      if (!actual) return
      for (const [nombre, valor] of Object.entries(valoresVivos.current)) {
        const campo = actual.elements.namedItem(nombre)
        if (campo instanceof HTMLSelectElement && campo.value !== valor) campo.value = valor
      }
    }
    const alResetear = () => { setTimeout(reponer, 0) }

    elemento.addEventListener('reset', alResetear)
    return () => elemento.removeEventListener('reset', alResetear)
    // Se cuelga una sola vez del formulario: los valores se leen de la ref en
    // el momento de reponer, así que no hace falta volver a colgarlo.
  }, [])

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

  return { campo, valores, setValores, form }
}
