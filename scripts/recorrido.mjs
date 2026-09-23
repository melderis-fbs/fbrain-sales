/**
 * El recorrido: la aplicación entera manejada por un navegador de verdad.
 *
 * Las pruebas de `npm test` verifican las reglas; esto verifica que las
 * pantallas hagan lo que dicen. Corre contra un servidor ya levantado:
 *
 *   npm run build
 *   DATABASE_URL=... npm start &
 *   npm run recorrido
 *
 * Escribe en la base a la que apunte ese servidor, así que no lo corras contra
 * la base de trabajo.
 */
import { chromium } from 'playwright'

const RAIZ = process.env.RECORRIDO_URL ?? 'http://localhost:3000'

/**
 * Cada corrida usa nombres y teléfonos propios.
 *
 * El recorrido escribe de verdad, así que sin esto la segunda corrida choca
 * contra el aviso de duplicado de la primera y falla por el motivo equivocado.
 */
const marca = String(Date.now()).slice(-6)
const TELEFONO = `11 5${marca}1`
const CLIENTA = `María Fernández ${marca}`
const OTRO = `Pedro Gómez ${marca}`

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1440, height: 950 } })
const fallos = []
p.on('pageerror', (e) => fallos.push(`pageerror: ${e.message}`))
p.on('response', (r) => { if (r.status() >= 500) fallos.push(`${r.status()} ${r.url()}`) })

const paso = async (n, f) => { console.log(`\n▶ ${n}`); await f() }

/**
 * Hoy, como lo cuenta la aplicación.
 *
 * `toISOString()` da la fecha UTC, y a partir de las 21 de Argentina eso ya es
 * mañana. El recorrido agendaba reuniones «de hoy» para el día siguiente y
 * fallaba pasos que no tenían nada roto. La aplicación cuenta el día en
 * Argentina, así que el recorrido también.
 */
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

/**
 * Los selectores van SIEMPRE dentro de `.contenido`.
 *
 * La barra lateral tiene el botón de Salir y es lo primero del DOM, así que un
 * `form button[type=submit]` a secas cierra la sesión y después todo falla
 * diciendo que no encuentra un campo. Ya pasó una vez.
 */
const enLaPantalla = (sel) => `.contenido ${sel}`
const foto = (n) => p.screenshot({ path: `/tmp/fsos-${n}.png`, fullPage: true })
const esperar = () => p.waitForLoadState('networkidle')

/**
 * Esperar un ESTADO, no la red.
 *
 * Después de una acción de servidor, Next revalida y React vuelve a dibujar; el
 * tráfico queda quieto un instante antes de que eso pase. Esperar «networkidle»
 * y mirar el DOM enseguida da falsos negativos que no le pasan a nadie usando
 * la aplicación.
 */
const esperarCuantos = async (selector, cuantos, ms = 5000) => {
  try {
    await p.waitForFunction(
      ([sel, n]) => document.querySelectorAll(sel).length === n,
      [selector, cuantos], { timeout: ms },
    )
  } catch { /* que lo diga la comprobación, con su mensaje */ }
}

const comprobar = (condicion, mensaje) => {
  if (condicion) console.log(`  ✓ ${mensaje}`)
  else { fallos.push(mensaje); console.log(`  ✗ ${mensaje}`) }
}

await paso('entrar', async () => {
  await p.goto(`${RAIZ}/login`)
  await p.fill('#email', 'admin@foundersbs.com')
  await p.fill('#clave', 'clave123')
  await p.click('form:has(#clave) button[type=submit]')
  await p.waitForURL('**/dashboard')
  comprobar(p.url().includes('/dashboard'), 'dirección abre en el Dashboard')
})

await paso('configuración: closers, setter, fuente y objetivo', async () => {
  await p.goto(`${RAIZ}/configuracion`)
  const alta = '.contenido .tarjeta:has-text("Dar de alta a alguien")'
  for (const [nombre, funcion] of [['Kevin', 'closer'], ['Braian', 'closer'], ['Fabricio', 'setter']]) {
    await p.fill(`${alta} #nombre`, nombre)
    await p.selectOption(`${alta} #funcion`, funcion)
    await p.uncheck(`${alta} input[name=entra]`)
    await p.click(`${alta} button[type=submit]`)
    await esperar()
  }

  await p.fill('.contenido .tarjeta:has-text("Fuentes") input[name=nombre]', 'Meta Ads')
  await p.click('.contenido .tarjeta:has-text("Fuentes") button[type=submit]')
  await esperar()

  await p.fill('#o-valor', '160000')
  await p.click('.contenido form:has(#o-valor) button[type=submit]')
  await esperar()
  await p.reload()

  comprobar(await p.locator('.contenido .tarjeta:has-text("El equipo") tbody tr').count() >= 3,
            'el equipo quedó cargado')
  comprobar(await p.locator('.contenido .tarjeta:has-text("Objetivos") tbody tr').count() >= 1,
            'el objetivo quedó cargado')
  comprobar(await p.locator('.contenido .tarjeta:has-text("cadencia") tbody tr').count() === 12,
            'la cadencia tiene sus 12 toques y es editable')
  await foto('configuracion')
})

let leadId = null

