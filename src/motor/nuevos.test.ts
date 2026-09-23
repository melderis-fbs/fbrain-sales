import { describe, expect, it } from 'vitest'
import { calidadDelLead } from './calidad'
import { puntuar, type Modelo } from './scoring'
import { comoViene, espera, fechaDelToque, toqueSiguiente } from './toques'
import { cierreAjustado, tasaSuavizada } from './ajuste'
import { DIMENSIONES, PENALIZACIONES, BONIFICACIONES, TOPES, TOPE_DE_BONIFICACIONES, NIVEL_A_NOTA } from '@/dominio/rubrica'

const MODELO: Modelo = {
  dimensiones: DIMENSIONES.map((d) => ({ clave: d.clave, nombre: d.nombre, peso: d.peso })),
  niveles: Object.fromEntries(Object.entries(NIVEL_A_NOTA).map(([k, v]) => [k, v])),
  penalizaciones: Object.fromEntries(
    Object.entries(PENALIZACIONES).map(([k, v]) => [k, { valor: v.valor, dimension: v.dimension }])),
  bonificaciones: Object.fromEntries(Object.entries(BONIFICACIONES).map(([k, v]) => [k, v.valor])),
  topeBonificaciones: TOPE_DE_BONIFICACIONES,
  topes: TOPES.map((t) => ({ dimension: t.dimension, menorA: t.menorA, tope: t.tope })),
}

const todos = (nivel: number) => DIMENSIONES.map((d) => ({ dimension: d.clave, nivel }))

describe('lead quality', () => {
  it('no publica nivel cuando falta más de la mitad de la ficha', () => {
    const c = calidadDelLead({ capacidad_inversion: 'si' })
    expect(c.score).toBeNull()
    expect(c.nivel).toBeNull()
    expect(c.faltan.length).toBeGreaterThan(0)
  })

  it('un lead que contesta todo lo mejor da 100', () => {
    const c = calidadDelLead({
      capacidad_inversion: 'si', es_decisor: 'si', urgencia: '5', facturacion_mensual: 'mas_15k',
      tiene_clientes: 'recurrentes', oferta_definida: 'si', conciencia: 'compara', interes: 'alto',
    })
    expect(c.score).toBe(100)
    expect(c.nivel).toBe('alto')
    expect(c.completitud).toBe(100)
  })

  it('lo que no se contestó no puntúa cero: sale del cálculo', () => {
    // Todo lo mejor, menos dos campos sin contestar: sigue siendo 100, no 80.
    const c = calidadDelLead({
      capacidad_inversion: 'si', es_decisor: 'si', urgencia: '5', facturacion_mensual: 'mas_15k',
      tiene_clientes: 'recurrentes', oferta_definida: 'si',
    })
    expect(c.score).toBe(100)
    expect(c.completitud).toBe(90)
  })

  it('cada aporte dice de dónde salió el número', () => {
    const c = calidadDelLead({
      capacidad_inversion: 'no', es_decisor: 'si', urgencia: '3', facturacion_mensual: '2k_5k',
      tiene_clientes: 'algunos', oferta_definida: 'si', conciencia: 'sabe', interes: 'medio',
    })
    const plata = c.aportes.find((a) => a.clave === 'capacidad_inversion')
    expect(plata?.aporte).toBe(0)
    expect(plata?.respuesta).toBe('No puede')
    expect(c.score).toBeLessThan(60)
  })
})

