import { describe, it, expect } from 'vitest'
import { motivoDeLaApi, enCastellano, costoDe } from './cliente'

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
  // El mensaje de la API es correcto e inservible para quien no sabe qué es un
  // workspace: «This API key is not scoped to a workspace, so this request
  // must include the anthropic-workspace-id header».
  const MOTIVO = 'This API key is not scoped to a workspace, so this request must include the ' +
    'anthropic-workspace-id header with the ID of the workspace to use.'

  it('sin nada cargado, dice los dos caminos para arreglarlo', () => {
    const texto = enCastellano(400, MOTIVO, 'claude-sonnet-5', null)
    expect(texto).toContain('workspace')
    expect(texto).toContain('ANTHROPIC_WORKSPACE_ID')
    expect(texto).toContain('console.anthropic.com')
    // Y no deja al lector con el 400 pelado.
    expect(texto).not.toContain('rechazó el pedido')
  })

  it('y arranca por el arreglo rápido, que es el que pide la propia API', () => {
    // La API dice literalmente «must include the anthropic-workspace-id
    // header», y la aplicación manda ese encabezado cuando hay
    // ANTHROPIC_WORKSPACE_ID. Ése es el camino de una variable; rotar la
    // clave es el de fondo y va segundo.
    const texto = enCastellano(400, MOTIVO, 'claude-sonnet-5', null)
    expect(texto.indexOf('ANTHROPIC_WORKSPACE_ID')).toBeLessThan(texto.indexOf('DESDE ADENTRO'))
  })

  it('con un id ya cargado, dice que ÉSE es el que falla', () => {
    // Repetir «agregá la variable» a quien ya la agregó lo manda a hacer de
    // nuevo el paso que ya hizo, y a dudar de que el sistema lea algo.
    const texto = enCastellano(400, MOTIVO, 'claude-sonnet-5', 'wrkspc_abc123')
    expect(texto).toContain('wrkspc_abc123')
    expect(texto).toContain('rechaza igual')
    expect(texto).toContain('desplegar')
  })
})


describe('lo que cuesta cada análisis', () => {
  it('sale de la lista de precios vigente, no de la anterior', () => {
    // Estaban los de la generación pasada: Sonnet a 3/15 y Opus a 15/75. El
    // gasto anotado venía inflado —Sonnet 50% de más, Opus el triple— y un
    // gasto que se mira para decidir y está mal hace decidir al revés.
    expect(costoDe('claude-sonnet-5', { entrada: 1_000_000, salida: 0, cacheLeido: 0, cacheEscrito: 0 }))
      .toBeCloseTo(2)
    expect(costoDe('claude-sonnet-5', { entrada: 0, salida: 1_000_000, cacheLeido: 0, cacheEscrito: 0 }))
      .toBeCloseTo(10)
    expect(costoDe('claude-opus-5', { entrada: 1_000_000, salida: 1_000_000, cacheLeido: 0, cacheEscrito: 0 }))
      .toBeCloseTo(30)
  })

  it('la lectura de caché es una décima parte de la entrada: por eso conviene', () => {
    expect(costoDe('claude-sonnet-5', { entrada: 0, salida: 0, cacheLeido: 1_000_000, cacheEscrito: 0 }))
      .toBeCloseTo(0.2)
  })

  it('un análisis de una llamada larga cuesta centavos, y el número lo dice', () => {
    // 25.000 tokens de transcripción y 2.000 de análisis con Sonnet.
    const c = costoDe('claude-sonnet-5', { entrada: 25_000, salida: 2_000, cacheLeido: 0, cacheEscrito: 0 })
    expect(c).toBeGreaterThan(0.06)
    expect(c).toBeLessThan(0.08)
  })
})
