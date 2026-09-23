import { describe, it, expect } from 'vitest'
import { pasosQueAplican, textoParaSlack, PIDE_DE_SALIDA } from './reporte'

describe('qué se le pregunta al closer', () => {
  it('al que no vino, sólo si vino y qué contar', () => {
    expect(pasosQueAplican('no_show', 'pendiente')).toEqual(['asistencia', 'notas'])
    expect(pasosQueAplican('cancelado', 'pendiente')).toEqual(['asistencia', 'notas'])
  })

  it('al que vino, todo menos la transcripción si no hubo plata ni segunda', () => {
    expect(pasosQueAplican('asistio', 'perdida'))
      .toEqual(['asistencia', 'oferta', 'resultado', 'notas'])
  })

  it('y la transcripción donde sirve: venta, seña y segunda llamada', () => {
    for (const s of ['venta', 'sena', 'segunda'] as const) {
      expect(pasosQueAplican('asistio', s)).toContain('transcripcion')
    }
    expect(pasosQueAplican('asistio', 'seguimiento_cadencia')).not.toContain('transcripcion')
  })

  it('cada resultado pide un dato distinto, y uno solo', () => {
    expect(PIDE_DE_SALIDA.venta).toBe('venta')
    expect(PIDE_DE_SALIDA.perdida).toBe('motivo')
    expect(PIDE_DE_SALIDA.segunda).toBe('segunda')
    expect(PIDE_DE_SALIDA.seguimiento_largo).toBe('volverEl')
    // La cadencia no pide nada: entra a los 12 toques y ya.
    expect(PIDE_DE_SALIDA.seguimiento_cadencia).toBeNull()
  })
})

const base = {
  lead: 'María Fernández', empresa: 'Estudio Fernández', closer: 'Kevin',
  fecha: '18 sep', estado: 'asistio' as const, salida: 'venta' as const,
  huboOferta: true, importe: 4000, moneda: 'USD',
  motivoPerdida: null, proximoPaso: null, notas: null,
}

describe('el mensaje que va al canal', () => {
  it('abre con quién es y quién lo atendió', () => {
    const t = textoParaSlack(base)
    expect(t.split('\n')[0]).toBe('*María Fernández · Estudio Fernández*')
    expect(t).toContain('18 sep · Kevin')
  })

  it('dice el resultado con la plata', () => {
    expect(textoParaSlack(base)).toContain('Resultado: Venta · 4.000 USD')
  })

  it('al que no vino no le inventa oferta ni importe', () => {
    const t = textoParaSlack({ ...base, estado: 'no_show', salida: 'pendiente', importe: null })
    expect(t).toContain('Resultado: No show')
    expect(t).not.toContain('Oferta presentada')
  })

  it('el motivo de pérdida sale escrito igual para todos', () => {
    const t = textoParaSlack({
      ...base, salida: 'perdida', importe: null, motivoPerdida: 'no_era_decisor',
    })
    expect(t).toContain('Motivo: No era decisor')
  })

  it('y lo que escribe el closer va al final, tal cual', () => {
    const t = textoParaSlack({ ...base, notas: '  Quedó en hablar con la socia el lunes.  ' })
    expect(t.endsWith('Quedó en hablar con la socia el lunes.')).toBe(true)
  })
})
