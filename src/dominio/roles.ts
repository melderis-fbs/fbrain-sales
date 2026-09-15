/**
 * Los seis roles y qué puede cada uno.
 *
 * Una tabla, no una cadena de `if`. Cuando dentro de tres meses haya que
 * contestar «¿el coach puede editar un importe?», la respuesta está acá y se
 * lee de un vistazo, en vez de estar repartida en once pantallas.
 */

export const ROLES = ['admin', 'direccion', 'head', 'closer', 'setter', 'coach'] as const
export type Rol = (typeof ROLES)[number]

export const NOMBRE_DE_ROL: Record<Rol, string> = {
  admin: 'Admin',
  direccion: 'Dirección',
  head: 'Head Comercial',
  closer: 'Closer',
  setter: 'Setter',
  coach: 'Coach / QA',
}

export type Permiso =
  | 'verTodo'          // la operación entera, no sólo lo propio
  | 'editarLead'
  | 'reasignarCloser'
  | 'cargarResultado'
  | 'editarDinero'
  | 'verDinero'
  | 'configurar'

export const PUEDE: Record<Rol, Record<Permiso, boolean>> = {
  admin:     { verTodo: true,  editarLead: true,  reasignarCloser: true,  cargarResultado: true,  editarDinero: true,  verDinero: true,  configurar: true  },
  direccion: { verTodo: true,  editarLead: true,  reasignarCloser: true,  cargarResultado: true,  editarDinero: true,  verDinero: true,  configurar: true  },
  head:      { verTodo: true,  editarLead: true,  reasignarCloser: true,  cargarResultado: true,  editarDinero: true,  verDinero: true,  configurar: true  },
  closer:    { verTodo: false, editarLead: true,  reasignarCloser: false, cargarResultado: true,  editarDinero: false, verDinero: true,  configurar: false },
  setter:    { verTodo: false, editarLead: true,  reasignarCloser: false, cargarResultado: false, editarDinero: false, verDinero: false, configurar: false },
  // El coach mira llamadas y da feedback. No toca la operación ni la plata.
  coach:     { verTodo: true,  editarLead: false, reasignarCloser: false, cargarResultado: false, editarDinero: false, verDinero: false, configurar: false },
}

/** A dónde manda el home de cada rol. Cada uno abre en la pregunta que le toca. */
export const HOME_DE_ROL: Record<Rol, string> = {
  admin: '/tablero',
  direccion: '/tablero',
  head: '/tablero',
  closer: '/hoy',
  setter: '/leads',
  coach: '/closers',
}
