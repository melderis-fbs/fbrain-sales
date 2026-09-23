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
  | 'borrarLead'       // dar de baja. Nada se borra de verdad: se puede restaurar
  | 'restaurarLead'
  | 'reasignarCloser'
  | 'cargarResultado'
  | 'editarDinero'
  | 'verDinero'
  | 'configurar'

export const PUEDE: Record<Rol, Record<Permiso, boolean>> = {
  admin:     { verTodo: true,  editarLead: true,  borrarLead: true,  restaurarLead: true,  reasignarCloser: true,  cargarResultado: true,  editarDinero: true,  verDinero: true,  configurar: true  },
  direccion: { verTodo: true,  editarLead: true,  borrarLead: true,  restaurarLead: true,  reasignarCloser: true,  cargarResultado: true,  editarDinero: true,  verDinero: true,  configurar: true  },
  head:      { verTodo: true,  editarLead: true,  borrarLead: true,  restaurarLead: true,  reasignarCloser: true,  cargarResultado: true,  editarDinero: true,  verDinero: true,  configurar: true  },
  // El closer y el setter TRABAJAN TODA la operación, sin excepción.
  //
  // No hay segmentación por quién cargó el dato, y es una decisión, no un
  // olvido: el equipo es chico, los leads se pasan, y cada permiso que decía
  // «esto no es tuyo» se pagaba con un dato peor. Un setter veía «está
  // duplicado» y no podía abrir contra qué; como tampoco podía reasignar el
  // closer, terminaba cargando el lead de nuevo. Un permiso que empuja a
  // duplicar el dato no protege nada: rompe el dato, y el dato es el producto.
  //
  // Todo lo que hacen queda firmado en el historial —quién, cuándo y por qué—,
  // que es el control que sí sirve: no impide el error, lo hace visible.
  //
  // Lo único que no tocan es CONFIGURAR: el equipo, los objetivos, la cadencia
  // y las reglas de comisión. Eso no es el dato de un lead, es cómo se mide a
  // todos, y se cambia en un solo lugar.
  closer:    { verTodo: true,  editarLead: true,  borrarLead: true,  restaurarLead: true,  reasignarCloser: true,  cargarResultado: true,  editarDinero: true,  verDinero: true,  configurar: false },
  setter:    { verTodo: true,  editarLead: true,  borrarLead: true,  restaurarLead: true,  reasignarCloser: true,  cargarResultado: true,  editarDinero: true,  verDinero: true,  configurar: false },
  // El coach mira llamadas y da feedback. No toca la operación ni la plata.
  coach:     { verTodo: true,  editarLead: false, borrarLead: false, restaurarLead: false, reasignarCloser: false, cargarResultado: false, editarDinero: false, verDinero: false, configurar: false },
}

/** A dónde manda el home de cada rol. Cada uno abre en la pregunta que le toca. */
export const HOME_DE_ROL: Record<Rol, string> = {
  admin: '/dashboard',
  direccion: '/dashboard',
  head: '/dashboard',
  closer: '/tracker',
  setter: '/leads',
  coach: '/llamadas',
}
