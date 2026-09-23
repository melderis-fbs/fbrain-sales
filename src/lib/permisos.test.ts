import { describe, it, expect } from 'vitest'
import {
  asignarAQuienCarga, alcanceDe, figuraDe, sinFiguraVinculada, type Figura,
} from './permisos'
import type { Usuario } from './auth'

const CLOSER: Figura = { tipo: 'closer', closerId: 7 }
const SETTER: Figura = { tipo: 'setter', setterId: 3 }
const NINGUNA: Figura = { tipo: 'ninguna' }

const cuenta = (extra: Partial<Usuario>): Usuario => ({
  id: 1, email: 'k@k.com', nombre: 'Kevin', rol: 'closer', closerId: null, setterId: null, ...extra,
})

describe('de quién es el lead que alguien carga', () => {
  it('el que carga un closer es suyo, aunque no se elija a sí mismo', () => {
    // Sin esto el lead quedaba sin dueño: se guardaba bien y desaparecía de su
    // pantalla, que del otro lado se lee como «no puedo crear leads».
    expect(asignarAQuienCarga(CLOSER, { closerId: null, setterId: null }).closerId).toBe(7)
  })

  it('el que carga un setter queda agendado por él', () => {
    expect(asignarAQuienCarga(SETTER, { closerId: null, setterId: null }).setterId).toBe(3)
  })

  it('un setter puede agendar para otro closer: el lead queda de los dos', () => {
    const lead = asignarAQuienCarga(SETTER, { closerId: 9, setterId: null })
    expect(lead.closerId).toBe(9)
    expect(lead.setterId).toBe(3)
  })

  it('no pisa lo que se eligió a mano', () => {
    expect(asignarAQuienCarga(CLOSER, { closerId: 9, setterId: null }).closerId).toBe(9)
  })

  it('quien no tiene figura comercial no se autoasigna nada', () => {
    // Dirección carga leads de otros todo el tiempo y los sigue viendo igual.
    const lead = asignarAQuienCarga(NINGUNA, { closerId: null, setterId: null })
    expect(lead.closerId).toBe(null)
    expect(lead.setterId).toBe(null)
  })
})

describe('ver todo y ser alguien son dos cosas distintas', () => {
  it('un closer ve toda la operación', () => {
    // Decisión del negocio: el equipo es chico y los leads se pasan. Un setter
    // que ve «está duplicado» y no puede ver contra qué no lee un permiso:
    // lee que el sistema está roto.
    expect(alcanceDe(cuenta({ closerId: 7 })).todo).toBe(true)
    expect(alcanceDe(cuenta({ rol: 'setter', setterId: 3 })).todo).toBe(true)
    expect(alcanceDe(cuenta({ rol: 'direccion' })).todo).toBe(true)
  })

  it('pero lo que carga sigue siendo suyo', () => {
    // El error que esto evita: abrirle la vista a un closer le quitaba el
    // dueño a lo que cargaba, porque las dos preguntas eran la misma.
    const figura = figuraDe(cuenta({ closerId: 7 }))
    expect(figura).toEqual({ tipo: 'closer', closerId: 7 })
    expect(asignarAQuienCarga(figura, { closerId: null, setterId: null }).closerId).toBe(7)
  })

  it('una cuenta de closer sin figura vinculada se avisa, no se adivina', () => {
    // Pasa cada vez que se crea el usuario antes que la persona en
    // Configuración, y también si la figura se desactiva: la sesión sólo la
    // toma si está activa. Lo que carga no queda a nombre de nadie.
    expect(sinFiguraVinculada(cuenta({ closerId: null }))).toBe(true)
    expect(sinFiguraVinculada(cuenta({ closerId: 7 }))).toBe(false)
    expect(sinFiguraVinculada(cuenta({ rol: 'direccion' }))).toBe(false)
    expect(figuraDe(cuenta({ closerId: null })).tipo).toBe('ninguna')
  })
})
