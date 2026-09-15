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
  let oportunidades: typeof import('./oportunidades')
  let tablero: typeof import('./tablero')
  let cambios: typeof import('./cambios')
  let usuarioId = 0
  let closerKevin = 0
  let closerBraian = 0

  const TODO = { todo: true } as const
  const rango = { desde: '2026-09-01', hasta: '2026-09-30', etiqueta: 'test' }

  beforeAll(async () => {
    db = await import('@/lib/db')
    leads = await import('./leads')
    oportunidades = await import('./oportunidades')
    tablero = await import('./tablero')
    cambios = await import('./cambios')
  })

  beforeEach(async () => {
    await db.escribir(
      `truncate leads, oportunidades, oportunidad_participaciones, llamadas, transcripciones,
               ventas, senias, pagos, objetivos, cambios, usuarios, closers, setters,
               fuentes, funnels restart identity cascade`,
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

  it('cambiar el closer no borra ni recrea: mantiene el histórico y el closer inicial', async () => {
    const leadId = await leads.crearLead({ nombre: 'María' }, usuarioId)
    const oid = await oportunidades.crearOportunidad(
      { leadId, closerId: closerKevin, fechaAgenda: '2026-09-10' }, usuarioId)

    await oportunidades.reasignarCloser(oid, closerBraian, usuarioId, 'Reasignación manual')

    const [o] = await oportunidades.oportunidadesDelLead(leadId)
    expect(o?.id).toBe(oid)                  // la misma oportunidad, no otra
    expect(o?.closer).toBe('Braian')
    expect(o?.closerInicial).toBe('Kevin')   // el inicial no se pisa nunca

    const historia = await cambios.historialDelLead(leadId)
    const reasignacion = historia.find((h) => h.campo.endsWith('closer'))
    expect(reasignacion?.anterior).toBe('Kevin')
    expect(reasignacion?.nuevo).toBe('Braian')
    expect(reasignacion?.motivo).toBe('Reasignación manual')

    // Los dos quedan registrados como participantes: sin eso no se puede
    // atribuir el cierre más adelante.
    const participaciones = await db.filas<{ closer_id: number }>(
      'select closer_id from oportunidad_participaciones where oportunidad_id = $1', [oid])
    expect(participaciones.map((p) => p.closer_id).sort()).toEqual([closerKevin, closerBraian].sort())
  })

  it('la seña no cierra la oportunidad, no es facturación y no es cash', async () => {
    const leadId = await leads.crearLead({ nombre: 'María' }, usuarioId)
    const oid = await oportunidades.crearOportunidad(
      { leadId, closerId: closerKevin, fechaAgenda: '2026-09-10' }, usuarioId)

    await oportunidades.cargarResultado(oid, {
      estado: 'asistida', resultado: 'sena', huboOferta: true,
      sena: { importe: 500, moneda: 'USD', fecha: '2026-09-10',
              saldoPendiente: 2500, fechaComprometida: '2026-09-18' },
    }, usuarioId)

    const { tarjetas, etapas } = await tablero.numeros(rango, TODO)
    expect(tarjetas.senas).toBe(1)
    expect(tarjetas.senasImporte).toBe(500)
    expect(tarjetas.ventas).toBe(0)
    expect(tarjetas.facturacion).toBe(0)      // no es una venta
    expect(tarjetas.cashCollected).toBe(0)    // decisión: la seña no entra al cash
    expect(etapas.find((e) => e.clave === 'senas')?.cantidad).toBe(1)

    // Y sigue abierta: aparece en las señas pendientes de convertir.
    expect(await tablero.seniasAbiertas(TODO)).toHaveLength(1)
  })

  it('al convertirse, la seña pasa a ser el primer pago: el dinero se cuenta una vez', async () => {
    const leadId = await leads.crearLead({ nombre: 'María' }, usuarioId)
    const oid = await oportunidades.crearOportunidad(
      { leadId, closerId: closerKevin, fechaAgenda: '2026-09-10' }, usuarioId)

    await oportunidades.cargarResultado(oid, {
      estado: 'asistida', resultado: 'sena', huboOferta: true,
      sena: { importe: 500, moneda: 'USD', fecha: '2026-09-10' },
    }, usuarioId)

    await oportunidades.cargarResultado(oid, {
      resultado: 'venta',
      venta: { importe: 3000, moneda: 'USD', fecha: '2026-09-18' },
    }, usuarioId)

    const { tarjetas } = await tablero.numeros(rango, TODO)
    expect(tarjetas.ventas).toBe(1)
    expect(tarjetas.facturacion).toBe(3000)
    // Los 500 de la seña entraron al cash recién ahora, y una sola vez.
    expect(tarjetas.cashCollected).toBe(500)
    // La seña sigue contándose en el embudo: la etapa ocurrió.
    expect(tarjetas.senas).toBe(1)

    expect(await tablero.seniasAbiertas(TODO)).toHaveLength(0)
    const sena = await db.fila<{ estado: string }>('select estado from senias where oportunidad_id = $1', [oid])
    expect(sena?.estado).toBe('convertida')
  })

  it('el embudo y las tasas salen de los datos, no de una suma a mano', async () => {
    const leadId = await leads.crearLead({ nombre: 'Test' }, usuarioId)
    const alta = async (estado: 'asistida' | 'no_show', oferta: boolean, resultado: 'venta' | 'seguimiento') => {
      const oid = await oportunidades.crearOportunidad(
        { leadId, closerId: closerKevin, fechaAgenda: '2026-09-10' }, usuarioId)
      await oportunidades.cargarResultado(oid, {
        estado, resultado, huboOferta: oferta,
        ...(resultado === 'venta'
          ? { venta: { importe: 1000, moneda: 'USD', fecha: '2026-09-10' } } : {}),
      }, usuarioId)
    }
    await alta('asistida', true, 'venta')
    await alta('asistida', true, 'seguimiento')
    await alta('asistida', false, 'seguimiento')
    await alta('no_show', false, 'seguimiento')

    const { tarjetas, etapas } = await tablero.numeros(rango, TODO)
    expect(tarjetas.agendadas).toBe(4)
    expect(tarjetas.asistencias).toBe(3)
    expect(tarjetas.asistenciaPct).toBe(75)
    expect(tarjetas.ofertas).toBe(2)
    expect(tarjetas.cierrePct).toBe(33.3)     // 1 venta sobre 3 asistencias
    expect(etapas.find((e) => e.clave === 'asistidas')?.paso).toBe(75)
  })

  it('un closer sólo ve sus oportunidades; un setter, sus leads', async () => {
    const deKevin = await leads.crearLead({ nombre: 'Lead de Kevin' }, usuarioId)
    await oportunidades.crearOportunidad({ leadId: deKevin, closerId: closerKevin, fechaAgenda: '2026-09-10' }, usuarioId)
    const deBraian = await leads.crearLead({ nombre: 'Lead de Braian' }, usuarioId)
    await oportunidades.crearOportunidad({ leadId: deBraian, closerId: closerBraian, fechaAgenda: '2026-09-10' }, usuarioId)

    const suyos = await leads.listarLeads({ todo: false, closerId: closerKevin })
    expect(suyos.map((l) => l.nombre)).toEqual(['Lead de Kevin'])

    expect(await leads.puedeVerLead(deBraian, { todo: false, closerId: closerKevin })).toBe(false)
    expect(await leads.puedeVerLead(deBraian, { todo: true })).toBe(true)

    // Sin closer ni setter asignado no se ve nada: vacío por permiso, no por
    // falta de datos.
    expect(await leads.listarLeads({ todo: false, nada: true })).toEqual([])
    expect((await tablero.numeros(rango, { todo: false, nada: true })).tarjetas.agendadas).toBe(0)
  })

  it('una escritura que no toca las filas que declaró, rompe', async () => {
    await expect(
      db.escribir('update leads set nombre = $1 where id = 999999', ['x']),
    ).rejects.toThrow(db.ErrorDeEscritura)
  })

  it('los importes en otra moneda no se suman con el total: se informan aparte', async () => {
    const leadId = await leads.crearLead({ nombre: 'Test' }, usuarioId)
    const oid = await oportunidades.crearOportunidad({ leadId, fechaAgenda: '2026-09-10' }, usuarioId)
    await oportunidades.cargarResultado(oid, {
      estado: 'asistida', resultado: 'venta',
      venta: { importe: 1_500_000, moneda: 'ARS', fecha: '2026-09-11' },
    }, usuarioId)

    const { tarjetas } = await tablero.numeros(rango, TODO, {}, 'USD')
    expect(tarjetas.facturacion).toBe(0)
    expect(tarjetas.otrasMonedas).toContainEqual({ moneda: 'ARS', importe: 1_500_000 })
  })

  it('los seguimientos vencidos son los que ya pasaron y siguen abiertos', async () => {
    const leadId = await leads.crearLead({ nombre: 'María' }, usuarioId)
    const oid = await oportunidades.crearOportunidad(
      { leadId, closerId: closerKevin, fechaAgenda: '2026-09-01' }, usuarioId)
    await oportunidades.cargarResultado(oid, {
      estado: 'asistida', resultado: 'seguimiento', proximoContacto: '2026-09-05',
    }, usuarioId)

    const vencidos = await tablero.seguimientosVencidos('2026-09-15', TODO)
    expect(vencidos).toHaveLength(1)
    expect(vencidos[0]?.diasVencido).toBe(10)

    // Una oportunidad cerrada deja de figurar aunque tenga fecha pasada.
    await oportunidades.cargarResultado(oid, { resultado: 'perdida' }, usuarioId)
    expect(await tablero.seguimientosVencidos('2026-09-15', TODO)).toHaveLength(0)
  })
})
