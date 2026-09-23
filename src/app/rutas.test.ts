import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Todo `redirect()` tiene que llevar a una pantalla que existe.
 *
 * Existe porque pasó: analizar una llamada terminaba con
 * `redirect('/llamadas/{id}')`, una ruta que nunca se creó. El análisis se
 * guardaba bien, el informe quedaba hecho, y el que lo había lanzado veía un
 * 404 después de esperar dos minutos. Cualquier otro entraba por otro lado y
 * lo veía perfecto, así que del lado del equipo se leía como «a mí me anda, a
 * él no» y no como una ruta mal escrita.
 *
 * Es un error que el compilador no ve —una cadena es una cadena— y que las
 * pruebas de reglas tampoco, porque la regla está bien. Se ve acá.
 */

const APP = join(process.cwd(), 'src', 'app')

/** Las rutas que existen, como patrones: `/leads/[id]` → `/leads/:`. */
function rutasDeclaradas(dir: string, prefijo = ''): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir)) {
    const camino = join(dir, entrada)
    if (!statSync(camino).isDirectory()) continue
    // Los grupos `(app)` no aparecen en la URL.
    const segmento = entrada.startsWith('(') && entrada.endsWith(')')
      ? prefijo
      : `${prefijo}/${entrada.startsWith('[') ? ':' : entrada}`
    if (readdirSync(camino).some((f) => f === 'page.tsx' || f === 'route.ts')) {
      salida.push(segmento === '' ? '/' : segmento)
    }
    salida.push(...rutasDeclaradas(camino, segmento))
  }
  return salida
}

/** Cada `redirect('...')` de los archivos de acciones, con su archivo. */
function redirecciones(dir: string): { archivo: string; destino: string }[] {
  const salida: { archivo: string; destino: string }[] = []
  for (const entrada of readdirSync(dir)) {
    const camino = join(dir, entrada)
    if (statSync(camino).isDirectory()) { salida.push(...redirecciones(camino)); continue }
    if (!/\.tsx?$/.test(entrada) || entrada.includes('.test.')) continue
    const texto = readFileSync(camino, 'utf8')
    for (const m of texto.matchAll(/redirect\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      const destino = m[1] ?? ''
      // Sólo las internas y sin parámetros de búsqueda, que no cambian la ruta.
      if (!destino.startsWith('/')) continue
      salida.push({ archivo: camino.replace(process.cwd() + '/', ''), destino })
    }
  }
  return salida
}

/** `/analizador/${llamadaId}` y `/leads/${id}?x=1` → `/analizador/:`, `/leads/:`. */
function comoPatron(destino: string): string {
  const sinBusqueda = destino.split('?')[0] ?? ''
  const partes = sinBusqueda.split('/').filter((x) => x !== '')
  const patron = partes.map((x) => (x.includes('${') ? ':' : x)).join('/')
  return patron === '' ? '/' : `/${patron}`
}

describe('las rutas a las que se redirige', () => {
  const declaradas = new Set(rutasDeclaradas(APP))

  it('declara las pantallas que se esperan', () => {
    expect(declaradas.has('/analizador/:')).toBe(true)
    expect(declaradas.has('/leads/:')).toBe(true)
    // La que no existe, y a la que se redirigía.
    expect(declaradas.has('/llamadas/:')).toBe(false)
  })

  it('todas existen', () => {
    const rotas = redirecciones(APP)
      .filter(({ destino }) => !declaradas.has(comoPatron(destino)))
      .map(({ archivo, destino }) => `${archivo} → ${destino}`)
    expect(rotas).toEqual([])
  })
})
