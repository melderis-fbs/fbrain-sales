import 'server-only'
import { filas } from '@/lib/db'

export type Opcion = { id: number; nombre: string }
export type CloserOpcion = Opcion & { capacidadSemanal: number | null }

export async function fuentes(soloActivas = true): Promise<Opcion[]> {
  return filas<Opcion>(
    `select id, nombre from fuentes ${soloActivas ? 'where activa' : ''} order by orden, nombre`,
  )
}

export async function funnels(soloActivos = true): Promise<Opcion[]> {
  return filas<Opcion>(
    `select id, nombre from funnels ${soloActivos ? 'where activo' : ''} order by orden, nombre`,
  )
}

export async function setters(soloActivos = true): Promise<Opcion[]> {
  return filas<Opcion>(
    `select id, nombre from setters ${soloActivos ? 'where activo' : ''} order by nombre`,
  )
}

export async function closers(soloActivos = true): Promise<CloserOpcion[]> {
  const f = await filas<{ id: number; nombre: string; capacidad_semanal: number | null }>(
    `select id, nombre, capacidad_semanal from closers ${soloActivos ? 'where activo' : ''} order by nombre`,
  )
  return f.map((c) => ({ id: c.id, nombre: c.nombre, capacidadSemanal: c.capacidad_semanal }))
}

/** Los catálogos de un formulario, en un viaje. */
export async function catalogos() {
  const [f, fn, s, c] = await Promise.all([fuentes(), funnels(), setters(), closers()])
  return { fuentes: f, funnels: fn, setters: s, closers: c }
}

export async function config<T>(clave: string, siNoEsta: T): Promise<T> {
  const r = await filas<{ valor: T }>('select valor from config where clave = $1', [clave])
  return r[0]?.valor ?? siNoEsta
}
