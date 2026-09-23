/**
 * Qué le puede pasar a un lead.
 *
 * El lead ES la oportunidad: no hay una capa intermedia. Las llamadas que
 * hagan falta para cerrarlo —una, dos o tres— cuelgan de él.
 *
 * Dos ejes distintos, y mezclarlos es lo que hace que después no se pueda
 * contestar «cuántas asistencias hubo» sin discutir:
 *
 *   ESTADO     qué pasó con la reunión  (vino, no vino, se canceló)
 *   RESULTADO  qué pasó con la venta    (compró, señó, quedó abierto, se perdió)
 */

export const ESTADOS = ['agendado', 'asistio', 'no_show', 'cancelado', 'reagendado'] as const
export type Estado = (typeof ESTADOS)[number]

export const NOMBRE_DE_ESTADO: Record<Estado, string> = {
  agendado: 'Agendado',
  asistio: 'Asistió',
  no_show: 'No show',
  cancelado: 'Cancelado',
  reagendado: 'Reagendado',
}

export const RESULTADOS = ['pendiente', 'venta', 'sena', 'seguimiento', 'perdida', 'no_calificado'] as const
export type Resultado = (typeof RESULTADOS)[number]

export const NOMBRE_DE_RESULTADO: Record<Resultado, string> = {
  pendiente: 'Pendiente',
  venta: 'Venta',
  sena: 'Seña',
  seguimiento: 'Seguimiento',
  perdida: 'Perdido',
  no_calificado: 'No calificado',
}

/**
 * El color de cada cosa. Nunca un color sin significado.
 *
 * La seña tiene el acento celeste: no es una venta y no es un seguimiento
 * cualquiera, porque hubo compromiso financiero. Que el acento de la interfaz
 * tenga un trabajo es lo que evita que sea decoración.
 */
export type Color = 'verde' | 'acento' | 'ambar' | 'rojo' | 'gris'

export const COLOR_DE_RESULTADO: Record<Resultado, Color> = {
  venta: 'verde',
  sena: 'acento',
  seguimiento: 'ambar',
  perdida: 'rojo',
  no_calificado: 'gris',
  pendiente: 'gris',
}

export const COLOR_DE_ESTADO: Record<Estado, Color> = {
  asistio: 'verde',
  agendado: 'gris',
  reagendado: 'ambar',
  no_show: 'rojo',
  cancelado: 'rojo',
}

export const TIPOS_SESION = ['primera', 'segunda', 'seguimiento', 'onboarding', 'otra'] as const
export type TipoSesion = (typeof TIPOS_SESION)[number]

export const NOMBRE_DE_TIPO: Record<TipoSesion, string> = {
  primera: 'Primera sesión',
  segunda: 'Segunda sesión',
  seguimiento: 'Seguimiento',
  onboarding: 'Onboarding',
  otra: 'Otra',
}

/**
 * Por qué se pierde. Lista cerrada a propósito: «no le interesó» escrito de
 * nueve maneras no se puede contar, y contar por qué se pierde es de lo poco
 * que cambia decisiones.
 */
export const MOTIVOS_PERDIDA = [
  'no_tenia_dinero', 'encaje', 'competencia', 'no_interesado',
  'precio', 'timing', 'socio', 'confianza', 'urgencia',
  'no_entendio', 'no_era_decisor', 'seguimiento_deficiente',
] as const
export type MotivoPerdida = (typeof MOTIVOS_PERDIDA)[number]

export const NOMBRE_DE_MOTIVO: Record<MotivoPerdida, string> = {
  no_tenia_dinero: 'Interesado sin dinero',
  encaje: 'No cualifica',
  competencia: 'Se fue con la competencia',
  no_interesado: 'No interesado',
  precio: 'Precio',
  timing: 'Timing',
  socio: 'Socio o pareja',
  confianza: 'Confianza',
  urgencia: 'Sin urgencia',
  no_entendio: 'No entendió la oferta',
  no_era_decisor: 'No era decisor',
  seguimiento_deficiente: 'Seguimiento deficiente',
}

/**
 * Los programas que se venden. Son dos.
 *
 * Era texto libre, y texto libre se escribe de nueve maneras: «Growth»,
 * «GROWTH», «growth elite». Después no se puede contestar cuánto vendió cada
 * programa, que es de las preguntas más baratas que hay.
 */
export const PROGRAMAS = ['GROWTH', 'ELITE'] as const
export type Programa = (typeof PROGRAMAS)[number]

/**
 * Cómo entró la plata. Lista cerrada por el mismo motivo que los motivos de
 * pérdida: «transfer», «Transferencia» y «transf.» escritos por tres personas
 * no se pueden contar.
 */
