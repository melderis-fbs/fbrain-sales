'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { escribir } from '@/lib/db'
import { plegar, oNulo } from '@/lib/texto'
import { anotar } from '@/datos/cambios'

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

export async function altaDePersonaAccion(datos: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const tipo = String(datos.get('tipo'))
  if (tipo !== 'closers' && tipo !== 'setters') throw new Error('Tipo desconocido.')

  const nombre = texto(datos, 'nombre')
  if (!nombre) throw new Error('Hace falta un nombre.')

  // `nombre_pleg` es único: dos veces «María» y «MARIA» no crean dos personas.
  const capacidad = texto(datos, 'capacidadSemanal')
  await escribir(
    tipo === 'closers'
      ? `insert into closers (nombre, nombre_pleg, capacidad_semanal) values ($1, $2, $3)
         on conflict (nombre_pleg) do update set activo = true, nombre = excluded.nombre`
      : `insert into setters (nombre, nombre_pleg) values ($1, $2)
         on conflict (nombre_pleg) do update set activo = true, nombre = excluded.nombre`,
    tipo === 'closers' ? [nombre, plegar(nombre), capacidad ? Number(capacidad) : null] : [nombre, plegar(nombre)],
  )

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
  revalidatePath('/tablero')
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
  revalidatePath('/tablero')
}
