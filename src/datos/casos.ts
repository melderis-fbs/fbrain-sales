import 'server-only'
import { escribir, escribirDevolviendo, fila, filas } from '@/lib/db'
import { oNulo } from '@/lib/texto'

/**
 * Los casos de éxito.
 *
 * No es una galería de marketing: es munición para el seguimiento. El toque 3
 * de la cadencia dice «caso de éxito similar», y hasta ahora el closer tenía
 * que acordarse de uno y redactarlo de cero cada vez.
 *
 * Por eso cada caso guarda su INDUSTRIA —para poder encontrar el que le sirve a
 * este prospecto— y su MÉTRICA, que es lo único que convence.
 */

export type Caso = {
  id: number
  titulo: string
  cliente: string | null
  industria: string | null
  situacion: string | null
  resultado: string | null
  metrica: string | null
  cita: string | null
  link: string | null
  mensaje: string | null
  activo: boolean
  creadoEn: string
}

function aCaso(x: Record<string, any>): Caso {
  return {
    id: x.id, titulo: x.titulo, cliente: x.cliente, industria: x.industria,
    situacion: x.situacion, resultado: x.resultado, metrica: x.metrica,
    cita: x.cita, link: x.link, mensaje: x.mensaje, activo: x.activo,
    creadoEn: x.creado_en.toISOString(),
  }
}

export async function listarCasos(soloActivos = false, industria?: string): Promise<Caso[]> {
  const condiciones: string[] = []
  const valores: unknown[] = []
  if (soloActivos) condiciones.push('activo')
  if (industria) { valores.push(industria); condiciones.push(`industria = $${valores.length}`) }

  const f = await filas<Record<string, any>>(
    `select * from casos_exito
     ${condiciones.length ? `where ${condiciones.join(' and ')}` : ''}
      order by activo desc, creado_en desc`,
    valores,
  )
  return f.map(aCaso)
}

export async function verCaso(id: number): Promise<Caso | null> {
  const f = await fila<Record<string, any>>('select * from casos_exito where id = $1', [id])
  return f ? aCaso(f) : null
}

export type DatosDeCaso = {
  titulo: string
  cliente?: string | null
  industria?: string | null
  situacion?: string | null
  resultado?: string | null
  metrica?: string | null
  cita?: string | null
  link?: string | null
  mensaje?: string | null
}

export async function guardarCaso(datos: DatosDeCaso, usuarioId: number, id?: number): Promise<number> {
  const titulo = datos.titulo.trim()
  if (titulo === '') throw new Error('El caso necesita un título.')

  const campos = [
    oNulo(datos.cliente), oNulo(datos.industria), oNulo(datos.situacion), oNulo(datos.resultado),
    oNulo(datos.metrica), oNulo(datos.cita), oNulo(datos.link), oNulo(datos.mensaje),
  ]

  if (id) {
    await escribir(
      `update casos_exito set titulo = $1, cliente = $2, industria = $3, situacion = $4,
                              resultado = $5, metrica = $6, cita = $7, link = $8, mensaje = $9,
                              actualizado_en = now()
        where id = $10`,
      [titulo, ...campos, id],
    )
    return id
  }

  const creado = await escribirDevolviendo<{ id: number }>(
    `insert into casos_exito (titulo, cliente, industria, situacion, resultado, metrica, cita, link, mensaje, creado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [titulo, ...campos, usuarioId],
  )
  return creado.id
}

export async function activarCaso(id: number, activo: boolean): Promise<void> {
  await escribir('update casos_exito set activo = $1, actualizado_en = now() where id = $2', [activo, id])
}

/** Las industrias que ya tienen caso. Sirve para saber cuál falta escribir. */
export async function industriasConCaso(): Promise<{ industria: string | null; casos: number }[]> {
  const f = await filas<{ industria: string | null; casos: number }>(
    `select industria, count(*)::int as casos from casos_exito where activo group by 1 order by 2 desc`,
  )
  return f
}

/**
 * Las industrias de los leads que están en seguimiento y NO tienen un caso.
 *
 * Es la lista de lo que falta escribir, ordenada por cuánta gente lo está
 * esperando. Sin esto, «escribir casos de éxito» es una tarea sin principio.
 */
export async function industriasQueFaltan(): Promise<{ industria: string; leads: number }[]> {
  const f = await filas<{ industria: string; leads: number }>(
    `select l.industria, count(*)::int as leads
       from leads l
       join seguimiento_estado se on se.lead_id = l.id and se.situacion = 'activo'
      where l.borrado_en is null and l.industria is not null and btrim(l.industria) <> ''
        and not exists (select 1 from casos_exito c
                         where c.activo and lower(c.industria) = lower(l.industria))
      group by 1 order by 2 desc limit 10`,
  )
  return f
}