await paso('registrar un lead con lo mínimo', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', CLIENTA)
  await p.fill('#email', `maria${marca}@ejemplo.com`)
  await p.fill('#telefono', `+54 9 ${TELEFONO}`)
  await p.fill('#empresa', 'Estudio Fernández')
  await p.selectOption('#closerId', { label: 'Kevin' })
  await p.selectOption('#setterId', { label: 'Fabricio' })
  await p.selectOption('#fuenteId', { label: 'Meta Ads' })
  const hoy = HOY
  await p.fill('#fechaSesion', hoy)
  await p.fill('#valorPotencial', '4000')
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  leadId = p.url().match(/leads\/(\d+)/)?.[1]
  comprobar(leadId !== null, `la ficha del lead abrió (id ${leadId})`)
  await foto('ficha-resumen')
})

await paso('el aviso de duplicado no deja crear a ciegas', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', 'Otra Persona')
  await p.fill('#telefono', TELEFONO)   // el mismo, sin el código de país
  await p.click(enLaPantalla('form button[type=submit]'))
  await esperar()
  comprobar(await p.locator('.aviso.atencion').count() > 0,
            'avisa del duplicado por la cola del teléfono, y no crea')
  comprobar(await p.locator('.aviso.atencion:has-text("mismo teléfono")').count() > 0,
            'y dice por qué sospecha')
  comprobar(await p.inputValue('#nombre') === 'Otra Persona',
            'lo escrito no se perdió al volver el aviso')
  await foto('duplicado')
})

await paso('el setter completa la calificación y sale el Lead Quality', async () => {
  await p.goto(`${RAIZ}/leads/${leadId}?pestana=calificacion`)
  await p.selectOption('#capacidad_inversion', 'si')
  await p.selectOption('#es_decisor', 'si')
  await p.selectOption('#urgencia', '4')
  await p.selectOption('#facturacion_mensual', '5k_15k')
  await p.selectOption('#tiene_clientes', 'recurrentes')
  await p.selectOption('#oferta_definida', 'difusa')
  await p.selectOption('#conciencia', 'busca')
  await p.selectOption('#interes', 'alto')
  await p.fill('#problema', 'No tiene un sistema de captación y vive de referidos.')
  await p.click(enLaPantalla('form button[type=submit]'))
  await esperar()
  const aviso = await p.locator('.aviso.dato').first().textContent()
  comprobar(/Lead Quality \d+/.test(aviso ?? ''), `el quality salió: ${aviso?.trim()}`)

  await p.goto(`${RAIZ}/leads/${leadId}`)
  comprobar((await p.locator('.cabecera-ficha').textContent())?.includes('Lead Quality'),
            'y el número queda en la cabecera de la ficha')
  comprobar((await p.locator('.contenido .tarjeta:has-text("Lo que averiguó el setter")').textContent())
              ?.includes('Sí, sin problema'),
            'con el detalle de lo que contestó, para leerlo antes de la llamada')
  await foto('calificacion')
})

