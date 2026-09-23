/**
 * Las fases de una llamada, que salen del PLAYBOOK de cada closer.
 *
 * Es la diferencia entre «te fue bien» y «seguiste el script». Una rúbrica
 * general —descubrimiento, dolor, cierre— mide si la venta consultiva estuvo
 * bien hecha, y eso es cierto para cualquier equipo. Las fases miden otra cosa:
 * si esta llamada siguió EL GUIÓN DE ESTE EQUIPO, con sus pesos y su orden.
 *
 * Por eso salen del playbook y no de una lista fija. Si el script cambia, el
 * análisis mide el script nuevo sin tocar código; y si dos closers trabajan
 * con guiones distintos, cada uno se mide contra el suyo. Una adherencia
 * calculada contra un guión que no es el que usa el closer es un número que
 * suena preciso y no significa nada.
 */

export type Fase = {
  /** Corto y sin espacios: es lo que el modelo devuelve para identificarla. */
  clave: string
  nombre: string
  /** Cuánto pesa en la nota de adherencia. Los pesos suman 100. */
  peso: number
  /** Qué tiene que lograr esta fase. Es contra esto que se evalúa. */
  objetivo: string
  /** Cómo se hace en este equipo: la fórmula, la pregunta literal, el orden. */
  comoSeHace: string
}

/**
 * Si la fase ocurrió, ocurrió a medias, o no ocurrió.
 *
 * Tres estados y no una nota, porque la adherencia es una pregunta binaria con
 * un medio: «¿hiciste este paso?». La calidad con la que se hizo va aparte, en
 * la nota de la fase.
 */
export const EJECUCIONES = ['ejecutado', 'parcial', 'no_ejecutado'] as const
export type Ejecucion = (typeof EJECUCIONES)[number]

export const NOMBRE_DE_EJECUCION: Record<Ejecucion, string> = {
  ejecutado: 'Ejecutado',
  parcial: 'Parcial',
  no_ejecutado: 'No ejecutado',
}

export const COLOR_DE_EJECUCION: Record<Ejecucion, 'verde' | 'ambar' | 'rojo'> = {
  ejecutado: 'verde',
  parcial: 'ambar',
  no_ejecutado: 'rojo',
}

/** Cuánto cuenta cada estado para la adherencia. Un paso a medias vale medio. */
const VALE: Record<Ejecucion, number> = { ejecutado: 1, parcial: 0.5, no_ejecutado: 0 }

/**
 * Las fases con las que arranca un playbook nuevo.
 *
 * Es un punto de partida editable, no una verdad: sale del informe que el
 * equipo ya venía usando. Lo importante es que un playbook nunca quede sin
 * fases, porque un análisis sin fases no puede medir adherencia y el número
 * quedaría en cero sin que eso signifique nada.
 */
export const FASES_POR_DEFECTO: Fase[] = [
  { clave: 'introduccion', nombre: 'Introducción y conexión', peso: 5,
    objetivo: 'Romper el hielo y que el prospecto baje la guardia en los primeros minutos.',
    comoSeHace: 'Saludo cálido, preguntar desde dónde conecta y cómo llegó, validar el tiempo que tiene.' },
  { clave: 'encuadre', nombre: 'Encuadre', peso: 10,
    objetivo: 'Dejar claras las reglas del juego y conseguir el micro-compromiso de avanzar.',
    comoSeHace: 'Explicar que es una sesión de diagnóstico, que va a haber preguntas, y que si no encaja también se lo va a decir. Cerrar con un «¿te parece bien?».' },
  { clave: 'descubrimiento', nombre: 'Descubrimiento / situación actual', peso: 10,
    objetivo: 'Entender qué hace, a quién ayuda y cómo consigue clientes hoy.',
    comoSeHace: 'Preguntas abiertas sobre el negocio y las fuentes de captación actuales, repreguntando sobre cada dato que aparezca.' },
  { clave: 'dolor', nombre: 'Dolor', peso: 25,
    objetivo: 'Que el prospecto verbalice qué le cuesta su situación, en plata, tiempo u oportunidades.',
    comoSeHace: 'Pregunta estrella y variantes sobre el impacto concreto de seguir igual.' },
  { clave: 'por_que_ahora', nombre: 'Por qué ahora / urgencia', peso: 10,
    objetivo: 'Encontrar el detonante real de por qué quiere cambiar hoy y no en seis meses.',
    comoSeHace: 'Preguntar qué lo está moviendo ahora y qué pasa si sigue como está.' },
  { clave: 'situacion_deseada', nombre: 'Situación deseada', peso: 10,
    objetivo: 'Que describa a dónde quiere llegar, y validar que cree que es posible.',
    comoSeHace: 'Preguntar cómo se imagina el negocio en tres o cuatro meses y cerrar con «¿creés que es posible para vos?».' },
  { clave: 'dinero', nombre: 'Dinero / pre-cualificación', peso: 10,
    objetivo: 'Confirmar capacidad de inversión ANTES de presentar la oferta.',
    comoSeHace: 'Preguntar por el rango de inversión que podría realizar, y validar liquidez real, no intención.' },
  { clave: 'transicion', nombre: 'Transición', peso: 5,
    objetivo: 'Pedir permiso para pasar del diagnóstico a la propuesta.',
    comoSeHace: '«¿Hay algo importante que todavía no me dijiste? Si te parece, te cuento cómo sería el proceso de trabajo.»' },
  { clave: 'oferta', nombre: 'Oferta / pitch', peso: 10,
    objetivo: 'Presentar la propuesta atada a lo que el prospecto dijo, no en general.',
    comoSeHace: 'Conectar cada parte del programa con un dolor o una meta que el prospecto haya verbalizado. Casos del mismo nicho.' },
  { clave: 'cierre', nombre: 'Cierre', peso: 5,
    objetivo: 'Pedir la decisión y dejar un próximo paso con fecha.',
    comoSeHace: 'Escala del 1 al 10 antes del precio, después la inversión y «¿cómo te gustaría avanzar?».' },
]

