import 'server-only'
import { MODELO_POR_DEFECTO, motivoDeLaApi, enCastellano } from './cliente'
import { versionQueCorre } from '@/lib/version'

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
  /**
   * Lo que contestó la API, TEXTUAL.
   *
   * `detalle` es nuestra traducción, y una traducción puede estar equivocada:
   * si clasificamos mal el error, la persona lee una explicación convincente
   * del problema que no tiene y persigue el arreglo que no era. Ya pasó. El
   * mensaje crudo es feo y es en inglés, y es el único dato que no depende de
   * que hayamos acertado.
   */
  motivo: string | null
  /**
   * Lo que la aplicación tiene cargado AHORA. Ninguna clave completa.
   *
   * `deploy` es el que cierra la pregunta «a mí me funciona y a ellos no». La
   * clave vive en el servidor, así que en un mismo deploy la respuesta es la
   * misma para todos, sea admin o closer. Si a dos personas les contesta
   * distinto, no están en el mismo deploy —una entró por una URL de preview,
   * o por una vieja— y eso no se ve por ningún lado hasta que se compara
   * este renglón.
   */
  config: { clave: string; workspace: string; modelo: string; deploy: string }
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
  const v = versionQueCorre()
  const config = {
    clave: clave ? huella(clave) : 'NO está cargada',
    workspace: workspace ?? 'sin cargar',
    modelo,
    deploy: v.commit ? `${v.entorno} · ${v.commit}` : v.entorno,
  }

  if (!clave) {
    return {
      ok: false,
      motivo: null,
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
        motivo: null,
        titulo: 'La conexión funciona',
        detalle: `El modelo ${modelo} contestó. El analizador puede trabajar.`,
        config,
      }
    }

    const cuerpo = await respuesta.text()
    const motivo = motivoDeLaApi(cuerpo)
    return {
      ok: false,
      motivo,
      titulo: `La API contestó ${respuesta.status}`,
      detalle: enCastellano(respuesta.status, motivo, modelo, workspace),
      config,
    }
  } catch (e) {
    return {
      ok: false,
      motivo: null,
      titulo: 'No se pudo llegar a la API',
      detalle: e instanceof Error ? e.message : 'Error de red.',
      config,
    }
  }
}
