import 'server-only'
import { escribir, escribirDevolviendo, fila, filas, enTransaccion } from '@/lib/db'
import { oNulo } from '@/lib/texto'

/**
 * El playbook de cada closer.
 *
 * Cada uno carga su propio guion y lo va corrigiendo. Por eso está versionado:
 * una nota de hace tres meses se sacó contra el guion de hace tres meses, y
 * releerla contra el de hoy es compararla con algo que no existía.
 *
 * Nunca se edita una versión: se crea la siguiente y la anterior queda.
 */

export type Playbook = {
  id: number
  closerId: number
  closer: string
  nombre: string
  oferta: string | null
  script: string
  version: number
  vigente: boolean
  creadoEn: string
}

export async function playbooksDe(closerId: number): Promise<Playbook[]> {
  const f = await filas<Record<string, any>>(
    `select p.*, c.nombre as closer from playbooks p join closers c on c.id = p.closer_id
      where p.closer_id = $1 order by p.version desc`,
    [closerId],
  )
  return f.map(aPlaybook)
}

export async function todosLosPlaybooks(): Promise<Playbook[]> {
  const f = await filas<Record<string, any>>(
    `select p.*, c.nombre as closer from playbooks p join closers c on c.id = p.closer_id
      where p.vigente order by c.nombre`,
  )
  return f.map(aPlaybook)
}

export async function playbookVigente(closerId: number): Promise<Playbook | null> {
  const f = await fila<Record<string, any>>(
    `select p.*, c.nombre as closer from playbooks p join closers c on c.id = p.closer_id
      where p.closer_id = $1 and p.vigente order by p.version desc limit 1`,
    [closerId],
  )
  return f ? aPlaybook(f) : null
}

export async function verPlaybook(id: number): Promise<Playbook | null> {
  const f = await fila<Record<string, any>>(
    `select p.*, c.nombre as closer from playbooks p join closers c on c.id = p.closer_id where p.id = $1`,
    [id],
  )
  return f ? aPlaybook(f) : null
}

function aPlaybook(x: Record<string, any>): Playbook {
  return {
    id: x.id, closerId: x.closer_id, closer: x.closer, nombre: x.nombre, oferta: x.oferta,
    script: x.script, version: Number(x.version), vigente: x.vigente,
    creadoEn: x.creado_en.toISOString(),
  }
}

export async function guardarPlaybook(
  closerId: number,
  datos: { nombre: string; oferta?: string | null; script: string },
): Promise<number> {
  if (datos.script.trim().length < 100) {
    throw new Error('El script es muy corto: sin guion no hay contra qué comparar la llamada.')
  }

  return enTransaccion(async (cx) => {
    const ultima = await fila<{ v: number }>(
      'select coalesce(max(version), 0) as v from playbooks where closer_id = $1', [closerId], cx,
    )
    await escribir('update playbooks set vigente = false where closer_id = $1 and vigente',
      [closerId], { esperadas: 'cualquiera', cliente: cx })
    const creado = await escribirDevolviendo<{ id: number }>(
      `insert into playbooks (closer_id, nombre, oferta, script, version, vigente)
       values ($1,$2,$3,$4,$5,true) returning id`,
      [closerId, datos.nombre.trim(), oNulo(datos.oferta), datos.script.trim(), (ultima?.v ?? 0) + 1],
      cx,
    )
    return creado.id
  })
}
