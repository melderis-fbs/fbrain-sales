import { describe, it, expect } from 'vitest'
import { sigueAbierta, COLOR_DE_RESULTADO, RESULTADOS } from './resultados'
import { PUEDE, ROLES } from './roles'

describe('la seña', () => {
  it('no cierra la oportunidad', () => {
    // Es lo que pide la Parte 6: hubo compromiso financiero pero no hay venta.
    expect(sigueAbierta('sena')).toBe(true)
  })

  it('tiene su propio color: no es una venta y no es un seguimiento', () => {
    expect(COLOR_DE_RESULTADO.sena).toBe('sena')
    expect(COLOR_DE_RESULTADO.venta).toBe('verde')
    expect(COLOR_DE_RESULTADO.seguimiento).toBe('amarillo')
  })

  it('una venta y una pérdida sí la cierran', () => {
    expect(sigueAbierta('venta')).toBe(false)
    expect(sigueAbierta('perdida')).toBe(false)
  })
})

describe('resultados', () => {
  it('todos tienen color: ninguno queda sin significado', () => {
    for (const r of RESULTADOS) expect(COLOR_DE_RESULTADO[r]).toBeTruthy()
  })
})

describe('permisos', () => {
  it('todos los roles declaran todos los permisos', () => {
    for (const rol of ROLES) {
      expect(Object.keys(PUEDE[rol]).sort()).toEqual(
        ['configurar', 'cargarResultado', 'editarDinero', 'editarLead', 'reasignarCloser', 'verDinero', 'verTodo'].sort(),
      )
    }
  })

  it('el coach mira, no toca', () => {
    expect(PUEDE.coach.verTodo).toBe(true)
    expect(PUEDE.coach.editarDinero).toBe(false)
    expect(PUEDE.coach.cargarResultado).toBe(false)
  })

  it('un closer no reasigna leads ni toca importes', () => {
    expect(PUEDE.closer.reasignarCloser).toBe(false)
    expect(PUEDE.closer.editarDinero).toBe(false)
    expect(PUEDE.closer.verTodo).toBe(false)
  })

  it('un setter no carga resultados de venta', () => {
    expect(PUEDE.setter.cargarResultado).toBe(false)
  })
})
