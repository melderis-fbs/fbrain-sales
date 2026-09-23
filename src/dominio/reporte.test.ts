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
  tipoSesion: 'primera' as const,
  fuente: 'Webinar',
  lead: 'Rosa Saez',
  resumen: 'Es foniatra y quiere convertir su profesión en un negocio.',
  oferta: null,
  estado: 'asistio' as const,
  salida: 'venta' as const,
  importe: 4000,
  moneda: 'USD',
  programa: 'GROWTH',
  motivoPerdida: null,
  volverEl: null,
  fechaSegunda: null,
  proximosPasos: null,
}

describe('el mensaje que va al canal', () => {
  it('son seis renglones con sus rótulos, siempre los mismos', () => {
    const renglones = textoParaSlack(base).split('\n')
    expect(renglones.map((r) => r.split(':')[0])).toEqual([
      'Tipo de llamada', 'Nombre del lead', 'Resumen de la llamada',
      'Oferta', 'Estado', 'Próximos pasos',
    ])
  })

  it('el tipo de llamada junta cómo lo llama el equipo con la fuente', () => {
    expect(textoParaSlack(base)).toContain('Tipo de llamada: Llamada de venta WEBINAR')
    expect(textoParaSlack({ ...base, tipoSesion: 'segunda' }))
      .toContain('Tipo de llamada: Segunda llamada WEBINAR')
    // Sin fuente cargada no se inventa una.
    expect(textoParaSlack({ ...base, fuente: null }))
      .toContain('Tipo de llamada: Llamada de venta\n')
  })

  it('un rótulo sin nada al lado va igual, y sin el espacio que sobra', () => {
    const t = textoParaSlack(base)
    expect(t).toContain('\nOferta:\n')
    expect(t.endsWith('Próximos pasos:')).toBe(true)
  })

  it('el estado de una venta lleva programa e importe', () => {
    expect(textoParaSlack(base)).toContain('Estado: Venta · GROWTH · 4.000 USD')
  })

  it('el de un seguimiento largo, el día en que hay que volver', () => {
    const t = textoParaSlack({
      ...base, salida: 'seguimiento_largo', importe: null, programa: null,
      volverEl: '2027-01-05',
    })
    expect(t).toContain('Estado: Seguimiento largo · vuelve el 05/01/2027')
  })

  it('el de una segunda llamada, cuándo es', () => {
    const t = textoParaSlack({
      ...base, salida: 'segunda', importe: null, programa: null, fechaSegunda: '2026-10-12',
    })
    expect(t).toContain('Estado: Segunda llamada · 12/10/2026')
  })

  it('el de un perdido, el motivo escrito igual para todos', () => {
    const t = textoParaSlack({
      ...base, salida: 'perdida', importe: null, programa: null, motivoPerdida: 'no_era_decisor',
    })
    expect(t).toContain('Estado: Perdido · No era decisor')
  })

  it('y al que no vino no le inventa ni oferta ni plata', () => {
    const t = textoParaSlack({ ...base, estado: 'no_show', salida: 'pendiente', importe: null })
    expect(t).toContain('Estado: No show')
    expect(t).not.toContain('4.000')
  })

  it('lo que escribe el closer va donde va, y se le sacan los espacios de más', () => {
    const t = textoParaSlack({
      ...base, oferta: '  GROWTH a 4.000  ', proximosPasos: '  Mandar el contrato  ',
    })
    expect(t).toContain('Oferta: GROWTH a 4.000')
    expect(t).toContain('Próximos pasos: Mandar el contrato')
    expect(t).toContain('Resumen de la llamada: Es foniatra')
  })
})