export const MEDIOS_DE_PAGO = [
  'transferencia', 'stripe', 'tarjeta', 'efectivo', 'mercadopago', 'paypal', 'cripto', 'otro',
] as const
export type MedioDePago = (typeof MEDIOS_DE_PAGO)[number]

export const NOMBRE_DE_MEDIO: Record<MedioDePago, string> = {
  transferencia: 'Transferencia',
  stripe: 'Stripe',
  tarjeta: 'Tarjeta',
  efectivo: 'Efectivo',
  mercadopago: 'Mercado Pago',
  paypal: 'PayPal',
  cripto: 'Cripto',
  otro: 'Otro',
}

/**
 * Hasta cuántas cuotas se puede pactar una venta. No es un límite del negocio:
 * es que un desplegable con cincuenta números no se elige, se sufre.
 */
export const MAXIMO_DE_CUOTAS = 12

/** «Primer pago», «Segundo pago»… Un «Pago 1» se lee peor y se completa igual. */
const ORDINALES = [
  'Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto',
  'Séptimo', 'Octavo', 'Noveno', 'Décimo', 'Undécimo', 'Duodécimo',
]

export function nombreDeCuota(n: number): string {
  const o = ORDINALES[n - 1]
  return o ? `${o} pago` : `Pago ${n}`
}

/**
 * Lo que el closer elige al cerrar la llamada.
 *
 * En la base son dos columnas —el resultado y, si quedó en seguimiento, cómo
 * sigue— pero para el que carga es UNA pregunta con una respuesta. Tenerlas
 * separadas en la pantalla obligaba a completar dos desplegables para decir
 * una sola cosa, y lo que se completa en dos pasos se completa mal.
 *
 * «Segunda llamada» es una salida propia y no un seguimiento cualquiera: la
 * reunión de hoy termina y queda agendada otra, con su fecha. Es lo que hace
 * que el mes que viene la segunda no le pise la agenda a la primera.
 */
export const SALIDAS = [
  'pendiente', 'venta', 'sena', 'segunda',
  'seguimiento_largo', 'seguimiento_cadencia', 'perdida', 'no_calificado',
] as const
export type Salida = (typeof SALIDAS)[number]

export const NOMBRE_DE_SALIDA: Record<Salida, string> = {
  pendiente: 'Todavía no se sabe',
  venta: 'Venta',
  sena: 'Seña',
  segunda: 'Segunda llamada',
  seguimiento_largo: 'Seguimiento largo',
  seguimiento_cadencia: 'Seguimiento · 12 toques',
  perdida: 'Perdido',
  no_calificado: 'No calificado',
}

export type ComoSigue = 'cadencia' | 'largo' | 'ninguno'

/** De lo que se elige en la pantalla a lo que se guarda. */
export function desdeSalida(salida: Salida): { resultado: Resultado; comoSigue: ComoSigue | null } {
  switch (salida) {
    case 'seguimiento_cadencia': return { resultado: 'seguimiento', comoSigue: 'cadencia' }
    case 'seguimiento_largo':    return { resultado: 'seguimiento', comoSigue: 'largo' }
    // La segunda llamada queda agendada: perseguirla con toques es perseguir
    // a alguien que ya tiene reunión.
    case 'segunda':              return { resultado: 'seguimiento', comoSigue: 'ninguno' }
    default:                     return { resultado: salida, comoSigue: null }
  }
}

/** Y al revés, para abrir la ficha en lo que el lead ya tiene cargado. */
export function salidaDe(resultado: Resultado, seguimientoLargo?: boolean): Salida {
  if (resultado !== 'seguimiento') return resultado
  return seguimientoLargo ? 'seguimiento_largo' : 'seguimiento_cadencia'
}

/** Un lead sigue abierto mientras no se haya vendido ni perdido. La seña NO lo cierra. */
export function sigueAbierto(resultado: Resultado): boolean {
  return resultado === 'pendiente' || resultado === 'seguimiento' || resultado === 'sena'
}

/**
 * ¿La plata cargada contradice el resultado?
 *
 * Existe porque faltaba y la falta era cara: cargar una venta por error y
 * después corregir el resultado a «Perdido» sacaba el lead del embudo pero
 * dejaba la venta. La facturación del mes seguía contando plata que no entró, y
 * el número no se podía arreglar desde ningún lado.
 *
 * Una seña convertida ya es una venta: no cuenta acá, se mira la venta.
 */
export function plataQueNoCuadra(
  resultado: Resultado,
  plata: { venta: number; sena: number },
): 'venta' | 'sena' | null {
  if (plata.venta > 0 && resultado !== 'venta') return 'venta'
  // Una seña convive con «pendiente», «seguimiento» y «seña». Con un lead
  // cerrado en falso, no: o la seña se perdió y hay que anularla, o el lead
  // no está perdido.
  if (plata.sena > 0 && (resultado === 'perdida' || resultado === 'no_calificado')) return 'sena'
  return null
}
