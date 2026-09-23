import { plegar, pareceEmail } from '@/lib/texto'
import {
  ESTADOS, RESULTADOS, MOTIVOS_PERDIDA, TIPOS_SESION,
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, NOMBRE_DE_MOTIVO, NOMBRE_DE_TIPO,
  type Estado, type Resultado, type MotivoPerdida, type TipoSesion,
} from './resultados'

/**
 * Leer una planilla pegada.
 *
 * Existe porque cargar un mes de llamadas de a un formulario por vez no se
 * hace: se empieza, se abandona a la mitad, y el tablero queda con la mitad de
 * los datos —que es peor que con ninguno, porque igual se mira—.
 *
 * Todo esto es PURO: entra texto y catálogos, sale una lista de filas con lo
 * que se entendió y lo que no. No toca la base. Así se puede probar cada regla
 * de lectura —una fecha al revés, un importe con coma, un closer mal escrito—
 * sin levantar nada, que es donde de verdad se rompen las importaciones.
 *
 * La regla de fondo: **nunca adivinar**. Si un valor no se entiende, la fila
 * queda marcada y se muestra antes de escribir nada. Una importación que
 * interpreta de más mete datos falsos en el tablero, y un dato falso adentro
 * es mucho más caro que uno que faltó.
 */

export type Columna =
  | 'nombre' | 'email' | 'telefono' | 'empresa' | 'pais' | 'industria'
  | 'fuente' | 'funnel' | 'setter' | 'closer'
  | 'fecha' | 'hora' | 'tipo' | 'valorPotencial'
  | 'estado' | 'resultado' | 'motivo'
  | 'importe' | 'moneda' | 'fechaVenta' | 'cobrado' | 'fechaCobro'
  | 'observaciones'

/**
 * Cómo se puede llamar cada columna en la planilla.
 *
 * La lista es larga a propósito. Nadie va a renombrar los encabezados de su
 * Excel para que le entre a la aplicación: o entiende cómo ya se llaman, o no
 * se usa.
 */
const SINONIMOS: Record<Columna, string[]> = {
  nombre: ['nombre', 'nombre y apellido', 'lead', 'cliente', 'prospecto', 'contacto'],
  email: ['email', 'e-mail', 'mail', 'correo'],
  telefono: ['telefono', 'tel', 'celular', 'whatsapp', 'wpp', 'movil'],
  empresa: ['empresa', 'negocio', 'compania'],
  pais: ['pais'],
  industria: ['industria', 'rubro', 'nicho'],
  fuente: ['fuente', 'origen', 'canal'],
  funnel: ['funnel', 'embudo'],
  setter: ['setter', 'agendo', 'agendado por'],
  closer: ['closer', 'vendedor', 'asignado a'],
  fecha: ['fecha', 'fecha de reunion', 'fecha de la reunion', 'fecha de sesion',
          'fecha de llamada', 'dia', 'fecha agenda'],
  hora: ['hora', 'horario'],
  tipo: ['tipo', 'tipo de sesion', 'tipo de llamada', 'sesion'],
  valorPotencial: ['valor potencial', 'valor', 'ticket estimado', 'potencial'],
  estado: ['estado', 'que paso', 'asistio', 'asistencia', 'estado de la reunion'],
  resultado: ['resultado', 'resultado de la venta', 'cierre', 'estado de venta'],
  motivo: ['motivo', 'motivo de perdida', 'por que se perdio', 'razon'],
  importe: ['importe', 'monto', 'venta', 'precio', 'monto vendido', 'facturado'],
  moneda: ['moneda', 'divisa'],
  fechaVenta: ['fecha de venta', 'fecha venta', 'fecha de cierre'],
  cobrado: ['cobrado', 'cash', 'cash collected', 'pago', 'pagado', 'cobro'],
  fechaCobro: ['fecha de cobro', 'fecha cobro', 'fecha de pago'],
  observaciones: ['observaciones', 'notas', 'comentarios', 'nota'],
}

