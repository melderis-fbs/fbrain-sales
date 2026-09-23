'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { pareceEmail } from '@/lib/texto'
import { alcanceDe, asignarAQuienCarga, figuraDe, exigir, puede } from '@/lib/permisos'
import {
  crearLead, editarLead, posiblesDuplicados, reflotarLead, reasignarCloser,
  exigirAccesoAlLead, borrarLead, restaurarLead, loQueCuelgaDelLead, puedeVerLeadDeBaja,
  verLead,
  type DatosDeLead, type ClaveEditable,
} from '@/datos/leads'
import {
  cargarResultado, registrarPago, anularVenta, anularSena, agendarSegundaLlamada,
} from '@/datos/resultado'
import { leerPlanilla, type FilaLeida } from '@/dominio/importacion'
import { yaCargados, importar, type YaEstaba, type ReporteDeImportacion } from '@/datos/importar'
import { catalogos, config } from '@/datos/catalogos'
import { guardarCalificacion, congelarQuality } from '@/datos/calificacion'
import { agregarNota, borrarNota } from '@/datos/notas'
import { marcarSeguimientoLargo } from '@/datos/seguimientos'
import {
  NOMBRE_DE_RESULTADO, PROGRAMAS, desdeSalida,
  type Estado, type Resultado, type MotivoPerdida, type TipoSesion,
  type Salida, type ComoSigue, type Programa,
} from '@/dominio/resultados'
import { CAMPOS_LIBRES, CAMPOS_QUE_PUNTUAN } from '@/dominio/calidad'

function texto(datos: FormData, campo: string): string | null {
  const v = datos.get(campo)
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function numero(datos: FormData, campo: string): number | null {
  const s = texto(datos, campo)
  if (s === null) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Refrescar todo lo que puede haber cambiado. Una pantalla vieja miente igual que un dato mal. */
function refrescar(leadId: number) {
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/tracker')
  revalidatePath('/dashboard')
  revalidatePath('/seguimientos')
  // La plata que se carga acá es la que se cuenta allá.
  revalidatePath('/metricas')
  revalidatePath('/comisiones')
}

// ── Alta ────────────────────────────────────────────────────────────────────

export type EstadoDeAlta =
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'duplicados'; mensaje: string
      duplicados: { id: number; nombre: string; porque: string; cerrado: boolean; resultado: string
                    /** Quién lo tiene hoy. Todos los pueden abrir: el equipo ve toda la operación. */
                    closer: string | null }[] }
  | null

/**
 * Registrar un lead.
 *
 * Con lo mínimo: nombre, cómo contactarlo, de dónde vino y —si ya está la
 * reunión— cuándo. Todo lo demás se carga después en su ficha, por quien lo
 * sepa. Un alta de doce campos obligatorios se completa con datos inventados.
 *
 * Antes de crear busca duplicados y, si encuentra, NO crea: devuelve la lista y
 * espera. El sistema no decide que dos personas son la misma, y tampoco que no
 * lo son. Y si el que ya está es un lead perdido, lo que corresponde no es
 * crear otro: es reflotarlo, porque esa repesca la cobra quien la hace.
 */
export async function crearLeadAccion(_previo: EstadoDeAlta, datos: FormData): Promise<EstadoDeAlta> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const lead: DatosDeLead = {
    nombre: String(datos.get('nombre') ?? '').trim(),
    email: texto(datos, 'email'),
    telefono: texto(datos, 'telefono'),
    pais: texto(datos, 'pais'),
    empresa: texto(datos, 'empresa'),
    industria: texto(datos, 'industria'),
    fuenteId: numero(datos, 'fuenteId'),
    funnelId: numero(datos, 'funnelId'),
    setterId: numero(datos, 'setterId'),
    closerId: numero(datos, 'closerId'),
    fechaSesion: texto(datos, 'fechaSesion'),
    horaSesion: texto(datos, 'horaSesion'),
    tipoSesion: (texto(datos, 'tipoSesion') ?? 'primera') as TipoSesion,
    valorPotencial: numero(datos, 'valorPotencial'),
    moneda: texto(datos, 'moneda') ?? 'USD',
  }
  if (lead.nombre === '') return { tipo: 'error', mensaje: 'El lead necesita un nombre.' }

  // El lead que carga un closer es suyo; el que carga un setter, suyo. Sin
  // esto quedaba sin dueño y desaparecía de su pantalla — ver `asignarAQuienCarga`.
  const suyo = asignarAQuienCarga(figuraDe(usuario), lead)

  if (datos.get('confirmado') !== '1') {
    const encontrados = await posiblesDuplicados(suyo)
    if (encontrados.length > 0) {
      // Los duplicados se buscan en TODA la operación —si no, dos personas
      // cargan dos fichas del mismo cliente— y ahora también se pueden ABRIR
      // todos. Antes el que preguntaba podía no tener acceso al que se
      // encontró: veía «está duplicado» y una fila muerta, que se lee como que
      // el aviso miente. El aviso sólo sirve si lleva a la ficha que ya está.
      return {
        tipo: 'duplicados',
        mensaje: 'Puede que esta persona ya esté cargada. Mirá antes de crear otra ficha.',
        duplicados: encontrados.map((d, i) => ({
          id: d.id,
          nombre: d.nombre,
          porque: d.porque === 'email' ? 'mismo email'
            : d.porque === 'telefono' ? 'mismo teléfono' : 'nombre parecido',
          cerrado: d.resultado === 'perdida' || d.resultado === 'no_calificado',
          resultado: NOMBRE_DE_RESULTADO[d.resultado] ?? d.resultado,
          closer: d.closer,
        })),
      }
    }
  }

  const id = await crearLead(suyo, usuario.id)
  revalidatePath('/leads')
  revalidatePath('/tracker')

  // Sin rebotes: quien carga un lead lo ve siempre, aunque su cuenta no tenga
  // figura vinculada y aunque el lead quede asignado a otro. Esa es la regla
  // que hace que «lo cargué y no está» no pueda volver a pasar.
  redirect(`/leads/${id}`)
}

