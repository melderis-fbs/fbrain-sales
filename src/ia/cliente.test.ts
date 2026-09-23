import { describe, it, expect } from 'vitest'
import { motivoDeLaApi, enCastellano } from './cliente'

describe('el motivo que manda la API', () => {
  it('sale del cuerpo del error, que es lo único útil que trae', () => {
    expect(motivoDeLaApi('{"type":"error","error":{"type":"invalid_request_error","message":"model: claude-inventado"}}'))
      .toBe('model: claude-inventado')
  })

  it('un cuerpo que no es JSON no rompe: devuelve null', () => {
    expect(motivoDeLaApi('<html>502 Bad Gateway</html>')).toBe(null)
    expect(motivoDeLaApi('')).toBe(null)
  })
})

describe('el error que ve la persona', () => {
  // Cada uno de estos se arregla en un lugar distinto. Decir «400» los junta a
  // todos en un callejón sin salida, que es lo que estaba pasando.
  it('una clave mal puesta manda a Vercel', () => {
    expect(enCastellano(401, 'invalid x-api-key', 'claude-sonnet-5')).toMatch(/Vercel/)
  })

  it('sin crédito manda a la consola de Anthropic', () => {
    expect(enCastellano(400, 'Your credit balance is too low', 'claude-sonnet-5'))
      .toMatch(/crédito/i)
  })

  it('un modelo que no existe nombra el modelo y la variable', () => {
    const m = enCastellano(404, 'model: claude-inventado not found', 'claude-inventado')
    expect(m).toMatch(/claude-inventado/)
    expect(m).toMatch(/MODELO_ANALIZADOR/)
  })

  it('una transcripción demasiado larga dice qué hacer con ella', () => {
    expect(enCastellano(400, 'prompt is too long: 1200000 tokens', 'claude-sonnet-5'))
      .toMatch(/cortala en dos/i)
  })

  it('lo que no se reconoce se muestra tal cual, en vez de esconderse', () => {
    // El peor error posible es el que no dice nada: si no sabemos traducirlo,
    // se muestra el texto de la API y alguien puede buscarlo.
    expect(enCastellano(400, 'messages.0.content.1: unexpected field', 'claude-sonnet-5'))
      .toMatch(/unexpected field/)
  })

  it('y si la API no dijo nada, lo dice', () => {
    expect(enCastellano(503, null, 'claude-sonnet-5')).toMatch(/no dijo por qué/)
  })
})
