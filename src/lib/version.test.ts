import { describe, it, expect, afterEach } from 'vitest'
import { versionQueCorre } from './version'

/**
 * Lo que se prueba acá es una sola distinción, y es la que costó una ronda
 * entera de «a mí me anda y a ellos no»: el commit NO identifica al deploy.
 *
 * Dos pantallas mostraban `production · 1ef91dd` las dos y usaban claves
 * distintas. Con el commit solo, eso parece imposible y manda a buscar el
 * problema donde no está —en los permisos, en el rol—. Con el build a la
 * vista, es evidente: el mismo commit se publicó dos veces con variables
 * distintas.
 */
const guardadas = { ...process.env }
afterEach(() => { process.env = { ...guardadas } })

describe('versionQueCorre', () => {
  it('fuera de Vercel no inventa un número', () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA
    delete process.env.VERCEL_DEPLOYMENT_ID
    delete process.env.VERCEL_URL
    delete process.env.VERCEL_ENV
    const v = versionQueCorre()
    expect(v.commit).toBeNull()
    expect(v.despliegue).toBeNull()
    expect(v.entorno).toBe('local')
  })

  it('distingue dos builds del MISMO commit', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_GIT_COMMIT_SHA = '1ef91dd0000000000000000000000000000000'

    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_AAAAAAAAAAAAAAAAAAAAAAviejo123'
    const antes = versionQueCorre()

    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_BBBBBBBBBBBBBBBBBBBBBBnuevo456'
    const despues = versionQueCorre()

    expect(antes.commit).toBe(despues.commit)
    expect(antes.despliegue).not.toBe(despues.despliegue)
  })

  it('si no hay id de build usa la URL, que también es única por build', () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.VERCEL_DEPLOYMENT_ID
    process.env.VERCEL_URL = 'fbrain-sales-git-abc123xyz.vercel.app'
    expect(versionQueCorre().despliegue).not.toBeNull()
  })

  it('el build se muestra cortito: es para comparar, no para buscarlo', () => {
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_9xQ2mK4pLt7ZaBc3Rd8Vf1Gh5Jk6'
    const v = versionQueCorre()
    expect(v.despliegue!.length).toBeLessThanOrEqual(11)
    expect(v.despliegue).toContain('5Jk6')
    // Sin el prefijo, que es igual en todos y no distingue nada.
    expect(v.despliegue).not.toContain('dpl_')
  })

  it('del mensaje del commit se queda con el título', () => {
    process.env.VERCEL_GIT_COMMIT_MESSAGE = 'Arregla el panel\n\nY explica por qué.'
    expect(versionQueCorre().mensaje).toBe('Arregla el panel')
  })
})