/**
 * Lo que contesta el formulario de datos.
 *
 * Existe porque sin esto no contestaba nada: se apretaba «Guardar los cambios»
 * y la pantalla quedaba igual, que es indistinguible de que no se guardó. El
 * caso real fue peor todavía —el navegador bloqueaba el envío por un email
 * viejo que no era un email, y el botón no hacía literalmente nada—, pero la
 * lección vale igual: un formulario que no confirma es un formulario en el que
 * no se confía, y lo que no se confía se carga dos veces.
 */
export type Guardado = { ok: boolean; mensaje: string } | null

export async function editarLeadAccion(_previo: Guardado, datos: FormData): Promise<Guardado> {
  try {
    const usuario = await exigirUsuario()
    exigir(usuario, 'editarLead')

    const leadId = Number(datos.get('leadId'))
    // El id viene del navegador: es lo que escribió cualquiera, no lo que vio en
    // la pantalla. Se comprueba contra la base.
    await exigirAccesoAlLead(leadId, alcanceDe(usuario))

    const cambios: Partial<Record<ClaveEditable, string | null>> = {}
    for (const campo of ['nombre', 'email', 'telefono', 'pais', 'empresa', 'industria',
                         'fuenteId', 'funnelId', 'setterId', 'fechaSesion', 'horaSesion',
                         'tipoSesion', 'valorPotencial', 'moneda',
                         'links', 'infoNegocio', 'infoExtra'] as ClaveEditable[]) {
      if (datos.has(campo)) cambios[campo] = texto(datos, campo)
    }

    const motivo = texto(datos, 'motivo')
    const cuantos = await editarLead(leadId, cambios, usuario.id, motivo ?? undefined)

    // El CLOSER se edita en la misma pantalla que el resto —no tenía sentido
    // mandar a buscarlo a otra pestaña— pero no pasa por el mismo camino: una
    // reasignación congela el quality con el que se lo va a evaluar y deja su
    // propia línea en el historial. Es un cambio con consecuencias, y el
    // formulario lo dice sin obligar a nadie a mudarse de pantalla.
    let reasignado = 0
    if (datos.has('closerId') && puede(usuario, 'reasignarCloser')) {
      const antes = await verLead(leadId)
      const nuevo = numero(datos, 'closerId')
      if (antes && antes.closerId !== nuevo) {
        await reasignarCloser(leadId, nuevo, usuario.id, motivo)
        await congelarQuality(leadId)
        reasignado = 1
      }
    }

    refrescar(leadId)

    // El email se guarda como vino, pero si no es un email hay que decirlo: no
    // va a servir para buscar ni para detectar duplicados.
    const mail = texto(datos, 'email')
    const dudoso = mail !== null && !pareceEmail(mail)
      ? ` El email «${mail}» no parece un email: no va a servir para buscar ni para detectar duplicados.`
      : ''

    const total = cuantos + reasignado
    if (total === 0) {
      return { ok: true, mensaje: `No había nada para cambiar: está todo como estaba.${dudoso}` }
    }
    const closer = reasignado === 1 ? ' El closer quedó reasignado.' : ''
    return {
      ok: true,
      mensaje: `Guardado. ${total} ${total === 1 ? 'campo cambiado' : 'campos cambiados'}, con su registro en el historial.${closer}${dudoso}`,
    }
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo guardar.' }
  }
}

