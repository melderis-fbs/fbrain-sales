/**
 * El Lead Quality: qué se le pregunta al lead antes de la llamada.
 *
 * Es la ficha que completa el setter. No está acá por prolijidad: es lo único
 * que después permite comparar dos closers con justicia. Un closer que cierra
 * 18% con leads flojos y otro que cierra 22% con leads buenos no se pueden
 * ordenar por el 18 y el 22, y ordenarlos así es exactamente lo que hace que
 * el que trabaja mejor quede último en la tabla.
 *
 * Todo lo que puntúa es de lista cerrada. «Tiene plata» escrito de nueve
 * maneras no se puede contar, y un campo libre no se puede ponderar.
 */

export type Opcion = { valor: string; etiqueta: string; nivel: 0 | 1 | 2 | 3 | 4 }

export type CampoQuePuntua = {
  clave: string
  etiqueta: string
  ayuda?: string
  /** Cuánto pesa sobre 100. La suma de todos los pesos es 100. */
  peso: number
  opciones: readonly Opcion[]
}

export const CAMPOS_QUE_PUNTUAN: readonly CampoQuePuntua[] = [
  {
    clave: 'capacidad_inversion',
    etiqueta: '¿Puede invertir?',
    ayuda: 'Lo primero que hunde una llamada. Preguntarlo antes es más barato que averiguarlo en la reunión.',
    peso: 25,
    opciones: [
      { valor: 'no', etiqueta: 'No puede', nivel: 0 },
      { valor: 'no_ahora', etiqueta: 'No ahora', nivel: 1 },
      { valor: 'necesita_financiar', etiqueta: 'Necesita financiar', nivel: 2 },
      { valor: 'con_esfuerzo', etiqueta: 'Sí, con esfuerzo', nivel: 3 },
      { valor: 'si', etiqueta: 'Sí, sin problema', nivel: 4 },
    ],
  },
  {
    clave: 'es_decisor',
    etiqueta: '¿Decide solo?',
    peso: 15,
    opciones: [
      { valor: 'no', etiqueta: 'No decide', nivel: 0 },
      { valor: 'comparte', etiqueta: 'Decide con otra persona', nivel: 2 },
      { valor: 'si', etiqueta: 'Decide solo', nivel: 4 },
    ],
  },
  {
    clave: 'urgencia',
    etiqueta: 'Urgencia',
    ayuda: 'Cuánto le corre el reloj. Sin urgencia, el «lo pienso» llega igual con la mejor llamada.',
    peso: 15,
    opciones: [
      { valor: '1', etiqueta: '1 · puede esperar un año', nivel: 0 },
      { valor: '2', etiqueta: '2 · le gustaría en algún momento', nivel: 1 },
      { valor: '3', etiqueta: '3 · lo quiere resolver este trimestre', nivel: 2 },
      { valor: '4', etiqueta: '4 · lo quiere resolver este mes', nivel: 3 },
      { valor: '5', etiqueta: '5 · lo necesita ya', nivel: 4 },
    ],
  },
  {
    clave: 'facturacion_mensual',
    etiqueta: 'Facturación mensual',
    peso: 15,
    opciones: [
      { valor: 'sin_facturar', etiqueta: 'Todavía no factura', nivel: 0 },
      { valor: 'hasta_2k', etiqueta: 'Hasta 2.000', nivel: 1 },
      { valor: '2k_5k', etiqueta: '2.000 – 5.000', nivel: 2 },
      { valor: '5k_15k', etiqueta: '5.000 – 15.000', nivel: 3 },
      { valor: 'mas_15k', etiqueta: 'Más de 15.000', nivel: 4 },
    ],
  },
  {
    clave: 'tiene_clientes',
    etiqueta: '¿Tiene clientes hoy?',
    peso: 10,
    opciones: [
      { valor: 'ninguno', etiqueta: 'Ninguno', nivel: 0 },
      { valor: 'algunos', etiqueta: 'Algunos, sueltos', nivel: 2 },
      { valor: 'recurrentes', etiqueta: 'Cartera recurrente', nivel: 4 },
    ],
  },
  {
    clave: 'oferta_definida',
    etiqueta: '¿Tiene una oferta definida?',
    peso: 10,
    opciones: [
      { valor: 'no', etiqueta: 'No sabe qué vende', nivel: 0 },
      { valor: 'difusa', etiqueta: 'Una idea, sin precio ni promesa', nivel: 2 },
      { valor: 'si', etiqueta: 'Oferta clara y con precio', nivel: 4 },
    ],
  },
  {
    clave: 'conciencia',
    etiqueta: 'Nivel de conciencia',
    ayuda: 'Cuánto entiende de su propio problema antes de entrar a la llamada.',
    peso: 5,
    opciones: [
      { valor: 'no_sabe', etiqueta: 'No sabe que tiene un problema', nivel: 0 },
      { valor: 'sabe', etiqueta: 'Sabe que tiene un problema', nivel: 1 },
      { valor: 'busca', etiqueta: 'Busca solución activamente', nivel: 3 },
      { valor: 'compara', etiqueta: 'Compara soluciones concretas', nivel: 4 },
    ],
  },
  {
    clave: 'interes',
    etiqueta: 'Interés mostrado',
    peso: 5,
    opciones: [
      { valor: 'bajo', etiqueta: 'Bajo · contestó por compromiso', nivel: 0 },
      { valor: 'medio', etiqueta: 'Medio · curioso', nivel: 2 },
      { valor: 'alto', etiqueta: 'Alto · pidió la reunión él', nivel: 4 },
    ],
  },
] as const

/** Lo que el setter escribe con sus palabras. No puntúa, y sirve muchísimo. */
export const CAMPOS_LIBRES = [
  { clave: 'problema', etiqueta: 'El problema, en sus palabras', largo: true },
  { clave: 'objetivo', etiqueta: 'Qué quiere lograr', largo: true },
  { clave: 'ticket_actual', etiqueta: 'Ticket promedio actual', largo: false },
  { clave: 'observaciones_setter', etiqueta: 'Observaciones del setter', largo: true },
] as const

export const PESO_TOTAL = CAMPOS_QUE_PUNTUAN.reduce((s, c) => s + c.peso, 0)

export type NivelDeCalidad = 'alto' | 'medio' | 'bajo'

export const NOMBRE_DE_NIVEL: Record<NivelDeCalidad, string> = {
  alto: 'Alto', medio: 'Medio', bajo: 'Bajo',
}

/**
 * Por debajo de esto no se publica un nivel.
 *
 * Con tres campos de doce contestados, cualquier número que se muestre se va a
 * leer como «este lead es malo», cuando lo que pasa es que nadie lo calificó.
 * «Sin calificar» es una respuesta; «bajo» sería una mentira.
 */
export const COMPLETITUD_MINIMA = 60

export function nivelDeCalidad(score: number): NivelDeCalidad {
  if (score >= 70) return 'alto'
  if (score >= 45) return 'medio'
  return 'bajo'
}

export const COLOR_DE_CALIDAD: Record<NivelDeCalidad, 'verde' | 'ambar' | 'rojo'> = {
  alto: 'verde', medio: 'ambar', bajo: 'rojo',
}
