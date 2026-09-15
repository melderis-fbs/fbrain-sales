'use server'

import { redirect } from 'next/navigation'
import { hashDeClave } from '@/lib/claves'
import { enTransaccion, escribirDevolviendo, fila } from '@/lib/db'
import { clave as normalizar } from '@/lib/texto'

/**
 * Crear el primer usuario, desde el navegador.
 *
 * Sólo funciona mientras la tabla `usuarios` esté vacía, y esa condición se
 * vuelve a comprobar **adentro de la transacción**, no sólo al dibujar la
 * pantalla: entre que alguien abre esta página y aprieta el botón puede haberse
 * creado un usuario, y dos personas apretando a la vez no pueden terminar en
 * dos administradores creados sin que nadie se entere.
 *
 * Una vez que hay alguien, esta puerta queda cerrada para siempre. Los usuarios
 * que siguen los da de alta un admin, o `npm run seed`.
 */
export async function crearPrimerUsuarioAccion(
  _previo: string | null,
  datos: FormData,
): Promise<string | null> {
  const email = String(datos.get('email') ?? '').trim().toLowerCase()
  const nombre = normalizar(String(datos.get('nombre') ?? ''))
  const clave = String(datos.get('clave') ?? '')
  const repetida = String(datos.get('repetida') ?? '')

  if (email === '' || nombre === '' || clave === '') return 'Completá los tres campos.'
  if (!email.includes('@')) return 'Ese email no parece un email.'
  if (clave.length < 8) return 'La clave tiene que tener al menos 8 caracteres.'
  if (clave !== repetida) return 'Las dos claves no coinciden.'

  const hash = await hashDeClave(clave)

  const creado = await enTransaccion(async (cx) => {
    // `for update` sobre la tabla vacía no alcanza: lo que se bloquea es la
    // tabla entera, y por eso se toma el lock explícito. Es una sola vez en la
    // vida de la instalación, así que el costo no importa.
    await cx.query('lock table usuarios in exclusive mode')
    const alguien = await fila<{ id: number }>('select id from usuarios limit 1', [], cx)
    if (alguien) return null

    return escribirDevolviendo<{ id: number }>(
      `insert into usuarios (email, nombre, rol, clave_hash) values ($1, $2, 'admin', $3) returning id`,
      [email, nombre, hash],
      cx,
    )
  })

  if (!creado) return 'Alguien más ya creó el primer usuario. Entrá con esa cuenta.'

  redirect('/login')
}
