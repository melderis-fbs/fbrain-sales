/**
 * La rúbrica del analizador.
 *
 * Acá está la diferencia con el analizador anterior. Al modelo no se le pide
 * una nota: se le pide, por dimensión, en cuál de cinco descripciones de
 * CONDUCTA OBSERVABLE cae la llamada, y la frase de la transcripción que lo
 * sostiene. La nota la calcula el motor.
 *
 * Por qué importa: «¿del 0 al 10, qué tan bien descubrió?» no tiene respuesta
 * verificable, y un modelo de lenguaje contesta lo que contestaría una persona
 * amable — de ahí sale que todo termine en 7,4. «¿Repreguntó al menos una vez
 * y llegó a un dato que el prospecto no había ofrecido?» sí se puede verificar,
 * y se puede citar.
 *
 * Esta redacción es un borrador para corregir con quien entrena a los closers.
 * Los pesos y los niveles viven en `scoring_config` y se cambian sin tocar
 * código.
 */

export type Dimension = {
  clave: string
  nombre: string
  peso: number
  anclas: [string, string, string, string, string]
}

export const DIMENSIONES: readonly Dimension[] = [
  {
    clave: 'descubrimiento',
    nombre: 'Descubrimiento',
    peso: 20,
    anclas: [
      'No preguntó. Habló de la oferta desde el minuto uno.',
      'Preguntas de encuadre («¿a qué te dedicás?») y nada más.',
      'Preguntó por la situación pero no repreguntó sobre ninguna respuesta.',
      'Repreguntó al menos una vez y llegó a un dato que el prospecto no había ofrecido.',
      'Llegó a la causa: el prospecto dijo algo que no sabía que iba a decir, y el closer lo usó después en la conversación.',
    ],
  },
  {
    clave: 'dolor',
    nombre: 'Profundidad del dolor',
    peso: 15,
    anclas: [
      'No se habló de ningún problema. La conversación fue sobre la solución.',
      'El prospecto nombró un problema y el closer pasó al tema siguiente.',
      'Se habló del problema en términos generales, sin consecuencias.',
      'El closer hizo que el prospecto dijera qué le cuesta ese problema: plata, tiempo u oportunidades perdidas.',
      'El prospecto llegó solo a una consecuencia que no había dicho antes, y se lo escuchó reconocerla.',
    ],
  },
  {
    clave: 'diagnostico',
    nombre: 'Diagnóstico',
    peso: 15,
    anclas: [
      'No hubo diagnóstico. Se presentó la oferta sin devolver una lectura.',
      'Devolvió una lectura genérica, que aplicaría a cualquiera.',
      'Nombró el problema del prospecto con sus mismas palabras, sin agregar nada.',
      'Conectó dos o más cosas que el prospecto había dicho por separado y armó una explicación.',
      'Nombró la causa detrás del síntoma, y el prospecto la confirmó.',
    ],
  },
  {
    clave: 'valor',
    nombre: 'Construcción de valor',
    peso: 15,
    anclas: [
      'No se construyó valor: se habló de precio o de contenidos.',
      'Listó características o módulos del programa.',
      'Explicó beneficios generales, iguales para cualquier prospecto.',
      'Ató al menos un elemento del programa a algo concreto que dijo el prospecto.',
      'El prospecto verbalizó el valor: dijo con sus palabras para qué le serviría.',
    ],
  },
  {
    clave: 'oferta',
    nombre: 'Presentación de la oferta',
    peso: 10,
    anclas: [
      'No se presentó oferta.',
      'Dijo el precio sin ningún encuadre.',
      'Presentó la oferta completa, pero desconectada de lo que se había hablado.',
      'Presentó la oferta como respuesta al problema que había diagnosticado.',
      'Presentó la oferta y el prospecto la recibió sin sorpresa por el precio, porque el costo de no resolverlo ya estaba claro.',
    ],
  },
  {
    clave: 'objeciones',
    nombre: 'Manejo de objeciones',
    peso: 10,
    anclas: [
      'Apareció una objeción y no se trabajó.',
      'Respondió con un argumento sin entender qué había detrás.',
      'Preguntó qué había detrás, pero volvió a argumentar igual.',
      'Aisló la objeción, confirmó que era la única, y recién ahí respondió.',
      'Hizo que el prospecto mismo desarmara su objeción.',
    ],
  },
  {
    clave: 'control',
    nombre: 'Control y liderazgo',
    peso: 10,
    anclas: [
      'La llamada la condujo el prospecto.',
      'El closer siguió su guion sin adaptarse a lo que estaba pasando.',
      'Condujo la conversación, pero perdió el hilo en algún desvío.',
      'Llevó la conversación de punta a punta, incluso cuando el prospecto desvió.',
      'Condujo y además cambió el rumbo cuando lo que apareció lo ameritaba, sin perder el marco.',
    ],
  },
  {
    clave: 'cierre',
    nombre: 'Cierre / siguiente paso',
    peso: 5,
    anclas: [
      'La llamada terminó sin pedir nada ni acordar nada.',
      'Dejó la pelota del lado del prospecto («cualquier cosa me avisás»).',
      'Pidió una decisión, pero sin fecha ni compromiso concreto.',
      'Pidió la decisión y acordó un próximo paso con fecha.',
      'Cerró, o acordó un próximo paso con fecha, responsable y qué tiene que pasar para decidir.',
    ],
  },
] as const

