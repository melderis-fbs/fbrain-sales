import 'server-only'
import { escribir, escribirDevolviendo, fila, enTransaccion } from '@/lib/db'
import { oNulo } from '@/lib/texto'
import { anotar, type Cambio } from './cambios'
import { entrarAlPipeline, salirDelPipeline, ponerSeguimientoLargo } from './seguimientos'
import { sincronizarLlamada } from './llamadas'
import type { Estado, Resultado, MotivoPerdida } from '@/dominio/resultados'

/**
 * Qué pasó con la llamada.
 *
 * Dos ejes distintos y mezclarlos es lo que hace que después no se pueda
 * contestar «cuántas asistencias hubo» sin discutir:
 *
 *   ESTADO     qué pasó con la reunión  (vino, no vino, se canceló)
 *   RESULTADO  qué pasó con la venta    (compró, señó, quedó abierto, se perdió)
 *
 * El setter carga lo de arriba de la ficha antes de la llamada; el closer entra
 * el día de la reunión y completa esto. Son dos momentos y dos personas, y el
 * formulario lo refleja.
 */

export type ResultadoCargado = {
  estado?: Estado
  resultado?: Resultado
  huboOferta?: boolean
  motivoPerdida?: MotivoPerdida | null
  proximoContacto?: string | null
  proximoPaso?: string | null
  observaciones?: string | null
  /** Cuando el resultado es venta. */
  venta?: {
    importe: number; moneda: string; fecha: string
    /** GROWTH o ELITE. */
    programa?: string | null
    /** En cuántas cuotas se pactó. */
    cuotas?: number | null
    /**
     * El plan de pagos, una fila por cuota.
     *
     * Es el número que más se perdía: la venta quedaba marcada y el cobro
     * «para cargarlo después» en otra pantalla, así que el cash collected
     * mentía siempre hacia abajo. Se carga en el mismo momento que la venta.
     *
     * `pagado` es la diferencia entre plata que entró y plata que se va a ir a
     * buscar: sólo la cobrada suma al cash. Las pendientes quedan escritas
     * —con su fecha— porque son la cobranza del mes que viene.
     */
    plan?: { n: number; importe: number; fecha: string; medio?: string | null; pagado: boolean }[]
  }
  /**
   * Cómo sigue un lead que queda en seguimiento.
   *
   *   'cadencia'  entra al pipeline de 12 toques (lo que se hacía siempre)
   *   'largo'     vuelve a aparecer una fecha puntual, fuera de la cadencia
   *   'ninguno'   queda en seguimiento y nadie lo persigue
   *
   * Antes no se preguntaba: todo lo que se marcaba «seguimiento» entraba a los
   * doce toques. Un cliente que pidió que lo llamen en marzo no necesita doce
   * toques, y meterlo igual llena el pipeline de tarjetas que nadie va a tocar
   * — y un pipeline con ruido se deja de mirar.
   */
  comoSigue?: 'cadencia' | 'largo' | 'ninguno'
  /** Con 'largo', cuándo volver. */
  volverEl?: string | null
  /** Cuando el resultado es seña. */
  sena?: { importe: number; moneda: string; fecha: string; saldoPendiente?: number | null; fechaComprometida?: string | null }
}

const CAMPOS = [
  { clave: 'estado', columna: 'estado' },
  { clave: 'resultado', columna: 'resultado' },
  { clave: 'huboOferta', columna: 'hubo_oferta' },
  { clave: 'motivoPerdida', columna: 'motivo_perdida' },
  { clave: 'proximoContacto', columna: 'proximo_contacto' },
  { clave: 'proximoPaso', columna: 'proximo_paso' },
  { clave: 'observaciones', columna: 'observaciones' },
] as const