/** El número grande de una tarjeta del tablero, como número. */
const tarjeta = async (etiqueta) => {
  const texto = await p.locator(`.contenido .tarjeta:has-text("${etiqueta}") .numero`).first().textContent()
  return Number((texto ?? '0').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
}

const antesDeLaSena = await (async () => {
  await p.goto(`${RAIZ}/dashboard`)
  return { senas: await tarjeta('Señas'), facturacion: await tarjeta('Facturación') }
})()

await paso('el closer carga el resultado: seña', async () => {
  const hoy = HOY
  await p.goto(`${RAIZ}/leads/${leadId}?pestana=resultado`)
  await p.selectOption('#estado', 'asistio')
  await p.selectOption('#salida', 'sena')
  await p.check('input[name=huboOferta]')
  await p.fill('#importe', '500')
  await p.fill('#fecha', hoy)
  await p.fill('#saldoPendiente', '3500')
  await p.click(enLaPantalla('form:has(#salida) button[type=submit]'))
  await esperar()

  await p.goto(`${RAIZ}/dashboard`)
  comprobar(await tarjeta('Señas') === antesDeLaSena.senas + 1, 'la seña aparece en su tarjeta')
  comprobar(await tarjeta('Facturación') === antesDeLaSena.facturacion,
            'y NO entra a facturación')
  await foto('dashboard-sena')
})

await paso('la ficha pregunta sólo lo del resultado que se eligió', async () => {
  // Mostrar los cinco bloques a la vez era lo que hacía que quien carga un
  // lead perdido tuviera que decidir cuáles de los catorce campos eran suyos.
  await p.goto(`${RAIZ}/leads/${leadId}?pestana=resultado`)
  const cuantos = async (sel) => p.locator(`.contenido form:has(#salida) ${sel}`).count()

  await p.selectOption('#salida', 'perdida')
  comprobar(await cuantos('#motivoPerdida') === 1, 'perdido pide el motivo')
  comprobar(await cuantos('#importe') === 0, 'y no pide un importe que no existe')

  await p.selectOption('#salida', 'venta')
  comprobar(await cuantos('#importe') === 1 && await cuantos('#cuotas') === 1,
            'la venta pide monto y cuotas')
  comprobar(await cuantos('#motivoPerdida') === 0, 'y ya no pregunta por qué se perdió')
  comprobar(await p.locator('#programa option').count() === 3,
            'el programa es GROWTH o ELITE, no texto libre')

  // Las cuotas dibujan el plan de pagos: una fila por cuota, con su fecha.
  comprobar(await cuantos('#c1i') === 1 && await cuantos('#c2i') === 0,
            'con un pago hay un solo bloque de cobro')
  await p.selectOption('#cuotas', '3')
  comprobar(await cuantos('#c1i') === 1 && await cuantos('#c2i') === 1 && await cuantos('#c3i') === 1,
            'al poner tres cuotas aparecen las tres, con monto y fecha')
  comprobar(await cuantos('#c2f') === 1 && await cuantos('#c2m') === 1 && await cuantos('#c2p') === 1,
            'cada una con su fecha, su método y si ya entró')
  await p.selectOption('#cuotas', '1')
  comprobar(await cuantos('#c3i') === 0, 'y al volver a un pago, las otras se van')

  await p.selectOption('#salida', 'segunda')
  comprobar(await cuantos('#fechaSegunda') === 1, 'la segunda llamada pide su fecha')
  comprobar(await cuantos('#importe') === 0, 'y nada de plata')

  await p.selectOption('#salida', 'seguimiento_largo')
  comprobar(await cuantos('#volverEl') === 1, 'el seguimiento largo pide cuándo volver')

  // Y lo que se pregunta siempre, se pregunta siempre.
  for (const cual of ['venta', 'sena', 'perdida', 'seguimiento_cadencia']) {
    await p.selectOption('#salida', cual)
    comprobar(await cuantos('#estado') === 1 && await cuantos('input[name=huboOferta]') === 1
              && await cuantos('#proximoPaso') === 1,
              `con «${cual}» siguen estando la asistencia, la oferta y los pasos a seguir`)
  }
  await foto('ficha-resultado')
})

await paso('convertir la seña: el dinero se cuenta una vez', async () => {
  const hoy = HOY
  await p.goto(`${RAIZ}/leads/${leadId}?pestana=resultado`)
  await p.selectOption('#salida', 'venta')
  await p.fill('#importe', '4000')
  await p.fill('#fecha', hoy)
  await p.selectOption('#programa', 'ELITE')
  await p.click(enLaPantalla('form:has(#salida) button[type=submit]'))
  await esperar()

  await p.goto(`${RAIZ}/leads/${leadId}`)
  const texto = await p.locator('.tarjeta:has-text("La plata")').textContent()
  comprobar(texto?.includes('4.000') || texto?.includes('4000'), 'la venta quedó cargada')
  comprobar(texto?.includes('500'), 'y la seña entró como el primer cobro, una sola vez')
  comprobar((await p.locator('.aviso:has-text("ya se convirtió")').count()) > 0,
            'la ficha lo explica en vez de dejar el número suelto')
  await foto('ficha-venta')
})

await paso('el cierre no puede pasar de 100%', async () => {
  await p.goto(`${RAIZ}/dashboard`)
  // La tasa de cierre sale de la cohorte de reuniones del período; las ventas
  // de al lado se cuentan por fecha de venta y son otro universo. Por eso el
  // porcentaje se mide acá y no en la tarjeta de Ventas.
  const cierre = await p.locator('.tarjeta:has-text("Tasa de cierre") .numero').first().textContent()
  const pct = Number((cierre ?? '').match(/([\d.]+)/)?.[1] ?? '0')
  comprobar(pct <= 100, `el cierre es ${pct}% · nunca más de 100 porque sale del mismo universo`)
  const ventas = await p.locator('.tarjeta:has-text("Ventas") .etiqueta').first().textContent()
  comprobar(ventas?.includes('Ventas'), 'y las ventas del período están al lado, por fecha de venta')
})

await paso('un lead en seguimiento entra solo al pipeline', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', OTRO)
  await p.selectOption('#closerId', { label: 'Braian' })
  await p.fill('#fechaSesion', HOY)
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  const otro = p.url().match(/leads\/(\d+)/)?.[1]

  await p.goto(`${RAIZ}/leads/${otro}?pestana=resultado`)
  await p.selectOption('#estado', 'asistio')
  await p.selectOption('#salida', 'seguimiento_cadencia')
  await p.click(enLaPantalla('form:has(#salida) button[type=submit]'))
  await esperar()

  await p.goto(`${RAIZ}/seguimientos`)
  comprobar(await p.locator(`.contenido .ficha:has-text("${OTRO}")`).count() === 1,
            'apareció en el pipeline sin que nadie lo agregue a mano')
  comprobar(await p.locator('.contenido .pista .nodo').count() === 12,
            'la pista dibuja los doce toques')

  const suya = () => p.locator(`.contenido .ficha:has-text("${OTRO}")`)
  const progresoDe = async () => ({
    hechos: await suya().locator('.progreso i.hecho').count(),
    actual: await suya().locator('.progreso i.actual').count(),
    total: await suya().locator('.progreso i').count(),
  })

  const antesDelToque = await progresoDe()
  comprobar(antesDelToque.total === 12 && antesDelToque.hechos === 0 && antesDelToque.actual === 1,
            'la tarjeta muestra el progreso sobre los 12 pasos, en el primero')
  comprobar((await suya().textContent())?.includes('Toque 1 de 12'),
            'y dice en qué toque va')

  await paso('registrar el toque mueve el progreso de la tarjeta', async () => {
    await suya().locator('select[name=estado]').selectOption('no_contesto')
    await suya().locator('button[type=submit]').click()
    await esperar()
    await p.waitForFunction(
      (nombre) => {
        const fichas = [...document.querySelectorAll('.contenido .ficha')]
        const f = fichas.find((x) => x.textContent?.includes(nombre))
        return f !== undefined && f.querySelectorAll('.progreso i.hecho').length === 1
      },
      OTRO, { timeout: 5000 },
    ).catch(() => {})
    const despues = await progresoDe()
    comprobar(despues.hechos === 1 && despues.actual === 1,
              'el paso 1 quedó marcado como hecho y el actual pasó al 2')
    comprobar((await suya().textContent())?.includes('Toque 2 de 12'),
              'y la tarjeta lo dice')
    await foto('pipeline')
  })

  await paso('«no interesado» lo saca del pipeline y cierra el lead', async () => {
    await suya().locator('select[name=estado]').selectOption('no_interesado')
    await suya().locator('button[type=submit]').click()
    await esperar()
    // `:has-text()` es de Playwright, no de querySelectorAll: acá se filtra
    // por el texto a mano.
    await p.waitForFunction(
      (nombre) => ![...document.querySelectorAll('.contenido .ficha')]
        .some((f) => f.textContent?.includes(nombre)),
      OTRO, { timeout: 5000 },
    ).catch(() => {})
    comprobar(await p.locator(`.contenido .tanda .ficha:has-text("${OTRO}")`).count() === 0,
              'dejó de ocupar lugar entre las tarjetas')
    comprobar(await p.locator(`.tarjeta:has-text("Fuera del pipeline") tr:has-text("${OTRO}")`).count() === 1,
              'y quedó listado por si hay que volver a meterlo')
  })
})

