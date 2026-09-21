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
  const hoy = new Date().toISOString().slice(0, 10)
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
  comprobar(await p.locator('.tarjeta:has-text("Lead Quality") .numero').count() > 0,
            'y se ve en el resumen con el detalle de cada aporte')
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
  const hoy = new Date().toISOString().slice(0, 10)
  await p.goto(`${RAIZ}/leads/${leadId}?pestana=resultado`)
  await p.selectOption('#estado', 'asistio')
  await p.selectOption('#resultado', 'sena')
  await p.check('input[name=huboOferta]')
  await p.fill('#importe', '500')
  await p.fill('#fecha', hoy)
  await p.fill('#saldoPendiente', '3500')
  await p.click(enLaPantalla('form:has(#resultado) button[type=submit]'))
  await esperar()

  await p.goto(`${RAIZ}/dashboard`)
  comprobar(await tarjeta('Señas') === antesDeLaSena.senas + 1, 'la seña aparece en su tarjeta')
  comprobar(await tarjeta('Facturación') === antesDeLaSena.facturacion,
            'y NO entra a facturación')
  await foto('dashboard-sena')
})

await paso('convertir la seña: el dinero se cuenta una vez', async () => {
  const hoy = new Date().toISOString().slice(0, 10)
  await p.goto(`${RAIZ}/leads/${leadId}?pestana=resultado`)
  await p.selectOption('#resultado', 'venta')
  await p.fill('#importe', '4000')
  await p.fill('#fecha', hoy)
  await p.fill('#programa', 'Founders Scale')
  await p.click(enLaPantalla('form:has(#resultado) button[type=submit]'))
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
  const cierre = await p.locator('.tarjeta:has-text("Ventas") .contra').first().textContent()
  const pct = Number((cierre ?? '').match(/([\d.]+)%/)?.[1] ?? '0')
  comprobar(pct <= 100, `el cierre es ${pct}% · nunca más de 100 porque sale del mismo universo`)
})

await paso('un lead en seguimiento entra solo al pipeline', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', OTRO)
  await p.selectOption('#closerId', { label: 'Braian' })
  await p.fill('#fechaSesion', new Date().toISOString().slice(0, 10))
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  const otro = p.url().match(/leads\/(\d+)/)?.[1]

  await p.goto(`${RAIZ}/leads/${otro}?pestana=resultado`)
  await p.selectOption('#estado', 'asistio')
  await p.selectOption('#resultado', 'seguimiento')
  await p.click(enLaPantalla('form:has(#resultado) button[type=submit]'))
  await esperar()

  await p.goto(`${RAIZ}/seguimientos`)
  // Cuántas tarjetas había antes de la nuestra: el recorrido puede correrse
  // varias veces contra la misma base de pruebas.
  const previas = {
    enTotal: await p.locator('.columna .ficha').count() - 1,
    enSegunda: await p.locator('.columna').nth(1).locator('.ficha').count(),
  }
  comprobar(await p.locator(`.columna .ficha:has-text("${OTRO}")`).count() === 1,
            'apareció en el pipeline sin que nadie lo agregue a mano')
  comprobar(await p.locator('.columna').count() === 12, 'las doce columnas están')
  await foto('pipeline')

  await paso('registrar el toque mueve la tarjeta sola', async () => {
    const primera = p.locator('.columna').first()
    await primera.locator(`.ficha:has-text("${OTRO}") select`).selectOption('no_contesto')
    await primera.locator(`.ficha:has-text("${OTRO}") button[type=submit]`).click()
    await esperar()
    await esperarCuantos(`.columna:nth-child(2) .ficha`, previas.enSegunda + 1)
    comprobar(await p.locator('.columna').nth(1).locator(`.ficha:has-text("${OTRO}")`).count() === 1,
              'la tarjeta pasó sola al toque 2')
  })

  await paso('«no interesado» lo saca del pipeline y cierra el lead', async () => {
    const segunda = p.locator('.columna').nth(1)
    await segunda.locator(`.ficha:has-text("${OTRO}") select`).selectOption('no_interesado')
    await segunda.locator(`.ficha:has-text("${OTRO}") button[type=submit]`).click()
    await esperar()
    await esperarCuantos('.columna .ficha', previas.enTotal)
    comprobar(await p.locator(`.columna .ficha:has-text("${OTRO}")`).count() === 0,
              'dejó de ocupar lugar en la grilla')
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
  await fila.locator('input[type=date]').fill(new Date().toISOString().slice(0, 10))
  await fila.locator('button[type=submit]').click()
  await esperar()
  await esperarCuantos('.tarjeta .tabla-carga tr', 0, 3000)
  comprobar(await p.locator('.contenido .tarjeta:has-text("Sin fecha de reunión")').count() === 0,
            'al ponerle fecha entra al Tracker y deja de reclamarse')
})

await paso('el closer carga el resultado sin salir del Tracker', async () => {
  await p.goto(`${RAIZ}/tracker`)
  const carga = p.locator('.contenido .tarjeta:has-text("Cargar el resultado de la llamada")')
  comprobar(await carga.count() > 0, 'el Tracker tiene el espacio para cargar el resultado')

  const fila = carga.locator(`tr:has-text("Sin Fecha ${marca}")`)
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

await paso('el Tracker y el Dashboard dicen lo mismo del mismo mes', async () => {
  await p.goto(`${RAIZ}/dashboard?periodo=mes`)
  const dash = await p.locator('.tarjeta:has-text("Asistencias") .numero').first().textContent()
  await p.goto(`${RAIZ}/tracker?periodo=mes`)
  const track = await p.locator('.tarjeta:has-text("Asistencias") .numero').first().textContent()
  comprobar(dash?.trim() === track?.trim(),
            `asistencias: Dashboard ${dash?.trim()} · Tracker ${track?.trim()}`)
  await foto('tracker')
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

await b.close()

console.log(`\n${'─'.repeat(60)}`)
if (fallos.length === 0) {
  console.log('Recorrido completo sin fallos.')
} else {
  console.log(`${fallos.length} fallo(s):`)
  for (const f of fallos) console.log(`  · ${f}`)
  process.exit(1)
}