export async function reasignarCloserAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'reasignarCloser')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await reasignarCloser(leadId, numero(datos, 'closerId'), usuario.id, texto(datos, 'motivo'))
  // Asignarle el lead a un closer congela el quality con el que se lo va a
  // evaluar. Después de esto, bajarle la calidad al lead ya no cambia su número.
  await congelarQuality(leadId)
  refrescar(leadId)
}

// ── Lo que carga el setter ──────────────────────────────────────────────────

export async function guardarCalificacionAccion(
  _previo: string | null, datos: FormData,
): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const respuestas: Record<string, string | null> = {}
  for (const c of [...CAMPOS_QUE_PUNTUAN.map((x) => x.clave), ...CAMPOS_LIBRES.map((x) => x.clave)]) {
    if (datos.has(c)) respuestas[c] = texto(datos, c)
  }

  const calidad = await guardarCalificacion(leadId, respuestas, usuario.id)
  refrescar(leadId)

  return calidad.score === null
    ? `Guardado. Todavía falta contestar ${calidad.faltan.length} ` +
      `${calidad.faltan.length === 1 ? 'campo' : 'campos'} para que haya un Lead Quality: ` +
      `${calidad.faltan.join(', ')}.`
    : `Guardado. Lead Quality ${calidad.score} · ${calidad.completitud}% de la ficha completa.`
}

// ── Lo que carga el closer ──────────────────────────────────────────────────

