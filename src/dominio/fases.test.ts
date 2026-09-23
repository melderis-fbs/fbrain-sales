import { describe, it, expect } from 'vitest'
import {
  adherencia, notaDeFases, normalizarFases, pesoTotal, FASES_POR_DEFECTO, type Fase,
} from './fases'

const FASES: Fase[] = [
  { clave: 'a', nombre: 'A', peso: 50, objetivo: '', comoSeHace: '' },
  { clave: 'b', nombre: 'B', peso: 30, objetivo: '', comoSeHace: '' },
  { clave: 'c', nombre: 'C', peso: 20, objetivo: '', comoSeHace: '' },
]

describe('las fases por defecto', () => {
  it('suman 100: si no, el porcentaje de adherencia no sería un porcentaje', () => {
    expect(pesoTotal(FASES_POR_DEFECTO)).toBe(100)
  })

  it('no tienen dos claves iguales: el modelo no sabría a cuál se refiere', () => {
    const claves = FASES_POR_DEFECTO.map((f) => f.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('cada una dice qué tiene que lograr: es contra eso que se evalúa', () => {
    for (const f of FASES_POR_DEFECTO) expect(f.objetivo.length).toBeGreaterThan(10)
  })
})

describe('la adherencia al script', () => {
  it('pondera por peso, y un paso a medias vale medio', () => {
    expect(adherencia(FASES, [
      { clave: 'a', ejecucion: 'ejecutado' },
      { clave: 'b', ejecucion: 'parcial' },
      { clave: 'c', ejecucion: 'no_ejecutado' },
    ])).toBe(65)   // 50 + 15 + 0
  })

  it('una fase que el modelo no nombró cuenta como no ejecutada', () => {
    // Es lo correcto acá y es la diferencia con la nota: si no aparece en
    // ningún lado de la transcripción, el paso no se hizo.
    expect(adherencia(FASES, [{ clave: 'a', ejecucion: 'ejecutado' }])).toBe(50)
  })

  it('sin fases no hay porcentaje, y eso se dice con null y no con cero', () => {
    expect(adherencia([], [])).toBe(null)
  })
})

describe('la nota de las fases', () => {
  it('es el promedio ponderado de las notas', () => {
    expect(notaDeFases(FASES, [
      { clave: 'a', nota: 8 }, { clave: 'b', nota: 6 }, { clave: 'c', nota: 5 },
    ])).toBe(6.8)   // (8*50 + 6*30 + 5*20) / 100
  })

  it('una fase sin nota queda FUERA del promedio, no en cero', () => {
    // Que no se haya podido evaluar no es lo mismo que haberla hecho pésimo, y
    // ponerle cero convierte una laguna en una acusación.
    expect(notaDeFases(FASES, [
      { clave: 'a', nota: 8 }, { clave: 'b', nota: null }, { clave: 'c', nota: 8 },
    ])).toBe(8)
  })

  it('sin ninguna nota, no hay nota', () => {
    expect(notaDeFases(FASES, [])).toBe(null)
  })
})

describe('cargar fases desde la pantalla', () => {
  it('deriva la clave del nombre, sin acentos ni espacios', () => {
    const f = normalizarFases([{ nombre: 'Por qué ahora / urgencia', peso: 10 }])
    expect(f[0]?.clave).toBe('por_que_ahora_urgencia')
  })

  it('dos fases con el mismo nombre no comparten clave', () => {
    const f = normalizarFases([{ nombre: 'Cierre', peso: 5 }, { nombre: 'Cierre', peso: 5 }])
    expect(f[0]?.clave).not.toBe(f[1]?.clave)
  })

  it('una fila sin nombre no es una fase y se descarta', () => {
    expect(normalizarFases([{ nombre: '   ', peso: 10 }])).toEqual([])
  })

  it('un peso que no es un número es cero, no NaN', () => {
    expect(normalizarFases([{ nombre: 'A', peso: 'ocho' }])[0]?.peso).toBe(0)
  })
})
