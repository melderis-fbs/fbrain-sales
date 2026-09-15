/**
 * Crea o actualiza un usuario, y deja cargados los catálogos mínimos.
 *
 *   npm run seed -- tu@email.com "Tu Nombre" tuclave [rol]
 *
 * El rol por defecto es admin. Volver a correrlo con el mismo email cambia la
 * clave en vez de crear otro usuario.
 */
import { hashDeClave } from '../src/lib/claves'
import { escribir, escribirDevolviendo, fila, pool } from '../src/lib/db'
import { ROLES, type Rol } from '../src/dominio/roles'

const [email, nombre, clave, rolCrudo = 'admin'] = process.argv.slice(2)

if (!email || !nombre || !clave) {
  console.error('Uso: npm run seed -- <email> "<nombre>" <clave> [rol]')
  console.error(`Roles: ${ROLES.join(', ')}`)
  process.exit(1)
}
if (!ROLES.includes(rolCrudo as Rol)) {
  console.error(`Rol desconocido: "${rolCrudo}". Tiene que ser uno de: ${ROLES.join(', ')}`)
  process.exit(1)
}

const hash = await hashDeClave(clave)
const existente = await fila<{ id: number }>('select id from usuarios where lower(email) = lower($1)', [email])

if (existente) {
  await escribir(
    'update usuarios set nombre = $1, rol = $2, clave_hash = $3, activo = true where id = $4',
    [nombre, rolCrudo, hash, existente.id],
  )
  console.log(`Usuario actualizado: ${email} (${rolCrudo})`)
} else {
  const creado = await escribirDevolviendo<{ id: number }>(
    'insert into usuarios (email, nombre, rol, clave_hash) values ($1,$2,$3,$4) returning id',
    [email, nombre, rolCrudo, hash],
  )
  console.log(`Usuario creado: ${email} (${rolCrudo}) · id ${creado.id}`)
}

// Catálogos mínimos, para que la primera pantalla no esté vacía. Son los que ya
// usa la planilla de hoy; se editan desde Configuración.
for (const [i, n] of ['Anuncios', 'Bio IG', 'Webinar', 'Referido', 'Orgánico'].entries()) {
  await escribir(
    'insert into fuentes (nombre, orden) values ($1, $2) on conflict (nombre) do nothing',
    [n, i], { esperadas: 'cualquiera' },
  )
}
for (const [i, n] of ['Principal', 'Webinar', 'VSL'].entries()) {
  await escribir(
    'insert into funnels (nombre, orden) values ($1, $2) on conflict (nombre) do nothing',
    [n, i], { esperadas: 'cualquiera' },
  )
}

await pool().end()
