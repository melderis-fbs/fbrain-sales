/**
 * Las pruebas que escriben corren sobre OTRA base.
 *
 * Hacen `truncate`. Si corrieran contra la base de trabajo se llevarían puesta
 * la operación entera. Por eso el interruptor es otra variable,
 * `DATABASE_URL_PRUEBAS`: sin ella, estas pruebas se saltean solas.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const URL_PRUEBAS = process.env.DATABASE_URL_PRUEBAS
const siHayBase = URL_PRUEBAS ? describe : describe.skip

if (URL_PRUEBAS) process.env.DATABASE_URL = URL_PRUEBAS

siHayBase('la operación comercial, contra una base de verdad', () => {
  let db: typeof import('@/lib/db')
  let leads: typeof import('./leads')
  let resultado: typeof import('./resultado')
  let metricas: typeof import('./metricas')
  let seguimientos: typeof import('./seguimientos')
  let calificacion: typeof import('./calificacion')
  let cambios: typeof import('./cambios')
  let usuarioId = 0
  let closerKevin = 0
  let closerBraian = 0

  const TODO = { todo: true } as const
  const rango = { desde: '2026-09-01', hasta: '2026-09-30', etiqueta: 'test' }

  beforeAll(async () => {
    db = await import('@/lib/db')
    leads = await import('./leads')
    resultado = await import('./resultado')
    metricas = await import('./metricas')
    seguimientos = await import('./seguimientos')
    calificacion = await import('./calificacion')
    cambios = await import('./cambios')
  })

  beforeEach(async () => {
    await db.escribir(
      `truncate leads, llamadas, transcripciones, lead_calificacion, lead_quality, notas,
               seguimiento_estado, seguimiento_interacciones,
               analisis, call_scores, scoring_config, playbooks,
               ventas, senias, pagos, objetivos, cambios, usuarios, closers, setters,
               fuentes, funnels, casos_exito, config restart identity cascade`,
      [], { esperadas: 'cualquiera' },
    )
    const u = await db.escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email, nombre, rol, clave_hash) values ('t@t.com','Test','admin','x') returning id`,
    )
    usuarioId = u.id
    const k = await db.escribirDevolviendo<{ id: number }>(
      `insert into closers (nombre, nombre_pleg) values ('Kevin','kevin') returning id`)
    const b = await db.escribirDevolviendo<{ id: number }>(
      `insert into closers (nombre, nombre_pleg) values ('Braian','braian') returning id`)
    closerKevin = k.id
    closerBraian = b.id
  })

  afterAll(async () => { await db.pool().end() })

  /** Un lead con reunión en el período, que es el universo de todo el embudo. */
  const alta = (nombre: string, extra: Partial<Parameters<typeof leads.crearLead>[0]> = {}) =>
    leads.crearLead({ nombre, closerId: closerKevin, fechaSesion: '2026-09-10', ...extra }, usuarioId)

  it('un lead se puede editar después de creado, y queda el historial', async () => {
    const id = await leads.crearLead({ nombre: 'Maria Fernandez', email: 'maria@ejemplo.com' }, usuarioId)

    const cambiados = await leads.editarLead(
      id, { nombre: 'María Fernández', telefono: '+54 9 11 5555-1234', pais: 'Argentina' },
      usuarioId, 'Corrección de datos',
    )
    expect(cambiados).toBe(3)

    const lead = await leads.verLead(id)
    expect(lead?.nombre).toBe('María Fernández')
    expect(lead?.pais).toBe('Argentina')

    // La forma normalizada se actualiza junto con el valor: si no, el buscador
    // y los duplicados quedan mirando el dato viejo.
    const fila = await db.fila<{ nombre_pleg: string; telefono_pleg: string }>(
      'select nombre_pleg, telefono_pleg from leads where id = $1', [id])
    expect(fila?.nombre_pleg).toBe('maria fernandez')
    expect(fila?.telefono_pleg).toBe('5491155551234')

    const historia = await cambios.historialDelLead(id)
    const nombre = historia.find((h) => h.campo === 'nombre')
    expect(nombre?.anterior).toBe('Maria Fernandez')
    expect(nombre?.nuevo).toBe('María Fernández')
    expect(nombre?.motivo).toBe('Corrección de datos')
  })

  it('editar con el mismo valor no ensucia el historial', async () => {
    const id = await leads.crearLead({ nombre: 'Juan' }, usuarioId)
    expect(await leads.editarLead(id, { nombre: 'Juan' }, usuarioId)).toBe(0)
  })

  it('avisa de un posible duplicado por email, teléfono y nombre parecido', async () => {
    await leads.crearLead({ nombre: 'María Fernández', email: 'm@e.com', telefono: '11 5555 1234' }, usuarioId)

    expect((await leads.posiblesDuplicados({ nombre: 'Otro', email: 'M@E.COM' }))[0]?.porque).toBe('email')
    expect((await leads.posiblesDuplicados({ nombre: 'Otro', telefono: '+5411-5555-1234' }))[0]?.porque).toBe('telefono')
    // Sin acentos y en minúscula: avisa igual. Pero avisa, no decide.
    expect((await leads.posiblesDuplicados({ nombre: 'maria fernandez' }))[0]?.porque).toBe('nombre')
    expect(await leads.posiblesDuplicados({ nombre: 'Pedro Gómez' })).toEqual([])
  })

  it('una reunión de hoy no está «sin cargar» hasta que termine el día', async () => {
    // El reporte: «las sesiones del día las muestra como pasadas y todavía no
    // pasó la hora». Pedir el resultado de una llamada que no ocurrió enseña
    // dos cosas malas: a inventar el dato, o a no mirar el aviso.
    const hoy = (await import('@/motor/periodos')).hoyEn()
    const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)

    await leads.crearLead({ nombre: 'Es hoy más tarde', closerId: closerKevin, fechaSesion: hoy }, usuarioId)
    await leads.crearLead({ nombre: 'Fue ayer', closerId: closerKevin, fechaSesion: ayer }, usuarioId)

    const r = { desde: ayer, hasta: hoy, etiqueta: 'estos dos días' }
    const { medidas } = await metricas.metricas(r, TODO)
    expect(medidas.agendadas).toBe(2)
    // Sólo la de ayer: la de hoy tiene su propio bloque, con su hora.
    expect(medidas.pendientesDeCargar).toBe(1)
    expect((await metricas.sinCargar(TODO, hoy)).map((x) => x.lead)).toEqual(['Fue ayer'])
  })

  it('«no tiene» en la columna email no convierte a dos personas en la misma', async () => {
    // La columna «email» de una planilla trae de todo. Si eso se guarda como
    // email, dos leads con «no tiene» son el mismo email y el aviso de
    // duplicado empieza a mentir justo donde tiene que ser creíble.
    await leads.crearLead({ nombre: 'Uno', email: 'no tiene' }, usuarioId)
    expect(await leads.posiblesDuplicados({ nombre: 'Dos', email: 'no tiene' })).toEqual([])
  })

  it('el aviso de duplicado dice quién lo tiene, que es lo que evita la segunda ficha', async () => {
    // Sin esto el aviso decía «está duplicado» y nada más. El que lo veía no
    // podía hacer nada con esa información, así que creaba la ficha igual —y
    // dos fichas del mismo cliente son dos historias a medias.
    await leads.crearLead(
      { nombre: 'María Fernández', email: 'm@e.com', closerId: closerKevin }, usuarioId)

    const [d] = await leads.posiblesDuplicados({ nombre: 'Otra', email: 'm@e.com' })
    expect(d?.closer).toBe('Kevin')
    expect(d?.sinAsignar).toBe(false)
  })

  it('el lead ES la oportunidad: tres llamadas no son tres leads', async () => {
    const id = await alta('María')
    const llamadas = await import('./llamadas')
    await llamadas.crearLlamada(id, { fecha: '2026-09-10' })
    await llamadas.crearLlamada(id, { fecha: '2026-09-14' })
    await llamadas.crearLlamada(id, { fecha: '2026-09-20' })

    const lista = await leads.listarLeads(TODO)
    expect(lista).toHaveLength(1)
    expect(lista[0]?.llamadas).toBe(3)
    expect((await metricas.metricas(rango, TODO)).medidas.agendadas).toBe(1)
  })

  it('reflotar suma un ciclo al mismo lead y registra quién lo hizo', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, { estado: 'asistio', resultado: 'perdida', motivoPerdida: 'timing' }, usuarioId)

    const ciclo = await leads.reflotarLead(id, usuarioId, { fechaSesion: '2026-09-25' })
    expect(ciclo).toBe(2)

    const lead = await leads.verLead(id)
    expect(lead?.ciclo).toBe(2)
    expect(lead?.resultado).toBe('pendiente')
    expect(lead?.reflotadoPor).toBe('Test')
    // No se creó otro registro: la historia sigue siendo una sola.
    expect(await leads.listarLeads(TODO)).toHaveLength(1)
  })

  it('cambiar el closer no borra ni recrea: mantiene el histórico y el closer inicial', async () => {
    const id = await alta('María')
    await leads.reasignarCloser(id, closerBraian, usuarioId, 'Reasignación manual')

    const lead = await leads.verLead(id)
    expect(lead?.closer).toBe('Braian')
    expect(lead?.closerInicial).toBe('Kevin')   // el inicial no se pisa nunca

    const historia = await cambios.historialDelLead(id)
    const reasignacion = historia.find((h) => h.campo === 'closer')
    expect(reasignacion?.anterior).toBe('Kevin')
    expect(reasignacion?.nuevo).toBe('Braian')
    expect(reasignacion?.motivo).toBe('Reasignación manual')
  })

  it('la seña no cierra el lead, no es facturación y no es cash', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'sena', huboOferta: true,
      sena: { importe: 500, moneda: 'USD', fecha: '2026-09-10',
              saldoPendiente: 2500, fechaComprometida: '2026-09-18' },
    }, usuarioId)

    const { medidas, etapas } = await metricas.metricas(rango, TODO)
    expect(medidas.senas).toBe(1)
    expect(medidas.senasImporte).toBe(500)
    expect(medidas.ventas).toBe(0)
    expect(medidas.facturacion).toBe(0)      // no es una venta
    expect(medidas.cashCollected).toBe(0)    // decisión: la seña no entra al cash
    expect(etapas.find((e) => e.clave === 'senas')?.cantidad).toBe(1)

    // Y sigue abierta: aparece en las señas pendientes de convertir.
    expect(await metricas.senasAbiertas(TODO, '2026-09-15')).toHaveLength(1)
  })

  it('al convertirse, la seña pasa a ser el primer pago: el dinero se cuenta una vez', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'sena', huboOferta: true,
      sena: { importe: 500, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)
    await resultado.cargarResultado(id, {
      resultado: 'venta', venta: { importe: 3000, moneda: 'USD', fecha: '2026-09-18' },
    }, usuarioId)

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.ventas).toBe(1)
    expect(medidas.facturacion).toBe(3000)
    // Los 500 de la seña entraron al cash recién ahora, y una sola vez.
    expect(medidas.cashCollected).toBe(500)
    // La seña sigue contándose en el embudo: la etapa ocurrió.
    expect(medidas.senas).toBe(1)

    expect(await metricas.senasAbiertas(TODO, '2026-09-20')).toHaveLength(0)
    const sena = await db.fila<{ estado: string }>('select estado from senias where lead_id = $1', [id])
    expect(sena?.estado).toBe('convertida')
  })

  it('corregir una venta la corrige: no carga una segunda', async () => {
    // El error caro: el closer se equivocaba en un dígito, volvía a guardar la
    // ficha y quedaban DOS ventas. La facturación del mes contaba la plata dos
    // veces, para siempre, y no había forma de sacarla desde la aplicación.
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 300, moneda: 'USD', fecha: '2026-09-10', programa: 'GROWTH' },
    }, usuarioId)
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 3000, moneda: 'USD', fecha: '2026-09-10', programa: 'ELITE', cuotas: 3 },
    }, usuarioId)

    const cuantas = await db.fila<{ n: string }>(
      'select count(*) as n from ventas where lead_id = $1 and borrado_en is null', [id])
    expect(Number(cuantas?.n)).toBe(1)

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.ventas).toBe(1)
    expect(medidas.facturacion).toBe(3000)

    const lead = await leads.verLead(id)
    expect(lead?.venta?.importe).toBe(3000)
    expect(lead?.venta?.programa).toBe('ELITE')
    expect(lead?.venta?.cuotas).toBe(3)

    // Y el cambio queda escrito: plata que cambia de valor hay que poder explicarla.
    const historia = await cambios.historialDelLead(id)
    expect(historia.some((h) => h.anterior === 'USD 300' && h.nuevo === 'USD 3000')).toBe(true)
  })

  it('pero un lead reflotado que compra en el segundo intento tiene dos ventas de verdad', async () => {
    // El límite del arreglo de arriba: corregir no duplica, vender otra vez sí
    // suma. Lo que los separa es el ciclo, no la suerte.
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'perdida', motivoPerdida: 'timing',
    }, usuarioId)
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 1000, moneda: 'USD', fecha: '2026-09-05' },
    }, usuarioId)

    await leads.reflotarLead(id, usuarioId, { fechaSesion: '2026-09-20' })
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 2000, moneda: 'USD', fecha: '2026-09-22' },
    }, usuarioId)

    const cuantas = await db.fila<{ n: string }>(
      'select count(*) as n from ventas where lead_id = $1 and borrado_en is null', [id])
    expect(Number(cuantas?.n)).toBe(2)

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.facturacion).toBe(3000)
  })

  it('el plan de cuotas: sólo lo cobrado es cash, lo que falta queda escrito', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 3000, moneda: 'USD', fecha: '2026-09-10', cuotas: 3, plan: [
        { n: 1, importe: 1000, fecha: '2026-09-10', medio: 'transferencia', pagado: true },
        { n: 2, importe: 1000, fecha: '2026-09-25', pagado: false },
        { n: 3, importe: 1000, fecha: '2026-09-30', pagado: false },
      ] },
    }, usuarioId)

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.facturacion).toBe(3000)   // lo que se vendió
    expect(medidas.cashCollected).toBe(1000) // lo que entró por la venta nueva

    const lead = await leads.verLead(id)
    expect(lead?.pagos).toHaveLength(3)
    expect(lead?.pagos.filter((x) => x.estado === 'cobrado')).toHaveLength(1)
    expect(lead?.pagos[0]?.medio).toBe('transferencia')
    expect(lead?.cobrado).toBe(1000)
  })

  it('volver a guardar el plan lo corrige, y cobrar una cuota la suma', async () => {
    // El cash collected no puede subir porque alguien abrió la venta a mirarla:
    // cada cuota se identifica por su número y se corrige, no se duplica.
    const id = await alta('María')
    const conPlan = (pagada2: boolean) => resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 2000, moneda: 'USD', fecha: '2026-09-10', cuotas: 2, plan: [
        { n: 1, importe: 1000, fecha: '2026-09-10', pagado: true },
        { n: 2, importe: 1000, fecha: '2026-09-25', pagado: pagada2 },
      ] },
    }, usuarioId)

    await conPlan(false)
    await conPlan(false)
    expect((await metricas.metricas(rango, TODO)).medidas.cashCollected).toBe(1000)

    // Cobrar la segunda cuota NO mueve el cash del mes: no es venta nueva, es
    // cobranza de algo ya vendido. Queda en la ficha, que es donde sirve.
    await conPlan(true)
    expect((await metricas.metricas(rango, TODO)).medidas.cashCollected).toBe(1000)
    const ficha = await leads.verLead(id)
    expect(ficha?.pagos).toHaveLength(2)
    expect(ficha?.cobrado).toBe(2000)
  })

  it('achicar el plan saca las cuotas que sobran, pero nunca las ya cobradas', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 3000, moneda: 'USD', fecha: '2026-09-10', cuotas: 3, plan: [
        { n: 1, importe: 1000, fecha: '2026-09-10', pagado: true },
        { n: 2, importe: 1000, fecha: '2026-09-20', pagado: true },
        { n: 3, importe: 1000, fecha: '2026-09-30', pagado: false },
      ] },
    }, usuarioId)
    // Se renegocia a una sola cuota. La 3 nunca entró y se va; la 2 ya entró
    // y sacarla bajaría el cash de un mes que ya se reportó.
    await resultado.cargarResultado(id, {
      resultado: 'venta',
      venta: { importe: 3000, moneda: 'USD', fecha: '2026-09-10', cuotas: 1, plan: [
        { n: 1, importe: 1000, fecha: '2026-09-10', pagado: true },
      ] },
    }, usuarioId)

    const lead = await leads.verLead(id)
    expect(lead?.pagos.map((x) => x.nCuota)).toEqual([1, 2])
    // La 2 está cobrada y se ve en la ficha, pero el cash del mes cuenta lo
    // que entró por la venta nueva: la cuota 1.
    expect((await metricas.metricas(rango, TODO)).medidas.cashCollected).toBe(1000)
  })

  it('una venta al contado sin cobro no inventa cash', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 3000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.facturacion).toBe(3000)
    expect(medidas.cashCollected).toBe(0)
  })

  it('corregir una seña tampoco carga una segunda', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'sena',
      sena: { importe: 200, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'sena',
      sena: { importe: 500, moneda: 'USD', fecha: '2026-09-10', saldoPendiente: 2500 },
    }, usuarioId)

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.senas).toBe(1)
    expect(medidas.senasImporte).toBe(500)
    expect(await metricas.senasAbiertas(TODO, '2026-09-15')).toHaveLength(1)
  })

  it('el seguimiento largo se ve en la ficha, que es donde se vuelve a elegir', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'seguimiento', comoSigue: 'largo', volverEl: '2026-12-01',
    }, usuarioId)

    const lead = await leads.verLead(id)
    expect(lead?.seguimientoLargo).toBe('2026-12-01')
    expect(lead?.proximoContacto).toBe('2026-12-01')

    // El que entra a los doce toques no tiene fecha larga: son dos cosas distintas.
    const otro = await alta('Pedro')
    await resultado.cargarResultado(otro, {
      estado: 'asistio', resultado: 'seguimiento', comoSigue: 'cadencia',
    }, usuarioId)
    expect((await leads.verLead(otro))?.seguimientoLargo).toBe(null)
  })

  it('el cierre no puede pasar de 100%: ventas y asistencias salen del mismo universo', async () => {
    // El bug que traía el sistema anterior: el tablero decía 111% porque las
    // ventas venían de la tabla de ventas, por fecha de venta, y las
    // asistencias de las reuniones del mes. Acá los dos numeradores cuentan
    // sobre los leads con reunión en el período, así que no puede pasar.
    const vieja = await leads.crearLead(
      { nombre: 'Vendida en agosto', closerId: closerKevin, fechaSesion: '2026-08-20' }, usuarioId)
    await resultado.cargarResultado(vieja, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-05' },   // cobra en septiembre
    }, usuarioId)

    const deSeptiembre = await alta('De septiembre')
    await resultado.cargarResultado(deSeptiembre, { estado: 'asistio', resultado: 'seguimiento' }, usuarioId)

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.asistencias).toBe(1)
    expect(medidas.ventas).toBe(0)          // la venta es de una reunión de agosto
    expect(medidas.cierrePct).toBe(0)
    // La facturación sí la cuenta, porque se cuenta por la fecha de la venta.
    // Son universos distintos a propósito, y por eso no se dividen entre sí.
    expect(medidas.facturacion).toBe(5000)
  })

  it('las ventas del período se cuentan por la fecha de la venta, no por la de la llamada', async () => {
    // Lo que se mostraba en el tablero era el cierre de la cohorte —de las
    // reuniones de este mes, cuántas cerraron— y no las ventas del mes. Una
    // llamada de agosto que firma en septiembre es una venta de septiembre, y
    // el mes que la cobra es el que la tiene que ver.
    const deAgosto = await leads.crearLead(
      { nombre: 'Llamó en agosto', closerId: closerKevin, fechaSesion: '2026-08-20' }, usuarioId)
    await resultado.cargarResultado(deAgosto, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 4000, moneda: 'USD', fecha: '2026-09-05', cuotas: 1,
               plan: [{ n: 1, importe: 1000, fecha: '2026-09-05', pagado: true }] },
    }, usuarioId)

    const deSeptiembre = await alta('Llamó y firmó en septiembre')
    await resultado.cargarResultado(deSeptiembre, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 6000, moneda: 'USD', fecha: '2026-09-12', cuotas: 1,
               plan: [{ n: 1, importe: 3000, fecha: '2026-09-12', pagado: true }] },
    }, usuarioId)

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.ventasCerradas).toBe(2)     // las dos firmaron en septiembre
    expect(medidas.ventas).toBe(1)             // pero sólo una reunión fue de septiembre
    expect(medidas.facturacion).toBe(10000)
    expect(medidas.cashCollected).toBe(4000)
    // Y el porcentaje que importa: de lo vendido, cuánto entró.
    expect(medidas.cobranzaPct).toBe(40)

    // La lista que abre el número tiene las dos, para que se pueda verificar.
    const lista = await metricas.ventasDelPeriodo(rango, TODO)
    expect(lista).toHaveLength(2)
    expect(lista.reduce((a, v) => a + v.importe, 0)).toBe(10000)
  })

  it('el cash del mes es lo cobrado de las ventas del mes, entrara cuando entrara', async () => {
    // Antes se contaba por la fecha del cobro y no cuadraba con la lista de
    // ventas de abajo: una venta de septiembre con la seña cobrada en agosto
    // figuraba cobrada en la lista y faltaba en el cash de septiembre. Dos
    // números correctos que no cuadran entre sí terminan en que no se cree en
    // ninguno, así que los dos cuentan sobre las mismas ventas.
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'sena',
      sena: { importe: 500, moneda: 'USD', fecha: '2026-08-20' },   // seña de agosto
    }, usuarioId)
    await resultado.cargarResultado(id, {
      resultado: 'venta',
      venta: { importe: 3000, moneda: 'USD', fecha: '2026-09-10', cuotas: 2, plan: [
        { n: 1, importe: 1000, fecha: '2026-09-10', pagado: true },
        { n: 2, importe: 1500, fecha: '2026-10-10', pagado: false },   // todavía no entró
      ] },
    }, usuarioId)

    const [venta] = await metricas.ventasDelPeriodo(rango, TODO)
    expect(venta?.cobrado).toBe(1500)   // los 500 de la seña más los 1000 de la firma

    const { medidas } = await metricas.metricas(rango, TODO)
    expect(medidas.facturacion).toBe(3000)
    // La tarjeta dice exactamente lo que suma la lista: no hay dos cuentas.
    expect(medidas.cashCollected).toBe(1500)
    expect(medidas.cobranzaPct).toBe(50)
  })

  it('y la tarjeta, la lista y el desglose por closer dicen los tres lo mismo', async () => {
    // El invariante que hace que se pueda creer en el tablero: no hay dos
    // cuentas del mismo número en dos pantallas.
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 4000, moneda: 'USD', fecha: '2026-09-10', cuotas: 2, plan: [
        { n: 1, importe: 2500, fecha: '2026-08-28', pagado: true },   // entró antes de firmar
        { n: 2, importe: 1500, fecha: '2026-10-05', pagado: false },
      ] },
    }, usuarioId)

    const { medidas } = await metricas.metricas(rango, TODO)
    const lista = await metricas.ventasDelPeriodo(rango, TODO)
    const porCloser = await metricas.recorridoPorCloser(rango, TODO, '2026-09-30')

    expect(lista.reduce((a, v) => a + v.importe, 0)).toBe(medidas.facturacion)
    expect(lista.reduce((a, v) => a + v.cobrado, 0)).toBe(medidas.cashCollected)
    expect(porCloser.reduce((a, c) => a + c.cash, 0)).toBe(medidas.cashCollected)
    expect(porCloser.reduce((a, c) => a + c.facturacion, 0)).toBe(medidas.facturacion)
  })

  it('el embudo y las tasas salen de los datos, no de una suma a mano', async () => {
    const cargar = async (
      nombre: string, estado: 'asistio' | 'no_show', oferta: boolean, r: 'venta' | 'seguimiento',
    ) => {
      const id = await alta(nombre)
      await resultado.cargarResultado(id, {
        estado, resultado: r, huboOferta: oferta,
        ...(r === 'venta' ? { venta: { importe: 1000, moneda: 'USD', fecha: '2026-09-10' } } : {}),
      }, usuarioId)
    }
    await cargar('A', 'asistio', true, 'venta')
    await cargar('B', 'asistio', true, 'seguimiento')
    await cargar('C', 'asistio', false, 'seguimiento')
    await cargar('D', 'no_show', false, 'seguimiento')

    const { medidas, etapas } = await metricas.metricas(rango, TODO)
    expect(medidas.agendadas).toBe(4)
    expect(medidas.asistencias).toBe(3)
    expect(medidas.asistenciaPct).toBe(75)
    expect(medidas.ofertas).toBe(2)
    expect(medidas.cierrePct).toBe(33.3)     // 1 venta sobre 3 asistencias
    expect(etapas.find((e) => e.clave === 'asistidas')?.paso).toBe(75)

    // La apertura por closer suma exactamente el total: sale de la misma consulta.
    const porCloser = await metricas.apertura('closer', rango, TODO)
    expect(porCloser.reduce((s, c) => s + c.agendadas, 0)).toBe(medidas.agendadas)
    expect(porCloser.reduce((s, c) => s + c.ventas, 0)).toBe(medidas.ventas)
  })

  it('marcar «seguimiento» mete el lead en el pipeline solo', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, { estado: 'asistio', resultado: 'seguimiento' }, usuarioId)

    const estado = await seguimientos.seguimientoDelLead(id, '2026-09-10')
    expect(estado?.toque).toBe(1)
    expect(estado?.situacion).toBe('activo')

    // Y vender lo saca solo: no hace falta acordarse de una segunda acción.
    await resultado.cargarResultado(id, {
      resultado: 'venta', venta: { importe: 1000, moneda: 'USD', fecha: '2026-09-12' },
    }, usuarioId)
    expect((await seguimientos.seguimientoDelLead(id, '2026-09-12'))?.situacion).toBe('fuera')
  })

  it('registrar un toque avanza la tarjeta y recuenta desde hoy', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, { estado: 'asistio', resultado: 'seguimiento' }, usuarioId)

    const { toque, salio } = await seguimientos.registrarInteraccion(id, 'no_contesto', null, usuarioId)
    expect(salio).toBe(false)
    expect(toque).toBe(2)

    // «No interesado» lo saca del pipeline y cierra el lead: si quedara en
    // seguimiento, seguiría contando como oportunidad abierta en el embudo.
    await seguimientos.registrarInteraccion(id, 'no_interesado', 'No le interesa', usuarioId)
    expect((await seguimientos.seguimientoDelLead(id, '2026-09-20'))?.situacion).toBe('fuera')
    expect((await leads.verLead(id))?.resultado).toBe('perdida')
  })

  it('el lead quality no puntúa cero lo que no se preguntó', async () => {
    const id = await alta('María')
    const pocas = await calificacion.guardarCalificacion(id, { capacidad_inversion: 'si' }, usuarioId)
    expect(pocas.score).toBeNull()      // sin calificar, no «bajo»

    const completa = await calificacion.guardarCalificacion(id, {
      capacidad_inversion: 'si', es_decisor: 'si', urgencia: '5', facturacion_mensual: 'mas_15k',
      tiene_clientes: 'recurrentes', oferta_definida: 'si', conciencia: 'compara', interes: 'alto',
    }, usuarioId)
    expect(completa.score).toBe(100)
    expect((await calificacion.qualityDelLead(id))?.score).toBe(100)
  })

  it('el quality congelado no cambia aunque después se edite la calificación', async () => {
    const id = await alta('María')
    await calificacion.guardarCalificacion(id, {
      capacidad_inversion: 'si', es_decisor: 'si', urgencia: '5', facturacion_mensual: 'mas_15k',
      tiene_clientes: 'recurrentes', oferta_definida: 'si', conciencia: 'compara', interes: 'alto',
    }, usuarioId)
    await calificacion.congelarQuality(id)

    // Después de perderlo, alguien le baja la calidad al lead.
    await calificacion.guardarCalificacion(id, {
      capacidad_inversion: 'no', es_decisor: 'no', urgencia: '1', facturacion_mensual: 'sin_facturar',
      tiene_clientes: 'ninguno', oferta_definida: 'no', conciencia: 'no_sabe', interes: 'bajo',
    }, usuarioId)

    // El vigente baja, el congelado no: con el congelado se evalúa al closer.
    expect((await calificacion.qualityDelLead(id))?.score).toBe(0)
    expect((await calificacion.qualityCongelado(id))?.score).toBe(100)
  })

  it('un closer sólo ve sus leads; un setter, los que agendó', async () => {
    const deKevin = await alta('Lead de Kevin')
    const deBraian = await alta('Lead de Braian', { closerId: closerBraian })

    const suyos = await leads.listarLeads({ todo: false, usuarioId: 0, closerId: closerKevin })
    expect(suyos.map((l) => l.nombre)).toEqual(['Lead de Kevin'])

    expect(await leads.puedeVerLead(deBraian, { todo: false, usuarioId: 0, closerId: closerKevin })).toBe(false)
    expect(await leads.puedeVerLead(deKevin, { todo: true })).toBe(true)

    // Sin closer ni setter asignado no se ve nada: vacío por permiso, no por
    // falta de datos.
    expect(await leads.listarLeads({ todo: false, usuarioId: 0, nada: true })).toEqual([])
    expect((await metricas.metricas(rango, { todo: false, usuarioId: 0, nada: true })).medidas.agendadas).toBe(0)
  })

  it('una escritura que no toca las filas que declaró, rompe', async () => {
    await expect(
      db.escribir('update leads set nombre = $1 where id = 999999', ['x']),
    ).rejects.toThrow(db.ErrorDeEscritura)
  })

  it('los importes en otra moneda no se suman con el total: se informan aparte', async () => {
    const id = await alta('Test')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 1_500_000, moneda: 'ARS', fecha: '2026-09-11' },
    }, usuarioId)

    const { medidas } = await metricas.metricas(rango, TODO, {}, 'USD')
    expect(medidas.facturacion).toBe(0)
    expect(medidas.otrasMonedas).toContainEqual({ moneda: 'ARS', importe: 1_500_000 })
  })

  it('el analizador guarda niveles con cita y la nota la calcula el motor', async () => {
    const analisis = await import('./analisis')
    const llamadas = await import('./llamadas')
    const { DIMENSIONES } = await import('@/dominio/rubrica')

    const id = await alta('María')
    const llamadaId = await llamadas.crearLlamada(id, { fecha: '2026-09-10' })
    const transcripcionId = await llamadas.guardarTranscripcion(
      llamadaId, 'Kevin: Hola.\nMaría: Hola.\n'.repeat(20), 'pegado', usuarioId)
    const analisisId = await analisis.crearAnalisis(llamadaId, transcripcionId, null, usuarioId)

    // Lo que es aritmética se cuenta en código y no se le pregunta al modelo.
    const texto = (await llamadas.transcripcionDe(llamadaId))!.texto
    await analisis.guardarConteos(analisisId, llamadas.medirTurnos(texto, 'Kevin'))

    const puntaje = await analisis.guardarEvaluacion(analisisId, {
      niveles: DIMENSIONES.map((d) => ({
        dimension: d.clave,
        // Impecable salvo descubrimiento, que es el que tiene tope.
        nivel: d.clave === 'descubrimiento' ? 1 : 4,
        cita: 'una frase de la transcripción',
        justificacion: 'porque sí',
        sinEvidencia: false,
      })),
      eventos: [{ evento: 'pitch_prematuro', cita: 'Te cuento el programa…', momento: 'inicio' }],
      objeciones: [],
      feedback: { loMejor: [], loQueCosto: [], errorPrincipal: null, queHubieraHecho: null,
                  momentoClave: null, fraseAlternativa: null, unaSolaCosa: 'Preguntar antes de contar' },
    })

    // El tope entra: sin descubrimiento no se puede saber si lo vendido servía.
    expect(puntaje.topeAplicado).toBe(7.0)
    expect(puntaje.score).toBe(7.0)

    const guardado = await analisis.verAnalisis(analisisId)
    expect(guardado?.score).toBe(7.0)
    expect(guardado?.estado).toBe('analizada')
    expect(guardado?.niveles.find((n) => n.dimension === 'descubrimiento')?.cita).toBeTruthy()
    // Los turnos se cuentan en código, no se le preguntan al modelo.
    expect(guardado?.turnosCloser).toBeGreaterThan(0)
    expect(guardado?.turnosProspecto).toBeGreaterThan(0)
  })

  it('un nivel sin cita no entra al cálculo, aunque el modelo lo haya mandado', async () => {
    const analisis = await import('./analisis')
    const llamadas = await import('./llamadas')
    const { DIMENSIONES } = await import('@/dominio/rubrica')

    const id = await alta('María')
    const llamadaId = await llamadas.crearLlamada(id, { fecha: '2026-09-10' })
    const tId = await llamadas.guardarTranscripcion(
      llamadaId, 'Kevin: Hola.\nMaría: Hola.\n'.repeat(20), 'pegado', usuarioId)
    const aId = await analisis.crearAnalisis(llamadaId, tId, null, usuarioId)

    await analisis.guardarEvaluacion(aId, {
      niveles: DIMENSIONES.map((d) => ({
        dimension: d.clave, nivel: 4,
        // Al cierre le manda un nivel alto sin ninguna frase que lo sostenga.
        cita: d.clave === 'cierre' ? '' : 'una frase',
        justificacion: null, sinEvidencia: false,
      })),
      eventos: [{ evento: 'no_pide_decision', cita: '', momento: null }],   // tampoco entra
      objeciones: [],
      feedback: { loMejor: [], loQueCosto: [], errorPrincipal: null, queHubieraHecho: null,
                  momentoClave: null, fraseAlternativa: null, unaSolaCosa: null },
    })

    const guardado = await analisis.verAnalisis(aId)
    expect(guardado?.niveles.find((n) => n.dimension === 'cierre')?.sinEvidencia).toBe(true)
    // Y sin la cita, el evento no resta.
    expect(guardado?.penalizacion).toBe(0)
  })

  it('recalibrar no necesita al modelo: se repuntúa sobre los niveles guardados', async () => {
    const analisis = await import('./analisis')
    const llamadas = await import('./llamadas')
    const { DIMENSIONES } = await import('@/dominio/rubrica')

    const id = await alta('María')
    const llamadaId = await llamadas.crearLlamada(id, { fecha: '2026-09-10' })
    const tId = await llamadas.guardarTranscripcion(
      llamadaId, 'Kevin: Hola.\nMaría: Hola.\n'.repeat(20), 'pegado', usuarioId)
    const aId = await analisis.crearAnalisis(llamadaId, tId, null, usuarioId)

    await analisis.guardarEvaluacion(aId, {
      niveles: DIMENSIONES.map((d) => ({
        dimension: d.clave, nivel: d.clave === 'descubrimiento' ? 1 : 4,
        cita: 'una frase', justificacion: null, sinEvidencia: false,
      })),
      eventos: [], objeciones: [],
      feedback: { loMejor: [], loQueCosto: [], errorPrincipal: null, queHubieraHecho: null,
                  momentoClave: null, fraseAlternativa: null, unaSolaCosa: null },
    })
    expect((await analisis.verAnalisis(aId))?.score).toBe(7.0)

    // Una versión nueva sin topes. Ni una llamada al modelo.
    const m = analisis.modeloDelCodigo()
    const nueva = await db.escribirDevolviendo<{ id: number }>(
      `insert into scoring_config (version, dimensiones, niveles, penalizaciones, bonificaciones, topes, vigente)
       values ('v2-sin-topes', $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, '[]'::jsonb, false) returning id`,
      [JSON.stringify(m.dimensiones), JSON.stringify(m.niveles),
       JSON.stringify(m.penalizaciones),
       JSON.stringify({ valores: m.bonificaciones, tope: m.topeBonificaciones })],
    )
    expect(await analisis.recalcular(nueva.id)).toBe(1)

    // La nota nueva es la vigente; la vieja no se pisó, quedó con su versión.
    const despues = await analisis.verAnalisis(aId)
    expect(despues?.score).toBe(7.8)
    expect(despues?.version).toBe('v2-sin-topes')
    const historia = await db.filas<{ score: number }>(
      'select score from call_scores where analisis_id = $1 order by id', [aId])
    expect(historia.map((h) => Number(h.score))).toEqual([7.0, 7.8])
  })

  it('las comisiones se calculan sobre lo cobrado, y la repesca la cobra quien reflotó', async () => {
    const comisiones = await import('./comisiones')

    // Un lead que Kevin cerró y Fabricio agendó.
    const s = await db.escribirDevolviendo<{ id: number }>(
      `insert into setters (nombre, nombre_pleg) values ('Fabricio','fabricio') returning id`)
    const id = await leads.crearLead(
      { nombre: 'María', closerId: closerKevin, setterId: s.id, fechaSesion: '2026-09-10' }, usuarioId)
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 10000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)
    await resultado.registrarPago(id, { importe: 4000, moneda: 'USD', fecha: '2026-09-12' }, usuarioId)

    await comisiones.guardarReglas(
      { sobre: 'cash', closer: 10, setter: 5, repesca: 2, head: 0 }, usuarioId)

    const l = await comisiones.liquidacion(rango)
    // Se comisiona sobre los 4000 cobrados, no sobre los 10000 vendidos: pagar
    // sobre lo facturado es pagar por plata que todavía no entró.
    expect(l.baseTotal).toBe(4000)
    expect(l.lineas.find((x) => x.rol === 'closer')?.comision).toBe(400)
    expect(l.lineas.find((x) => x.rol === 'setter')?.comision).toBe(200)
    expect(l.total).toBe(600)
    // Nadie lo reflotó, así que no hay línea de repesca.
    expect(l.lineas.find((x) => x.rol === 'repesca')).toBeUndefined()

    // Sobre lo facturado, la base es otra y el número también.
    await comisiones.guardarReglas(
      { sobre: 'facturacion', closer: 10, setter: 5, repesca: 2, head: 0 }, usuarioId)
    const facturado = await comisiones.liquidacion(rango)
    expect(facturado.baseTotal).toBe(10000)
    expect(facturado.total).toBe(1500)
  })

  it('el que reflota un lead cobra la repesca, aunque no lo cierre él', async () => {
    const comisiones = await import('./comisiones')
    const otro = await db.escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email, nombre, rol, clave_hash)
       values ('f@f.com','Fabricio','setter','x') returning id`)

    const id = await leads.crearLead(
      { nombre: 'Pedro', closerId: closerKevin, fechaSesion: '2026-09-01' }, usuarioId)
    await resultado.cargarResultado(id, { estado: 'asistio', resultado: 'perdida', motivoPerdida: 'timing' }, usuarioId)
    // Lo reflota Fabricio, no Kevin.
    await leads.reflotarLead(id, otro.id, { fechaSesion: '2026-09-20' })
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-20' },
    }, usuarioId)

    await comisiones.guardarReglas(
      { sobre: 'facturacion', closer: 10, setter: 0, repesca: 4, head: 0 }, usuarioId)
    const l = await comisiones.liquidacion(rango)

    expect(l.lineas.find((x) => x.rol === 'closer')?.quien).toBe('Kevin')
    const repesca = l.lineas.find((x) => x.rol === 'repesca')
    expect(repesca?.quien).toBe('Fabricio')
    expect(repesca?.comision).toBe(200)   // 4% de 5000
  })

  it('el matching no publica una tasa sacada de cuatro llamadas', async () => {
    const matching = await import('./matching')
    for (let i = 0; i < 4; i++) {
      const id = await leads.crearLead(
        { nombre: `Lead ${i}`, closerId: closerKevin, industria: 'E-commerce', fechaSesion: '2026-09-10' },
        usuarioId)
      await resultado.cargarResultado(id, {
        estado: 'asistio', resultado: i === 0 ? 'venta' : 'perdida',
        motivoPerdida: i === 0 ? null : 'precio',
        ...(i === 0 ? { venta: { importe: 1000, moneda: 'USD', fecha: '2026-09-10' } } : {}),
      }, usuarioId)
    }

    const m = await matching.matriz('industria', rango)
    const celda = m.celdas.find((c) => c.segmento === 'E-commerce')
    expect(celda?.asistencias).toBe(4)
    // 1 de 4 es 25%, y no se publica: con cuatro llamadas ese número se mueve
    // veinticinco puntos con una venta más.
    expect(celda?.tasa).toBeNull()
    expect(celda?.confianza).toBe('ninguna')
    expect(matching.loQueSeSabe(m)).toEqual([])
  })

  it('un lead sin fecha de reunión no entra a las métricas, pero se cuenta aparte', async () => {
    await leads.crearLead({ nombre: 'Suelto', closerId: closerKevin }, usuarioId)

    // No aparece en ninguna métrica…
    expect((await metricas.metricas(rango, TODO)).medidas.agendadas).toBe(0)
    // …pero no desaparece: se puede contar y listar para reclamarlo.
    expect(await metricas.sinFechaDeReunion(TODO)).toBe(1)
    expect((await leads.listarLeads(TODO, { sinFecha: true })).map((l) => l.nombre)).toEqual(['Suelto'])
  })

  it('una figura comercial se puede pasar de una cuenta a otra', async () => {
    const personas = await import('./personas')

    // El caso real: Kevin cambia de email. Se le crea la cuenta nueva y la
    // figura sigue atada a la vieja, así que entra y no ve ningún lead.
    const vieja = await db.escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email, nombre, rol, clave_hash)
       values ('kevinpavon@x.com','Kevin','closer','x') returning id`)
    const nueva = await db.escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email, nombre, rol, clave_hash)
       values ('admisiones@x.com','Kevin','closer','x') returning id`)
    await db.escribir('update closers set usuario_id = $1 where id = $2', [vieja.id, closerKevin])

    const antes = await personas.equipo()
    const cuentaNueva = antes.personas.find((p) => p.email === 'admisiones@x.com')
    expect(cuentaNueva?.sinVincular).toBe(true)
    expect(cuentaNueva?.figuraId).toBeNull()

    // Atarle la figura a la cuenta nueva la suelta de la vieja: es la misma
    // persona con otro email, no dos closers.
    await db.escribir('update closers set usuario_id = null where usuario_id = $1', [nueva.id],
      { esperadas: 'cualquiera' })
    await db.escribir('update closers set usuario_id = $1, activo = true where id = $2',
      [nueva.id, closerKevin])

    const despues = await personas.equipo()
    expect(despues.personas.find((p) => p.email === 'admisiones@x.com')?.figuraId).toBe(closerKevin)
    expect(despues.personas.find((p) => p.email === 'kevinpavon@x.com')?.figuraId).toBeNull()
    // La figura sigue siendo UNA: no se duplicó el closer.
    expect(despues.figuras.filter((f) => f.tipo === 'closer' && f.nombre === 'Kevin')).toHaveLength(1)
  })

  it('una cuenta desactivada no reclama figura comercial', async () => {
    const personas = await import('./personas')
    const u = await db.escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email, nombre, rol, clave_hash, activo)
       values ('afuera@x.com','Se Fue','closer','x', false) returning id`)

    const equipo = await personas.equipo()
    const cuenta = equipo.personas.find((p) => p.usuarioId === u.id)
    // No ve leads, pero tampoco entra: avisar de eso es ruido que tapa el
    // aviso que sí importa.
    expect(cuenta?.sinVincular).toBe(false)
  })

  it('dar de baja un lead lo saca de todo, pero no borra nada', async () => {
    const id = await alta('María')
    // Cargar el resultado ya registra la reunión como llamada: no hace falta
    // crearla a mano, y crearla igual la duplicaría.
    await resultado.cargarResultado(id, { estado: 'asistio', resultado: 'seguimiento' }, usuarioId)

    await leads.borrarLead(id, usuarioId, 'Duplicado')

    // Sale de las listas, de las métricas y del pipeline de seguimientos.
    expect(await leads.listarLeads(TODO)).toEqual([])
    expect((await metricas.metricas(rango, TODO)).medidas.agendadas).toBe(0)
    expect((await seguimientos.seguimientoDelLead(id, '2026-09-15'))?.situacion).toBe('fuera')

    // Pero la fila sigue estando, con todo lo que tenía colgado.
    const cuelga = await leads.loQueCuelgaDelLead(id)
    expect(cuelga.llamadas).toBe(1)

    const [deBaja] = await leads.listarBorrados(TODO)
    expect(deBaja?.nombre).toBe('María')
    expect(deBaja?.motivo).toBe('Duplicado')
    expect(deBaja?.porQuien).toBe('Test')

    // Y se puede volver a poner en juego.
    await leads.restaurarLead(id, usuarioId)
    expect((await leads.listarLeads(TODO)).map((l) => l.nombre)).toEqual(['María'])
    expect(await leads.listarBorrados(TODO)).toEqual([])
  })

  it('una baja sin motivo no se guarda', async () => {
    const id = await alta('María')
    await expect(leads.borrarLead(id, usuarioId, '   ')).rejects.toThrow(/motivo/i)
    expect(await leads.listarLeads(TODO)).toHaveLength(1)
  })

  it('la plata de un lead dado de baja sale de los números', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)
    expect((await metricas.metricas(rango, TODO)).medidas.facturacion).toBe(5000)

    // Es justamente por esto que un setter no puede dar de baja un lead con
    // venta: la facturación del mes cambia y él no la ve.
    const cuelga = await leads.loQueCuelgaDelLead(id)
    expect(cuelga.tieneVenta).toBe(true)
    expect(cuelga.importe).toBe(5000)

    await leads.borrarLead(id, usuarioId, 'Se cargó en el lead equivocado')
    expect((await metricas.metricas(rango, TODO)).medidas.facturacion).toBe(0)
  })

  it('corregir el resultado NO saca la venta: hay que anularla, y entonces sí sale del mes', async () => {
    // Ésta es la prueba de un error que estuvo vivo: cargar una venta por
    // equivocación y después corregir el resultado a «perdida» sacaba el lead
    // del embudo pero dejaba la plata contando en la facturación del mes, para
    // siempre y sin forma de arreglarlo.
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)
    await resultado.registrarPago(id, { importe: 2000, moneda: 'USD', fecha: '2026-09-12' }, usuarioId)

    await resultado.cargarResultado(id, { resultado: 'perdida', motivoPerdida: 'precio' }, usuarioId)

    // El embudo ya no la cuenta como venta...
    const conError = (await metricas.metricas(rango, TODO)).medidas
    expect(conError.ventas).toBe(0)
    // ...pero la plata sigue ahí. Esto es el error, y el tablero lo sabe decir.
    expect(conError.facturacion).toBe(5000)
    expect(conError.cashCollected).toBe(2000)

    const [fantasma] = await metricas.plataFantasma(TODO)
    expect(fantasma?.lead).toBe('María')
    expect(fantasma?.que).toBe('venta')
    expect(fantasma?.importe).toBe(5000)

    await resultado.anularVenta(id, usuarioId, 'Se cargó en el lead equivocado')

    const limpio = (await metricas.metricas(rango, TODO)).medidas
    expect(limpio.facturacion).toBe(0)
    // El cobro se va con la venta: si no, el cash seguiría contando plata de
    // algo que ya no existe.
    expect(limpio.cashCollected).toBe(0)
    expect(await metricas.plataFantasma(TODO)).toEqual([])

    // Y no se borró: queda quién la anuló y por qué.
    const anulada = (await cambios.historialDelLead(id)).find((h) => h.campo === 'venta: anulada')
    expect(anulada?.anterior).toBe('USD 5000')
    expect(anulada?.motivo).toBe('Se cargó en el lead equivocado')
  })

  it('anular una venta sin motivo no se hace', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)

    await expect(resultado.anularVenta(id, usuarioId, '  ')).rejects.toThrow(/por qué/i)
    expect((await metricas.metricas(rango, TODO)).medidas.facturacion).toBe(5000)
  })

  it('anular la venta de un lead que todavía dice «venta» lo deja pendiente, no mintiendo', async () => {
    // Un lead que dice «Venta» sin venta es el mismo error dado vuelta.
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)

    await resultado.anularVenta(id, usuarioId, 'El cliente se arrepintió antes de pagar')

    const lead = await leads.verLead(id)
    expect(lead?.resultado).toBe('pendiente')
    expect(lead?.venta).toBe(null)
    expect(await metricas.plataFantasma(TODO)).toEqual([])
  })

  it('anular la venta devuelve la seña que se había convertido en ella', async () => {
    // La seña se había convertido y su importe era el primer pago de la venta.
    // Si la venta se anula y la seña no vuelve, esa plata desaparece de los dos
    // lados: no era una venta y tampoco un compromiso abierto.
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'sena',
      sena: { importe: 1000, moneda: 'USD', fecha: '2026-09-05' },
    }, usuarioId)
    await resultado.cargarResultado(id, {
      resultado: 'venta', venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)
    expect((await metricas.metricas(rango, TODO)).medidas.cashCollected).toBe(1000)

    await resultado.anularVenta(id, usuarioId, 'Se cargó en el lead equivocado')

    const abiertas = await metricas.senasAbiertas(TODO, '2026-09-15')
    expect(abiertas.map((s) => s.importe)).toEqual([1000])
    const m = (await metricas.metricas(rango, TODO)).medidas
    expect(m.facturacion).toBe(0)
    expect(m.cashCollected).toBe(0)
  })

  it('una seña ya convertida no se anula por su lado: lo que se anula es la venta', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'sena',
      sena: { importe: 1000, moneda: 'USD', fecha: '2026-09-05' },
    }, usuarioId)
    await resultado.cargarResultado(id, {
      resultado: 'venta', venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)

    await expect(resultado.anularSena(id, usuarioId, 'Error')).rejects.toThrow(/venta/i)
  })

  it('una seña en un lead perdido es plata que no cuadra, y se puede anular', async () => {
    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'sena',
      sena: { importe: 1000, moneda: 'USD', fecha: '2026-09-05' },
    }, usuarioId)
    // Una seña con el lead abierto es normal: no es un descuadre.
    expect(await metricas.plataFantasma(TODO)).toEqual([])

    await resultado.cargarResultado(id, { resultado: 'perdida', motivoPerdida: 'precio' }, usuarioId)
    const [fantasma] = await metricas.plataFantasma(TODO)
    expect(fantasma?.que).toBe('sena')

    await resultado.anularSena(id, usuarioId, 'Nunca llegó a transferir')
    expect(await metricas.senasAbiertas(TODO, '2026-09-15')).toEqual([])
    expect(await metricas.plataFantasma(TODO)).toEqual([])
  })

  it('el lead que carga un closer le queda a él, y lo puede volver a abrir', async () => {
    // El reporte fue «no puedo crear leads para cargar mi histórico». El lead
    // se creaba bien: quedaba sin closer, y un closer sólo ve lo suyo, así que
    // desaparecía de su lista y la ficha le contestaba «no encontrado».
    const permisos = await import('@/lib/permisos')
    const suyo = permisos.asignarAQuienCarga<Parameters<typeof leads.crearLead>[0]>(
      { tipo: 'closer', closerId: closerKevin },
      { nombre: 'Histórico de Kevin', fechaSesion: '2026-09-03' },
    )
    const id = await leads.crearLead(suyo, usuarioId)

    const comoKevin = { todo: false, usuarioId: 0, closerId: closerKevin } as const
    expect(await leads.puedeVerLead(id, comoKevin)).toBe(true)
    expect((await leads.listarLeads(comoKevin)).map((l) => l.nombre)).toContain('Histórico de Kevin')

    // Y entra a sus números, que es para lo que lo está cargando.
    expect((await metricas.metricas(rango, comoKevin)).medidas.agendadas).toBe(1)
    // Sin resultado cargado, le aparece en «reuniones que pasaron sin cargar»:
    // es justo el camino para completar un histórico.
    expect(await metricas.sinCargar(comoKevin, '2026-09-15')).toHaveLength(1)
  })

  it('el que carga un lead lo ve, aunque su cuenta no tenga figura vinculada', async () => {
    // Es la regla que evita el problema que tuvo bloqueado a un closer días
    // enteros: su figura estaba desactivada, el lead se guardaba y desaparecía
    // de su pantalla. Del otro lado eso se lee «esto no anda», y lo siguiente
    // que pasa es que se carga de nuevo y quedan duplicados que nadie ve.
    const suCuenta = await db.escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email,nombre,rol,clave_hash) values ('sin@figura.com','Sin Figura','closer','x') returning id`)
    const id = await leads.crearLead({ nombre: 'Cargado a Ciegas', fechaSesion: '2026-09-03' }, suCuenta.id)

    const comoEl = { todo: false, usuarioId: suCuenta.id, nada: true } as const
    expect(await leads.puedeVerLead(id, comoEl)).toBe(true)
    expect((await leads.listarLeads(comoEl)).map((l) => l.nombre)).toEqual(['Cargado a Ciegas'])
    // Y entra a sus números, así no carga contra una pantalla en cero.
    expect((await metricas.metricas(rango, comoEl)).medidas.agendadas).toBe(1)

    // Pero sigue sin ver lo que no es suyo.
    await leads.crearLead({ nombre: 'De Otro', closerId: closerBraian, fechaSesion: '2026-09-04' }, usuarioId)
    expect((await leads.listarLeads(comoEl)).map((l) => l.nombre)).toEqual(['Cargado a Ciegas'])
  })

  it('un closer ve lo que le asignaron Y lo que cargó él, y nada más', async () => {
    const cuentaKevin = await db.escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email,nombre,rol,clave_hash) values ('k@k.com','Kevin','closer','x') returning id`)

    // Se lo asignó dirección: no lo cargó él.
    await leads.crearLead({ nombre: 'Me lo asignaron', closerId: closerKevin, fechaSesion: '2026-09-05' }, usuarioId)
    // Lo cargó él y quedó para otro closer.
    await leads.crearLead({ nombre: 'Lo cargué para Braian', closerId: closerBraian, fechaSesion: '2026-09-06' }, cuentaKevin.id)
    // Ni de él ni cargado por él.
    await leads.crearLead({ nombre: 'Ajeno', closerId: closerBraian, fechaSesion: '2026-09-07' }, usuarioId)

    const comoKevin = { todo: false, usuarioId: cuentaKevin.id, closerId: closerKevin } as const
    expect((await leads.listarLeads(comoKevin)).map((l) => l.nombre).sort())
      .toEqual(['Lo cargué para Braian', 'Me lo asignaron'])
  })

  it('el setter que carga un lead para otro closer lo sigue viendo', async () => {
    const s = await db.escribirDevolviendo<{ id: number }>(
      `insert into setters (nombre, nombre_pleg) values ('Fabricio','fabricio') returning id`)
    const permisos = await import('@/lib/permisos')
    const suyo = permisos.asignarAQuienCarga<Parameters<typeof leads.crearLead>[0]>(
      { tipo: 'setter', setterId: s.id },
      { nombre: 'Agendado por Fabricio', closerId: closerBraian, fechaSesion: '2026-09-03' },
    )
    const id = await leads.crearLead(suyo, usuarioId)

    expect(await leads.puedeVerLead(id, { todo: false, usuarioId: 0, setterId: s.id })).toBe(true)
    expect(await leads.puedeVerLead(id, { todo: false, usuarioId: 0, closerId: closerBraian })).toBe(true)
    // Y no el closer al que no se lo asignaron.
    expect(await leads.puedeVerLead(id, { todo: false, usuarioId: 0, closerId: closerKevin })).toBe(false)
  })

  it('la migración devuelve a su dueño los leads que quedaron sueltos', async () => {
    // Los que ya se habían cargado con el error: existen, pero el closer que
    // los cargó no los ve. La migración 0008 se los devuelve usando `creado_por`,
    // que es un dato que siempre estuvo guardado.
    const { readFile } = await import('node:fs/promises')

    const kevin = await db.escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email,nombre,rol,clave_hash) values ('k@k.com','Kevin','closer','x') returning id`)
    await db.escribir('update closers set usuario_id = $1 where id = $2', [kevin.id, closerKevin],
      { esperadas: 1 })

    const suelto = await leads.crearLead({ nombre: 'Suelto', fechaSesion: '2026-09-03' }, kevin.id)
    const deDireccion = await leads.crearLead({ nombre: 'De Dirección' }, usuarioId)
    const comoKevin = { todo: false, usuarioId: 0, closerId: closerKevin } as const
    expect(await leads.puedeVerLead(suelto, comoKevin)).toBe(false)

    await db.escribir(
      await readFile('supabase/migrations/0008_leads_sin_dueno.sql', 'utf8'), [],
      { esperadas: 'cualquiera' },
    )

    expect(await leads.puedeVerLead(suelto, comoKevin)).toBe(true)
    // Y el closer inicial también, que es con el que se mide la reasignación.
    const f = await db.fila<{ closer_inicial_id: number }>(
      'select closer_inicial_id from leads where id = $1', [suelto])
    expect(f?.closer_inicial_id).toBe(closerKevin)

    // Lo que dirección dejó sin asignar a propósito no se toca: dirección ve
    // la operación entera y no perdió nada.
    const sigueSuelto = await db.fila<{ closer_id: number | null }>(
      'select closer_id from leads where id = $1', [deDireccion])
    expect(sigueSuelto?.closer_id).toBe(null)
  })

  it('los posibles duplicados dicen si son de otro o si no son de nadie', async () => {
    // Para un closer no es lo mismo: uno se pide, el otro se habla con quien
    // lo tiene. Decir «de otro» para un lead sin asignar manda a preguntarle a
    // nadie.
    await leads.crearLead({ nombre: 'Clarissa Persichini' }, usuarioId)
    await leads.crearLead({ nombre: 'Clarissa Persichini', closerId: closerBraian }, usuarioId)

    const encontrados = await leads.posiblesDuplicados({ nombre: 'clarissa persichini' })
    expect(encontrados).toHaveLength(2)
    expect(encontrados.map((d) => d.sinAsignar).sort()).toEqual([false, true])
  })

  it('la asistencia válida separa al que no calificaba, y el cierre sobre ella es otro número', async () => {
    // Cerrar 1 de 4 asistencias y cerrar 1 de 2 asistencias válidas es el mismo
    // mes: la diferencia dice si el problema es del closer o del filtro, y se
    // arreglan en lugares distintos.
    await alta('Compró').then((id) => resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 4000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId))
    await alta('Sigue').then((id) => resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'seguimiento' }, usuarioId))
    await alta('No calificaba').then((id) => resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'no_calificado' }, usuarioId))
    await alta('Tampoco').then((id) => resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'no_calificado' }, usuarioId))
    await alta('Faltó').then((id) => resultado.cargarResultado(id, { estado: 'no_show' }, usuarioId))

    const m = (await metricas.metricas(rango, TODO)).medidas
    expect(m.agendadas).toBe(5)
    expect(m.asistencias).toBe(4)
    expect(m.noCalificadas).toBe(2)
    expect(m.asistenciasValidas).toBe(2)

    expect(m.asistenciaPct).toBe(80)            // 4 de 5 agendadas
    expect(m.asistenciaValidaPct).toBe(40)      // 2 de 5 agendadas
    expect(m.noCalificadasPct).toBe(50)         // 2 de 4 asistencias
    expect(m.cierrePct).toBe(25)                // 1 de 4 asistencias
    expect(m.cierreSobreValidaPct).toBe(50)     // 1 de 2 válidas
  })

  it('las segundas llamadas se cuentan aparte de las primeras', async () => {
    await leads.crearLead({ nombre: 'Primera', closerId: closerKevin, fechaSesion: '2026-09-10' }, usuarioId)
    const b = await leads.crearLead(
      { nombre: 'Segunda B', closerId: closerKevin, fechaSesion: '2026-09-11', tipoSesion: 'segunda' }, usuarioId)
    const c = await leads.crearLead(
      { nombre: 'Segunda C', closerId: closerKevin, fechaSesion: '2026-09-12', tipoSesion: 'segunda' }, usuarioId)
    await resultado.cargarResultado(b, { estado: 'asistio' }, usuarioId)
    await resultado.cargarResultado(c, { estado: 'no_show' }, usuarioId)

    const m = (await metricas.metricas(rango, TODO)).medidas
    expect(m.segundas).toBe(2)
    expect(m.segundasAsistidas).toBe(1)
    expect(m.segundaAsistenciaPct).toBe(50)
  })

  it('el cash por reunión no se inventa cuando no hubo reuniones', async () => {
    // Dividir por cero no da cero. «USD 0 por agenda» sin agendas es un número
    // inventado, y un número inventado en un tablero se usa igual que uno real.
    const vacio = (await metricas.metricas(
      { desde: '2026-01-01', hasta: '2026-01-31', etiqueta: 'enero' }, TODO)).medidas
    expect(vacio.cashPorAgenda).toBe(null)
    expect(vacio.cashPorAsistencia).toBe(null)

    const id = await alta('María')
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 6000, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)
    await resultado.registrarPago(id, { importe: 3000, moneda: 'USD', fecha: '2026-09-12' }, usuarioId)
    await alta('No vino').then((x) => resultado.cargarResultado(x, { estado: 'no_show' }, usuarioId))

    const m = (await metricas.metricas(rango, TODO)).medidas
    expect(m.cashCollected).toBe(3000)
    expect(m.cashPorAgenda).toBe(1500)      // 3000 ÷ 2 agendadas
    expect(m.cashPorAsistencia).toBe(3000)  // 3000 ÷ 1 asistencia
  })

  it('cada medida del tablero tiene su definición escrita', async () => {
    // El tablero muestra la fórmula al pasar el mouse. Una medida sin
    // definición es una que después se discute en una reunión.
    for (const clave of ['agendadas', 'asistencias', 'asistenciasValidas', 'noCalificadas',
                         'noShows', 'cancelados', 'reagendados', 'segundas', 'segundasAsistidas',
                         'ofertas', 'senas', 'ventas', 'cierrePct', 'asistenciaValidaPct',
                         'noCalificadasPct', 'segundaAsistenciaPct', 'cierreSobreValidaPct',
                         'cierreSobreOfertaPct', 'cashCollected', 'cashPorAgenda',
                         'cashPorAsistencia', 'facturacion']) {
      expect(metricas.DEFINICIONES[clave]?.formula).toBeTruthy()
    }
  })

  it('una planilla pegada entra entera: el lead, lo que pasó, la venta y el cobro', async () => {
    // Cargar un mes de a un formulario por vez no se hace: se abandona a la
    // mitad y el tablero queda con la mitad de los datos, que es peor que con
    // ninguno porque igual se mira.
    const { leerPlanilla } = await import('@/dominio/importacion')
    const importar = await import('./importar')

    const lectura = leerPlanilla([
      'Nombre\tEmail\tFecha\tCloser\tEstado\tResultado\tImporte\tCobrado',
      'María Fernández\tmaria@ej.com\t10/09/2026\tKevin\tAsistió\tVenta\t5.000\t2.000',
      'Pedro Gómez\tpedro@ej.com\t11/09/2026\tKevin\tNo show\t\t\t',
      'Ana López\t\t12/09/2026\tKevin\tAsistió\tPerdido\t\t',
    ].join('\n'), {
      fuentes: [], funnels: [], setters: [], closers: [{ id: closerKevin, nombre: 'Kevin' }],
    })
    expect(lectura.problema).toBe(null)
    expect(lectura.filas.every((f) => f.errores.length === 0)).toBe(true)

    const reporte = await importar.importar(lectura.filas, usuarioId)
    expect(reporte.importadas).toBe(3)
    expect(reporte.fallidas).toEqual([])

    // Y quedan contados como si los hubiera cargado el closer a mano.
    const m = (await metricas.metricas(rango, TODO)).medidas
    expect(m.agendadas).toBe(3)
    expect(m.asistencias).toBe(2)
    expect(m.noShows).toBe(1)
    expect(m.ventas).toBe(1)
    expect(m.facturacion).toBe(5000)
    expect(m.cashCollected).toBe(2000)

    // Con dueño: si no, el closer que los importó no los volvería a ver.
    expect(await leads.listarLeads({ todo: false, usuarioId: 0, closerId: closerKevin })).toHaveLength(3)
  })

  it('volver a pegar la misma planilla no duplica nada', async () => {
    // Es el camino normal después de corregir tres filas, no un caso raro.
    const { leerPlanilla } = await import('@/dominio/importacion')
    const importar = await import('./importar')
    const cats = { fuentes: [], funnels: [], setters: [], closers: [{ id: closerKevin, nombre: 'Kevin' }] }
    const texto = [
      'Nombre\tEmail\tFecha\tCloser',
      'María Fernández\tmaria@ej.com\t10/09/2026\tKevin',
      'Pedro Gómez\tpedro@ej.com\t11/09/2026\tKevin',
    ].join('\n')

    await importar.importar(leerPlanilla(texto, cats).filas, usuarioId)

    const otraVez = leerPlanilla(texto, cats).filas
    const repetidas = await importar.yaCargados(otraVez)
    expect(repetidas.map((r) => r?.porque)).toEqual(['email', 'email'])
    expect(repetidas[0]?.nombre).toBe('María Fernández')

    // Y si se importan sólo las que no estaban, no entra ninguna de nuevo.
    const nuevas = otraVez.filter((_, i) => repetidas[i] === null)
    const reporte = await importar.importar(nuevas, usuarioId)
    expect(reporte.importadas).toBe(0)
    expect(await leads.listarLeads(TODO)).toHaveLength(2)
  })

  it('una fila que la planilla trae mal no arrastra a las demás', async () => {
    const { leerPlanilla } = await import('@/dominio/importacion')
    const importar = await import('./importar')
    const lectura = leerPlanilla([
      'Nombre\tFecha\tCloser\tResultado\tImporte',
      'Buena\t10/09/2026\tKevin\tVenta\t1000',
      'Mala\t31/02/2026\tKevin\t\t',
      'Sin closer\t10/09/2026\tBriann\t\t',
    ].join('\n'), {
      fuentes: [], funnels: [], setters: [], closers: [{ id: closerKevin, nombre: 'Kevin' }],
    })

    const buenas = lectura.filas.filter((f) => f.errores.length === 0)
    expect(buenas.map((f) => f.nombre)).toEqual(['Buena'])

    const reporte = await importar.importar(buenas, usuarioId)
    expect(reporte.importadas).toBe(1)
    expect((await metricas.metricas(rango, TODO)).medidas.facturacion).toBe(1000)
  })

  it('elegir «Todos» en un filtro no vacía la lista', async () => {
    // Un `<select>` con «Todos» manda `resultado=` en la URL. Eso llegaba como
    // cadena vacía y se filtraba por ella: la lista aparecía en cero y parecía
    // que no había leads. Vacío es SIN filtro.
    const id = await alta('María')
    await resultado.cargarResultado(id, { estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-10' } }, usuarioId)
    await alta('Pedro')

    expect(await leads.listarLeads(TODO)).toHaveLength(2)
    expect(await leads.listarLeads(TODO, { resultado: '' as never })).toHaveLength(2)
    expect(await leads.listarLeads(TODO, { estado: '' as never })).toHaveLength(2)
    expect(await leads.listarLeads(TODO, { closerId: '' as never })).toHaveLength(2)

    // Y un filtro de verdad sigue filtrando.
    expect((await leads.listarLeads(TODO, { resultado: 'venta' })).map((l) => l.nombre))
      .toEqual(['María'])
  })

  it('la lista de leads muestra la plata que entró, no la que se estimó', async () => {
    // La columna decía «Valor» y traía el valor POTENCIAL, incluso en un lead
    // ya vendido: una venta de 5.000 se veía como su estimación de 4.000, o
    // como «—» si nadie la había estimado. La columna no era el valor de nada.
    const vendido = await leads.crearLead(
      { nombre: 'Vendido', closerId: closerKevin, fechaSesion: '2026-09-10', valorPotencial: 4000 }, usuarioId)
    await resultado.cargarResultado(vendido, { estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-09-10' } }, usuarioId)
    await resultado.registrarPago(vendido, { importe: 2000, moneda: 'USD', fecha: '2026-09-12' }, usuarioId)

    const senado = await leads.crearLead(
      { nombre: 'Señado', closerId: closerKevin, fechaSesion: '2026-09-11' }, usuarioId)
    await resultado.cargarResultado(senado, { estado: 'asistio', resultado: 'sena',
      sena: { importe: 900, moneda: 'USD', fecha: '2026-09-11' } }, usuarioId)

    const soloEstimado = await leads.crearLead(
      { nombre: 'Estimado', closerId: closerKevin, fechaSesion: '2026-09-12', valorPotencial: 3000 }, usuarioId)

    const porNombre = Object.fromEntries(
      (await leads.listarLeads(TODO)).map((l) => [l.nombre, l]))

    expect(porNombre['Vendido']).toMatchObject({ vendido: 5000, cobrado: 2000, valorPotencial: 4000 })
    expect(porNombre['Señado']).toMatchObject({ vendido: null, senado: 900 })
    // Y el que sólo tiene estimación no inventa una venta.
    expect(porNombre['Estimado']).toMatchObject({ vendido: null, senado: null, valorPotencial: 3000 })
    expect(soloEstimado).toBeGreaterThan(0)
  })

  it('el closer elige cómo se sigue: no todo entra a los 12 toques', async () => {
    // Antes entraba todo. Un cliente que pidió que lo llamen en marzo no
    // necesita doce toques, y meterlo igual llena el pipeline de tarjetas que
    // nadie va a tocar — y un pipeline con ruido se deja de mirar.
    const enCadencia = await alta('Con cadencia')
    await resultado.cargarResultado(enCadencia, {
      estado: 'asistio', resultado: 'seguimiento', comoSigue: 'cadencia' }, usuarioId)
    expect((await seguimientos.seguimientoDelLead(enCadencia, '2026-09-15'))?.situacion).toBe('activo')

    const largo = await alta('Volver en marzo')
    await resultado.cargarResultado(largo, {
      estado: 'asistio', resultado: 'seguimiento', comoSigue: 'largo', volverEl: '2027-03-01' }, usuarioId)
    const suyo = await seguimientos.seguimientoDelLead(largo, '2026-09-15')
    expect(suyo?.situacion).toBe('largo')
    expect((await leads.verLead(largo))?.proximoContacto).toBe('2027-03-01')

    const suelto = await alta('Sin perseguir')
    await resultado.cargarResultado(suelto, {
      estado: 'asistio', resultado: 'seguimiento', comoSigue: 'ninguno' }, usuarioId)
    // Sin perseguirlo no hay tarjeta en el pipeline: ni siquiera una «fuera».
    const sinTarjeta = await seguimientos.seguimientoDelLead(suelto, '2026-09-15')
    expect(sinTarjeta === null || sinTarjeta.situacion === 'fuera').toBe(true)

    // Los tres siguen en seguimiento: lo que cambia es quién los persigue.
    for (const id of [enCadencia, largo, suelto]) {
      expect((await leads.verLead(id))?.resultado).toBe('seguimiento')
    }

    // Y sin decir nada, la cadencia: lo que se hacía siempre.
    const porDefecto = await alta('Sin elegir')
    await resultado.cargarResultado(porDefecto, { estado: 'asistio', resultado: 'seguimiento' }, usuarioId)
    expect((await seguimientos.seguimientoDelLead(porDefecto, '2026-09-15'))?.situacion).toBe('activo')
  })

  it('la venta se cuenta el mes que se firma, no el mes de la llamada', async () => {
    // Es la regla que pidió dirección: la llamada puede ser de septiembre y la
    // venta cerrarse en octubre, y recién ahí cuenta.
    const id = await alta('María')                       // reunión el 2026-09-10
    await resultado.cargarResultado(id, {
      estado: 'asistio', resultado: 'venta',
      venta: { importe: 5000, moneda: 'USD', fecha: '2026-10-03' },
    }, usuarioId)

    const octubre = { desde: '2026-10-01', hasta: '2026-10-31', etiqueta: 'octubre' }

    const sep = (await metricas.metricas(rango, TODO)).medidas
    const oct = (await metricas.metricas(octubre, TODO)).medidas

    // Septiembre tuvo la reunión y la asistencia; la venta es de octubre.
    expect(sep.agendadas).toBe(1)
    expect(sep.asistencias).toBe(1)
    expect(sep.ventasCerradas).toBe(0)
    expect(sep.facturacion).toBe(0)
    expect(oct.ventasCerradas).toBe(1)
    expect(oct.facturacion).toBe(5000)

    // Y la lista de ventas dice lo mismo que el total, con nombre y todo.
    expect(await metricas.ventasDelPeriodo(rango, TODO)).toEqual([])
    const [venta] = await metricas.ventasDelPeriodo(octubre, TODO)
    expect(venta).toMatchObject({ lead: 'María', importe: 5000, fecha: '2026-10-03', enSegunda: false })
  })

  it('una segunda llamada no es una agenda nueva, y deja escrita la primera', async () => {
    const id = await leads.crearLead(
      { nombre: 'Dos vueltas', closerId: closerKevin, fechaSesion: '2026-09-05' }, usuarioId)
    await resultado.cargarResultado(id, { estado: 'asistio', resultado: 'seguimiento' }, usuarioId)

    await resultado.agendarSegundaLlamada(id, { fecha: '2026-09-20', hora: '15:00' }, usuarioId)

    // La primera reunión quedó escrita con SU fecha: el mes no pierde su agenda.
    const suyas = await (await import('./llamadas')).llamadasDelLead(id)
    expect(suyas.map((c) => c.fecha)).toContain('2026-09-05')

    // Y el lead quedó agendado para la segunda, sin entrar a los toques.
    const lead = await leads.verLead(id)
    expect(lead?.fechaSesion).toBe('2026-09-20')
    expect(lead?.tipoSesion).toBe('segunda')
    expect(lead?.estado).toBe('agendado')
    const enPipeline = await seguimientos.seguimientoDelLead(id, '2026-09-21')
    expect(enPipeline === null || enPipeline.situacion === 'fuera').toBe(true)

    // En los números: una agenda (la primera) y una segunda llamada, aparte.
    const m = (await metricas.metricas(rango, TODO)).medidas
    expect(m.agendadas).toBe(0)      // el lead hoy es una segunda
    expect(m.segundas).toBe(1)
    expect(m.reuniones).toBe(1)
  })

  it('las reuniones que pasaron sin resultado se cuentan aparte y se pueden listar', async () => {
    await leads.crearLead(
      { nombre: 'Sin cargar', closerId: closerKevin, fechaSesion: '2026-09-01' }, usuarioId)

    const pendientes = await metricas.sinCargar(TODO, '2026-09-15')
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0]?.dias).toBe(14)
  })
})