await paso('un lead sin fecha no desaparece: el Tracker lo reclama', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', `Sin Fecha ${marca}`)
  await p.selectOption('#closerId', { label: 'Kevin' })
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)

  await p.goto(`${RAIZ}/tracker`)
  comprobar(await p.locator('.contenido .tarjeta:has-text("Sin fecha de reunión")').count() > 0,
            'aparece en «Sin fecha de reunión», en vez de no estar en ningún lado')

  const fila = p.locator(`.contenido tr:has-text("Sin Fecha ${marca}")`)
  await fila.locator('input[type=date]').fill(HOY)
  await fila.locator('button[type=submit]').click()
  await esperar()
  await esperarCuantos('.tarjeta .tabla-carga tr', 0, 3000)
  comprobar(await p.locator('.contenido .tarjeta:has-text("Sin fecha de reunión")').count() === 0,
            'al ponerle fecha entra al Tracker y deja de reclamarse')
})

await paso('el closer carga el resultado sin salir del Tracker', async () => {
  await p.goto(`${RAIZ}/tracker`)
  const carga = p.locator('.contenido .tarjeta:has-text("Hoy")').first()
  comprobar(await carga.locator('.cita').count() > 0,
            'el Tracker abre con la agenda del día y se carga desde ahí')

  const fila = carga.locator(`.cita:has-text("Sin Fecha ${marca}")`)
  await fila.locator('select[name=estado]').selectOption('asistio')
  await fila.locator('select[name=resultado]').selectOption('venta')
  // El importe aparece SOLO cuando hace falta: es la prueba de que el
  // formulario no pide catorce campos para cargar un no-show.
  comprobar(await fila.locator('input[name=importe]').count() === 1,
            'al elegir «venta» aparece el importe, y sólo entonces')
  await fila.locator('input[name=importe]').fill('2500')
  await fila.locator('button[type=submit]').click()
  await esperar()
  await p.waitForTimeout(900)

  await p.goto(`${RAIZ}/leads`)
  const estado = await p.locator(`.contenido tr:has-text("Sin Fecha ${marca}")`).textContent()
  comprobar((estado ?? '').includes('Venta'), 'quedó cargado como venta sin abrir la ficha')
  await foto('tracker-carga')
})

/** El valor de una fila de las listas de métricas, por su etiqueta EXACTA. */
const miniValor = (etiqueta) => p.evaluate((e) => {
  const fila = [...document.querySelectorAll('.contenido .lista-metrica tr')].find((tr) => {
    const th = tr.querySelector('th')?.cloneNode(true)
    th?.querySelector('.sobre')?.remove()
    return th?.textContent?.trim() === e
  })
  return fila?.querySelector('td')?.textContent?.trim() ?? null
}, etiqueta)

await paso('el Tracker y el Dashboard dicen lo mismo del mismo mes', async () => {
  await p.goto(`${RAIZ}/dashboard?periodo=mes`)
  const dash = await p.locator('.tarjeta:has-text("Asistencias") .numero').first().textContent()
  await p.goto(`${RAIZ}/tracker?periodo=mes`)
  const track = await miniValor('Asistencias')
  comprobar(dash?.trim() === track,
            `asistencias: Dashboard ${dash?.trim()} · Tracker ${track}`)
  await foto('tracker')
})

