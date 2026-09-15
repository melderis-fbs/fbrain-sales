// Corre antes del build. No aplica nada: sólo avisa si hay migraciones nuevas
// sin declarar en la revisión del esquema, que es el error que después sale en
// producción como una tabla que no existe.
import { readdir, readFile } from 'node:fs/promises'

const migraciones = new URL('../supabase/migrations/', import.meta.url).pathname
const revision = new URL('../src/lib/revision.ts', import.meta.url).pathname

const archivos = (await readdir(migraciones)).filter((a) => a.endsWith('.sql')).sort()
const texto = await readFile(revision, 'utf8')

const sinDeclarar = archivos.filter((a) => !texto.includes(a))
if (sinDeclarar.length > 0) {
  console.error(
    `\nHay migraciones que la revisión del esquema no conoce: ${sinDeclarar.join(', ')}.\n` +
    `Agregá sus tablas a ESPERADO en src/lib/revision.ts, así la aplicación puede\n` +
    `decir cuál falta en vez de reventar contra una tabla que no existe.\n`,
  )
  process.exit(1)
}

console.log(`Migraciones declaradas: ${archivos.length}.`)
