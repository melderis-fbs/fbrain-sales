'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { enTransaccion, escribir, escribirDevolviendo, fila } from '@/lib/db'
import { clave as normalizar, plegar, oNulo } from '@/lib/texto'
import { hashDeClave } from '@/lib/claves'
import { anotar } from '@/datos/cambios'
import { ROLES, PUEDE, type Rol } from '@/dominio/roles'

/**
 * Lo que se configura acá lo muestran todas las demás pantallas.
 *
 * El equipo, las fuentes y los funnels alimentan el alta de leads, los filtros
 * del Tracker, los de Seguimientos y el desplegable de closer de cada ficha.
 * Revalidar sólo Configuración dejaba a todas esas con la lista vieja: se daba
 * de alta a alguien, no aparecía en ningún desplegable, y la conclusión
 * razonable del otro lado es que el alta no funcionó.
 */
function refrescarTodo(): void {
  revalidatePath('/configuracion')
  revalidatePath('/', 'layout')
}

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
    const repetido = await fila<{ nombre: string }>(
      'select nombre from usuarios where lower(email) = lower($1)', [email])
    if (repetido) {
      return `Ya hay una cuenta con ese email (${repetido.nombre}). Si lo que querés es ` +
             `atarle su figura comercial, usá «Figura comercial» en la fila de esa persona: ` +
             `dar de alta de nuevo no la vincula.`
    }
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

  refrescarTodo()
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
  refrescarTodo()
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
  refrescarTodo()
}

/**
 * Corregirle el nombre o el email a una cuenta.
 *
 * Es lo primero que hay que poder hacer y faltaba: una persona cambia de email
 * y, sin esto, la única salida era crear una cuenta nueva —que entra sin ver
 * ningún lead, porque la figura comercial quedó atada a la vieja—.
 *
 * La cuenta es la misma: conserva su figura, su historial y lo que cargó.
 */
export async function editarCuentaAccion(_previo: string | null, datos: FormData): Promise<string | null> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const usuarioId = Number(datos.get('usuarioId'))
  const nombre = normalizar(String(datos.get('nombre') ?? ''))
  const email = (texto(datos, 'email') ?? '').toLowerCase()

  if (nombre === '') return 'Hace falta un nombre.'
  if (!email.includes('@')) return 'Ese email no parece un email.'

  const antes = await fila<{ nombre: string; email: string }>(
    'select nombre, email from usuarios where id = $1', [usuarioId])
  if (!antes) return 'Esa cuenta no existe.'

  const ocupado = await fila<{ nombre: string }>(
    'select nombre from usuarios where lower(email) = lower($1) and id <> $2', [email, usuarioId])
  if (ocupado) {
    return `Ese email ya lo tiene ${ocupado.nombre}. Si es la misma persona duplicada, ` +
           `borrá la otra cuenta y después cambiá ésta.`
  }

  if (antes.nombre === nombre && antes.email.toLowerCase() === email) return 'No había nada que cambiar.'

  await enTransaccion(async (cx) => {
    await escribir('update usuarios set nombre = $1, email = $2 where id = $3',
      [nombre, email, usuarioId], { esperadas: 1, cliente: cx })
    await anotar([
      ...(antes.nombre !== nombre
        ? [{ entidad: 'config' as const, entidadId: usuarioId, campo: 'nombre',
             anterior: antes.nombre, nuevo: nombre }] : []),
      ...(antes.email.toLowerCase() !== email
        ? [{ entidad: 'config' as const, entidadId: usuarioId, campo: 'email',
             anterior: antes.email, nuevo: email }] : []),
    ], usuario.id, cx)
  })

  refrescarTodo()
  return null
}

/**
 * Borrar una cuenta que nunca hizo nada.
 *
 * Sólo las que no dejaron rastro: si cargó un lead, escribió una nota o tocó
 * algo, borrarla dejaría esos registros sin autor y eso no se puede deshacer.
 * Para ésas está «quitar acceso», que las deja afuera sin perder la historia.
 *
 * Existe para el caso concreto que lo pidió: una cuenta duplicada por error,
 * creada hace cinco minutos, que ocupa el email que necesita la buena.
 */
export async function eliminarCuentaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const usuarioId = Number(datos.get('usuarioId'))
  if (usuarioId === usuario.id) throw new Error('No te podés borrar a vos mismo.')

  const cuenta = await fila<{ nombre: string; email: string }>(
    'select nombre, email from usuarios where id = $1', [usuarioId])
  if (!cuenta) throw new Error('Esa cuenta no existe.')

  const rastro = await fila<{ n: number }>(
    `select (select count(*) from leads where creado_por = $1)
          + (select count(*) from notas where usuario_id = $1)
          + (select count(*) from cambios where usuario_id = $1 and campo <> 'alta de persona')
          + (select count(*) from ventas where creado_por = $1)
          + (select count(*) from seguimiento_interacciones where usuario_id = $1) as n`,
    [usuarioId])

  if ((rastro?.n ?? 0) > 0) {
    throw new Error(
      `${cuenta.nombre} ya cargó cosas en el sistema, así que borrarla dejaría esos registros ` +
      `sin autor. Usá «Quitar acceso»: queda afuera y no se pierde la historia.`,
    )
  }

  await enTransaccion(async (cx) => {
    // La figura comercial no se borra: sobrevive sin cuenta y sus ventas
    // siguen contando.
    await escribir('update closers set usuario_id = null where usuario_id = $1', [usuarioId],
      { esperadas: 'cualquiera', cliente: cx })
    await escribir('update setters set usuario_id = null where usuario_id = $1', [usuarioId],
      { esperadas: 'cualquiera', cliente: cx })
    await escribir('delete from usuarios where id = $1', [usuarioId], { esperadas: 1, cliente: cx })
    await anotar([{ entidad: 'config', entidadId: 0, campo: 'baja de cuenta',
                    anterior: `${cuenta.nombre} · ${cuenta.email}`, nuevo: null }], usuario.id, cx)
  })

  refrescarTodo()
}