export async function cargarResultadoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  // En la pantalla el closer elige UNA cosa —«Venta», «Seguimiento largo»,
  // «Segunda llamada»— y acá se abre en las dos columnas que guarda la base.
  const elegida = texto(datos, 'salida') as Salida | null
  const { resultado, comoSigue } = elegida
    ? desdeSalida(elegida)
    : { resultado: texto(datos, 'resultado') as Resultado | null,
        comoSigue: (texto(datos, 'comoSigue') ?? 'cadencia') as ComoSigue }

  const moneda = texto(datos, 'moneda') ?? 'USD'
  const importe = numero(datos, 'importe')
  const fecha = texto(datos, 'fecha')

  if ((resultado === 'venta' || resultado === 'sena') && (importe === null || fecha === null)) {
    throw new Error(
      resultado === 'venta'
        ? 'Una venta necesita importe y fecha: sin eso no se puede contar en facturación.'
        : 'Una seña necesita importe y fecha.',
    )
  }
  if (resultado === 'perdida' && texto(datos, 'motivoPerdida') === null) {
    throw new Error('Un lead perdido necesita su motivo: es lo que después dice por qué se pierde.')
  }
  const programa = texto(datos, 'programa')
  if (programa !== null && !PROGRAMAS.includes(programa as Programa)) {
    throw new Error('El programa es GROWTH o ELITE.')
  }
  // El plan de pagos: una fila por cuota, con lo que ya entró marcado como
  // cobrado. Sólo entran las que tienen monto y fecha; una cuota a medio
  // escribir no es un pago y guardarla igual ensucia la cobranza.
  const cuotas = numero(datos, 'cuotas')
  const plan: { n: number; importe: number; fecha: string; medio: string | null; pagado: boolean }[] = []
  for (let n = 1; n <= (cuotas ?? 1); n++) {
    const m = numero(datos, `cuota${n}Importe`)
    const f = texto(datos, `cuota${n}Fecha`)
    if (m === null || m <= 0) continue
    if (f === null) throw new Error(`Falta la fecha del pago ${n}: el cash se cuenta el mes en que entra.`)
    plan.push({ n, importe: m, fecha: f, medio: texto(datos, `cuota${n}Medio`),
                pagado: datos.get(`cuota${n}Pagado`) === 'si' })
  }
  const pactado = plan.reduce((a, c) => a + c.importe, 0)
  if (importe !== null && pactado > importe) {
    throw new Error(`Las cuotas suman más que la venta: ${pactado} contra ${importe}.`)
  }

  // Una segunda llamada necesita su fecha antes de tocar nada: si falla a la
  // mitad, la reunión de hoy queda cerrada y el lead sin agenda.
  const fechaSegunda = texto(datos, 'fechaSegunda')
  if (elegida === 'segunda' && fechaSegunda === null) {
    throw new Error('Una segunda llamada necesita la fecha de la segunda llamada.')
  }

  await cargarResultado(leadId, {
    estado: (texto(datos, 'estado') ?? undefined) as Estado | undefined,
    resultado: resultado ?? undefined,
    ...(resultado === 'seguimiento'
      ? { comoSigue: comoSigue ?? 'cadencia', volverEl: texto(datos, 'volverEl') }
      : {}),
    huboOferta: datos.has('huboOferta') ? datos.get('huboOferta') === 'on' : undefined,
    motivoPerdida: (texto(datos, 'motivoPerdida') ?? null) as MotivoPerdida | null,
    // Lo que el formulario no mandó, no se toca. Los campos del resultado que
    // no se eligió ni se dibujan, y un campo ausente que se guardaba como
    // vacío le borraba al lead el próximo contacto que ya tenía.
    ...(datos.has('proximoContacto') ? { proximoContacto: texto(datos, 'proximoContacto') } : {}),
    ...(datos.has('proximoPaso') ? { proximoPaso: texto(datos, 'proximoPaso') } : {}),
    ...(datos.has('observaciones') ? { observaciones: texto(datos, 'observaciones') } : {}),
    ...(resultado === 'venta' && importe !== null && fecha !== null
      ? { venta: { importe, moneda, fecha, programa, cuotas, plan } }
      : {}),
    ...(resultado === 'sena' && importe !== null && fecha !== null
      ? { sena: {
            importe, moneda, fecha,
            saldoPendiente: numero(datos, 'saldoPendiente'),
            fechaComprometida: texto(datos, 'fechaComprometida'),
          } }
      : {}),
  }, usuario.id)

  // Y recién ahora se re-agenda: la reunión de hoy ya quedó escrita con su
  // fecha y su resultado, así que la segunda no le pisa la agenda a la primera.
  if (elegida === 'segunda' && fechaSegunda !== null) {
    await agendarSegundaLlamada(
      leadId,
      { fecha: fechaSegunda, hora: texto(datos, 'horaSegunda'), nota: texto(datos, 'proximoPaso') },
      usuario.id,
    )
  }

  refrescar(leadId)
}

/**
 * Cargar el resultado sin salir del Tracker.
 *
 * Es el camino del closer que sale de una llamada y tiene otra en diez minutos.
 * Pedirle que abra la ficha, encuentre una pestaña y complete un formulario
 * largo es lo que hace que la carga quede «para después», y lo que queda para
 * después no se carga: por eso el Dashboard del sistema anterior estaba siempre
 * incompleto.
 *
 * Pide lo mínimo que hace que el número no mienta —una venta sin importe no se
 * puede facturar, una pérdida sin motivo no se puede contar— y todo lo demás se
 * completa en la ficha cuando haya tiempo.
 */
