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
// Con la URL: un error de página sin saber en cuál pasó no se puede perseguir.
p.on('pageerror', (e) => fallos.push(`pageerror en ${p.url()}: ${e.message}`))
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
  // Y al lado están los CIERRES del período, contados por fecha de venta: es
  // el número que el closer entiende como «este mes cerré tres», y no tiene
  // por qué coincidir con el numerador del porcentaje de acá al lado.
  const cierres = await p.locator('.tarjeta:has-text("Cierres") .etiqueta').first().textContent()
  comprobar(cierres?.trim() === 'Cierres',
            'y los cierres del período están al lado, por fecha de venta')
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
  comprobar(await p.locator('.contenido .tablero .columna').count() >= 12,
            'el tablero tiene una columna por toque')

  // En un tablero la posición ES el paso: la tarjeta tiene que estar en la
  // columna del toque que le toca, y moverse de columna al registrarlo.
  const enColumna = (n) => p.locator(`.contenido .tablero .columna[data-toque="${n}"] .ficha:has-text("${OTRO}")`)
  const suya = () => p.locator(`.contenido .ficha:has-text("${OTRO}")`)

  comprobar(await enColumna(1).count() === 1, 'y arranca en la columna del primer toque')

  await paso('registrar el toque mueve la tarjeta a la columna siguiente', async () => {
    await suya().locator('select[name=estado]').selectOption('no_contesto')
    await suya().locator('button[type=submit]').click()
    await esperar()
    await p.waitForFunction(
      (nombre) => {
        const col = document.querySelector('.contenido .tablero .columna[data-toque="2"]')
        return col !== null && [...col.querySelectorAll('.ficha')]
          .some((f) => f.textContent?.includes(nombre))
      },
      OTRO, { timeout: 5000 },
    ).catch(() => {})
    comprobar(await enColumna(2).count() === 1, 'pasó a la columna del toque 2')
    comprobar(await enColumna(1).count() === 0, 'y dejó de estar en la del 1')
    await foto('pipeline')
  })

  await paso('«Lo que toca» deja en el tablero sólo lo vencido y lo de hoy', async () => {
    await p.goto(`${RAIZ}/seguimientos?solo=toca`)
    comprobar(await p.locator('.contenido .tablero .columna').count() >= 12,
              'sigue siendo el mismo tablero, con menos tarjetas')
    comprobar(await p.locator(
                '.contenido .barra-filtros .chips:not([aria-label]) a.activo').count() === 1,
              'y el filtro queda marcado')
    await p.goto(`${RAIZ}/seguimientos`)
  })

  await paso('el tablero se filtra por closer, y los números de arriba también', async () => {
    // Un filtro que deja el encabezado contando a todo el equipo dice dos
    // cosas a la vez, y la que se cree es la que está más arriba.
    await p.goto(`${RAIZ}/seguimientos`)
    const enCadencia = async () => Number(
      (await p.locator('.contenido .tarjeta:has-text("En cadencia") .numero').first().textContent() ?? '0')
        .replace(/\D/g, ''))
    const todos = await enCadencia()
    comprobar(todos >= 1, `sin filtrar hay ${todos} en cadencia`)

    // Kevin no tiene a nadie en la cadencia: el lead en seguimiento es de Braian.
    const porCloser = (quien) =>
      p.locator(`.contenido [aria-label="Filtrar por closer"] a:has-text("${quien}")`)
    await porCloser('Kevin').click()
    await esperar()
    await p.waitForTimeout(400)
    comprobar(await enCadencia() === 0, 'filtrando por Kevin, el encabezado baja a 0')
    comprobar(await p.locator(`.contenido .tablero .ficha:has-text("${OTRO}")`).count() === 0,
              'y su tarjeta desaparece del tablero')

    await porCloser('Braian').click()
    await esperar()
    await p.waitForTimeout(400)
    comprobar(await p.locator(`.contenido .tablero .ficha:has-text("${OTRO}")`).count() === 1,
              'y con el closer que lo tiene, vuelve')

    // El tablero se desliza: la barra está puesta, no escondida hasta que
    // alguien adivine que hay más columnas a la derecha.
    const deslizador = await p.evaluate(() => {
      const t = document.querySelector('.contenido .tablero')
      if (!t) return null
      return { ancho: t.scrollWidth - t.clientWidth, estilo: getComputedStyle(t).overflowX }
    })
    comprobar(deslizador?.estilo === 'scroll',
              'y tiene barra de desplazamiento siempre visible, no sólo al arrastrar')

    await p.goto(`${RAIZ}/seguimientos`)
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
    comprobar(await p.locator(`.contenido .tablero .ficha:has-text("${OTRO}")`).count() === 0,
              'dejó de ocupar lugar en el tablero')
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
  await p.waitForTimeout(900)
  comprobar(await p.locator('.contenido .tarjeta:has-text("Sin fecha de reunión")').count() === 0,
            'al ponerle fecha entra al Tracker y deja de reclamarse')
})