/** Los pesos tienen que sumar 100: si no, el porcentaje no es un porcentaje. */
export function pesoTotal(fases: readonly Fase[]): number {
  return fases.reduce((s, f) => s + f.peso, 0)
}

/**
 * La adherencia al script: cuánto del guión se ejecutó, ponderado por peso.
 *
 * No es el promedio de las notas. Una fase puede estar ejecutada y mal hecha
 * —eso lo dice la nota— o saltada del todo, que es lo que este número cuenta.
 * Son dos preguntas distintas y en el informe van separadas.
 */
export function adherencia(
  fases: readonly Fase[],
  ejecuciones: readonly { clave: string; ejecucion: Ejecucion }[],
): number | null {
  const total = pesoTotal(fases)
  if (total === 0) return null

  const suma = fases.reduce((s, f) => {
    const e = ejecuciones.find((x) => x.clave === f.clave)
    return s + f.peso * (e === undefined ? 0 : VALE[e.ejecucion])
  }, 0)
  return Math.round((suma / total) * 1000) / 10
}

/**
 * La nota de las fases: el promedio de las notas, ponderado por peso.
 *
 * Las fases sin nota quedan FUERA del promedio y no en cero: que el modelo no
 * haya podido evaluar una fase no es lo mismo que haberla hecho pésimo, y
 * ponerle cero convierte una laguna en una acusación.
 */
export function notaDeFases(
  fases: readonly Fase[],
  notas: readonly { clave: string; nota: number | null }[],
): number | null {
  let peso = 0
  let acumulado = 0
  for (const f of fases) {
    const n = notas.find((x) => x.clave === f.clave)
    if (n === undefined || n.nota === null) continue
    peso += f.peso
    acumulado += n.nota * f.peso
  }
  return peso === 0 ? null : Math.round((acumulado / peso) * 10) / 10
}

/**
 * Normalizar lo que se carga desde la pantalla.
 *
 * Una fase sin nombre no es una fase, y un peso que no es un número es cero.
 * La clave se deriva del nombre para que quien carga no tenga que inventar
 * identificadores.
 */
export function normalizarFases(
  crudas: readonly { nombre: string; peso: unknown; objetivo?: string; comoSeHace?: string }[],
): Fase[] {
  const vistas = new Set<string>()
  const fases: Fase[] = []

  for (const c of crudas) {
    const nombre = (c.nombre ?? '').trim()
    if (nombre === '') continue

    let clave = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
    if (clave === '') clave = `fase_${fases.length + 1}`
    // Dos fases con el mismo nombre darían la misma clave y el modelo no
    // podría decir a cuál se refiere.
    let unica = clave
    let n = 2
    while (vistas.has(unica)) unica = `${clave}_${n++}`
    vistas.add(unica)

    const peso = Number(c.peso)
    fases.push({
      clave: unica,
      nombre,
      peso: Number.isFinite(peso) && peso > 0 ? Math.round(peso) : 0,
      objetivo: (c.objetivo ?? '').trim(),
      comoSeHace: (c.comoSeHace ?? '').trim(),
    })
  }
  return fases
}
