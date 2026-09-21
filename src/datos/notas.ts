import 'server-only'
import { escribir, filas } from '@/lib/db'
import { oNulo } from '@/lib/texto'

/**
 * Las notas del lead.
 *
 * Texto libre a propósito: lo que pasa en una conversación no entra en una
 * lista de opciones. Lo que NO es libre es quién la escribió y cuándo — sin
 * eso, tres meses después nadie sabe si «dijo que llamaba él» es de enero o de
 * ayer, y una nota que no se puede fechar no se puede usar.
 */

export type Nota = {
  id: number
  texto: string
  autor: string | null
  cuando: string
}

export async function notasDelLead(leadId: number): Promise<Nota[]> {
  const f = await filas<{ id: number; texto: string; autor: string | null; creado_en: Date }>(
    `select n.id, n.texto, u.nombre as autor, n.creado_en
       from notas n left join usuarios u on u.id = n.usuario_id
      where n.lead_id = $1
      order by n.creado_en desc, n.id desc
      limit 200`,
    [leadId],
  )
  return f.map((x) => ({ id: x.id, texto: x.texto, autor: x.autor, cuando: x.creado_en.toISOString() }))
}

export async function agregarNota(leadId: number, texto: string, usuarioId: number): Promise<void> {
  const limpio = oNulo(texto)
  if (limpio === null) throw new Error('La nota está vacía.')
  await escribir(
    'insert into notas (lead_id, texto, usuario_id) values ($1, $2, $3)',
    [leadId, limpio, usuarioId],
  )
}

/**
 * Borrar una nota propia.
 *
 * Propia y nada más: el `usuario_id` va en el WHERE, así que un id ajeno no
 * borra nada y la escritura verificada lo convierte en error en vez de en un
 * «listo» silencioso.
 */
export async function borrarNota(notaId: number, usuarioId: number): Promise<void> {
  await escribir('delete from notas where id = $1 and usuario_id = $2', [notaId, usuarioId])
}