await paso('reportar es el MISMO botón, entre por donde entre', async () => {
  // Había dos formas de cargar una llamada: el reporte en Llamadas y un
  // desplegable propio en el Tracker. Dos formas de cargar una cosa son dos
  // formas de cargarla distinto, y encima sólo una guardaba la nota y la
  // transcripción.
  await p.goto(`${RAIZ}/tracker`)
  const carga = p.locator('.contenido .tarjeta:has-text("Hoy")').first()
  comprobar(await carga.locator('.turno').count() > 0,
            'el Tracker abre con la agenda del día')
  comprobar(await carga.locator('button:has-text("Reportar")').count()
              === await carga.locator('.turno').count(),
            'y cada renglón tiene su botón de reportar, el mismo de Llamadas')

  const fila = carga.locator(`.turno:has-text("Sin Fecha ${marca}")`)
  await fila.locator('button:has-text("Reportar")').click()
  await p.waitForTimeout(400)
  const hoja = p.locator('dialog.hoja[open]')
  comprobar(await hoja.count() === 1, 'abre la misma hoja de reporte')

  await hoja.locator('.paso:has-text("Asistencia") .accion:has-text("Asistió")').click()
  await hoja.locator('.paso .cabeza:has-text("Resultado") ~ .botonera .accion:has-text("Venta")')
    .first().click()
  await p.waitForTimeout(300)
  await hoja.locator('input[name=importe]').fill('2500')
  await hoja.locator('input[name=fecha]').fill(HOY)
  await hoja.locator('button:has-text("Guardar el reporte")').click()
  await p.waitForSelector('dialog.hoja .aviso.dato', { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(600)

  await p.goto(`${RAIZ}/leads`)
  const estado = await p.locator(`.contenido tr:has-text("Sin Fecha ${marca}")`).textContent()
  comprobar((estado ?? '').includes('Venta'), 'quedó cargado como venta sin abrir la ficha')
  await foto('tracker-carga')
})

await paso('y está en TODA llamada, no sólo en las de hoy', async () => {
  await p.goto(`${RAIZ}/llamadas?periodo=mes`)
  const tabla = p.locator('.contenido .tarjeta table').last()
  const renglones = await tabla.locator('tbody tr').count()
  comprobar(renglones > 0 && await tabla.locator('button:has-text("Reportar")').count() === renglones,
            `las ${renglones} llamadas del mes tienen su botón, no sólo las de hoy`)
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
    'Reservas', 'Cierres', 'Cierres de reuniones del período', 'Facturación',
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

await paso('la aplicación dice qué versión está corriendo', async () => {
  // Existe porque costó tres idas y vueltas: se arreglaba un número, se
  // publicaba, y del otro lado seguía mal. No estaba mal el arreglo —era un
  // deploy anterior— y no había forma de saberlo desde la aplicación.
  await p.goto(`${RAIZ}/configuracion`)
  const tarjeta = p.locator('.contenido .tarjeta:has-text("Qué versión está corriendo")')
  comprobar(await tarjeta.count() === 1, 'Configuración dice qué versión está corriendo')
  // Este servidor corre fuera de Vercel, así que tiene que decir eso y no
  // inventar un número.
  comprobar((await tarjeta.innerText()).includes('fuera de Vercel'),
            'y sin las variables del deploy lo dice, en vez de inventar un número')
})

await paso('el cierre se mide sobre las asistencias, no sobre las agendas', async () => {
  // Cuatro agendas, tres asistencias, un cierre: sobre asistencias da 33,3%
  // y sobre agendas daría 25%. Los dos números existen, así que la prueba
  // sirve sólo si distingue cuál se muestra.
  // Con un closer propio, para que los leads de los pasos anteriores no se
  // mezclen: una cuenta que sólo da bien cuando el resto de la corrida
  // colabora no comprueba nada.
  const SOLO = `Cierre ${marca}`
  await p.goto(`${RAIZ}/configuracion`)
  const suyo = '.contenido .tarjeta:has-text("Dar de alta a alguien")'
  await p.fill(`${suyo} #nombre`, SOLO)
  await p.selectOption(`${suyo} #funcion`, 'closer')
  await p.uncheck(`${suyo} input[name=entra]`)
  await p.click(`${suyo} button[type=submit]`)
  await esperar()
  await p.waitForTimeout(400)

  const nombres = ['Vino Y Compró', 'Vino Y No', 'Vino Tampoco', 'No Vino Nunca']
  for (const n of nombres) {
    await p.goto(`${RAIZ}/leads/nuevo`)
    await p.fill('#nombre', `${n} ${marca}`)
    await p.selectOption('#closerId', { label: SOLO })
    await p.fill('#fechaSesion', HOY)
    await p.click(enLaPantalla('form button[type=submit]'))
    await p.waitForURL(/leads\/\d+/)
    const id = p.url().match(/leads\/(\d+)/)?.[1]

    await p.goto(`${RAIZ}/leads/${id}?pestana=resultado`)
    await p.selectOption('.contenido #estado', n === 'No Vino Nunca' ? 'no_show' : 'asistio')
    if (n === 'Vino Y Compró') {
      await p.selectOption('.contenido #salida', 'venta')
      await p.fill('.contenido #importe', '1000')
      await p.fill('.contenido #fecha', HOY)
    } else if (n !== 'No Vino Nunca') {
      await p.selectOption('.contenido #salida', 'seguimiento_cadencia')
    }
    await p.click('.contenido form button:has-text("Guardar el resultado")')
    await esperar()
    await p.waitForTimeout(500)
  }

  await p.goto(`${RAIZ}/llamadas?periodo=hoy`)
  await p.locator(`[aria-label="Filtrar por closer"] a:has-text("${SOLO}")`).click()
  await esperar()
  await p.waitForTimeout(500)

  const { pct, contra } = await p.evaluate(() => {
    const tarjeta = [...document.querySelectorAll('.contenido .tarjeta')]
      .find((t) => t.querySelector('.etiqueta')?.textContent?.trim() === 'Cierre')
    return {
      pct: tarjeta?.querySelector('.numero')?.textContent?.trim() ?? '',
      contra: tarjeta?.querySelector('.contra')?.textContent?.trim() ?? '',
    }
  })
  comprobar(pct.startsWith('33'),
            `con 4 agendas, 3 asistencias y 1 venta el cierre da ${pct}: sobre las asistencias, ` +
            `no sobre las agendas —que daría 25%—`)
  comprobar(contra.includes('asistencias'),
            `y la pantalla dice contra qué mide: «${contra}»`)
})

await paso('un cierre se cuenta en el mes en que se firmó, no en el de la llamada', async () => {
  // El reporte: «a Kevin no le está tomando la fecha de cierre, le toma la
  // fecha de llamada». La llamada fue el mes pasado y la firma es de hoy.
  const mesPasado = (() => {
    const [a, m] = HOY.split('-').map(Number)
    const d = new Date(Date.UTC(a, m - 2, 15))
    return d.toISOString().slice(0, 10)
  })()

  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', `Cerró Tarde ${marca}`)
  await p.selectOption('#closerId', { label: 'Kevin' })
  await p.fill('#fechaSesion', mesPasado)
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  const tarde = p.url().match(/leads\/(\d+)/)?.[1]

  // Se reporta la venta con fecha de HOY, sobre una reunión del mes pasado.
  await p.goto(`${RAIZ}/leads/${tarde}?pestana=resultado`)
  await p.selectOption('.contenido #estado', 'asistio')
  await p.selectOption('.contenido #salida', 'venta')
  await p.fill('.contenido #importe', '4000')
  await p.fill('.contenido #fecha', HOY)
  await p.click('.contenido form button:has-text("Guardar el resultado")')
  await esperar()
  await p.waitForTimeout(700)

  const numero = async (etiqueta) => {
    const t = await p.locator(`.contenido .tarjeta:has-text("${etiqueta}") .numero`).first()
      .textContent() ?? '0'
    return Number(t.replace(/\D/g, ''))
  }

  await p.goto(`${RAIZ}/llamadas?periodo=mes`)
  comprobar(await numero('Cierres') >= 1,
            'el cierre aparece en el mes en que se firmó, aunque la llamada sea de otro mes')

  await p.goto(`${RAIZ}/llamadas?periodo=mes_anterior`)
  const enElMesDeLaLlamada = await numero('Cierres')
  comprobar(enElMesDeLaLlamada === 0,
            'y NO aparece en el mes de la llamada, que es lo que estaba mal')
  comprobar(await numero('Total llamadas') >= 1,
            'pero la reunión sí sigue siendo de ese mes: son dos cosas distintas')

  // El número se puede abrir, y la lista trae las DOS fechas. Es lo que
  // contesta «tengo ocho y la pantalla dice cinco» sin tener que preguntar:
  // o las que faltan están ahí con su fecha de llamada en azul, o no están y
  // entonces el problema es el dato, no la cuenta.
  await p.goto(`${RAIZ}/llamadas?periodo=mes`)
  await p.locator('.contenido .tarjeta:has-text("Cierres") a:has-text("ver cuáles")').click()
  await esperar()
  await p.waitForTimeout(600)
  const enLista = p.locator('#ventas .lista-cierres table')
  comprobar(await enLista.count() === 1, 'el número de cierres se puede abrir')
  const columnas = (await enLista.locator('thead th').allInnerTexts()).map((t) => t.trim())
  comprobar(/fecha de venta/i.test(columnas[0] ?? '') && /llamada/i.test(columnas[1] ?? ''),
            `y la lista trae las dos fechas al lado: ${columnas.slice(0, 2).join(' · ')}`)
  comprobar(await p.locator('#ventas .lista-cierres tbody td[style*="acento"]').count() >= 1,
            'marcando la que vino de una llamada de otro mes')

  // El desglose del Tracker es donde se vio el problema: la columna de
  // ventas contaba por fecha de llamada al lado de una facturación que
  // contaba por fecha de venta, así que un closer aparecía con menos cierres
  // de los que tenía facturados.
  await p.goto(`${RAIZ}/tracker?periodo=mes`)
  const enElDesglose = await p.evaluate(() => {
    const tr = [...document.querySelectorAll('.contenido table.desglose tbody tr')]
      .find((f) => f.textContent?.includes('Kevin'))
    const c = [...(tr?.querySelectorAll('td') ?? [])].map((x) => x.textContent?.trim() ?? '')
    return { cierres: c[4] ?? '', facturado: c[6] ?? '' }
  })
  comprobar(Number(enElDesglose.cierres) >= 1 && enElDesglose.facturado !== '—',
            `en el desglose del Tracker, Kevin tiene ${enElDesglose.cierres} cierres y ` +
            `${enElDesglose.facturado} facturados: las dos columnas por fecha de venta`)

  // Y la facturación acompaña. Es lo que hacía que los dos números no se
  // pudieran mirar juntos: los cierres contados por fecha de llamada y la
  // plata por fecha de venta dan un ticket promedio que no es el ticket de
  // nada. Si las tres columnas cierran entre sí, salen del mismo universo.
  await p.goto(`${RAIZ}/closers?periodo=mes`)
  const fila = await p.locator('.contenido tbody tr:has-text("Kevin")').first().innerText()
  const celdas = fila.split('\t').map((x) => x.trim())
  const num = (x) => Number((x ?? '').replace(/[^\d]/g, ''))
  const cierres = num(celdas[5])
  const facturado = num(celdas[9])
  const ticket = num(celdas[10])
  comprobar(cierres >= 1 && facturado > 0,
            `Kevin tiene ${cierres} cierres y ${facturado} facturados en el mes de la firma`)
  comprobar(cierres > 0 && Math.abs(facturado / cierres - ticket) <= 1,
            'y el ticket cierra contra las dos: los tres números salen de la fecha de venta')
})

await paso('filtrar por closer es un clic, y está en todas las pantallas', async () => {
  // El pedido fue «que puedan filtrar por nombre de closer, para más
  // facilidad»: estaba en cuatro pantallas de seis, escondido en un
  // desplegable al fondo y con un botón para confirmar.
  const pastillas = '.contenido [aria-label="Filtrar por closer"]'
  for (const donde of ['/llamadas', '/leads', '/tracker', '/dashboard',
                       '/seguimientos', '/analizador']) {
    await p.goto(`${RAIZ}${donde}`)
    comprobar(await p.locator(pastillas).count() === 1,
              `${donde} filtra por closer de un clic`)
  }

  await p.goto(`${RAIZ}/leads`)
  const nombres = (await p.locator(`${pastillas} a`).allTextContents()).map((t) => t.trim())
  comprobar(nombres[0] === 'Todos' && nombres.includes('Kevin') && nombres.includes('Braian'),
            `con un nombre por closer y «Todos» adelante: ${nombres.join(' · ')}`)

  await p.locator(`${pastillas} a:has-text("Kevin")`).click()
  await esperar()
  await p.waitForTimeout(400)
  comprobar((await p.locator(`${pastillas} a.activo`).textContent())?.trim() === 'Kevin',
            'un clic y queda marcado')
  const deKevin = await p.locator('.contenido table').textContent() ?? ''
  comprobar(deKevin.includes(`María Fernández ${marca}`), 'la lista queda en la de Kevin')

  // Un filtro que al aplicarse borra otro obliga a empezar de nuevo.
  await p.fill('.contenido #q', 'ánde')
  await p.click('.contenido .filtros button[type=submit]')
  await esperar()
  comprobar(p.url().includes('closer='),
            'y filtrar por otra cosa no pierde el closer que se venía mirando')
})

await paso('el closer reporta la llamada del día sin salir de Llamadas', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', `Un Toque ${marca}`)
  await p.selectOption('#closerId', { label: 'Kevin' })
  await p.fill('#fechaSesion', HOY)
  await p.fill('#horaSesion', '11:00')
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  const unToque = p.url().match(/leads\/(\d+)/)?.[1]

  // La botonera se fue de la ficha: había tres formas de cargar lo mismo.
  comprobar(await p.locator('.contenido .acciones-closer').count() === 0,
            'la ficha ya no repite la carga del resultado')

  await p.goto(`${RAIZ}/llamadas`)
  const hoy = p.locator('.contenido .tarjeta:has-text("Hoy ·")').first()
  comprobar(await hoy.count() === 1, 'Llamadas abre con las llamadas de hoy')
  comprobar(await hoy.locator('.titulo-seccion').count() >= 1,
            'agrupadas por closer, que es como las mira cada uno')
  comprobar(await hoy.locator('button:has-text("Reportar")').count()
              === await hoy.locator('.turno').count(),
            'y cada una con su botón para reportarla')

  const fila = hoy.locator(`.turno:has-text("Un Toque ${marca}")`)
  await fila.locator('button:has-text("Reportar")').click()
  await p.waitForTimeout(400)
  const hoja = p.locator('dialog.hoja[open]')
  comprobar(await hoja.count() === 1, 'el botón abre la hoja de reporte')

  const pasos = async () =>
    (await hoja.locator('.paso .cabeza strong').allTextContents()).map((t) => t.trim())
  comprobar((await pasos()).join(' · ')
              === 'Asistencia · Oferta · Resultado · Reporte de la llamada · Transcripción',
            'con las cinco cosas a reportar, en el orden en que pasaron')

  // La venta pide el importe; el motivo de pérdida es de otro resultado.
  await hoja.locator('.paso:has-text("Asistencia") .accion:has-text("Asistió")').click()
  await hoja.locator('.pastilla:has-text("Sí, se presentó")').click()
  await hoja.locator('.paso .cabeza:has-text("Resultado") ~ .botonera .accion:has-text("Venta")')
    .first().click()
  await p.waitForTimeout(300)
  comprobar(await hoja.locator('input[name=importe]').count() === 1,
            'al elegir Venta pide el importe')
  comprobar(await hoja.locator('select[name=motivoPerdida]').count() === 0,
            'y no el motivo de pérdida, que es de otro resultado')

  await hoja.locator('input[name=importe]').fill('3500')
  await hoja.locator('select[name=cuotas]').selectOption('2')
  await p.waitForTimeout(300)
  comprobar(await hoja.locator('input[name=cuota2Importe]').count() === 1,
            'dos cuotas dibujan las dos filas de pago, con su fecha')
  await hoja.locator('input[name=cuota1Importe]').fill('2000')
  await hoja.locator('input[name=cuota1Fecha]').fill(HOY)
  await hoja.locator('select[name=cuota1Pagado]').selectOption('si')

  await hoja.locator('input[name=oferta]').fill('GROWTH a 3.500')
  await hoja.locator('textarea[name=notas]').fill('Cerró en la primera llamada.')
  await hoja.locator('input[name=proximoPaso]').fill('Mandar el contrato')
  const alCanal = await hoja.locator('.slack pre').textContent() ?? ''
  comprobar(alCanal.split('\n').map((r) => r.split(':')[0]).join(' | ')
              === 'Tipo de llamada | Nombre del lead | Resumen de la llamada | Oferta | Estado | Próximos pasos',
            'el mensaje sale con los seis renglones del equipo, en su orden')
  comprobar(alCanal.includes('Estado: Venta · 3.500 USD'),
            'y el estado lo calcula el sistema, para que se escriba siempre igual')
  comprobar(alCanal.includes('Resumen de la llamada: Cerró en la primera llamada.')
              && alCanal.includes('Próximos pasos: Mandar el contrato'),
            'con lo que escribió el closer en su renglón')

  await hoja.locator('button:has-text("Guardar el reporte")').click()
  await p.waitForSelector('dialog.hoja .aviso', { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(600)
  comprobar((await hoja.locator('.aviso').first().textContent())?.includes('Reportado'),
            'y al guardar dice qué guardó')
  await foto('reporte-del-closer')

  // Lo reportado ES lo que hay en la ficha: no son dos cargas distintas.
  await p.goto(`${RAIZ}/leads/${unToque}?pestana=resultado`)
  comprobar(await p.inputValue('#salida') === 'venta', 'la ficha del lead quedó en Venta')
  comprobar(await p.inputValue('#importe') === '3500', 'con su importe')
  await p.goto(`${RAIZ}/leads/${unToque}?pestana=notas`)
  const enElLead = await p.locator('.contenido').textContent() ?? ''
  comprobar(enElLead.includes('Cerró en la primera llamada.')
              && enElLead.includes('Estado: Venta'),
            'y el historial del lead guarda el reporte entero, no sólo el resumen suelto')

  // Y el plan de pagos vuelve a salir cargado: un formulario que muestra las
  // cuotas vacías sobre una venta que ya las tiene se lee como «no se guardó».
  await p.goto(`${RAIZ}/llamadas`)
  await p.locator(`.turno:has-text("Un Toque ${marca}") button:has-text("Reportar")`).click()
  await p.waitForTimeout(400)
  const otra = p.locator('dialog.hoja[open]')
  comprobar(await otra.locator('input[name=cuota1Importe]').inputValue() === '2000',
            'al reabrirlo, el plan de pagos sale como se cargó')
  comprobar(await otra.locator('select[name=cuota1Pagado]').inputValue() === 'si',
            'con lo que ya se cobró marcado')
})

await paso('al que no vino no se le pregunta el resto', async () => {
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('#nombre', `No Vino ${marca}`)
  await p.selectOption('#closerId', { label: 'Kevin' })
  await p.fill('#fechaSesion', HOY)
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)

  await p.goto(`${RAIZ}/llamadas`)
  await p.locator(`.turno:has-text("No Vino ${marca}") button:has-text("Reportar")`).click()
  await p.waitForTimeout(400)
  const hoja = p.locator('dialog.hoja[open]')
  await hoja.locator('.paso:has-text("Asistencia") .accion:has-text("No show")').click()
  await p.waitForTimeout(300)
  const titulos = (await hoja.locator('.paso .cabeza strong').allTextContents()).map((t) => t.trim())
  comprobar(!titulos.includes('Resultado'),
            'con «No show» desaparece el paso del resultado')
  comprobar(!titulos.includes('Oferta'), 'y el de la oferta: no hubo oferta que mostrar')
  comprobar(titulos.includes('Reporte de la llamada'), 'y queda qué contarle al equipo')

  await hoja.locator('textarea[name=notas]').fill('No se conectó, le escribí por WhatsApp.')
  await hoja.locator('button:has-text("Guardar el reporte")').click()
  await p.waitForSelector('dialog.hoja .aviso.dato', { timeout: 15000 }).catch(() => {})
  comprobar((await hoja.locator('.aviso').first().textContent())?.includes('Reportado'),
            'y se guarda igual, con lo poco que hay para decir')
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
  comprobar(await p.locator('.contenido .cabecera-ficha').count() === 1,
            'y tocar el nombre abre su ficha')
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

  // Se carga la venta desde el reporte, que es por donde entra de verdad.
  const reportar = async (armar) => {
    await p.goto(`${RAIZ}/llamadas`)
    await p.locator(`.turno:has-text("Venta Mal Cargada ${marca}") button:has-text("Reportar")`).click()
    await p.waitForTimeout(400)
    const hoja = p.locator('dialog.hoja[open]')
    await hoja.locator('.paso:has-text("Asistencia") .accion:has-text("Asistió")').click()
    await armar(hoja)
    await hoja.locator('button:has-text("Guardar el reporte")').click()
    await p.waitForSelector('dialog.hoja .aviso.dato', { timeout: 15000 }).catch(() => {})
    await p.waitForTimeout(500)
  }

  await reportar(async (hoja) => {
    await hoja.locator('.paso .cabeza:has-text("Resultado") ~ .botonera .accion:has-text("Venta")')
      .first().click()
    await hoja.locator('input[name=importe]').fill('9900')
  })

  // El closer se da cuenta y corrige el resultado.
  await reportar(async (hoja) => {
    await hoja.locator('.paso .cabeza:has-text("Resultado") ~ .botonera .accion:has-text("Perdido")')
      .first().click()
    await hoja.locator('select[name=motivoPerdida]').selectOption('precio')
  })

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
  const suLista = await p.locator('.contenido table').textContent() ?? ''
  comprobar(suLista.includes(`Cliente Histórico ${marca}`),
            'y le aparece en su lista de leads')
  // Y ve TAMBIÉN lo que cargó otro. El equipo es chico y los leads se pasan:
  // un setter que veía «está duplicado» sin poder abrir contra qué no leía un
  // permiso, leía que el sistema está roto.
  comprobar(suLista.includes(CLIENTA),
            'y también el lead que cargó otro: todos ven toda la operación')

  // Por eso mismo el aviso de duplicado ahora se puede verificar: el lead
  // contra el que choca se abre.
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('.contenido #nombre', 'Otra Persona Más')
  await p.fill('.contenido #telefono', TELEFONO)
  await p.click(enLaPantalla('form button[type=submit]'))
  await esperar()
  comprobar(await p.locator('.contenido .aviso.atencion').count() > 0,
            'al cargar un duplicado de otro, avisa')
  comprobar(await p.locator(`.contenido .aviso.atencion a:has-text("${CLIENTA}")`).count() === 1,
            'y el duplicado se puede abrir, que era lo que faltaba')

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

  // ── Y el Analizador, que es lo que se reportó como inaccesible ──────
  //
  // Podían entrar —la pantalla nunca estuvo cerrada— pero el aviso de «tu
  // cuenta no está vinculada» los mandaba a Configuración, y Configuración
  // les devolvía un 500. Un permiso que falta contestado con «Algo se rompió
  // en esta pantalla» se lee como que la aplicación no anda.
  comprobar(await p.locator('.lateral a[href="/analizador"]').count() === 1,
            'el Analizador está en el menú del closer')
  await p.goto(`${RAIZ}/analizador`)
  await esperar()
  comprobar((await p.locator('.contenido h1').first().textContent() ?? '')
              .includes('Llamadas analizadas'),
            'y lo abre, sin cartel de permiso denegado')

  // Lo que SÍ es de dirección se contesta, no revienta.
  await p.goto(`${RAIZ}/configuracion`)
  await esperar()
  await p.waitForTimeout(400)
  comprobar(await p.locator('.contenido:has-text("Esto no lo hace tu rol")').count() === 1,
            'Configuración le dice que eso lo hace dirección, en vez de darle un error')
  comprobar(await p.locator('.contenido:has-text("Algo se rompió")').count() === 0,
            'y no le muestra «Algo se rompió en esta pantalla»')

  // Y analiza de punta a punta: sube la transcripción y llega al botón.
  await p.goto(`${RAIZ}/llamadas`)
  const subirla = p.locator('.contenido button:has-text("Subir")').first()
  if (await subirla.count() > 0) {
    await subirla.click()
    await p.waitForURL(/analizador\/\d+/, { timeout: 15000 }).catch(() => {})
    comprobar(/analizador\/\d+/.test(p.url()), 'entra a la pantalla de una llamada suya')
    await p.fill('.contenido textarea[name=texto]',
      'Nadia: Hola, contame en qué andás con el negocio. Ana: Facturo ocho mil por mes. '.repeat(5))
    await p.click('.contenido button:has-text("Guardar la transcripción")')
    await esperar()
    await p.waitForTimeout(700)
    comprobar(await p.locator('.contenido button:has-text("Analizar")').count() === 1,
              'sube la transcripción y le queda el botón de Analizar')
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

await paso('la ficha dice si guardó o no, y un email viejo no la bloquea', async () => {
  // El reporte fue «le quise cambiar el setter y la fuente y no lo guarda». El
  // lead venía de una planilla con «no tiene» en la columna email: el
  // navegador consideraba inválido ese campo y bloqueaba el envío del
  // formulario entero. El botón no hacía literalmente nada.
  await p.goto(`${RAIZ}/leads/nuevo`)
  await p.fill('.contenido #nombre', `Email Roto ${marca}`)
  await p.fill('.contenido #fechaSesion', HOY)
  await p.click(enLaPantalla('form button[type=submit]'))
  await p.waitForURL(/leads\/\d+/)
  const roto = p.url().match(/leads\/(\d+)/)?.[1]

  await p.goto(`${RAIZ}/leads/${roto}?pestana=datos`)
  await p.fill('.contenido #email', 'no tiene')
  await p.selectOption('.contenido #fuenteId', { index: 1 })
  await p.selectOption('.contenido #setterId', { index: 1 })

  const valido = await p.evaluate(() => document.querySelector('.contenido form').checkValidity())
  comprobar(valido === true, 'un email que no es un email no invalida el formulario entero')

  await p.click('.contenido form button:has-text("Guardar")')
  await esperarCuantos('.contenido .aviso.dato', 1)
  const aviso = await p.locator('.contenido .aviso').first().textContent() ?? ''
  comprobar(aviso.includes('Guardado'), `y contesta que guardó: «${aviso.trim().slice(0, 60)}…»`)
  comprobar(aviso.includes('no parece un email'), 'avisando además que ese email no va a servir')

  await p.goto(`${RAIZ}/leads/${roto}?pestana=datos`)
  comprobar(await p.locator('.contenido #setterId').inputValue() !== '',
            'y el setter quedó cambiado de verdad')
  comprobar(await p.locator('.contenido #fuenteId').inputValue() !== '',
            'y la fuente también')

  // Y guardar sin tocar nada lo dice en vez de quedarse callado.
  await p.click('.contenido form button:has-text("Guardar")')
  await esperarCuantos('.contenido .aviso.dato', 1)
  comprobar((await p.locator('.contenido .aviso').first().textContent() ?? '')
              .includes('nada para cambiar'),
            'y si no cambió nada, también lo dice')
})

await paso('el Analizador se puede probar sin adivinar', async () => {
  // «Lo cambié en Vercel y sigue sin andar»: entre editar una variable y que
  // el analizador la use hay tres cosas que pueden fallar —la clave, el
  // workspace, el deploy— y las tres dan el mismo error.
  await p.goto(`${RAIZ}/analizador`)
  comprobar(await p.locator('.contenido button:has-text("Probar la conexión")').count() === 1,
            'hay un botón para probar la conexión con el modelo')
  await p.locator('.contenido button:has-text("Probar la conexión")').click()
  await esperarCuantos('.contenido .aviso.problema, .contenido .aviso.dato', 1, 20000)
  const dice = await p.locator('.contenido .tarjeta:has-text("¿El modelo responde?")').textContent() ?? ''
  // Este servidor corre sin clave, así que tiene que decir eso y no «error».
  comprobar(dice.includes('Falta la clave'),
            'y sin clave cargada lo dice con todas las letras')
  comprobar(dice.includes('NO está cargada'),
            'mostrando lo que este deploy está usando, que es la mitad de la respuesta')
})

await paso('cada closer carga SU playbook, y la pantalla dice si guardó', async () => {
  // El reporte fue «a Braian le funciona mal el analizador y a mí bien», y
  // acá adentro había tres cosas distintas: el formulario no decía nada
  // cuando fallaba, el desplegable de closer volvía al primero de la lista
  // después de un error —así que el segundo intento guardaba a nombre de
  // otro— y las fases que mostraba eran siempre las del primer playbook
  // cargado, no las del closer elegido.
  const guion = 'Guion de Kevin. Apertura: encuadrar y pedir permiso para preguntar. ' +
    'Diagnóstico: facturación, equipo, qué probó antes. Oferta recién después, ' +
    'atada a lo que dijo. Cierre: pedir la decisión hoy.'
  const cartel = () => p.locator('.contenido form .aviso').first().textContent().catch(() => '')

  await p.goto(`${RAIZ}/analizador?pestana=playbooks`)
  const kevin = await p.locator('#pb-closerId option', { hasText: 'Kevin' }).getAttribute('value')

  await p.selectOption('#pb-closerId', { label: 'Kevin' })
  await p.fill('#pb-script', 'corto')
  await p.click('.contenido form:has(#pb-closerId) button[type=submit]')
  await esperarCuantos('.contenido form .aviso', 1, 8000)
  comprobar((await cartel())?.includes('muy corto'),
            'un guardado que falla lo dice, en vez de no hacer nada')
  comprobar(await p.inputValue('#pb-closerId') === kevin,
            'y no cambia de closer a escondidas')
  comprobar(await p.inputValue('#pb-script') === 'corto',
            'y no borra lo que se escribió')

  await p.fill('#pb-script', guion)
  await p.fill('#f0n', 'FASE PROPIA DE KEVIN')
  await p.click('.contenido form:has(#pb-closerId) button[type=submit]')
  await p.waitForSelector('.contenido form .aviso.dato', { timeout: 8000 }).catch(() => {})
  comprobar((await cartel())?.includes('Guardado'), 'y el que sale bien también lo dice')

  await p.goto(`${RAIZ}/analizador?pestana=playbooks`)
  await p.selectOption('#pb-closerId', { label: 'Kevin' })
  await p.waitForTimeout(300)
  comprobar(await p.inputValue('#f0n') === 'FASE PROPIA DE KEVIN', 'Kevin ve sus fases')

  await p.selectOption('#pb-closerId', { label: 'Braian' })
  await p.waitForTimeout(300)
  comprobar(await p.inputValue('#f0n') !== 'FASE PROPIA DE KEVIN',
            'y Braian no ve las de Kevin')
  comprobar((await p.locator('.contenido .ayuda:has-text("Sin playbook cargado")').textContent())
              ?.includes('Braian'),
            'y la pantalla nombra a quién le falta cargarlo')
})

await paso('el closer se cambia desde la misma pantalla que el resto', async () => {
  // El reporte: «no deja cambiar el nombre del closer una vez creado el lead».
  // Estaba, pero en otra pestaña, y un campo que está en otro lado es un campo
  // que no está.
  await p.goto(`${RAIZ}/leads/${leadId}?pestana=datos`)
  comprobar(await p.locator('.contenido #closerId').count() === 1,
            'el closer está entre los datos del lead, con la fuente y el setter')

  const antes = await p.locator('.contenido #closerId').inputValue()
  const otro = await p.locator('.contenido #closerId option')
    .evaluateAll((os, actual) => os.find((o) => o.value !== '' && o.value !== actual)?.value, antes)
  await p.selectOption('.contenido #closerId', otro)
  await p.fill('.contenido #motivo', 'Se lo pasa el equipo')
  await p.click('.contenido form button:has-text("Guardar")')
  await esperarCuantos('.contenido .aviso.dato', 1)
  comprobar((await p.locator('.contenido .aviso').first().textContent() ?? '')
              .includes('closer quedó reasignado'),
            'y al guardar lo dice: el cambio de closer no pasa desapercibido')

  await p.goto(`${RAIZ}/leads/${leadId}?pestana=datos`)
  comprobar(await p.locator('.contenido #closerId').inputValue() === otro,
            'el cambio quedó guardado')

  await p.goto(`${RAIZ}/leads/${leadId}?pestana=historial`)
  comprobar((await p.locator('.contenido').textContent() ?? '').includes('Se lo pasa el equipo'),
            'y en el historial queda quién lo cambió y por qué')
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
