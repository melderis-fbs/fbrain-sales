import { describe, it, expect } from 'vitest'
import {
  sigueAbierto, plataQueNoCuadra, COLOR_DE_RESULTADO, COLOR_DE_ESTADO, RESULTADOS, ESTADOS,
} from './resultados'
import { PUEDE, ROLES } from './roles'

describe('la seña', () => {
  it('no cierra el lead', () => {
    // Hubo compromiso financiero pero no hay venta: la oportunidad sigue viva.
    expect(sigueAbierto('sena')).toBe(true)
  })

  it('se lleva el acento, que es el único color con trabajo en la interfaz', () => {
    expect(COLOR_DE_RESULTADO.sena).toBe('acento')
    expect(COLOR_DE_RESULTADO.venta).toBe('verde')
    expect(COLOR_DE_RESULTADO.seguimiento).toBe('ambar')
  })

  it('una venta y una pérdida sí lo cierran', () => {
    expect(sigueAbierto('venta')).toBe(false)
    expect(sigueAbierto('perdida')).toBe(false)
  })
})

describe('resultados y estados', () => {
  it('todos tienen color: ninguno queda sin significado', () => {
    for (const r of RESULTADOS) expect(COLOR_DE_RESULTADO[r]).toBeTruthy()
    for (const e of ESTADOS) expect(COLOR_DE_ESTADO[e]).toBeTruthy()
  })

  it('el estado de la reunión y el resultado de la venta son ejes distintos', () => {
    // Mezclarlos es lo que hace que después no se pueda contestar «cuántas
    // asistencias hubo» sin discutir.
    expect(ESTADOS).not.toContain('venta')
    expect(RESULTADOS).not.toContain('asistio')
  })
})

describe('permisos', () => {
  it('todos los roles declaran todos los permisos', () => {
    for (const rol of ROLES) {
      expect(Object.keys(PUEDE[rol]).sort()).toEqual(
        ['configurar', 'cargarResultado', 'editarDinero', 'editarLead', 'borrarLead',
         'restaurarLead', 'reasignarCloser', 'verDinero', 'verTodo'].sort(),
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

  it('el setter y el closer dan de baja lo suyo, pero no lo restauran', () => {
    // Si el que se equivocó pudiera deshacerlo solo, el error no dejaría
    // rastro. El punto de que la baja sea reversible es que el error se vea.
    for (const rol of ['setter', 'closer'] as const) {
      expect(PUEDE[rol].borrarLead).toBe(true)
      expect(PUEDE[rol].restaurarLead).toBe(false)
    }
    expect(PUEDE.direccion.restaurarLead).toBe(true)
  })

  it('dar de baja un lead con plata necesita permiso sobre la plata', () => {
    // La regla vive en la acción, pero se apoya en esto: quien no puede tocar
    // importes tampoco puede hacerlos desaparecer dando de baja el lead.
    expect(PUEDE.setter.editarDinero).toBe(false)
    expect(PUEDE.closer.editarDinero).toBe(false)
    expect(PUEDE.head.editarDinero).toBe(true)
  })

  it('el coach no borra nada', () => {
    expect(PUEDE.coach.borrarLead).toBe(false)
    expect(PUEDE.coach.restaurarLead).toBe(false)
  })
})

describe('la plata que no cuadra con el resultado', () => {
  it('una venta en un lead que dice cualquier otra cosa está inflando la facturación', () => {
    // Es el error que estuvo vivo: corregir el resultado sacaba el lead del
    // embudo y dejaba la plata contando en el mes.
    expect(plataQueNoCuadra('perdida', { venta: 5000, sena: 0 })).toBe('venta')
    expect(plataQueNoCuadra('pendiente', { venta: 5000, sena: 0 })).toBe('venta')
    expect(plataQueNoCuadra('venta', { venta: 5000, sena: 0 })).toBe(null)
  })

  it('una seña convive con un lead abierto: eso no es un error', () => {
    // La seña NO cierra el lead. Avisar acá sería avisar de lo normal, y un
    // aviso que salta siempre deja de leerse.
    for (const r of ['pendiente', 'seguimiento', 'sena'] as const) {
      expect(plataQueNoCuadra(r, { venta: 0, sena: 1000 })).toBe(null)
    }
  })

  it('una seña en un lead cerrado en falso sí lo es', () => {
    expect(plataQueNoCuadra('perdida', { venta: 0, sena: 1000 })).toBe('sena')
    expect(plataQueNoCuadra('no_calificado', { venta: 0, sena: 1000 })).toBe('sena')
  })

  it('sin plata cargada no hay nada que avisar, diga lo que diga el resultado', () => {
    for (const r of RESULTADOS) expect(plataQueNoCuadra(r, { venta: 0, sena: 0 })).toBe(null)
  })

  it('la venta manda sobre la seña: lo que infla la facturación se avisa primero', () => {
    expect(plataQueNoCuadra('perdida', { venta: 5000, sena: 1000 })).toBe('venta')
  })
})