/**
 * Cargar el resultado de un lead.
 *
 * Tres cosas que no son obvias y son la mitad del sistema:
 *
 *  - La SEÑA no cierra nada. Deja el lead abierto y crea una fila en `senias`
 *    con su saldo y su fecha comprometida. No es facturación y no es cash: se
 *    ve en su propia tarjeta hasta que se convierte.
 *  - Una VENTA crea la fila en `ventas`; el cobro se carga aparte en `pagos`.
 *    Facturación y cash collected no son el mismo número.
 *  - Marcar «seguimiento» mete el lead en el pipeline de 12 toques solo. Si
 *    hiciera falta acordarse de una segunda acción, la mitad de los leads en
 *    seguimiento no estarían en el pipeline y nadie sabría cuáles.
 */
export async function cargarResultado(
  leadId: number,
  datos: ResultadoCargado,
  usuarioId: number,
): Promise<void> {
  const antes = await fila<Record<string, unknown>>(
    `select ${CAMPOS.map((c) => c.columna).join(', ')}, ciclo
       from leads where id = $1 and borrado_en is null`,
    [leadId],
  )
  if (!antes) throw new Error('Ese lead no existe.')

  // El ciclo es lo que separa «corregir la venta» de «vendió otra vez». Un lead
  // perdido que se reflota y compra en el segundo intento tiene dos ventas de
  // verdad, y ésas no son duplicados.
  const ciclo = Number(antes.ciclo ?? 1)

  const sets: string[] = []
  const valores: unknown[] = []
  const anotaciones: Cambio[] = []
  const p = (v: unknown): string => { valores.push(v); return `$${valores.length}` }

  for (const campo of CAMPOS) {
    const nuevo = (datos as Record<string, unknown>)[campo.clave]
    if (nuevo === undefined) continue
    const anterior = antes[campo.columna] ?? null
    const normalizado = typeof nuevo === 'string' ? oNulo(nuevo) : nuevo
    if (String(anterior ?? '') === String(normalizado ?? '')) continue

    sets.push(`${campo.columna} = ${p(normalizado)}`)
    anotaciones.push({
      entidad: 'lead', entidadId: leadId, campo: campo.clave,
      anterior: anterior === null ? null : String(anterior),
      nuevo: normalizado === null || normalizado === undefined ? null : String(normalizado),
    })
  }

  await enTransaccion(async (cx) => {
    if (sets.length > 0) {
      await escribir(
        `update leads set ${sets.join(', ')}, actualizado_en = now()
          where id = ${p(leadId)} and borrado_en is null`,
        valores, { esperadas: 1, cliente: cx },
      )
    }

    if (datos.venta) {
      // Volver a guardar la ficha CORRIGE la venta; no carga otra. Insertar
      // siempre era plata duplicada en la facturación del mes por el solo
      // hecho de arreglar un importe mal tipeado, y esa plata no se podía
      // sacar de ningún lado.
      const yaHay = await fila<{ id: number; importe: string | number; moneda: string }>(
        `select id, importe, moneda from ventas
          where lead_id = $1 and ciclo = $2 and borrado_en is null
          order by fecha desc, id desc limit 1`,
        [leadId, ciclo], cx,
      )

      let ventaId: number
      if (yaHay) {
        ventaId = yaHay.id
        await escribir(
          `update ventas set importe = $1, moneda = $2, fecha = $3, programa = $4, cuotas = $5
            where id = $6`,
          [datos.venta.importe, datos.venta.moneda, datos.venta.fecha,
           oNulo(datos.venta.programa), datos.venta.cuotas ?? null, ventaId],
          { esperadas: 1, cliente: cx },
        )
        const antesPlata = `${yaHay.moneda} ${Number(yaHay.importe)}`
        const ahoraPlata = `${datos.venta.moneda} ${datos.venta.importe}`
        if (antesPlata !== ahoraPlata) {
          anotaciones.push({ entidad: 'venta', entidadId: leadId, campo: 'importe',
                             anterior: antesPlata, nuevo: ahoraPlata })
        }
      } else {
        const v = await escribirDevolviendo<{ id: number }>(
          `insert into ventas (lead_id, ciclo, importe, moneda, fecha, programa, cuotas, creado_por)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [leadId, ciclo, datos.venta.importe, datos.venta.moneda, datos.venta.fecha,
           oNulo(datos.venta.programa), datos.venta.cuotas ?? null, usuarioId],
          cx,
        )
        ventaId = v.id
        anotaciones.push({
          entidad: 'venta', entidadId: leadId, campo: 'importe',
          anterior: null, nuevo: `${datos.venta.moneda} ${datos.venta.importe}`,
        })
      }

      // Si venía de una seña, la seña se convierte y su importe pasa a ser el
      // primer pago de esta venta. Así el dinero se cuenta una vez: no dos, y
      // no cero.
      const abierta = await fila<{ id: number; importe: number; moneda: string; fecha: string }>(
        `select id, importe, moneda, fecha from senias
          where lead_id = $1 and estado = 'abierta' and borrado_en is null
          order by fecha limit 1`,
        [leadId], cx,
      )
      if (abierta) {
        await escribir(`update senias set estado = 'convertida', venta_id = $1 where id = $2`,
          [ventaId, abierta.id], { esperadas: 1, cliente: cx })
        await escribir(
          `insert into pagos (venta_id, importe, moneda, fecha, origen, estado)
           values ($1, $2, $3, $4, 'sena', 'cobrado')`,
          [ventaId, abierta.importe, abierta.moneda, abierta.fecha], { esperadas: 1, cliente: cx },
        )
        anotaciones.push({ entidad: 'sena', entidadId: leadId, campo: 'estado',
                           anterior: 'abierta', nuevo: 'convertida' })
      }

      // El plan de pagos. Cada cuota se identifica por su NÚMERO, así que
      // volver a guardar la ficha la corrige en vez de cargar otra: si no, el
      // cash collected subía cada vez que alguien abría la venta a mirarla.
      const total = datos.venta.cuotas ?? null
      const enCuotas = (total ?? 1) > 1
      for (const c of datos.venta.plan ?? []) {
        const ya = await fila<{ id: number; estado: string; importe: string | number }>(
          `select id, estado, importe from pagos
            where venta_id = $1 and n_cuota = $2 and borrado_en is null limit 1`,
          [ventaId, c.n], cx,
        )
        const estado = c.pagado ? 'cobrado' : 'pendiente'
        if (ya) {
          await escribir(
            `update pagos set importe = $1, moneda = $2, fecha = $3, medio = $4,
                              estado = $5, cuotas_totales = $6
              where id = $7`,
            [c.importe, datos.venta.moneda, c.fecha, oNulo(c.medio ?? null), estado, total, ya.id],
            { esperadas: 1, cliente: cx },
          )
        } else {
          await escribir(
            `insert into pagos (venta_id, importe, moneda, fecha, medio, origen,
                                n_cuota, cuotas_totales, estado)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [ventaId, c.importe, datos.venta.moneda, c.fecha, oNulo(c.medio ?? null),
             enCuotas ? 'cuota' : 'contado', c.n, total, estado],
            { esperadas: 1, cliente: cx },
          )
        }
        // Al historial va el cobro, no la promesa: una cuota que todavía no
        // entró no es plata y anotarla como tal es el mismo error de siempre.
        if (c.pagado && ya?.estado !== 'cobrado') {
          anotaciones.push({ entidad: 'venta', entidadId: leadId, campo: 'cobro',
                             anterior: null, nuevo: `${datos.venta.moneda} ${c.importe}` })
        }
      }

      // Si el plan se achica —eran cuatro cuotas y son dos— las que sobran se
      // van. Las YA COBRADAS no: esa plata entró, y sacarla porque alguien
      // cambió un desplegable es exactamente lo que no puede pasar.
      if (total !== null) {
        await escribir(
          `update pagos set borrado_en = now()
            where venta_id = $1 and n_cuota > $2 and estado <> 'cobrado' and borrado_en is null`,
          [ventaId, total], { esperadas: 'cualquiera', cliente: cx },
        )
      }
    }

    if (datos.sena) {
      // Mismo criterio que la venta: corregir una seña no crea una segunda.
      const yaHay = await fila<{ id: number; importe: string | number; moneda: string }>(
        `select id, importe, moneda from senias
          where lead_id = $1 and ciclo = $2 and estado = 'abierta' and borrado_en is null
          order by fecha desc, id desc limit 1`,
        [leadId, ciclo], cx,
      )
      if (yaHay) {
        await escribir(
          `update senias set importe = $1, moneda = $2, fecha = $3,
                             saldo_pendiente = $4, fecha_comprometida = $5
            where id = $6`,
          [datos.sena.importe, datos.sena.moneda, datos.sena.fecha,
           datos.sena.saldoPendiente ?? null, oNulo(datos.sena.fechaComprometida), yaHay.id],
          { esperadas: 1, cliente: cx },
        )
        const antesPlata = `${yaHay.moneda} ${Number(yaHay.importe)}`
        const ahoraPlata = `${datos.sena.moneda} ${datos.sena.importe}`
        if (antesPlata !== ahoraPlata) {
          anotaciones.push({ entidad: 'sena', entidadId: leadId, campo: 'importe',
                             anterior: antesPlata, nuevo: ahoraPlata })
        }
      } else {
        await escribir(
          `insert into senias (lead_id, ciclo, importe, moneda, fecha, saldo_pendiente,
                               fecha_comprometida, creado_por)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [leadId, ciclo, datos.sena.importe, datos.sena.moneda, datos.sena.fecha,
           datos.sena.saldoPendiente ?? null, oNulo(datos.sena.fechaComprometida), usuarioId],
          { esperadas: 1, cliente: cx },
        )
        anotaciones.push({ entidad: 'sena', entidadId: leadId, campo: 'importe',
                           anterior: null, nuevo: `${datos.sena.moneda} ${datos.sena.importe}` })
      }
    }

    // El pipeline de seguimientos se mueve con el resultado, pero ya no
    // arrastra a todos: el closer dice cómo sigue cada uno.
    if (datos.resultado === 'seguimiento') {
      const como = datos.comoSigue ?? 'cadencia'
      if (como === 'cadencia') await entrarAlPipeline(leadId, cx)
      else if (como === 'largo' && datos.volverEl) {
        await ponerSeguimientoLargo(leadId, datos.volverEl, cx)
        anotaciones.push({ entidad: 'lead', entidadId: leadId, campo: 'seguimiento largo',
                           anterior: null, nuevo: datos.volverEl })
      } else {
        // Sin cadencia y sin fecha: queda en seguimiento y nadie lo persigue.
        await salirDelPipeline(leadId, cx)
      }
    }
    if (datos.resultado === 'venta' || datos.resultado === 'perdida' || datos.resultado === 'no_calificado') {
      await salirDelPipeline(leadId, cx)
    }

    // La reunión que se acaba de cargar queda como fila propia. Es lo que
    // permite que una segunda llamada no le pise la fecha a la primera.
    await sincronizarLlamada(leadId, cx)

    await anotar(anotaciones, usuarioId, cx)
  })
}

/** Registrar un cobro de una venta. Esto —y no la venta— es el cash collected. */
export async function registrarPago(
  leadId: number,
  datos: { importe: number; moneda: string; fecha: string; medio?: string | null; nCuota?: number | null },
  usuarioId: number,
): Promise<void> {
  const venta = await fila<{ id: number }>(
    `select id from ventas where lead_id = $1 and borrado_en is null order by fecha desc limit 1`,
    [leadId],
  )
  if (!venta) throw new Error('No hay una venta cargada en este lead: un cobro tiene que ser de algo.')

  await enTransaccion(async (cx) => {
    await escribir(
      `insert into pagos (venta_id, importe, moneda, fecha, medio, n_cuota, origen, estado)
       values ($1,$2,$3,$4,$5,$6,'cuota','cobrado')`,
      [venta.id, datos.importe, datos.moneda, datos.fecha, oNulo(datos.medio), datos.nCuota ?? null],
      { esperadas: 1, cliente: cx },
    )
    await anotar([{ entidad: 'venta', entidadId: leadId, campo: 'cobro',
                    anterior: null, nuevo: `${datos.moneda} ${datos.importe}` }], usuarioId, cx)
  })
}

/**
 * Quedó en una segunda llamada.
 *
 * Cierra la reunión de hoy —queda su fila, con su fecha y su resultado— y
 * re-agenda al lead para la nueva. Esto último es lo que hacía falta hacer
 * bien: mover la fecha del lead sin dejar registrada la primera le borraba al
 * mes anterior su agenda, y un número que cambia hacia atrás es peor que uno
 * que falta.
 *
 * No entra al pipeline de toques: ya tiene fecha. Perseguir a alguien que
 * tiene reunión agendada es ruido.
 */
export async function agendarSegundaLlamada(
  leadId: number,
  datos: { fecha: string; hora?: string | null; nota?: string | null },
  usuarioId: number,
): Promise<void> {
  const antes = await fila<{ fecha_sesion: string | null; tipo_sesion: string; estado: string }>(
    'select fecha_sesion, tipo_sesion, estado from leads where id = $1 and borrado_en is null',
    [leadId],
  )
  if (!antes) throw new Error('Ese lead no existe.')

  await enTransaccion(async (cx) => {
    // 1 · La reunión que termina queda escrita, con su fecha y lo que dio.
    await escribir(
      `update leads set estado = 'asistio', resultado = 'seguimiento', hubo_oferta = hubo_oferta
        where id = $1`,
      [leadId], { esperadas: 1, cliente: cx },
    )
    await sincronizarLlamada(leadId, cx)

    // 2 · El lead se re-agenda. Su fila de llamada de la segunda se va a crear
    //     cuando se cargue el resultado de esa reunión.
    await escribir(
      `update leads set fecha_sesion = $1, hora_sesion = $2, tipo_sesion = 'segunda',
                        estado = 'agendado', resultado = 'pendiente',
                        proximo_contacto = $1, actualizado_en = now()
        where id = $3`,
      [datos.fecha, oNulo(datos.hora ?? null), leadId], { esperadas: 1, cliente: cx },
    )

    // Con reunión agendada no hace falta perseguirlo con toques.
    await salirDelPipeline(leadId, cx)

    await anotar([{
      entidad: 'lead', entidadId: leadId, campo: 'segunda llamada',
      anterior: antes.fecha_sesion, nuevo: datos.fecha, motivo: oNulo(datos.nota ?? null),
    }], usuarioId, cx)
  })
}

// ── Anular plata cargada por error ──────────────────────────────────────────

/**
 * Anular una venta cargada por error.
 *
 * Hacía falta y no estaba, y la falta era cara: cambiar el resultado de «venta»
 * a «perdida» sacaba el lead del embudo pero DEJABA la fila en `ventas`. La
 * facturación del mes seguía contando plata que no entró, para siempre, y no
 * había forma de sacarla desde la aplicación.
 *
 * Se anula, no se borra: queda con `borrado_en` y en el historial con su
 * motivo, porque plata que aparece y desaparece de la facturación es
 * exactamente lo que hay que poder explicar tres meses después.
 *
 * Tres cosas se van con ella, y ninguna es opcional:
 *  - los COBROS, o el cash collected seguiría contando plata de algo que ya no
 *    existe;
 *  - la conversión de la SEÑA, que vuelve a estar abierta como estaba antes;
 *  - el RESULTADO del lead si decía «venta», que queda pendiente. Un lead que
 *    dice «Venta» sin venta es el mismo error dado vuelta.
 */
export async function anularVenta(leadId: number, usuarioId: number, motivo: string): Promise<void> {
  const razon = oNulo(motivo)
  if (razon === null) {
    throw new Error('Poné por qué se anula: plata que desaparece de la facturación hay que poder explicarla.')
  }

  const venta = await fila<{ id: number; importe: number; moneda: string; resultado: Resultado }>(
    `select v.id, v.importe, v.moneda, l.resultado
       from ventas v join leads l on l.id = v.lead_id
      where v.lead_id = $1 and v.borrado_en is null
      order by v.fecha desc, v.id desc limit 1`,
    [leadId],
  )
  if (!venta) throw new Error('Este lead no tiene ninguna venta cargada.')

  await enTransaccion(async (cx) => {
    await escribir('update ventas set borrado_en = now() where id = $1', [venta.id],
      { esperadas: 1, cliente: cx })
    await escribir(
      'update pagos set borrado_en = now() where venta_id = $1 and borrado_en is null',
      [venta.id], { esperadas: 'cualquiera', cliente: cx },
    )
    await escribir(
      `update senias set estado = 'abierta', venta_id = null
        where venta_id = $1 and estado = 'convertida'`,
      [venta.id], { esperadas: 'cualquiera', cliente: cx },
    )

    const cambios: Cambio[] = [{
      entidad: 'venta', entidadId: leadId, campo: 'anulada',
      anterior: `${venta.moneda} ${venta.importe}`, nuevo: null, motivo: razon,
    }]
    if (venta.resultado === 'venta') {
      await escribir(
        `update leads set resultado = 'pendiente', actualizado_en = now() where id = $1`,
        [leadId], { esperadas: 1, cliente: cx },
      )
      cambios.push({ entidad: 'lead', entidadId: leadId, campo: 'resultado',
                     anterior: 'venta', nuevo: 'pendiente', motivo: razon })
    }
    await anotar(cambios, usuarioId, cx)
  })
}

/**
 * Anular una seña cargada por error. Mismo criterio: sale de los números y
 * queda el rastro.
 *
 * Una seña ya convertida no se toca por acá: esa plata hoy es una venta, y lo
 * que hay que anular es la venta.
 */
export async function anularSena(leadId: number, usuarioId: number, motivo: string): Promise<void> {
  const razon = oNulo(motivo)
  if (razon === null) throw new Error('Poné por qué se anula.')

  const sena = await fila<{ id: number; importe: number; moneda: string; resultado: Resultado }>(
    `select s.id, s.importe, s.moneda, l.resultado
       from senias s join leads l on l.id = s.lead_id
      where s.lead_id = $1 and s.borrado_en is null and s.estado <> 'convertida'
      order by s.fecha desc, s.id desc limit 1`,
    [leadId],
  )
  if (!sena) {
    throw new Error(
      'Este lead no tiene ninguna seña abierta. Si la seña ya se convirtió en venta, ' +
      'lo que hay que anular es la venta.',
    )
  }

  await enTransaccion(async (cx) => {
    await escribir('update senias set borrado_en = now() where id = $1', [sena.id],
      { esperadas: 1, cliente: cx })

    const cambios: Cambio[] = [{
      entidad: 'sena', entidadId: leadId, campo: 'anulada',
      anterior: `${sena.moneda} ${sena.importe}`, nuevo: null, motivo: razon,
    }]
    if (sena.resultado === 'sena') {
      await escribir(
        `update leads set resultado = 'pendiente', actualizado_en = now() where id = $1`,
        [leadId], { esperadas: 1, cliente: cx },
      )
      cambios.push({ entidad: 'lead', entidadId: leadId, campo: 'resultado',
                     anterior: 'sena', nuevo: 'pendiente', motivo: razon })
    }
    await anotar(cambios, usuarioId, cx)
  })
}