/**
 * Atar una cuenta a su figura comercial —o soltarla, o darle una nueva—.
 *
 * Existe porque sin esto se puede quedar trabado de verdad, y pasó: una persona
 * cambia de email, se le crea la cuenta nueva, y la figura sigue atada a la
 * vieja. La cuenta nueva entra y no ve ningún lead; el alta no sirve para
 * arreglarlo porque el email ya existe, y aunque no existiera tampoco
 * revincularía nada. La única salida era el SQL.
 *
 * Una figura apunta a UNA cuenta. Atarla a otra la suelta de la anterior, y eso
 * es lo que se quiere: es la misma persona con otro email.
 */
export async function vincularFiguraAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const usuarioId = Number(datos.get('usuarioId'))
  const eleccion = String(datos.get('figura') ?? '')

  const cuenta = await fila<{ nombre: string; rol: Rol }>(
    'select nombre, rol from usuarios where id = $1', [usuarioId])
  if (!cuenta) throw new Error('Esa cuenta no existe.')
  if (cuenta.rol !== 'closer' && cuenta.rol !== 'setter') {
    throw new Error('Sólo las cuentas de closer o setter llevan figura comercial.')
  }
  const tabla = cuenta.rol === 'closer' ? 'closers' : 'setters'

  await enTransaccion(async (cx) => {
    // Soltar la que tenga hoy, sea cual sea: una cuenta lleva una sola.
    await escribir(`update ${tabla} set usuario_id = null where usuario_id = $1`,
      [usuarioId], { esperadas: 'cualquiera', cliente: cx })

    if (eleccion === 'nueva') {
      await escribir(
        `insert into ${tabla} (nombre, nombre_pleg, usuario_id) values ($1, $2, $3)
         on conflict (nombre_pleg) do update
            set activo = true, usuario_id = excluded.usuario_id`,
        [cuenta.nombre, plegar(cuenta.nombre), usuarioId], { esperadas: 1, cliente: cx },
      )
    } else if (eleccion !== '') {
      const figuraId = Number(eleccion)
      if (!Number.isInteger(figuraId)) throw new Error('Esa figura no existe.')
      // Si la figura estaba atada a otra cuenta, queda atada a ésta. Es el caso
      // que esto vino a resolver.
      await escribir(`update ${tabla} set usuario_id = $1, activo = true where id = $2`,
        [usuarioId, figuraId], { esperadas: 1, cliente: cx })
    }

    await anotar([{
      entidad: 'config', entidadId: usuarioId, campo: 'figura comercial',
      anterior: null,
      nuevo: eleccion === '' ? 'sin figura' : eleccion === 'nueva' ? `nueva (${cuenta.nombre})` : `figura ${eleccion}`,
    }], usuario.id, cx)
  })

  refrescarTodo()
}

/**
 * Cambiarle el rol a una cuenta.
 *
 * Hace falta cuando alguien pasa de setter a closer, y cuando una cuenta se
 * creó con el rol equivocado — que pasaba solo hasta hace poco.
 */
export async function cambiarRolAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const usuarioId = Number(datos.get('usuarioId'))
  const rol = String(datos.get('rol') ?? '') as Rol
  if (!ROLES.includes(rol)) throw new Error('Ese rol no existe.')

  const antes = await fila<{ rol: Rol; nombre: string }>(
    'select rol, nombre from usuarios where id = $1', [usuarioId])
  if (!antes) throw new Error('Esa cuenta no existe.')
  if (antes.rol === rol) return

  // Nadie se saca a sí mismo la llave de configurar: es la forma más rápida de
  // quedarse sin ningún admin.
  if (usuarioId === usuario.id && !PUEDE[rol].configurar) {
    throw new Error('No te podés sacar a vos mismo el permiso de configurar.')
  }

  await enTransaccion(async (cx) => {
    await escribir('update usuarios set rol = $1 where id = $2', [rol, usuarioId],
      { esperadas: 1, cliente: cx })
    await anotar([{ entidad: 'config', entidadId: usuarioId, campo: 'rol',
                    anterior: antes.rol, nuevo: rol }], usuario.id, cx)
  })

  refrescarTodo()
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
  refrescarTodo()
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
  refrescarTodo()
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
  refrescarTodo()
  revalidatePath('/dashboard')
}