await paso('el mini tablero del Tracker trae las medidas que pidió el equipo', async () => {
  await p.goto(`${RAIZ}/tracker?periodo=mes`)
  const pedidas = [
    // Métricas
    'Llamadas agendadas', 'Asistencias', 'Asistencias válidas', 'No calificadas', 'No show',
    'Canceladas', 'Reagendadas', 'Segundas llamadas', 'Asistencia a segunda', 'Ofertas hechas',
    'Reservas', 'Cierres', 'Ventas cerradas', 'Facturación',
    'Cash collected', 'Cash por agenda', 'Cash por asistencia',
    // Conversión
    'Asistencia', 'Asistencia válida', 'Canceladas', 'Asistencia a segunda', 'Ofertas hechas',
    'Cierre / asistencia', 'Cierre / asistencia válida', 'Cierre / oferta',
  ]
  const faltan = []
  for (const etiqueta of pedidas) if ((await miniValor(etiqueta)) === null) faltan.push(etiqueta)
  comprobar(faltan.length === 0, `están las ${pedidas.length} medidas en las dos listas${faltan.length ? `; faltan: ${faltan.join(', ')}` : ''}`)

  // Ningún porcentaje va solo: al lado dice sobre qué se calcula, que es lo
  // que separa «28%» de «28% sobre asistencias».
  const sinContra = await p.evaluate(() => {
    const listas = document.querySelectorAll('.contenido .dos-listas > div')
    const conversiones = listas[listas.length - 1]
    return [...(conversiones?.querySelectorAll('.lista-metrica tr') ?? [])]
      .filter((tr) => !tr.querySelector('.sobre')).length
  })
  comprobar(sinContra === 0, 'ningún porcentaje va solo: todos dicen sobre qué se calculan')

  // Y el cierre sobre asistencia válida no puede ser menor que el cierre sobre
  // asistencia: las válidas son un subconjunto.
  // Los porcentajes salen en formato local: «66,7%». Leerlos con Number() a
  // secas da NaN, y una comprobación que falla por eso no comprueba nada.
  const aPct = (t) => (t === null || t === 'sin datos' ? null
    : Number(t.replace('%', '').replace(/\./g, '').replace(',', '.')))
  const sobreAsistencia = aPct(await miniValor('Cierre / asistencia'))
  const sobreValida = aPct(await miniValor('Cierre / asistencia válida'))
  comprobar(sobreAsistencia === null || sobreValida === null || sobreValida >= sobreAsistencia,
            `el cierre sobre asistencia válida (${sobreValida}%) no puede ser menor que sobre asistencia (${sobreAsistencia}%)`)
  await foto('tablero')
})

await paso('las demás pantallas abren sin romperse', async () => {
  for (const ruta of ['/leads', '/closers', '/setters', '/llamadas',
                      '/analizador', '/analizador?pestana=rubrica', '/analizador?pestana=playbooks',
                      '/metricas', '/matching', '/matching?por=industria', '/matching?por=fuente',
                      '/casos', '/comisiones', '/leads?sinfecha=1',
                      `/leads/${leadId}?pestana=llamadas`,
                      `/leads/${leadId}?pestana=notas`, `/leads/${leadId}?pestana=datos`,
                      `/leads/${leadId}?pestana=historial`, `/leads/${leadId}?pestana=seguimiento`]) {
    const r = await p.goto(`${RAIZ}${ruta}`)
    comprobar(r?.status() === 200, `${ruta} → ${r?.status()}`)
  }
  await p.goto(`${RAIZ}/closers`)
  await foto('closers')
  await p.goto(`${RAIZ}/analizador?pestana=rubrica`)
  await foto('rubrica')
  await p.goto(`${RAIZ}/metricas`)
  await foto('metricas')
  await p.goto(`${RAIZ}/matching`)
  await foto('matching')
  await p.goto(`${RAIZ}/comisiones`)
  await foto('comisiones')
})

await paso('el closer carga con un toque desde la ficha', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', `Un Toque ${marca}`)
  await p.selectOption('#closerId', { label: 'Kevin' })
  await p.fill('#fechaSesion', HOY)
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  const unToque = p.url().match(/leads\/(\d+)/)?.[1]

  comprobar(await p.locator('.contenido .acciones-closer').count() === 1,
            'la ficha abre con la acción del closer a la vista')
  comprobar(await p.locator('.contenido .botonera .accion').count() === 6,
            'con los seis resultados posibles, incluida la segunda llamada')
  comprobar(await p.locator('.contenido .botonera .accion:has-text("Segunda llamada")').count() === 1,
            'y «Segunda llamada» es uno de ellos')

  // «No Show» no necesita nada más: un toque y queda cargado.
  await p.locator('.contenido .botonera .accion:has-text("No Show")').click()
  await p.locator('.contenido .confirmar button[type=submit]').click()
  await esperar()
  await p.waitForTimeout(700)
  comprobar((await p.locator('.cabecera-ficha').textContent())?.includes('No show'),
            'No Show se carga con un toque, sin pedir nada')

  // La venta sí pide el importe, y sólo el importe.
  await p.goto(`${RAIZ}/leads/${unToque}`)
  await p.locator('.contenido .botonera .accion:has-text("Venta")').click()
  comprobar(await p.locator('.contenido .confirmar input[name=importe]').count() === 1,
            'al elegir Venta pide el importe')
  comprobar(await p.locator('.contenido .confirmar select[name=motivoPerdida]').count() === 0,
            'y no pide el motivo de pérdida, que no viene al caso')
  await p.fill('.contenido .confirmar input[name=importe]', '3500')
  await p.locator('.contenido .confirmar button[type=submit]').click()
  await esperar()
  await p.waitForTimeout(700)
  comprobar((await p.locator('.cabecera-ficha').textContent())?.includes('Venta'),
            'y la venta queda cargada desde la misma pantalla')
  await foto('ficha-lead')

  // Perdido pide el motivo: sin él, el número de «por qué se pierde» no existe.
  await p.goto(`${RAIZ}/leads/${unToque}`)
  await p.locator('.contenido .botonera .accion:has-text("Perdido")').click()
  comprobar(await p.locator('.contenido .confirmar select[name=motivoPerdida]').count() === 1,
            'al elegir Perdido pide el motivo')
})

