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


describe('la clave que no está en un workspace', () => {
  it('se explica con los dos caminos, no con el mensaje de la API', () => {
    // El mensaje de la API es correcto e inservible para quien no sabe qué es
    // un workspace: «This API key is not scoped to a workspace, so this
    // request must include the anthropic-workspace-id header».
    const texto = enCastellano(400,
      'This API key is not scoped to a workspace, so this request must include the ' +
      'anthropic-workspace-id header with the ID of the workspace to use.',
      'claude-sonnet-5')
    expect(texto).toContain('workspace')
    expect(texto).toContain('ANTHROPIC_WORKSPACE_ID')
    expect(texto).toContain('console.anthropic.com')
    // Y no deja al lector con el 400 pelado.
    expect(texto).not.toContain('rechazó el pedido')
  })
})