export async function cargarRapidoAccion(
  _previo: string | null, datos: FormData,
): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const estado = (texto(datos, 'estado') ?? undefined) as Estado | undefined
  const resultado = (texto(datos, 'resultado') ?? undefined) as Resultado | undefined
  const importe = numero(datos, 'importe')
  const fecha = texto(datos, 'fecha')
  const motivo = texto(datos, 'motivoPerdida')

  if ((resultado === 'venta' || resultado === 'sena') && importe === null) {
    return resultado === 'venta'
      ? 'Poné el importe: una venta sin importe no se puede contar en facturación.'
      : 'Poné el importe de la seña.'
  }
  if (resultado === 'perdida' && motivo === null) {
    return 'Elegí por qué se perdió. Es lo que después dice dónde se pierde el equipo.'
  }

  // Cómo se persigue un lead en seguimiento. Si no se dice nada, la cadencia
  // de 12 toques, que es lo que se hacía siempre.
  const comoSigue = (texto(datos, 'comoSigue') ?? 'cadencia') as 'cadencia' | 'largo' | 'ninguno'
  const volverEl = texto(datos, 'volverEl')
  if (resultado === 'seguimiento' && comoSigue === 'largo' && volverEl === null) {
    return 'Poné la fecha en la que hay que volver, o elegí otra forma de seguirlo.'
  }

  const moneda = texto(datos, 'moneda') ?? 'USD'
  const cuando = fecha ?? new Date().toISOString().slice(0, 10)

  await cargarResultado(leadId, {
    estado,
    resultado,
    // Si vino venta o seña, hubo oferta. No hace falta preguntarlo dos veces.
    huboOferta: resultado === 'venta' || resultado === 'sena' ? true : undefined,
    motivoPerdida: (motivo ?? null) as MotivoPerdida | null,
    ...(resultado === 'seguimiento' ? { comoSigue, volverEl } : {}),
    ...(resultado === 'venta' && importe !== null
      ? { venta: { importe, moneda, fecha: cuando } } : {}),
    ...(resultado === 'sena' && importe !== null
      ? { sena: { importe, moneda, fecha: cuando } } : {}),
  }, usuario.id)

  refrescar(leadId)
  return null
}

/** Ponerle fecha de reunión a un lead que quedó suelto, sin abrir la ficha. */
export async function agendarRapidoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await editarLead(leadId, {
    fechaSesion: texto(datos, 'fechaSesion'),
    horaSesion: texto(datos, 'horaSesion'),
  }, usuario.id)
  refrescar(leadId)
}

export async function registrarPagoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarDinero')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const importe = numero(datos, 'importe')
  const fecha = texto(datos, 'fecha')
  if (importe === null || fecha === null) throw new Error('Un cobro necesita importe y fecha.')

  await registrarPago(leadId, {
    importe, fecha,
    moneda: texto(datos, 'moneda') ?? 'USD',
    medio: texto(datos, 'medio'),
    nCuota: numero(datos, 'nCuota'),
  }, usuario.id)
  refrescar(leadId)
}

/**
 * Cargar el cobro sin salir de la lista de ventas.
 *
 * Es el camino para poner al día lo que ya se vendió. Facturación y cash son
 * dos números distintos y el segundo sólo sabe lo que alguien cargó: una venta
 * marcada y el cobro «para después» deja el cash mintiendo hacia abajo, que es
 * peor que no tenerlo porque igual se mira.
 *
 * Pide importe y fecha y nada más. La fecha importa: el cash se cuenta el mes
 * en que entró la plata, no el mes en que se firmó.
 */
export async function cobrarRapidoAccion(
  _previo: string | null, datos: FormData,
): Promise<string | null> {
  try {
    const usuario = await exigirUsuario()
    exigir(usuario, 'editarDinero')

    const leadId = Number(datos.get('leadId'))
    await exigirAccesoAlLead(leadId, alcanceDe(usuario))

    const importe = numero(datos, 'importe')
    const fecha = texto(datos, 'fecha')
    if (importe === null || importe <= 0) return 'Poné cuánto entró.'
    if (fecha === null) return 'Poné la fecha del cobro.'

    await registrarPago(leadId, {
      importe, fecha, moneda: texto(datos, 'moneda') ?? 'USD',
      medio: texto(datos, 'medio'), nCuota: numero(datos, 'nCuota'),
    }, usuario.id)
    refrescar(leadId)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo registrar el cobro.'
  }
}

