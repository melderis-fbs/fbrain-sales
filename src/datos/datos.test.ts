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

    const suyos = await leads.listarLeads({ todo: false, closerId: closerKevin })
    expect(suyos.map((l) => l.nombre)).toEqual(['Lead de Kevin'])

    expect(await leads.puedeVerLead(deBraian, { todo: false, closerId: closerKevin })).toBe(false)
    expect(await leads.puedeVerLead(deKevin, { todo: true })).toBe(true)

    // Sin closer ni setter asignado no se ve nada: vacío por permiso, no por
    // falta de datos.
    expect(await leads.listarLeads({ todo: false, nada: true })).toEqual([])
    expect((await metricas.metricas(rango, { todo: false, nada: true })).medidas.agendadas).toBe(0)
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
    await resultado.cargarResultado(id, { estado: 'asistio', resultado: 'seguimiento' }, usuarioId)
    const llamadas = await import('./llamadas')
    await llamadas.crearLlamada(id, { fecha: '2026-09-10' })

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

  it('las reuniones que pasaron sin resultado se cuentan aparte y se pueden listar', async () => {
    await leads.crearLead(
      { nombre: 'Sin cargar', closerId: closerKevin, fechaSesion: '2026-09-01' }, usuarioId)

    const pendientes = await metricas.sinCargar(TODO, '2026-09-15')
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0]?.dias).toBe(14)
  })
})
