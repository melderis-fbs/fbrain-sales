// Imprime todas las migraciones juntas, para pegar en el SQL Editor de Supabase
// cuando no se puede correr `npm run migrar` desde la máquina.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const CARPETA = new URL('../supabase/migrations/', import.meta.url).pathname
const archivos = (await readdir(CARPETA)).filter((a) => a.endsWith('.sql')).sort()

for (const archivo of archivos) {
  console.log(`\n-- ═══ ${archivo} ═══\n`)
  console.log(await readFile(join(CARPETA, archivo), 'utf8'))
}