// ── Anular plata cargada por error ──────────────────────────────────────────

/**
 * Sacar de los números una venta o una seña que no existió.
 *
 * Es la tercera forma de «cargué mal». Las otras dos ya estaban: si el dato del
 * lead está mal se corrige en Datos, y si el lead no debería existir se da de
 * baja. Faltaba ésta, y era la cara: corregir el resultado de «venta» a
 * «perdida» sacaba el lead del embudo pero dejaba la plata contando en la
 * facturación del mes, sin forma de sacarla.
 *
 * La pide quien puede tocar la plata, con motivo. No la borra: la anula, y
 * queda en el historial con quién y por qué.
 */
export async function anularPlataAccion(
  _previo: string | null, datos: FormData,
): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarDinero')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const motivo = texto(datos, 'motivo')
  if (motivo === null) {
    return 'Poné por qué se anula. Plata que desaparece de la facturación hay que poder explicarla.'
  }

  try {
    if (texto(datos, 'que') === 'sena') await anularSena(leadId, usuario.id, motivo)
    else await anularVenta(leadId, usuario.id, motivo)
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo anular.'
  }

  refrescar(leadId)
  return null
}

// ── Cargar el histórico de una planilla ─────────────────────────────────────

export type EstadoDeImportacion =
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'vista'
      filas: (FilaLeida & { yaEstaba: YaEstaba | null })[]
      columnasIgnoradas: string[]
      listas: number; conError: number; repetidas: number }
  | { tipo: 'hecho'; reporte: ReporteDeImportacion }
  | null

/**
 * Leer la planilla y, recién en el segundo paso, escribirla.
 *
 * Nunca importa en el primer envío, aunque no haya un solo error. Una
 * importación que escribe sesenta filas sin que nadie haya visto cómo quedaron
 * interpretadas es la forma más rápida de meter datos falsos en el tablero, y
 * un dato falso adentro cuesta mucho más que uno que faltó.
 *
 * El texto pegado vuelve en el mismo formulario y se relee igual, así que no
 * hace falta guardar nada entre los dos pasos.
 */
export async function importarAccion(
  _previo: EstadoDeImportacion, datos: FormData,
): Promise<EstadoDeImportacion> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const pegado = String(datos.get('planilla') ?? '')
  if (pegado.trim() === '') return { tipo: 'error', mensaje: 'Pegá la planilla en el cuadro de arriba.' }

  // La planilla que sube un closer entra a su nombre si no trae columna de
  // closer. Es su histórico: pedirle que escriba su propio nombre en cien
  // filas es pedirle que no lo suba.
  const figura = figuraDe(usuario)
  const cats = await catalogos()
  const lectura = leerPlanilla(pegado, cats, {
    closerId: figura.tipo === 'closer' ? figura.closerId : null,
    setterId: figura.tipo === 'setter' ? figura.setterId : null,
  }, await config<string>('moneda_base', 'USD'))

  if (lectura.problema !== null) return { tipo: 'error', mensaje: lectura.problema }
  if (lectura.filas.length === 0) return { tipo: 'error', mensaje: 'La planilla tiene encabezados pero ninguna fila.' }

  const repetidas = await yaCargados(lectura.filas)
  const crearRepetidas = datos.get('repetidas') === '1'
  const conMarca = lectura.filas.map((f, i) => ({ ...f, yaEstaba: repetidas[i] ?? null }))

  const entra = (f: (typeof conMarca)[number]) =>
    f.errores.length === 0 && (f.yaEstaba === null || crearRepetidas)

  if (datos.get('confirmado') !== '1') {
    return {
      tipo: 'vista',
      filas: conMarca,
      columnasIgnoradas: lectura.columnasIgnoradas,
      listas: conMarca.filter(entra).length,
      conError: conMarca.filter((f) => f.errores.length > 0).length,
      repetidas: conMarca.filter((f) => f.yaEstaba !== null).length,
    }
  }

  const aImportar = conMarca.filter(entra)
  if (aImportar.length === 0) {
    return { tipo: 'error', mensaje: 'No quedó ninguna fila para importar. Corregí los errores de arriba y volvé a pegarla.' }
  }

  const reporte = await importar(aImportar, usuario.id)
  reporte.salteadas = conMarca.length - aImportar.length

  revalidatePath('/leads')
  revalidatePath('/tracker')
  revalidatePath('/dashboard')
  revalidatePath('/llamadas')
  revalidatePath('/metricas')
  return { tipo: 'hecho', reporte }
}