await paso('desde Mis Llamadas se entra a la ficha del lead', async () => {
  await p.goto(`${RAIZ}/llamadas`)
  comprobar((await p.locator('.contenido h1').textContent())?.includes('Mis llamadas'),
            'Llamadas es la pantalla del closer')
  comprobar(await p.locator('.contenido .tarjeta:has-text("Call score")').count() === 1,
            'con el resumen de cómo le fue')
  const primera = p.locator(`.contenido table a:has-text("Un Toque ${marca}")`).first()
  await primera.click()
  await p.waitForURL(/leads\/\d+/)
  comprobar(await p.locator('.contenido .acciones-closer').count() === 1,
            'y tocar el nombre abre la ficha con las acciones')
  comprobar((await p.locator('.contenido .volver').textContent())?.includes('Volver a Llamadas'),
            'con el camino de vuelta a donde estaba')
  // Subir una transcripción no tiene que obligar a «registrar la llamada»
  // antes: si la reunión está cargada, la llamada existió.
  await p.goto(`${RAIZ}/llamadas`)
  const subir = p.locator('.contenido table form button:has-text("Subir")').first()
  if (await subir.count() > 0) {
    await subir.click()
    await p.waitForURL(/analizador\/\d+/, { timeout: 10000 }).catch(() => {})
    comprobar(/analizador\/\d+/.test(p.url()),
              'el botón Subir crea la llamada sola y abre la transcripción')
    comprobar(await p.locator('.contenido textarea[name=texto]').count() === 1,
              'con el campo para pegarla')
  }
  await foto('mis-llamadas')
})

await paso('dar de baja un lead lo saca de las listas, y se puede volver a poner', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', `Duplicado ${marca}`)
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  const duplicado = p.url().match(/leads\/(\d+)/)?.[1]

  await p.goto(`${RAIZ}/leads/${duplicado}?pestana=datos`)
  await p.locator('.contenido button:has-text("Dar de baja este lead")').click()
  comprobar(await p.locator('.contenido #motivo-baja').count() === 1,
            'pide el motivo antes de dar de baja')
  await p.fill('.contenido #motivo-baja', 'Cargado dos veces')
  await p.locator('.contenido button:has-text("Sí, dar de baja")').click()
  await p.waitForURL(/leads\?baja=1/, { timeout: 10000 }).catch(() => {})

  await p.goto(`${RAIZ}/leads`)
  comprobar(!(await p.locator('.contenido table').textContent())?.includes(`Duplicado ${marca}`),
            'sale de la lista de activos')

  await p.goto(`${RAIZ}/leads?baja=1`)
  const enBajas = await p.locator(`.contenido tr:has-text("Duplicado ${marca}")`).textContent()
  comprobar((enBajas ?? '').includes('Cargado dos veces'),
            'y queda en «dados de baja» con quién y por qué')

  await p.locator(`.contenido tr:has-text("Duplicado ${marca}") button:has-text("Volver a ponerlo")`).click()
  await esperar()
  await p.waitForTimeout(800)
  await p.goto(`${RAIZ}/leads`)
  comprobar((await p.locator('.contenido table').textContent())?.includes(`Duplicado ${marca}`),
            'y dirección lo puede volver a poner en juego')
  await foto('bajas')
})

await paso('un lead con una venta no se da de baja a la ligera', async () => {
  await p.goto(`${RAIZ}/leads/${leadId}?pestana=datos`)
  const aviso = await p.locator('.contenido .tarjeta:has-text("Dar de baja")').textContent()
  comprobar((aviso ?? '').includes('venta cargada'),
            'avisa que tiene una venta y que la baja la saca de los números')
})

await paso('una venta cargada por error se puede sacar de la facturación', async () => {
  // El error que estuvo vivo: corregir el resultado a «Perdido» sacaba el lead
  // del embudo pero dejaba la plata contando en la facturación del mes.
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', `Venta Mal Cargada ${marca}`)
  await p.selectOption('#closerId', { label: 'Kevin' })
  await p.fill('#fechaSesion', HOY)
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  const errada = p.url().match(/leads\/(\d+)/)?.[1]

  await p.locator('.contenido .botonera .accion:has-text("Venta")').click()
  await p.fill('.contenido .confirmar input[name=importe]', '9900')
  await p.locator('.contenido .confirmar button[type=submit]').click()
  await esperar()
  await p.waitForTimeout(700)

  // El closer se da cuenta y corrige el resultado.
  await p.goto(`${RAIZ}/leads/${errada}`)
  await p.locator('.contenido .botonera .accion:has-text("Perdido")').click()
  await p.selectOption('.contenido .confirmar select[name=motivoPerdida]', 'precio')
  await p.locator('.contenido .confirmar button[type=submit]').click()
  await esperar()
  await p.waitForTimeout(700)

  await p.goto(`${RAIZ}/leads/${errada}`)
  const alerta = await p.locator('.contenido .aviso.problema').first().textContent()
  comprobar((alerta ?? '').includes('9.900') || (alerta ?? '').includes('9900'),
            'la ficha avisa que la plata contradice el resultado, y dice cuánta')

  await p.goto(`${RAIZ}/dashboard`)
  comprobar((await p.locator('.contenido').textContent())?.includes(`Venta Mal Cargada ${marca}`),
            'y el Dashboard lo nombra en vez de dejar el número inflado en silencio')
  await foto('plata-que-no-cuadra')

  await p.goto(`${RAIZ}/leads/${errada}`)
  await p.locator('.contenido .aviso.problema button:has-text("Anular la venta")').click()
  comprobar(await p.locator('.contenido #motivo-anular').count() === 1,
            'pide el motivo antes de anular')
  await p.fill('.contenido #motivo-anular', 'Se cargó en el lead equivocado')
  await p.locator('.contenido .aviso.problema button:has-text("Sí, anular")').click()
  await esperar()
  await p.waitForTimeout(900)

  await p.goto(`${RAIZ}/leads/${errada}`)
  comprobar(await p.locator('.contenido .aviso.problema').count() === 0,
            'anulada, el aviso desaparece')

  await p.goto(`${RAIZ}/dashboard`)
  comprobar(!(await p.locator('.contenido').textContent())?.includes(`Venta Mal Cargada ${marca}`),
            'y el Dashboard deja de reclamarlo')

  await p.goto(`${RAIZ}/leads/${errada}?pestana=historial`)
  comprobar((await p.locator('.contenido').textContent())?.includes('Se cargó en el lead equivocado'),
            'no se borró nada: queda en el historial quién la anuló y por qué')
})