/**
 * Los eventos que restan. Vocabulario cerrado y con cita obligatoria: sin la
 * frase de la transcripción que lo sostiene, el evento no entra.
 */
export const PENALIZACIONES: Record<string, { nombre: string; valor: number; dimension?: string }> = {
  no_encuentra_dolor:          { nombre: 'No encontró un dolor real',                  valor: -0.8, dimension: 'dolor' },
  habla_mas_que_el_prospecto:  { nombre: 'Habló más que el prospecto sin justificación', valor: -0.4, dimension: 'control' },
  pitch_prematuro:             { nombre: 'Presentó la oferta antes de tiempo',          valor: -0.6, dimension: 'oferta' },
  no_identifica_objecion_real: { nombre: 'No identificó la objeción real',              valor: -0.7, dimension: 'objeciones' },
  no_pide_decision:            { nombre: 'No pidió una decisión',                       valor: -0.5, dimension: 'cierre' },
  no_establece_proximo_paso:   { nombre: 'No estableció el próximo paso',               valor: -0.5, dimension: 'cierre' },
  descuento_sin_trabajar:      { nombre: 'Ofreció descuento sin trabajar la objeción',  valor: -0.8, dimension: 'objeciones' },
  // Sin dimensión: no hay ninguna que lo mida, así que resta siempre.
  promesa_incorrecta:          { nombre: 'Prometió algo que el programa no hace',       valor: -1.0 },
}

/** Los que suman. Sólo por conductas excelentes: acá no se regalan puntos. */
export const BONIFICACIONES: Record<string, { nombre: string; valor: number }> = {
  pregunta_que_cambia:      { nombre: 'Una pregunta que cambió la conversación',     valor: 0.3 },
  descubre_la_raiz:         { nombre: 'Descubrió la raíz del problema',              valor: 0.3 },
  reformula_con_claridad:   { nombre: 'Reformuló con altísima claridad',             valor: 0.2 },
  conecta_con_costo_real:   { nombre: 'Conectó el problema con su costo real',       valor: 0.3 },
  objecion_sin_confrontar:  { nombre: 'Manejó la objeción sin confrontar',           valor: 0.2 },
  prospecto_verbaliza:      { nombre: 'Logró que el prospecto verbalizara la solución', valor: 0.3 },
  excelente_cierre:         { nombre: 'Cierre excelente',                            valor: 0.2 },
}

/** El total de bonificaciones no puede pasar de acá. Si no, se compensa lo grave con lo lindo. */
export const TOPE_DE_BONIFICACIONES = 0.5

/**
 * Los topes. Una venta consultiva necesita fundamentos mínimos: sin ellos, no
 * hay rapport que alcance.
 *
 * Es lo que rompe el 7,4. El ejemplo del documento maestro —rapport 9, energía
 * 9, comunicación 9, pero descubrimiento 3, diagnóstico 3 y objeciones 4—
 * terminaba en 7,2 promediando. Con topes termina en 5,3.
 */
export const TOPES: { dimension: string; menorA: number; tope: number; porque: string }[] = [
  { dimension: 'descubrimiento', menorA: 5, tope: 7.0, porque: 'Sin descubrimiento no se puede saber si lo que se vendió servía.' },
  { dimension: 'diagnostico',    menorA: 5, tope: 6.8, porque: 'Sin diagnóstico la oferta es una casualidad.' },
  { dimension: 'dolor',          menorA: 3, tope: 6.0, porque: 'Nunca se profundizó el dolor: la venta quedó apoyada en el entusiasmo.' },
]

/** Cómo se traduce cada nivel de rúbrica a una nota de 0 a 10. */
export const NIVEL_A_NOTA: Record<number, number> = { 0: 1.0, 1: 3.0, 2: 5.0, 3: 7.0, 4: 9.0 }

/**
 * La escala, para que una nota se pueda leer sin tabla al lado.
 * Llegar a 8 tiene que ser difícil; a 9, extraordinario.
 */
export function comoSeLee(score: number): string {
  if (score < 5) return 'mala'
  if (score < 6) return 'débil'
  if (score < 7) return 'promedio'
  if (score < 8) return 'buena'
  if (score < 9) return 'muy buena'
  return 'excepcional'
}
