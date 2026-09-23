'use client'

/**
 * Descargar el informe.
 *
 * Usa la impresión del navegador y no una librería de PDF en el servidor. No
 * es una concesión: el informe YA está maquetado en la pantalla, y una segunda
 * maqueta para el PDF es una segunda maqueta que se desactualiza —la de la
 * pantalla cambia, la del PDF no, y el día que alguien lo nota ya mandó tres
 * informes viejos—. Con una hoja de estilos de impresión, lo que se ve es lo
 * que se guarda.
 *
 * En el diálogo hay que elegir «Guardar como PDF» como destino, que es lo que
 * Chrome ofrece por defecto.
 */
export function Imprimir() {
  return (
    <button type="button" className="secundario" onClick={() => window.print()}>
      Descargar PDF
    </button>
  )
}