await paso('un caso de éxito se carga y queda listo para mandar', async () => {
  await p.goto(`${RAIZ}/casos`)
  await p.fill(enLaPantalla('#titulo'), `De 5k a 30k ${marca}`)
  await p.fill(enLaPantalla('#industria'), 'E-commerce')
  await p.fill(enLaPantalla('#metrica'), 'De USD 5.000 a USD 30.000 en 4 meses')
  await p.fill(enLaPantalla('#mensaje'), 'Hola, te comparto un caso parecido al tuyo.')
  // Al formulario de alta, no al botón «Archivar» de una tarjeta ya cargada:
  // las tarjetas van antes en el DOM y se lo llevarían puesto.
  await p.click('.contenido .tarjeta:has-text("Agregar un caso") button[type=submit]')
  await esperar()
  comprobar(await p.locator(`.contenido .tarjeta:has-text("De 5k a 30k ${marca}")`).count() > 0,
            'el caso quedó cargado y visible')
  await foto('casos')
})

await paso('un closer entra con su cuenta y carga su histórico', async () => {
  // El reporte fue «no puedo crear leads para cargar mi histórico». El lead se
  // creaba, pero quedaba sin closer: desaparecía de su lista y su ficha le
  // contestaba «no encontrado».
  await p.goto(`${RAIZ}/configuracion`)
  const alta = '.contenido .tarjeta:has-text("Dar de alta a alguien")'
  await p.fill(`${alta} #nombre`, `Nadia ${marca}`)
  await p.selectOption(`${alta} #funcion`, 'closer')
  await p.check(`${alta} input[name=entra]`)
  await p.fill(`${alta} #email`, `nadia${marca}@fbs.com`)
  await p.fill(`${alta} #clave`, 'clave12345')
  await p.click(`${alta} button[type=submit]`)
  await esperar()

  // Salir es el único botón de la barra lateral: por eso todo lo demás del
  // recorrido va dentro de `.contenido`.
  await p.locator('.lateral .pie button[type=submit]').click()
  await p.waitForURL('**/login')
  await p.fill('#email', `nadia${marca}@fbs.com`)
  await p.fill('#clave', 'clave12345')
  await p.click('form:has(#clave) button[type=submit]')
  await p.waitForURL('**/tracker')
  comprobar(await p.locator('.contenido .aviso.problema:has-text("no está vinculada")').count() === 0,
            'su cuenta quedó vinculada a su figura de closer')

  await p.goto(`${RAIZ}/leads/nuevo`)
  comprobar((await p.locator('.contenido .campo:has(label[for=closerId]) .fijo').textContent() ?? '')
              .includes(`Nadia ${marca}`),
            'el lead que carga es suyo: el closer no se elige, es él')

  await p.fill('.contenido #nombre', `Cliente Histórico ${marca}`)
  await p.fill('.contenido #fechaSesion', '2026-08-04')
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/, { timeout: 10000 })
  comprobar(/leads\/\d+/.test(p.url()),
            'después de crearlo abre su ficha, y no un «no encontrado»')
  comprobar((await p.locator('.contenido .cabecera-ficha').textContent() ?? '')
              .includes(`Cliente Histórico ${marca}`),
            'con el lead que acaba de cargar')

  await p.goto(`${RAIZ}/leads`)
  comprobar((await p.locator('.contenido table').textContent() ?? '')
              .includes(`Cliente Histórico ${marca}`),
            'y le aparece en su lista de leads')

  // «Verlas →» tiene que llevar a las reuniones atrasadas, sean del mes que
  // sean. Antes saltaba a un período fijo que podía no contenerlas: se
  // clickeaba y no pasaba nada, o peor, la lista quedaba vacía.
  await p.goto(`${RAIZ}/tracker`)
  const avisoAtrasadas = '.contenido .pendiente'
  comprobar(await p.locator(`${avisoAtrasadas} a:has-text("sin cargar")`).count() === 1,
            'el Tracker avisa, en un solo renglón, que hay una reunión atrasada')
  await p.locator(`${avisoAtrasadas} a:has-text("sin cargar")`).click()
  await esperar()
  comprobar((await p.locator('.contenido').textContent() ?? '')
              .includes(`Cliente Histórico ${marca}`),
            'y «Verlas →» la muestra, aunque sea de otro mes')

  await p.goto(`${RAIZ}/llamadas`)
  const avisoLlamadas = '.contenido .aviso:has-text("Fuera de este período")'
  if (await p.locator(avisoLlamadas).count() === 1) {
    await p.locator(`${avisoLlamadas} a:has-text("Verlas")`).click()
    await esperar()
    comprobar((await p.locator('.contenido').textContent() ?? '')
                .includes(`Cliente Histórico ${marca}`),
              'y en Llamadas también')
  }

  // Y vuelve a entrar dirección, que es con quien terminó todo lo demás.
  await p.locator('.lateral .pie button[type=submit]').click()
  await p.waitForURL('**/login')
  await p.fill('#email', 'admin@foundersbs.com')
  await p.fill('#clave', 'clave123')
  await p.click('form:has(#clave) button[type=submit]')
  await p.waitForURL('**/dashboard')
  await foto('closer-carga-historico')
})

