import 'server-only'
import { escribir } from '@/lib/db'

/**
 * La llamada al modelo.
 *
 * Tres cosas que no son opcionales y por eso están acá y no repartidas:
 *
 *  - Todo lo que se gasta queda anotado en `llamadas_modelo`. Un sistema que
 *    llama a un modelo por cada llamada de ventas se vuelve caro sin que nadie
 *    se entere; con la tabla, se ve el mes que empieza a subir.
 *  - Si el modelo devuelve algo que no es el JSON que se pidió, esto rompe. No
 *    rellena, no adivina, no devuelve un objeto a medias: un análisis a medias
 *    se ve igual que uno bueno.
 *  - Se reintenta sólo lo que tiene sentido reintentar: un 429 o un 5xx, con
 *    espera creciente. Un 400 no se arregla repitiéndolo.
 */

export type Uso = {
  modelo: string
  entrada: number
  salida: number
  cacheLeido: number
  cacheEscrito: number
  costoUsd: number
  ms: number
}

/** Precios por millón de tokens. Se actualizan acá y en un solo lugar. */
const PRECIOS: Record<string, { entrada: number; salida: number; cacheEscrito: number; cacheLeido: number }> = {
  'claude-sonnet-5': { entrada: 3, salida: 15, cacheEscrito: 3.75, cacheLeido: 0.3 },
  'claude-opus-5': { entrada: 15, salida: 75, cacheEscrito: 18.75, cacheLeido: 1.5 },
  'claude-haiku-4-5-20251001': { entrada: 1, salida: 5, cacheEscrito: 1.25, cacheLeido: 0.1 },
}

export const MODELO_POR_DEFECTO = process.env.MODELO_ANALIZADOR ?? 'claude-sonnet-5'

function costo(modelo: string, u: { entrada: number; salida: number; cacheLeido: number; cacheEscrito: number }): number {
  const p = PRECIOS[modelo] ?? PRECIOS['claude-sonnet-5']!
  return (u.entrada * p.entrada + u.salida * p.salida +
          u.cacheEscrito * p.cacheEscrito + u.cacheLeido * p.cacheLeido) / 1_000_000
}

export class ErrorDelModelo extends Error {
  constructor(mensaje: string, readonly detalle?: unknown) {
    super(mensaje)
    this.name = 'ErrorDelModelo'
  }
}

export type Bloque = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

/**
 * Pedirle al modelo un JSON con una forma concreta.
 *
 * Se usa una herramienta con esquema, no «devolveme JSON»: pedirlo en el texto
 * funciona casi siempre, y «casi siempre» en un lote de cien llamadas son tres
 * análisis rotos que alguien tiene que encontrar a mano.
 */
export async function pedirJson<T>(opciones: {
  sistema: Bloque[]
  mensaje: Bloque[]
  herramienta: { nombre: string; descripcion: string; esquema: Record<string, unknown> }
  modelo?: string
  maxTokens?: number
  para: string
  leadId?: number | null
  usuarioId?: number | null
}): Promise<{ datos: T; uso: Uso }> {
  const clave = process.env.ANTHROPIC_API_KEY
  if (!clave) {
    throw new ErrorDelModelo(
      'Falta ANTHROPIC_API_KEY. Sin eso el analizador no puede leer la llamada. ' +
      'Se carga en Vercel, en Settings → Environment Variables.',
    )
  }

  const modelo = opciones.modelo ?? MODELO_POR_DEFECTO
  const comienzo = Date.now()
  let ultimo: unknown = null

  for (let intento = 0; intento < 4; intento++) {
    if (intento > 0) await esperar(1000 * 2 ** intento)

    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: opciones.maxTokens ?? 8000,
        system: opciones.sistema,
        messages: [{ role: 'user', content: opciones.mensaje }],
        tools: [{
          name: opciones.herramienta.nombre,
          description: opciones.herramienta.descripcion,
          input_schema: opciones.herramienta.esquema,
        }],
        tool_choice: { type: 'tool', name: opciones.herramienta.nombre },
      }),
    })

    if (respuesta.status === 429 || respuesta.status >= 500) {
      ultimo = await respuesta.text()
      continue
    }
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text()
      await anotarUso(opciones.para, modelo, ceroUso(modelo, Date.now() - comienzo), opciones, cuerpo.slice(0, 500))
      throw new ErrorDelModelo(`El modelo contestó ${respuesta.status}.`, cuerpo.slice(0, 500))
    }

    const cuerpo = await respuesta.json() as {
      content: { type: string; name?: string; input?: unknown }[]
      usage?: { input_tokens?: number; output_tokens?: number
                cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
    }

    const u = cuerpo.usage ?? {}
    const partes = {
      entrada: u.input_tokens ?? 0,
      salida: u.output_tokens ?? 0,
      cacheLeido: u.cache_read_input_tokens ?? 0,
      cacheEscrito: u.cache_creation_input_tokens ?? 0,
    }
    const uso: Uso = { modelo, ...partes, costoUsd: costo(modelo, partes), ms: Date.now() - comienzo }
    await anotarUso(opciones.para, modelo, uso, opciones, null)

    const herramienta = cuerpo.content.find((c) => c.type === 'tool_use')
    if (!herramienta || herramienta.input === undefined) {
      throw new ErrorDelModelo('El modelo no devolvió la respuesta estructurada que se le pidió.', cuerpo)
    }
    return { datos: herramienta.input as T, uso }
  }

  await anotarUso(opciones.para, modelo, ceroUso(modelo, Date.now() - comienzo), opciones, 'sin respuesta tras 4 intentos')
  throw new ErrorDelModelo('El modelo no respondió después de cuatro intentos.', ultimo)
}

function ceroUso(modelo: string, ms: number): Uso {
  return { modelo, entrada: 0, salida: 0, cacheLeido: 0, cacheEscrito: 0, costoUsd: 0, ms }
}

async function anotarUso(
  para: string, _modelo: string, uso: Uso,
  opciones: { leadId?: number | null; usuarioId?: number | null },
  error: string | null,
): Promise<void> {
  // Que falle el registro del gasto no puede tumbar el análisis: se anota lo
  // que se puede y se sigue.
  try {
    await escribir(
      `insert into llamadas_modelo
         (lead_id, usuario_id, para, modelo, tokens_entrada, tokens_salida,
          tokens_cache_leido, tokens_cache_escrito, costo_usd, ms, error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [opciones.leadId ?? null, opciones.usuarioId ?? null, para, uso.modelo,
       uso.entrada, uso.salida, uso.cacheLeido, uso.cacheEscrito, uso.costoUsd, uso.ms, error],
    )
  } catch {
    // Anotado en ningún lado es peor que nada, pero perder el análisis es peor.
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