describe('scoring de llamadas', () => {
  it('la misma llamada da siempre la misma nota', () => {
    const a = puntuar(todos(3), ['pitch_prematuro'], MODELO)
    const b = puntuar(todos(3), ['pitch_prematuro'], MODELO)
    expect(a.score).toBe(b.score)
  })

  it('el peso ya castiga los fundamentos flojos, antes de cualquier tope', () => {
    // Todo en el nivel máximo salvo descubrimiento, dolor y diagnóstico en el
    // piso. Promediando las ocho dimensiones a secas daría 6,75; con los pesos
    // —que son la mitad del total— da 6,0. Ese es el 7,4 que no vuelve a pasar.
    const niveles = DIMENSIONES.map((d) => ({
      dimension: d.clave,
      nivel: ['descubrimiento', 'diagnostico', 'dolor'].includes(d.clave) ? 1 : 4,
    }))
    expect(puntuar(niveles, [], { ...MODELO, topes: [] }).score).toBe(6.0)
  })

  it('el tope pone un techo que ninguna otra dimensión compensa', () => {
    // Impecable en todo menos en descubrimiento. El promedio ponderado da 7,8,
    // y no: sin descubrimiento no se puede saber si lo que se vendió servía.
    const niveles = DIMENSIONES.map((d) => ({
      dimension: d.clave, nivel: d.clave === 'descubrimiento' ? 1 : 4,
    }))
    expect(puntuar(niveles, [], { ...MODELO, topes: [] }).score).toBe(7.8)
    const conTope = puntuar(niveles, [], MODELO)
    expect(conTope.score).toBe(7.0)
    expect(conTope.topeAplicado).toBe(7.0)
  })

  it('las bonificaciones tienen techo: lo lindo no compensa lo grave', () => {
    const p = puntuar(todos(2), Object.keys(BONIFICACIONES), MODELO)
    expect(p.bonificacion).toBe(TOPE_DE_BONIFICACIONES)
  })

  it('las penalizaciones tienen piso', () => {
    // Con todas las dimensiones en nivel 4, ninguna «ya lo contó», así que
    // entran todas y el piso es lo que las frena.
    const p = puntuar(todos(4), Object.keys(PENALIZACIONES), MODELO)
    expect(p.penalizacion).toBe(-1.5)
  })

  it('una penalización NO resta si la dimensión que la mide ya quedó floja', () => {
    // El error que daba notas que no se sostienen: las dimensiones promediaban
    // 5,0 y la nota final era 3,0 «mala», con «cierre 3» restando además por
    // «no pidió una decisión» y por «no estableció el próximo paso». Es el
    // mismo hecho cobrado tres veces, y una nota que contradice el detalle que
    // tiene abajo no se discute con el closer: se descarta.
    const p = puntuar(todos(2), ['no_pide_decision', 'no_establece_proximo_paso'], MODELO)
    expect(p.penalizacion).toBe(0)
    expect(p.penalizacionesAbsorbidas.sort())
      .toEqual(['no_establece_proximo_paso', 'no_pide_decision'])
    // Y siguen siendo verdad: se devuelven para poder mostrarlas.
  })

  it('pero sí resta lo que pasó dentro de una dimensión que salió bien', () => {
    // Un cierre de nivel 4 que igual no pidió la decisión es información que
    // el nivel no alcanzó a mostrar, y ahí la penalización hace su trabajo.
    const p = puntuar(todos(4), ['no_pide_decision'], MODELO)
    expect(p.penalizacion).toBe(-0.5)
    expect(p.penalizacionesAbsorbidas).toEqual([])
  })

  it('y lo que ninguna dimensión mide resta siempre', () => {
    // Prometer algo que el programa no hace no lo mide ninguna dimensión.
    const p = puntuar(todos(0), ['promesa_incorrecta'], MODELO)
    expect(p.penalizacion).toBe(-1)
  })

  it('una dimensión sin evidencia no cuenta como cero', () => {
    const conTodo = puntuar(todos(3), [], MODELO)
    const sinUna = puntuar(
      DIMENSIONES.map((d) => ({ dimension: d.clave, nivel: d.clave === 'cierre' ? null : 3 })),
      [], MODELO,
    )
    expect(sinUna.base).toBe(conTodo.base)
    expect(sinUna.sinEvidencia).toEqual(['cierre'])
  })

  it('sin ninguna evidencia no inventa una nota alta ni baja', () => {
    const p = puntuar(DIMENSIONES.map((d) => ({ dimension: d.clave, nivel: null })), [], MODELO)
    expect(p.base).toBe(0)
    expect(p.sinEvidencia).toHaveLength(DIMENSIONES.length)
  })

  it('los aportes de las dimensiones suman la base', () => {
    const p = puntuar(todos(2), [], MODELO)
    const suma = p.dimensiones.reduce((s, d) => s + d.aporte, 0)
    expect(Math.abs(suma - p.base)).toBeLessThan(0.05)
  })
})

describe('cadencia de seguimientos', () => {
  const TOQUES = [
    { orden: 1, nombre: 'a', dias: 0 }, { orden: 2, nombre: 'b', dias: 1 },
    { orden: 3, nombre: 'c', dias: 3 }, { orden: 4, nombre: 'd', dias: 7 },
  ]

  it('la espera de cada toque es contra el anterior, no contra el ingreso', () => {
    expect(espera(TOQUES, 1)).toBe(0)
    expect(espera(TOQUES, 2)).toBe(1)
    expect(espera(TOQUES, 3)).toBe(2)
    expect(espera(TOQUES, 4)).toBe(4)
  })

  it('un toque atrasado corre los que vienen en vez de vencerlos todos juntos', () => {
    // El toque 2 tocaba el 02 y se hizo el 05. El 3 no vence de una: pasa al 07.
    expect(fechaDelToque(TOQUES, 3, '2026-09-05')).toBe('2026-09-07')
  })

  it('distingue vencido de lo que toca hoy', () => {
    expect(comoViene('2026-09-18', '2026-09-21').urgencia).toBe('vencido')
    expect(comoViene('2026-09-21', '2026-09-21').urgencia).toBe('hoy')
    expect(comoViene('2026-09-22', '2026-09-21').urgencia).toBe('proximo')
    expect(comoViene('2026-10-01', '2026-09-21').urgencia).toBe('espera')
  })

  it('después del último toque no hay siguiente', () => {
    expect(toqueSiguiente(TOQUES, 3)).toBe(4)
    expect(toqueSiguiente(TOQUES, 4)).toBeNull()
  })
})

describe('cierre ajustado por lead quality', () => {
  it('pocas asistencias no publican índice', () => {
    const a = cierreAjustado([{ nivel: 'alto', asistencias: 4, ventas: 2 }], { alto: 0.3 }, 0.2)
    expect(a.indice).toBeNull()
    expect(a.porque).toContain('4')
  })

  it('con pocos casos la tasa no se va al 50%', () => {
    expect(tasaSuavizada(2, 4, 0.2)).toBeCloseTo(0.2857, 3)
    expect(tasaSuavizada(20, 100, 0.2)).toBeCloseTo(0.2, 2)
  })

  it('el que cierra menos con leads peores puede rendir más', () => {
    const tasas = { alto: 0.35, medio: 0.2, bajo: 0.08 }
    const flojos = cierreAjustado(
      [{ nivel: 'bajo', asistencias: 30, ventas: 5 }], tasas, 0.2,
    )
    const buenos = cierreAjustado(
      [{ nivel: 'alto', asistencias: 30, ventas: 8 }], tasas, 0.2,
    )
    expect(flojos.bruto! < buenos.bruto!).toBe(true)
    expect(flojos.indice! > buenos.indice!).toBe(true)
  })
})