// ── Repesca ─────────────────────────────────────────────────────────────────

/**
 * Volver a abrir un lead perdido.
 *
 * No se crea otro: se le suma un ciclo al mismo y queda escrito quién lo
 * reflotó, porque esa repesca la cobra quien la hace —suele ser el setter—.
 */
export async function reflotarLeadAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await reflotarLead(leadId, usuario.id, {
    closerId: numero(datos, 'closerId'),
    fechaSesion: texto(datos, 'fechaSesion'),
    horaSesion: texto(datos, 'horaSesion'),
    motivo: texto(datos, 'motivo'),
  })
  refrescar(leadId)
}

// ── Notas ───────────────────────────────────────────────────────────────────

export async function agregarNotaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await agregarNota(leadId, String(datos.get('texto') ?? ''), usuario.id)
  revalidatePath(`/leads/${leadId}`)
}

export async function borrarNotaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  await borrarNota(Number(datos.get('notaId')), usuario.id)
  revalidatePath(`/leads/${leadId}`)
}

// ── Seguimiento largo desde la ficha ────────────────────────────────────────

export async function seguimientoLargoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'cargarResultado')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const fecha = texto(datos, 'fecha')
  if (fecha === null) throw new Error('Un seguimiento largo necesita la fecha en la que hay que volver.')

  await marcarSeguimientoLargo(leadId, fecha, usuario.id, texto(datos, 'nota'))
  refrescar(leadId)
}

// ── Dar de baja ─────────────────────────────────────────────────────────────

/**
 * Dar de baja un lead.
 *
 * No borra nada: le pone fecha de baja y desaparece de las listas y de las
 * métricas. Sus llamadas, sus notas y su historial quedan, y se puede volver a
 * poner en juego.
 *
 * El freno que importa: si tiene una VENTA o una SEÑA cargada, sólo lo da de
 * baja quien puede tocar la plata. Un lead vendido que desaparece se lleva esa
 * venta de la facturación del mes, y el que lo dio de baja se entera cuando
 * alguien pregunta por qué no cierran los números.
 */
export async function borrarLeadAccion(_previo: string | null, datos: FormData): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'borrarLead')

  const leadId = Number(datos.get('leadId'))
  await exigirAccesoAlLead(leadId, alcanceDe(usuario))

  const motivo = texto(datos, 'motivo')
  if (motivo === null) {
    return 'Poné por qué se da de baja. Sin motivo, dentro de tres meses esto es un lead que desapareció y nadie sabe qué pasó.'
  }

  const cuelga = await loQueCuelgaDelLead(leadId)
  if ((cuelga.tieneVenta || cuelga.tieneSena) && !puede(usuario, 'editarDinero')) {
    return cuelga.tieneVenta
      ? `Este lead tiene una venta cargada, así que darlo de baja la saca de la facturación. ` +
        `Eso lo hace dirección. Si el resultado está mal, corregilo desde la ficha.`
      : `Este lead tiene una seña cargada. Darlo de baja la saca de los números, y eso lo hace ` +
        `dirección. Si el resultado está mal, corregilo desde la ficha.`
  }

  await borrarLead(leadId, usuario.id, motivo)
  refrescar(leadId)
  redirect('/leads?baja=1')
}

/**
 * Volver a poner en juego un lead dado de baja.
 *
 * Sólo lo hace quien ve la operación entera. Si el que se equivocó pudiera
 * deshacerlo solo, un error no dejaría rastro — y el punto de que esto sea
 * reversible es que el error se vea, no que se tape.
 */
export async function restaurarLeadAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'restaurarLead')

  const leadId = Number(datos.get('leadId'))
  if (!(await puedeVerLeadDeBaja(leadId, alcanceDe(usuario)))) {
    throw new Error('No tenés acceso a ese lead.')
  }

  await restaurarLead(leadId, usuario.id)
  refrescar(leadId)
}
