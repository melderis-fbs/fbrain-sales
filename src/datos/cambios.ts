import 'server-only'
import { escribir, filas } from '@/lib/db'
import type { PoolClient } from 'pg'

/**
 * El audit log.
 *
 * Nunca se pierde información: si un lead era de Kevin y ahora es de Braian,
 * queda escrito quién lo cambió, cuándo y por qué. Lo mismo con un resultado,
 * un importe o una fecha.
 *
 * Se anota sólo lo que efectivamente cambió. Guardar «cambió nombre de María a
 * María» llena la historia de ruido y hace que la que importa no se encuentre.
 */

/**
 * Ya no hay 'oportunidad': el lead ES la oportunidad. La plata se anota contra
 * el id del lead, así que la historia de un lead es una sola consulta.
 */
export type Entidad = 'lead' | 'venta' | 'sena' | 'config'

export type Cambio = {
  entidad: Entidad
  entidadId: number
  campo: string
  anterior: string | null
  nuevo: string | null
  motivo?: string | null
}

export async function anotar(
  cambios: readonly Cambio[],
  usuarioId: number | null,
  cliente?: PoolClient,
): Promise<number> {
  const reales = cambios.filter((c) => (c.anterior ?? '') !== (c.nuevo ?? ''))
  if (reales.length === 0) return 0

  const valores: unknown[] = []
  const tuplas = reales.map((c, i) => {
    const b = i * 7
    valores.push(c.entidad, c.entidadId, c.campo, c.anterior, c.nuevo, c.motivo ?? null, usuarioId)
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`
  })

  await escribir(
    `insert into cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, motivo, usuario_id)
     values ${tuplas.join(', ')}`,
    valores,
    { esperadas: reales.length, cliente },
  )
  return reales.length
}

export type LineaDeHistorial = {
  id: number
  campo: string
  anterior: string | null
  nuevo: string | null
  motivo: string | null
  usuario: string | null
  cuando: string
}

export async function historial(entidad: Entidad, entidadId: number): Promise<LineaDeHistorial[]> {
  const f = await filas<{
    id: number; campo: string; valor_anterior: string | null; valor_nuevo: string | null
    motivo: string | null; usuario: string | null; creado_en: Date
  }>(
    `select c.id, c.campo, c.valor_anterior, c.valor_nuevo, c.motivo, u.nombre as usuario, c.creado_en
       from cambios c
       left join usuarios u on u.id = c.usuario_id
      where c.entidad = $1 and c.entidad_id = $2
      order by c.creado_en desc, c.id desc
      limit 200`,
    [entidad, entidadId],
  )
  return f.map((x) => ({
    id: x.id, campo: x.campo, anterior: x.valor_anterior, nuevo: x.valor_nuevo,
    motivo: x.motivo, usuario: x.usuario, cuando: x.creado_en.toISOString(),
  }))
}

/** El historial de un lead incluye el de sus oportunidades: es una sola historia. */
export async function historialDelLead(leadId: number): Promise<LineaDeHistorial[]> {
  const f = await filas<{
    id: number; campo: string; valor_anterior: string | null; valor_nuevo: string | null
    motivo: string | null; usuario: string | null; creado_en: Date; entidad: string
  }>(
    `select c.id, c.campo, c.valor_anterior, c.valor_nuevo, c.motivo,
            u.nombre as usuario, c.creado_en, c.entidad
       from cambios c
       left join usuarios u on u.id = c.usuario_id
      where c.entidad in ('lead', 'venta', 'sena') and c.entidad_id = $1
      order by c.creado_en desc, c.id desc
      limit 200`,
    [leadId],
  )
  return f.map((x) => ({
    id: x.id,
    campo: x.entidad === 'lead' ? x.campo : `${x.entidad}: ${x.campo}`,
    anterior: x.valor_anterior, nuevo: x.valor_nuevo,
    motivo: x.motivo, usuario: x.usuario, cuando: x.creado_en.toISOString(),
  }))
}
