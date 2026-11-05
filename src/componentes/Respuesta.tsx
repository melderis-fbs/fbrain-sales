'use client'

import { useFormStatus } from 'react-dom'

/**
 * Lo que contestó el servidor, dicho en la pantalla.
 *
 * Una acción de servidor que devuelve `void` y deja salir la excepción
 * termina en «Algo se rompió en esta pantalla» con un digest: en producción
 * Next no muestra el mensaje del error, para no filtrar detalles. Así, «ese
 * estado no existe» o «no tenés acceso a ese lead» se leen como una
 * aplicación rota, cuando son cosas que quien carga puede arreglar en diez
 * segundos.
 *
 * Esto es la otra mitad: las acciones devuelven qué pasó y la pantalla lo
 * dice, al lado del botón que se apretó.
 */
export type Respuesta = { ok: boolean; mensaje: string } | null

export function Aviso({ r, chico = false }: { r: Respuesta; chico?: boolean }) {
  if (!r) return null
  return (
    <div className={r.ok ? 'aviso dato' : 'aviso problema'}
         style={chico ? { fontSize: 12, padding: '6px 9px', margin: '6px 0 0' } : undefined}>
      {r.mensaje}
    </div>
  )
}

/**
 * Un botón que dice que está trabajando.
 *
 * Sin esto, una acción que tarda dos segundos se ve igual que una que no hizo
 * nada, y se aprieta de nuevo. Dos veces apretado es el toque registrado dos
 * veces.
 */
export function Boton({
  children, clase, deshabilitado = false, mientras = 'Guardando…',
}: {
  children: React.ReactNode
  clase?: string
  deshabilitado?: boolean
  mientras?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={clase} disabled={pending || deshabilitado}>
      {pending ? mientras : children}
    </button>
  )
}