/** Qué columnas entiende, para poder decirlo en pantalla sin repetir la lista. */
export const COLUMNAS_QUE_ENTIENDE: { columna: Columna; como: string }[] =
  (Object.keys(SINONIMOS) as Columna[]).map((c) => ({ columna: c, como: SINONIMOS[c][0]! }))

const DE_ENCABEZADO = new Map<string, Columna>()
for (const columna of Object.keys(SINONIMOS) as Columna[]) {
  for (const alias of SINONIMOS[columna]) DE_ENCABEZADO.set(plegar(alias), columna)
}

// ── Leer valores sueltos ────────────────────────────────────────────────────

/**
 * Una fecha, escrita como la escribe la gente.
 *
 * `dd/mm/aaaa` gana sobre `mm/dd/aaaa` porque acá se escribe así, y no hay
 * forma de distinguirlas: 03/04 es el 3 de abril, y si alguien quiso decir el 4
 * de marzo esto lo lee mal y no hay cómo saberlo. Por eso la pantalla lo dice
 * antes de importar y muestra cada fecha ya interpretada, en letras.
 */
export function leerFecha(texto: string): string | null {
  const t = texto.trim()
  if (t === '') return null

  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return armarFecha(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const local = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (local) {
    const anio = Number(local[3])
    return armarFecha(anio < 100 ? 2000 + anio : anio, Number(local[2]), Number(local[1]))
  }
  return null
}

function armarFecha(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  // Un 31 de febrero se corre solo a marzo. Si eso pasó, la fecha no existía.
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** `14:30`, `14.30`, `1430`, `14`. Lo que no se entienda, no se inventa. */
export function leerHora(texto: string): string | null {
  const t = texto.trim()
  if (t === '') return null
  const m = t.match(/^(\d{1,2})[:.]?(\d{2})?/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  if (h > 23 || min > 59) return null

  // «2 pm» son las 14, no las 2 de la mañana. Sin esto la reunión de la tarde
  // entraba a la madrugada, la agenda del día quedaba mal ordenada y nadie
  // sospechaba del importador: sospechaban del que la cargó.
  const tarde = /p\.?\s?m\.?$/i.test(t)
  const manana = /a\.?\s?m\.?$/i.test(t)
  if (tarde && h < 12) h += 12
  if (manana && h === 12) h = 0

  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/**
 * Un importe, con el separador que sea.
 *
 * `1.500` acá es mil quinientos y en inglés es uno coma cinco. La regla que
 * resuelve los dos casos sin preguntar: **el último separador que aparece es el
 * decimal**, salvo que lo que le sigue tenga tres dígitos, que entonces era de
 * miles. Es lo mismo que hace una planilla.
 */
export function leerImporte(texto: string): number | null {
  const t = texto.replace(/[^\d,.\-]/g, '').trim()
  if (t === '' || t === '-') return null

  const ultimaComa = t.lastIndexOf(',')
  const ultimoPunto = t.lastIndexOf('.')
  const corte = Math.max(ultimaComa, ultimoPunto)

  let limpio: string
  if (corte === -1) {
    limpio = t
  } else {
    const decimales = t.length - corte - 1
    limpio = decimales === 3
      ? t.replace(/[,.]/g, '')                                   // 1.500 · 1,500 → miles
      : t.slice(0, corte).replace(/[,.]/g, '') + '.' + t.slice(corte + 1)
  }
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** Buscar un valor de una lista cerrada por su nombre, su clave o cómo se dice. */
function deLista<T extends string>(
  texto: string, claves: readonly T[], nombres: Record<T, string>, extra: Record<string, T>,
): T | undefined {
  const t = plegar(texto)
  if (t === '') return undefined
  const porClave = claves.find((c) => plegar(c) === t)
  if (porClave) return porClave
  const porNombre = claves.find((c) => plegar(nombres[c]) === t)
  if (porNombre) return porNombre
  return extra[t]
}

const COMO_SE_DICE_ESTADO: Record<string, Estado> = {
  'si': 'asistio', 'vino': 'asistio', 'presente': 'asistio', 'ok': 'asistio',
  'no': 'no_show', 'no vino': 'no_show', 'falto': 'no_show', 'ausente': 'no_show',
  'noshow': 'no_show', 'no asistio': 'no_show',
  'cancelo': 'cancelado', 'cancelada': 'cancelado',
  'reagendo': 'reagendado', 'reagendada': 'reagendado', 'reprogramado': 'reagendado',
  'pendiente': 'agendado', 'agendada': 'agendado',
}

const COMO_SE_DICE_RESULTADO: Record<string, Resultado> = {
  'vendido': 'venta', 'cerro': 'venta', 'cierre': 'venta', 'si': 'venta', 'compro': 'venta',
  'reserva': 'sena', 'senia': 'sena', 'senado': 'sena', 'deposito': 'sena',
  'follow up': 'seguimiento', 'followup': 'seguimiento', 'seguir': 'seguimiento',
  'perdido': 'perdida', 'no cerro': 'perdida', 'no': 'perdida', 'caido': 'perdida',
  'nc': 'no_calificado', 'no califica': 'no_calificado', 'descalificado': 'no_calificado',
}

const COMO_SE_DICE_TIPO: Record<string, TipoSesion> = {
  '1': 'primera', '1ra': 'primera', '1era': 'primera', 'inicial': 'primera',
  '2': 'segunda', '2da': 'segunda', 'segunda llamada': 'segunda', 'cierre': 'segunda',
}

// ── La fila leída ───────────────────────────────────────────────────────────

export type ValorLeido = {
  crudo: string
  /** Cómo quedó interpretado, para mostrarlo antes de escribir nada. */
  comoQueda: string | null
}

export type FilaLeida = {
  /** La fila en la planilla, contando el encabezado. Es la que va a buscar la persona. */
  linea: number
  nombre: string
  email: string | null
  telefono: string | null
  empresa: string | null
  pais: string | null
  industria: string | null
  fuenteId: number | null
  funnelId: number | null
  setterId: number | null
  closerId: number | null
  fechaSesion: string | null
  horaSesion: string | null
  tipoSesion: TipoSesion
  valorPotencial: number | null
  estado: Estado | null
  resultado: Resultado | null
  motivoPerdida: MotivoPerdida | null
  importe: number | null
  moneda: string
  fechaVenta: string | null
  cobrado: number | null
  fechaCobro: string | null
  observaciones: string | null
  /** Lo que hace que la fila NO se importe. */
  errores: string[]
  /** Lo que se importa igual, pero incompleto. Se muestra antes de confirmar. */
  avisos: string[]
}

export type Catalogo = { id: number; nombre: string }[]

export type Catalogos = {
  fuentes: Catalogo; funnels: Catalogo; setters: Catalogo; closers: Catalogo
}

export type Lectura = {
  filas: FilaLeida[]
  /** Encabezados que no se reconocieron. Se ignoran, y se dice cuáles. */
  columnasIgnoradas: string[]
  /** Columnas reconocidas, en el orden en que vinieron. */
  columnas: Columna[]
  problema: string | null
}

function separador(linea: string): string {
  if (linea.includes('\t')) return '\t'
  if (linea.includes(';')) return ';'
  return '\t'
}

function partir(linea: string, sep: string): string[] {
  return linea.split(sep).map((c) => c.trim().replace(/^"(.*)"$/s, '$1').trim())
}

/**
 * Leer la planilla entera.
 *
 * `quienCarga` es el closer o setter de quien está importando: si la planilla
 * no trae columna de closer, el lead es suyo. Es la misma regla que el alta de
 * a uno, y por el mismo motivo: un lead sin dueño desaparece de la pantalla de
 * quien lo cargó.
 */
export function leerPlanilla(
  texto: string,
  catalogos: Catalogos,
  quienCarga: { closerId?: number | null; setterId?: number | null } = {},
  monedaBase = 'USD',
): Lectura {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lineas.length === 0) {
    return { filas: [], columnasIgnoradas: [], columnas: [], problema: 'No hay nada pegado.' }
  }

  const sep = separador(lineas[0]!)
  const encabezados = partir(lineas[0]!, sep)
  const columnas: (Columna | null)[] = encabezados.map((e) => DE_ENCABEZADO.get(plegar(e)) ?? null)
  const columnasIgnoradas = encabezados.filter((_, i) => columnas[i] === null).filter((e) => e !== '')

  if (!columnas.includes('nombre')) {
    return {
      filas: [], columnasIgnoradas, columnas: [],
      problema: encabezados.length === 1 && lineas.length === 1
        ? 'Pegá la tabla completa, con la fila de encabezados arriba. Copiándola de la planilla ya viene separada por tabulaciones.'
        : `La primera fila tiene que ser la de encabezados y tiene que incluir una columna «nombre». ` +
          `Se leyó: ${encabezados.join(' · ')}.`,
    }
  }

  const buscar = (lista: Catalogo, valor: string) => {
    const v = plegar(valor)
    return lista.find((x) => plegar(x.nombre) === v) ?? null
  }

  const filas = lineas.slice(1).map((linea, i) => {
    const celdas = partir(linea, sep)
    const valor = (c: Columna): string => {
      const idx = columnas.indexOf(c)
      return idx === -1 ? '' : (celdas[idx] ?? '')
    }
    const errores: string[] = []
    const avisos: string[] = []

    const conFecha = (c: Columna, etiqueta: string): string | null => {
      const crudo = valor(c)
      if (crudo === '') return null
      const f = leerFecha(crudo)
      if (f === null) errores.push(`${etiqueta} «${crudo}» no se entiende. Usá 05/08/2026 o 2026-08-05.`)
      return f
    }
    const conImporte = (c: Columna, etiqueta: string): number | null => {
      const crudo = valor(c)
      if (crudo === '') return null
      const n = leerImporte(crudo)
      if (n === null) errores.push(`${etiqueta} «${crudo}» no se entiende como un número.`)
      return n
    }
    const deCatalogo = (c: Columna, lista: Catalogo, etiqueta: string, duro: boolean) => {
      const crudo = valor(c)
      if (crudo === '') return null
      const x = buscar(lista, crudo)
      if (x === null) {
        // El closer decide de quién es el lead, así que un nombre mal escrito
        // frena la fila. La fuente es un dato de análisis: se avisa y sigue.
        const mensaje = `No hay ${etiqueta} que se llame «${crudo}».`
        if (duro) errores.push(`${mensaje} Dalo de alta en Configuración y volvé a importar.`)
        else avisos.push(`${mensaje} La fila se importa sin ese dato.`)
        return null
      }
      return x.id
    }

    const nombre = valor('nombre')
    if (nombre === '') errores.push('Falta el nombre.')

    const estadoCrudo = valor('estado')
    const estado = estadoCrudo === '' ? null
      : deLista(estadoCrudo, ESTADOS, NOMBRE_DE_ESTADO, COMO_SE_DICE_ESTADO) ?? null
    if (estadoCrudo !== '' && estado === null) {
      errores.push(`No se entiende el estado «${estadoCrudo}». Poné: ${ESTADOS.map((e) => NOMBRE_DE_ESTADO[e]).join(', ')}.`)
    }

    const resultadoCrudo = valor('resultado')
    const resultado = resultadoCrudo === '' ? null
      : deLista(resultadoCrudo, RESULTADOS, NOMBRE_DE_RESULTADO, COMO_SE_DICE_RESULTADO) ?? null
    if (resultadoCrudo !== '' && resultado === null) {
      errores.push(`No se entiende el resultado «${resultadoCrudo}». Poné: ${RESULTADOS.map((r) => NOMBRE_DE_RESULTADO[r]).join(', ')}.`)
    }

    const motivoCrudo = valor('motivo')
    const motivoPerdida = motivoCrudo === '' ? null
      : deLista(motivoCrudo, MOTIVOS_PERDIDA, NOMBRE_DE_MOTIVO, {}) ?? null
    if (motivoCrudo !== '' && motivoPerdida === null) {
      avisos.push(`El motivo «${motivoCrudo}» no está en la lista, así que la fila se importa sin motivo.`)
    }

    const tipoCrudo = valor('tipo')
    const tipoLeido = tipoCrudo === '' ? undefined
      : deLista(tipoCrudo, TIPOS_SESION, NOMBRE_DE_TIPO, COMO_SE_DICE_TIPO)
    if (tipoCrudo !== '' && tipoLeido === undefined) {
      avisos.push(`El tipo de sesión «${tipoCrudo}» no se entiende: se importa como primera sesión.`)
    }
    const tipoSesion: TipoSesion = tipoLeido ?? 'primera'

    const importe = conImporte('importe', 'El importe')
    const cobrado = conImporte('cobrado', 'Lo cobrado')
    const fechaSesion = conFecha('fecha', 'La fecha de la reunión')
    const fechaVenta = conFecha('fechaVenta', 'La fecha de venta')
    const fechaCobro = conFecha('fechaCobro', 'La fecha de cobro')

    const horaCruda = valor('hora')
    const horaSesion = horaCruda === '' ? null : leerHora(horaCruda)
    if (horaCruda !== '' && horaSesion === null) avisos.push(`La hora «${horaCruda}» no se entiende: se importa sin hora.`)

    const closerId = deCatalogo('closer', catalogos.closers, 'ningún closer', true)
      ?? quienCarga.closerId ?? null
    const setterId = deCatalogo('setter', catalogos.setters, 'ningún setter', true)
      ?? quienCarga.setterId ?? null

    // Reglas que hacen que el número no mienta. Son las mismas que la carga de
    // a uno: una venta sin importe no se puede facturar.
    if ((resultado === 'venta' || resultado === 'sena') && importe === null) {
      errores.push(resultado === 'venta'
        ? 'Dice «venta» pero no trae importe: así no se puede contar en facturación.'
        : 'Dice «seña» pero no trae importe.')
    }
    if ((resultado === 'venta' || resultado === 'sena') && fechaSesion === null && fechaVenta === null) {
      errores.push('Una venta o una seña necesita una fecha: la de la reunión o la de la venta.')
    }
    if (resultado !== null && resultado !== 'pendiente' && estado === null) {
      avisos.push('Trae resultado pero no dice qué pasó con la reunión: se importa como «Asistió».')
    }
    if (cobrado !== null && importe === null) {
      errores.push('Trae un cobro pero no una venta. El cobro tiene que ser de algo.')
    }

    // La columna «email» de una planilla trae de todo: «no tiene», «-»,
    // «preguntar». Guardar eso como email tiene dos costos, y los dos se pagan
    // después: dos leads con «no tiene» se detectan como la misma persona, y
    // la ficha queda con un campo que el navegador considera inválido, así que
    // el formulario entero deja de guardar y nadie entiende por qué.
    const emailCrudo = valor('email')
    const email = pareceEmail(emailCrudo) ? emailCrudo : null
    if (emailCrudo !== '' && email === null) {
      avisos.push(`«${emailCrudo}» no es un email: la fila se importa sin email.`)
    }

    return {
      linea: i + 2,
      nombre,
      email,
      telefono: valor('telefono') || null,
      empresa: valor('empresa') || null,
      pais: valor('pais') || null,
      industria: valor('industria') || null,
      fuenteId: deCatalogo('fuente', catalogos.fuentes, 'ninguna fuente', false),
      funnelId: deCatalogo('funnel', catalogos.funnels, 'ningún funnel', false),
      setterId, closerId,
      fechaSesion, horaSesion,
      tipoSesion,
      valorPotencial: conImporte('valorPotencial', 'El valor potencial'),
      estado,
      resultado,
      motivoPerdida,
      importe,
      moneda: (valor('moneda') || monedaBase).toUpperCase().slice(0, 3),
      fechaVenta, cobrado, fechaCobro,
      observaciones: valor('observaciones') || null,
      errores, avisos,
    }
  })

  return { filas, columnasIgnoradas, columnas: columnas.filter((c): c is Columna => c !== null), problema: null }
}
