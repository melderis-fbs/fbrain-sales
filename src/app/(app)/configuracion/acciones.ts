'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { enTransaccion, escribir, escribirDevolviendo, fila } from '@/lib/db'
import { clave as normalizar, plegar, oNulo } from '@/lib/texto'
import { hashDeClave } from '@/lib/claves'
import { anotar } from '@/datos/cambios'
import { ROLES, type Rol } from '@/dominio/roles'

/**
 * Toda variable de negocio se cambia desde acá, no tocando código.
 *
 * Objetivos, fuentes, funnels, closers, setters y la moneda base. Un porcentaje
 * de comisión escrito en un archivo .js es algo que nadie del equipo comercial
 * puede corregir un viernes a la tarde.
 */

function texto(datos: FormData, campo: string): string | null {
  return oNulo(datos.get(campo) === null ? null : String(datos.get(campo)))
}

/**
 * Dar de alta a alguien del equipo.
 *
 * Una persona puede ser dos cosas y acá se resuelven juntas, que es lo que
 * antes faltaba: la **cuenta** con la que entra y la **figura comercial** a
 * cuyo nombre salen los números. Si un closer tiene cuenta pero no queda atada
 * a su fila de `closers`, entra y no ve ninguno de sus leads — vacío por
 * permiso, que desde afuera se lee como datos perdidos.
 *
 * Un closer o un setter puede no entrar a la aplicación: hace falta para cargar
 * a alguien que ya no está pero cuyas ventas siguen contando. Los demás roles
 * sin cuenta no significan nada, así que se exige.
 */
export async function crearPersonaAccion(_previo: string | null, datos: FormData): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const nombre = normalizar(String(datos.get('nombre') ?? ''))
  const funcion = String(datos.get('funcion') ?? '') as Rol
  const comercial = funcion === 'closer' || funcion === 'setter'
  const entra = comercial ? datos.get('entra') === 'on' : true
  const email = (texto(datos, 'email') ?? '').toLowerCase()
  const clave = String(datos.get('clave') ?? '')

  if (nombre === '') return 'Hace falta un nombre.'
  if (!ROLES.includes(funcion)) return 'Elegí qué hace esta persona.'
  if (entra) {
    if (!email.includes('@')) return 'Para entrar a la aplicación hace falta un email.'
    if (clave.length < 8) return 'La clave tiene que tener al menos 8 caracteres.'
    const repetido = await fila('select 1 from usuarios where lower(email) = lower($1)', [email])
    if (repetido) return 'Ya hay una cuenta con ese email.'
  }

  const hash = entra ? await hashDeClave(clave) : null

  await enTransaccion(async (cx) => {
    let usuarioId: number | null = null
    if (entra && hash) {
      const creado = await escribirDevolviendo<{ id: number }>(
        'insert into usuarios (email, nombre, rol, clave_hash) values ($1, $2, $3, $4) returning id',
        [email, nombre, funcion, hash], cx,
      )
      usuarioId = creado.id
    }

    // Si ya existía la figura —cargada antes sin cuenta, o importada— se
    // reactiva y se le ata la cuenta en vez de crear una segunda persona.
    if (funcion === 'closer' || funcion === 'setter') {
      const tabla = funcion === 'closer' ? 'closers' : 'setters'
      await escribir(
        `insert into ${tabla} (nombre, nombre_pleg, usuario_id) values ($1, $2, $3)
         on conflict (nombre_pleg) do update
            set activo = true, nombre = excluded.nombre,
                usuario_id = coalesce(${tabla}.usuario_id, excluded.usuario_id)`,
        [nombre, plegar(nombre), usuarioId], { esperadas: 1, cliente: cx },
      )
    }

    if (usuarioId !== null) {
      await anotar([{ entidad: 'config', entidadId: usuarioId, campo: 'alta de persona',
                      anterior: null, nuevo: `${nombre} (${funcion})` }], usuario.id, cx)
    }
  })

  revalidatePath('/configuracion')
  return null
}

