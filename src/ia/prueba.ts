import 'server-only'
import { MODELO_POR_DEFECTO, motivoDeLaApi, enCastellano } from './cliente'

/**
 * Probar la conexión con el modelo, sin analizar nada.
 *
 * Existe porque «lo cambié y sigue sin andar» no se puede resolver a ciegas.
 * Entre que alguien edita una variable en Vercel y que el analizador la usa
 * hay tres cosas que pueden fallar —la clave, el workspace, el deploy— y las
 * tres dan el mismo error genérico. Esto hace UN pedido mínimo y cuenta qué
 * contestó la API y, sobre todo, QUÉ ESTÁ USANDO la aplicación ahora mismo.
 *
 * Lo último es la mitad del valor: si la huella de la clave no es la de la
 * clave nueva, el problema no es la clave, es que el deploy no la tomó. Sin
 * esto, la respuesta a eso es cambiarla de nuevo.
 *
 * El pedido es de un token: cuesta una fracción de centavo y no se anota como
 * análisis porque no analizó nada.
 */
export type Diagnostico = {
  ok: boolean
  titulo: string
  detalle: string
  /** Lo que la aplicación tiene cargado AHORA. Ninguna clave completa. */
  config: { clave: string; workspace: string; modelo: string }
}

/**
 * La huella de la clave: se ve cuál es sin mostrarla.
 *
 * Los últimos cuatro caracteres alcanzan para comparar contra la que uno
 * acaba de pegar en Vercel, que es la única pregunta que hay que contestar.
 */
function huella(clave: string): string {
  if (clave.length < 12) return 'cargada (muy corta, revisala)'
  return `${clave.slice(0, 7)}…${clave.slice(-4)}`
}

export async function probarConexion(): Promise<Diagnostico> {
  const clave = process.env.ANTHROPIC_API_KEY
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim() || null
  const modelo = MODELO_POR_DEFECTO
  const config = {
    clave: clave ? huella(clave) : 'NO está cargada',
    workspace: workspace ?? 'sin cargar',
    modelo,
  }

  if (!clave) {
    return {
      ok: false,
      titulo: 'Falta la clave',
      detalle: 'No hay ANTHROPIC_API_KEY en este deploy. Cargala en Vercel y volvé a desplegar: ' +
               'las variables se leen al construir.',
      config,
    }
  }

  try {
    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
        ...(workspace ? { 'anthropic-workspace-id': workspace } : {}),
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ok' }],
      }),
    })

    if (respuesta.ok) {
      return {
        ok: true,
        titulo: 'La conexión funciona',
        detalle: `El modelo ${modelo} contestó. El analizador puede trabajar.`,
        config,
      }
    }

    const cuerpo = await respuesta.text()
    return {
      ok: false,
      titulo: `La API contestó ${respuesta.status}`,
      detalle: enCastellano(respuesta.status, motivoDeLaApi(cuerpo), modelo, workspace),
      config,
    }
  } catch (e) {
    return {
      ok: false,
      titulo: 'No se pudo llegar a la API',
      detalle: e instanceof Error ? e.message : 'Error de red.',
      config,
    }
  }
}
