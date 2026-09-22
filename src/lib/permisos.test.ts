import { describe, it, expect } from 'vitest'
import { asignarAQuienCarga, alcanceDe, sinEquipoAsignado, type Alcance } from './permisos'
import type { Usuario } from './auth'

const CLOSER: Alcance = { todo: false, usuarioId: 99, closerId: 7 }
const SETTER: Alcance = { todo: false, usuarioId: 99, setterId: 3 }
const TODO: Alcance = { todo: true }
const NADIE: Alcance = { todo: false, usuarioId: 99, nada: true }

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

  it('quien ve toda la operación no se autoasigna nada', () => {
    // Dirección carga leads de otros todo el tiempo y los sigue viendo igual.
    const lead = asignarAQuienCarga(TODO, { closerId: null, setterId: null })
    expect(lead.closerId).toBe(null)
    expect(lead.setterId).toBe(null)
  })

  it('una cuenta sin figura vinculada no inventa un dueño', () => {
    // No hay a quién asignarlo. Lo que corresponde no es adivinar: es avisarle
    // que su cuenta no está vinculada, que es lo que hace la pantalla.
    expect(asignarAQuienCarga(NADIE, { closerId: null, setterId: null }).closerId).toBe(null)
  })
})

describe('el alcance de una cuenta', () => {
  const cuenta = (extra: Partial<Usuario>): Usuario => ({
    id: 1, email: 'k@k.com', nombre: 'Kevin', rol: 'closer', closerId: null, setterId: null, ...extra,
  })

  it('un closer sin figura vinculada no ve nada, y eso se puede preguntar', () => {
    // Es el caso que dejaba todas las pantallas en cero sin decir por qué.
    expect(sinEquipoAsignado(alcanceDe(cuenta({ closerId: null })))).toBe(true)
    expect(sinEquipoAsignado(alcanceDe(cuenta({ closerId: 7 })))).toBe(false)
  })

  it('un rol que ve toda la operación nunca queda sin alcance', () => {
    expect(sinEquipoAsignado(alcanceDe(cuenta({ rol: 'direccion' })))).toBe(false)
  })
})

describe('una cuenta cuya figura comercial está desactivada', () => {
  it('queda sin alcance, igual que una sin vincular', () => {
    // Es el caso que tuvo bloqueado a un closer días enteros: la sesión sólo
    // toma la figura si está ACTIVA, así que desactivarla lo deja sin ver nada
    // —y hasta ahora el alta le creaba leads que no iba a ver nunca—.
    const sinFigura = alcanceDe({
      id: 1, email: 'b@b.com', nombre: 'Braian', rol: 'closer', closerId: null, setterId: null,
    })
    expect(sinEquipoAsignado(sinFigura)).toBe(true)
    // Y sin alcance no hay a quién asignarle el lead: no se inventa un dueño.
    expect(asignarAQuienCarga(sinFigura, { closerId: null, setterId: null }).closerId).toBe(null)
  })
})
