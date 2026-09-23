import Link from 'next/link'

/**
 * Filtrar por closer, de un clic.
 *
 * Estaba en cuatro pantallas de seis y en las cuatro era lo mismo: un
 * desplegable dentro del formulario de filtros, al fondo, que además había
 * que confirmar con «Filtrar». Tres pasos para una pregunta que el equipo se
 * hace todo el día —«¿cómo viene Kevin?»— y que en Leads y en el Dashboard
 * directamente no se podía hacer sin editar la dirección a mano.
 *
 * Acá arriba y en una pastilla por persona: un clic, y el nombre a la vista
 * en vez de escondido adentro de una lista. Con dos o tres closers, un
 * desplegable no ahorra espacio; cuesta un clic más.
 *
 * Conserva el resto de la dirección —el período, el texto buscado, la
 * pestaña— porque un filtro que al aplicarse borra los otros obliga a
 * empezar de nuevo, y eso se nota justo cuando más se está buscando algo.
 */
export function FiltroDeCloser({ closers, actual, href }: {
  closers: { id: number; nombre: string }[]
  /** El closer filtrado ahora, tal como viene en la dirección. */
  actual: string | undefined
  /** Cómo se arma la dirección con un closer distinto. */
  href: (closer: string | undefined) => string
}) {
  // Con un solo closer no hay nada que filtrar: la fila sería una pastilla
  // que no cambia nada, y una pastilla que no hace nada enseña a no tocarlas.
  if (closers.length < 2) return null

  return (
    <div className="chips" aria-label="Filtrar por closer">
      <Link href={href(undefined)} className={actual ? '' : 'activo'}>Todos</Link>
      {closers.map((c) => (
        <Link key={c.id} href={href(String(c.id))}
              className={actual === String(c.id) ? 'activo' : ''}>
          {c.nombre}
        </Link>
      ))}
    </div>
  )
}
