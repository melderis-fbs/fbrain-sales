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

/**
 * Qué dijo de verdad la API cuando contestó mal.
 *
 * El cuerpo viene como {"type":"error","error":{"type":..,"message":".."}}. El
 * mensaje de adentro es la única parte útil, y hasta ahora se guardaba en la
 * base y no se mostraba: la persona veía «El modelo contestó 400.» y nadie
 * podía hacer nada con eso sin entrar a Supabase.
 */
export function motivoDeLaApi(cuerpo: string): string | null {
  try {
    const j = JSON.parse(cuerpo) as { error?: { message?: string } }
    return j.error?.message ?? null
  } catch { return null }
}

/**
 * Traducir el motivo a algo con lo que se pueda hacer algo.
 *
 * Cada una de estas la vimos o la puede tirar la API, y todas se arreglan en un
 * lugar distinto: una en Vercel, otra pegando una transcripción más corta, otra
 * cargando crédito. Decir «400» las junta a todas en un callejón sin salida.
 */
export function enCastellano(estado: number, motivo: string | null, modelo: string): string {
  const m = (motivo ?? '').toLowerCase()

  if (estado === 401 || estado === 403) {
    return 'La clave de Anthropic no es válida o no tiene permiso. Se cambia en Vercel, ' +
           'en Settings → Environment Variables → ANTHROPIC_API_KEY, y hay que volver a desplegar.'
  }
  if (m.includes('credit') || m.includes('billing')) {
    return 'La cuenta de Anthropic no tiene crédito. Se carga en console.anthropic.com, en Billing.'
  }
  if (m.includes('model') && (m.includes('not found') || m.includes('does not exist') || m.includes('invalid'))) {
    return `El modelo configurado no existe: «${modelo}». Si pusiste MODELO_ANALIZADOR en Vercel, ` +
           'sacala o corregila; sin esa variable usa el modelo por defecto.'
  }
  if (m.includes('prompt is too long') || m.includes('too many tokens')) {
    return 'La transcripción es demasiado larga para una sola pasada. Cortala en dos y analizá cada parte.'
  }
  if (m.includes('rate limit')) {
    return 'La cuenta de Anthropic llegó a su límite de pedidos por minuto. Probá de nuevo en un minuto.'
  }
  return motivo
    ? `El modelo rechazó el pedido (${estado}): ${motivo}`
    : `El modelo contestó ${estado} y no dijo por qué.`
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
  // Los modelos más nuevos rechazan obligar una herramienta. En vez de pedirle
  // a alguien que cambie una variable de entorno, se pide igual y, si la API
  // dice que no, se vuelve a preguntar dejándolo elegir: el esquema sigue
  // siendo obligatorio, así que la respuesta llega igual de estructurada.
  let forzarHerramienta = true

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
        tool_choice: forzarHerramienta
          ? { type: 'tool', name: opciones.herramienta.nombre }
          : { type: 'auto' },
      }),
    })

    if (respuesta.status === 429 || respuesta.status >= 500) {
      ultimo = await respuesta.text()
      continue
    }
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text()
      const motivo = motivoDeLaApi(cuerpo)

      // «Este modelo no acepta que le obligues la herramienta»: se reintenta
      // dejándolo elegir, sin que nadie tenga que enterarse.
      if (forzarHerramienta && respuesta.status === 400 && (motivo ?? '').includes('tool_choice')) {
        forzarHerramienta = false
        continue
      }

      await anotarUso(opciones.para, modelo, ceroUso(modelo, Date.now() - comienzo), opciones, cuerpo.slice(0, 500))
      throw new ErrorDelModelo(enCastellano(respuesta.status, motivo, modelo), cuerpo.slice(0, 500))
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