await paso('el histórico de un mes entra pegando la planilla', async () => {
  // Cargar un mes de a un formulario por vez no se hace: se abandona a la
  // mitad y el tablero queda con la mitad de los datos.
  await p.goto(`${RAIZ}/leads/importar`)
  const planilla = [
    'Cliente\tMail\tFecha de la reunión\tCloser\tFuente\tAsistió\tResultado\tMonto\tCobrado',
    `Importada Una ${marca}\tuna${marca}@ej.com\t04/07/2026\tKevin\tMeta Ads\tSí\tVendido\tUSD 3.500\t1.500`,
    `Importada Dos ${marca}\tdos${marca}@ej.com\t05/07/2026\tKevin\tMeta Ads\tNo show\t\t\t`,
    `Importada Tres ${marca}\ttres${marca}@ej.com\t06/07/2026\tKevin\tInstagram\tAsistió\tPerdido\t\t`,
    `Importada Mala ${marca}\tmala${marca}@ej.com\t31/02/2026\tKevin\tMeta Ads\tAsistió\t\t\t`,
  ].join('\n')
  await p.fill('.contenido textarea', planilla)
  await p.click('.contenido button:has-text("Ver cómo queda")')
  await esperar()
  await p.waitForTimeout(900)

  comprobar(await p.locator('.contenido tbody tr').count() === 4,
            'la vista previa muestra las cuatro filas antes de escribir nada')
  const laMala = await p.locator(`.contenido tr:has-text("Importada Mala ${marca}")`).textContent()
  comprobar((laMala ?? '').includes('31/02/2026'),
            'y marca la fila con la fecha imposible, diciendo cuál es y cómo se escribe')
  const laDeInstagram = await p.locator(`.contenido tr:has-text("Importada Tres ${marca}")`).textContent()
  comprobar((laDeInstagram ?? '').includes('Instagram'),
            'una fuente que no existe avisa pero no frena la fila')
  comprobar((await p.locator('.contenido .aviso').first().textContent() ?? '').includes('3 filas listas'),
            'y dice cuántas van a entrar')
  await foto('importar-vista')

  // Hasta acá no se escribió nada.
  await p.goto(`${RAIZ}/leads`)
  comprobar(!(await p.locator('.contenido table').textContent())?.includes(`Importada Una ${marca}`),
            'la vista previa no escribió nada: hay que confirmar')

  await p.goto(`${RAIZ}/leads/importar`)
  await p.fill('.contenido textarea', planilla)
  await p.click('.contenido button:has-text("Ver cómo queda")')
  await esperar()
  await p.waitForTimeout(900)
  await p.click('.contenido button:has-text("Importar 3")')
  await esperar()
  await p.waitForTimeout(1500)
  comprobar((await p.locator('.contenido .aviso.dato').first().textContent() ?? '').includes('3 leads'),
            'confirmando, entran las tres buenas')

  // Y quedan contadas como si las hubiera cargado el closer a mano.
  await p.goto(`${RAIZ}/tracker?desde=2026-07-01&hasta=2026-07-31`)
  await esperar()
  const leer = (e) => miniValor(e)
  comprobar(await leer('Llamadas agendadas') === '3' && await leer('Asistencias') === '2'
            && await leer('No show') === '1' && await leer('Cierres') === '1',
            'el tablero de julio las cuenta: 3 agendadas, 2 asistencias, 1 no show, 1 cierre')
  comprobar(await leer('Facturación') === 'USD 3.500' && await leer('Cash collected') === 'USD 1.500',
            'con su facturación y su cash, que es lo que el formulario de a uno no carga')

  // Volver a pegar la misma planilla no duplica: es el camino normal después
  // de corregir las filas malas.
  await p.goto(`${RAIZ}/leads/importar`)
  await p.fill('.contenido textarea', planilla)
  await p.click('.contenido button:has-text("Ver cómo queda")')
  await esperar()
  await p.waitForTimeout(900)
  const aviso = await p.locator('.contenido .aviso').first().textContent()
  comprobar((aviso ?? '').includes('0 filas listas') || (aviso ?? '').includes('No hay ninguna fila'),
            'y volver a pegarla entera no vuelve a cargar nada')
  await foto('importar-repetida')
})

await b.close()

console.log(`\n${'─'.repeat(60)}`)
if (fallos.length === 0) {
  console.log('Recorrido completo sin fallos.')
} else {
  console.log(`${fallos.length} fallo(s):`)
  for (const f of fallos) console.log(`  · ${f}`)
  process.exit(1)
}
