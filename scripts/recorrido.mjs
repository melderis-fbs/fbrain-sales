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

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1280, height: 900 } })
const fallos = []
p.on('pageerror', (e) => fallos.push(`pageerror: ${e.message}`))
p.on('response', (r) => { if (r.status() >= 500) fallos.push(`${r.status()} ${r.url()}`) })

const paso = async (n, f) => { console.log(`\n▶ ${n}`); await f() }
const foto = async (n) => p.screenshot({ path: `/tmp/founders-sales-${n}.png`, fullPage: true })

await paso('entrar', async () => {
  await p.goto('http://localhost:3000/login')
  await p.fill('#email', 'admin@foundersbs.com')
  await p.fill('#clave', 'clave123')
  await p.click('button[type=submit]')
  await p.waitForURL('**/tablero')
  console.log('  url:', p.url())
})

await paso('configuración: alta de closers, setters y objetivo', async () => {
  await p.goto('http://localhost:3000/configuracion')
  for (const [nombre, tipo] of [['Kevin', 'closers'], ['Braian', 'closers']]) {
    await p.fill(`form:has(input[value="${tipo}"]) input[name=nombre]`, nombre)
    await p.click(`form:has(input[value="${tipo}"]) button[type=submit]`)
    await p.waitForLoadState('networkidle')
  }
  await p.fill('form:has(input[value="setters"]) input[name=nombre]', 'Fabricio')
  await p.click('form:has(input[value="setters"]) button[type=submit]')
  await p.waitForLoadState('networkidle')

  await p.fill('#o-valor', '160000')
  await p.click('form:has(#o-valor) button[type=submit]')
  await p.waitForLoadState('networkidle')
  await p.waitForTimeout(800)
  await p.reload()
  console.log('  objetivos cargados:', await p.locator('.tarjeta:has-text("Objetivos") table tbody tr').count())
})

await paso('registrar un lead', async () => {
  await p.goto('http://localhost:3000/leads/nuevo')
  await p.fill('#nombre', 'María Fernández')
  await p.fill('#email', 'maria@ejemplo.com')
  await p.fill('#telefono', '+54 9 11 5555-1234')
  await p.selectOption('#fuenteId', { label: 'Anuncios' })
  await p.selectOption('#setterId', { label: 'Fabricio' })
  await p.selectOption('#closerId', { label: 'Kevin' })
  await p.fill('#fechaAgenda', new Date().toISOString().slice(0, 10))
  await p.fill('#horaAgenda', '15:30')
  await p.fill('#valorPotencial', '3000')
  await p.click('.contenido form button:has-text("Registrar lead")')
  await p.waitForURL(/\/leads\/\d+/)
  console.log('  url:', p.url())
})

const urlLead = p.url()

await paso('el duplicado avisa y no crea', async () => {
  await p.goto('http://localhost:3000/leads/nuevo')
  await p.fill('#nombre', 'Maria Fernandez')          // sin acentos
  await p.fill('#telefono', '11 5555 1234')           // sin país
  await p.click('.contenido form button:has-text("Registrar lead")')
  await p.waitForSelector('.aviso.atencion')
  console.log('  aviso:', (await p.locator('.aviso.atencion').innerText()).split('\n').slice(0, 3).join(' | '))
  console.log('  botón ahora dice:', await p.locator('.contenido form button[type=submit]').first().innerText())
  await foto('duplicado')
})

await paso('editar el lead ya creado', async () => {
  await p.goto(`${urlLead}?p=ficha`)
  const tarjeta = p.locator('.tarjeta:has-text("País")')
  await tarjeta.locator('button:has-text("Editar")').click()
  await p.fill('input[name=pais]', 'Argentina')
  await tarjeta.locator('button:has-text("Guardar")').click()
  await p.waitForLoadState('networkidle')
  console.log('  país quedó:', await p.locator('.tarjeta:has-text("País")').innerText())
})

await paso('cargar una seña', async () => {
  await p.goto(`${urlLead}?p=sesiones`)
  await p.click('button:has-text("Cargar resultado")')
  await p.selectOption('select[name=estado]', 'asistida')
  await p.selectOption('select[name=resultado]', 'sena')
  await p.check('input[name=huboOferta]')
  await p.fill('input[name=importe]', '500')
  await p.fill('input[name=fecha]', new Date().toISOString().slice(0, 10))
  await p.fill('input[name=saldoPendiente]', '2500')
  await p.click('button:has-text("Guardar resultado")')
  await p.waitForLoadState('networkidle')
  console.log('  ', (await p.locator('.aviso').first().innerText()).replace(/\n/g, ' '))
  await foto('sena')
})

await paso('cambiar el closer', async () => {
  await p.goto(`${urlLead}?p=sesiones`)
  await p.click('button:has-text("Cambiar closer")')
  await p.selectOption('select[name=closerId]', { label: 'Braian' })
  await p.fill('input[name=motivo]', 'Reasignación manual')
  await p.click('button:has-text("Guardar el cambio")')
  await p.waitForLoadState('networkidle')
  const txt = await p.locator('.tarjeta').first().innerText()
  console.log('  ', txt.match(/Closer\n.*\nCloser inicial\n.*/s)?.[0]?.replace(/\n/g, ' ') ?? txt.slice(0, 120))
})

await paso('convertir la seña en venta', async () => {
  await p.goto(`${urlLead}?p=sesiones`)
  await p.waitForLoadState('networkidle')
  await p.click('button:has-text("Cargar resultado")')
  await p.waitForSelector('select[name=resultado]')
  await p.selectOption('select[name=resultado]', 'venta')
  await p.fill('input[name=importe]', '3000')
  await p.fill('input[name=fecha]', new Date().toISOString().slice(0, 10))
  await p.click('button:has-text("Guardar resultado")')
  await p.waitForLoadState('networkidle')
  console.log('  ', (await p.locator('.aviso').first().innerText()).replace(/\n/g, ' '))
})

await paso('el historial lo cuenta todo', async () => {
  await p.goto(`${urlLead}?p=historial`)
  const filas = await p.locator('table tbody tr').count()
  console.log('  cambios registrados:', filas)
  console.log('  ', (await p.locator('table tbody tr').first().innerText()).replace(/\t/g, ' · '))
})

await paso('el tablero y el día', async () => {
  await p.goto('http://localhost:3000/tablero')
  await foto('tablero')
  for (const e of ['Señas', 'Facturación', 'Cash collected', 'Objetivo del mes']) {
    const t = p.locator(`.tarjeta:has-text("${e}")`).first()
    console.log(`  ${e}: ${(await t.innerText()).replace(/\n/g, ' · ')}`)
  }
  await p.goto('http://localhost:3000/hoy')
  await foto('hoy')
  console.log('  llamadas de hoy:', await p.locator('table tbody tr').first().innerText().catch(() => 'ninguna'))
})

await paso('closers y setters', async () => {
  await p.goto('http://localhost:3000/closers'); await foto('closers')
  await p.goto('http://localhost:3000/setters'); await foto('setters')
  console.log('  ok')
})

console.log(fallos.length === 0 ? '\n✅ sin errores de página ni respuestas 5xx' : `\n❌ ${fallos.join('\n')}`)
await b.close()