/** Cambiarle la clave a alguien. Sin esto, quien se la olvida queda afuera. */
export async function cambiarClaveAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const usuarioId = Number(datos.get('usuarioId'))
  const clave = String(datos.get('clave') ?? '')
  if (clave.length < 8) throw new Error('La clave tiene que tener al menos 8 caracteres.')

  await escribir('update usuarios set clave_hash = $1 where id = $2', [await hashDeClave(clave), usuarioId])
  await anotar([{ entidad: 'config', entidadId: usuarioId, campo: 'clave',
                  anterior: null, nuevo: 'cambiada' }], usuario.id)
  revalidatePath('/configuracion')
}

/**
 * Dar de baja a alguien, o volver a darle acceso.
 *
 * Se desactiva, no se borra: sus ventas, sus llamadas y su historial siguen
 * contando. Y nadie se puede desactivar a sí mismo, que es la forma más rápida
 * de quedarse sin ningún admin.
 */
export async function activarPersonaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const usuarioId = Number(datos.get('usuarioId'))
  const activo = datos.get('activo') === '1'
  if (usuarioId === usuario.id && !activo) throw new Error('No te podés dar de baja a vos mismo.')

  await escribir('update usuarios set activo = $1 where id = $2', [activo, usuarioId])
  await anotar([{ entidad: 'config', entidadId: usuarioId, campo: 'acceso',
                  anterior: activo ? 'sin acceso' : 'con acceso',
                  nuevo: activo ? 'con acceso' : 'sin acceso' }], usuario.id)
  revalidatePath('/configuracion')
}

export async function altaDeCatalogoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const tabla = String(datos.get('tabla'))
  if (tabla !== 'fuentes' && tabla !== 'funnels') throw new Error('Tabla desconocida.')

  const nombre = texto(datos, 'nombre')
  if (!nombre) throw new Error('Hace falta un nombre.')

  await escribir(
    `insert into ${tabla} (nombre) values ($1) on conflict (nombre) do nothing`,
    [nombre], { esperadas: 'cualquiera' },
  )
  revalidatePath('/configuracion')
}

export async function objetivoAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const desde = texto(datos, 'desde')
  const hasta = texto(datos, 'hasta')
  const valor = texto(datos, 'valor')
  if (!desde || !hasta || !valor) throw new Error('El objetivo necesita desde, hasta y valor.')
  if (desde > hasta) throw new Error('La fecha de inicio no puede ser posterior a la de fin.')

  const ambitoId = texto(datos, 'ambitoId')

  await escribir(
    `insert into objetivos (ambito, ambito_id, periodo, desde, hasta, tipo, valor, moneda, creado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (ambito, ambito_id, periodo, desde, tipo)
       do update set valor = excluded.valor, hasta = excluded.hasta, moneda = excluded.moneda`,
    [
      String(datos.get('ambito') ?? 'empresa'),
      ambitoId ? Number(ambitoId) : null,
      String(datos.get('periodo') ?? 'mes'),
      desde, hasta,
      String(datos.get('tipo') ?? 'facturacion'),
      Number(valor.replace(/\./g, '').replace(',', '.')),
      String(datos.get('moneda') ?? 'USD'),
      usuario.id,
    ],
  )
  revalidatePath('/configuracion')
  revalidatePath('/dashboard')
}

export async function monedaBaseAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const moneda = texto(datos, 'moneda')
  if (!moneda) throw new Error('Hace falta una moneda.')

  await escribir(
    `update config set valor = $1::jsonb, usuario_id = $2, actualizado_en = now() where clave = 'moneda_base'`,
    [JSON.stringify(moneda), usuario.id],
  )
  await anotar([{ entidad: 'config', entidadId: 0, campo: 'moneda_base', anterior: null, nuevo: moneda }], usuario.id)
  revalidatePath('/configuracion')
  revalidatePath('/dashboard')
}
