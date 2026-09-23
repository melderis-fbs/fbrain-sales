import { describe, it, expect } from 'vitest'
import { embudo, tasa } from './embudo'
import { ritmo, diasHabilesTranscurridos } from './objetivo'
import { rango, lunesDe, sumarDias, diasDelMes, hoyEn } from './periodos'

describe('embudo', () => {
  it('cada etapa se mide contra su base, no contra la de arriba', () => {
    const e = embudo({ agendadas: 100, asistidas: 83, ofertas: 76, senas: 9, ventas: 6 })
    // Asistidas sobre agendadas; ofertas, señas y ventas sobre asistidas.
    expect(e.map((x) => x.paso)).toEqual([null, 83, 91.6, 10.8, 7.2])
    expect(e.map((x) => x.sobre)).toEqual(
      [null, 'de las agendadas', 'de las asistencias', 'de las asistencias', 'de las asistencias'])
  })

  it('la venta NO se mide contra la seña: daría más de 100% y no sería un error de redondeo', () => {
    // El caso real: dos señas y doce ventas daban «Ventas · 600% de señas». La
    // seña no es un paso obligatorio —la mayoría de las ventas no pasa por
    // ahí— y un número imposible en la pantalla principal se lleva puesta la
    // confianza en el resto del tablero.
    const e = embudo({ agendadas: 99, asistidas: 87, ofertas: 10, senas: 2, ventas: 12 })
    const ventas = e.find((x) => x.clave === 'ventas')
    expect(ventas?.paso).toBe(13.8)          // 12 sobre 87 asistencias
    expect(ventas?.sobre).toBe('de las asistencias')
  })

  it('no divide por cero: sin base el paso es null, no 0%', () => {
    const e = embudo({ agendadas: 0, asistidas: 0, ofertas: 0, senas: 0, ventas: 0 })
    expect(e.every((x) => x.paso === null)).toBe(true)
  })
})

describe('tasa', () => {
  it('sobre cero devuelve null, no cero', () => {
    // «0% de asistencia» sobre cero agendadas es una afirmación falsa.
    expect(tasa(0, 0)).toBeNull()
    expect(tasa(0, 10)).toBe(0)
  })
})

describe('ritmo del objetivo', () => {
  it('compara lo alcanzado contra lo esperado a esta altura del mes', () => {
    const r = ritmo(160_000, 104_000, 12, 22)!
    expect(r.alcanzado).toBe(65)
    expect(r.ritmoEsperado).toBe(54.5)
    expect(r.desvio).toBe(10.5)
    expect(r.estado).toBe('sobre')
  })

  it('el mismo porcentaje cerca de fin de mes está por debajo', () => {
    expect(ritmo(160_000, 104_000, 21, 22)!.estado).toBe('debajo')
  })

  it('sin objetivo cargado no inventa uno', () => {
    expect(ritmo(0, 104_000, 12, 22)).toBeNull()
  })
})

describe('días hábiles', () => {
  it('no cuenta sábados ni domingos', () => {
    // 2026-09-01 es martes; al viernes 4 hay 4 hábiles.
    expect(diasHabilesTranscurridos('2026-09-01', '2026-09-04', '2026-09-30')).toBe(4)
    // El lunes 7 suma uno solo: el finde no cuenta.
    expect(diasHabilesTranscurridos('2026-09-01', '2026-09-07', '2026-09-30')).toBe(5)
  })

  it('no se pasa del fin del período', () => {
    expect(diasHabilesTranscurridos('2026-09-01', '2026-12-31', '2026-09-30')).toBe(22)
  })
})

describe('períodos', () => {
  it('la semana arranca el lunes', () => {
    expect(lunesDe('2026-09-15')).toBe('2026-09-14')   // martes → lunes
    expect(lunesDe('2026-09-13')).toBe('2026-09-07')   // domingo → lunes anterior
  })

  it('el mes va del 1 al último día', () => {
    expect(rango('mes', '2026-09-15')).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30' })
    expect(rango('mes_anterior', '2026-01-15')).toMatchObject({ desde: '2025-12-01', hasta: '2025-12-31' })
  })

  it('los últimos 3 meses cruzan el año sin romperse', () => {
    expect(rango('ultimos_3_meses', '2026-01-15')).toMatchObject({ desde: '2025-11-01', hasta: '2026-01-31' })
  })

  it('febrero bisiesto', () => {
    expect(diasDelMes(2028, 2)).toBe(29)
    expect(diasDelMes(2026, 2)).toBe(28)
  })

  it('sumar días cruza el mes', () => {
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('hoy no se corre un día por la zona horaria', () => {
    // Las 2 de la mañana UTC del 16 son todavía el 15 en Buenos Aires.
    const medianoche = new Date('2026-09-16T02:00:00Z')
    expect(hoyEn('America/Argentina/Buenos_Aires', medianoche)).toBe('2026-09-15')
  })
})
