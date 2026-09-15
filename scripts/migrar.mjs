// Aplica supabase/migrations/*.sql en orden. Son idempotentes: volver a correr
// una que ya está aplicada no rompe nada.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const CARPETA = new URL('../supabase/migrations/', import.meta.url).pathname

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL. Ponela en .env.local o pasala en el entorno.')
  process.exit(1)
}

const esLocal = /@(localhost|127\.0\.0\.1)/.test(url)
const laCadenaDecideElTls = /[?&]sslmode=/.test(url)
const cliente = new pg.Client({
  connectionString: url,
  ...(laCadenaDecideElTls ? {} : { ssl: esLocal ? undefined : { rejectUnauthorized: false } }),
})

await cliente.connect()

const archivos = (await readdir(CARPETA)).filter((a) => a.endsWith('.sql')).sort()
for (const archivo of archivos) {
  const sql = await readFile(join(CARPETA, archivo), 'utf8')
  process.stdout.write(`  ${archivo} … `)
  try {
    await cliente.query(sql)
    console.log('ok')
  } catch (error) {
    console.log('ERROR')
    console.error(`\n${archivo}: ${error.message}\n`)
    await cliente.end()
    process.exit(1)
  }
}

console.log(`\n${archivos.length} migración(es) aplicadas.`)
await cliente.end()
