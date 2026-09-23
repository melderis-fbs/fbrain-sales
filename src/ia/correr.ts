import 'server-only'
import { leer, evaluar } from './analizar'
import { ErrorDelModelo, MODELO_POR_DEFECTO } from './cliente'
import {
  crearAnalisis, guardarConteos, guardarEvaluacion, marcarEstado,
} from '@/datos/analisis'
import { medirTurnos, transcripcionDe, verLlamada } from '@/datos/llamadas'
import { playbookVigente } from '@/datos/playbooks'
import { FASES_POR_DEFECTO } from '@/dominio/fases'

/**
 * Analizar una llamada, de punta a punta.
 *
 * El estado del análisis se va guardando en cada paso: si el segundo llamado al
 * modelo falla, queda `error` con el motivo y no un registro a medias que se ve
 * igual que uno bueno. Se puede reintentar sin volver a pegar la transcripción.
 *
 * Corre en el pedido, no en un trabajo de fondo. Con el volumen de este equipo
 * —decenas de llamadas por semana, no miles— una cola sería infraestructura que
 * hay que mantener para resolver un problema que todavía no existe. Cuando el
 * volumen la pida, la tabla `trabajos` ya está.
 */
export async function analizarLlamada(
  llamadaId: number,
  usuarioId: number,
): Promise<{ analisisId: number; score: number }> {
  const llamada = await verLlamada(llamadaId)
  if (!llamada) throw new Error('Esa llamada no existe.')

  const transcripcion = await transcripcionDe(llamadaId)
  if (!transcripcion) {
    throw new Error('Esta llamada no tiene transcripción cargada. Pegala primero.')
  }

  const playbook = llamada.closerId === null ? null : await playbookVigente(llamada.closerId)

  /**
   * Las fases contra las que se mide esta llamada.
   *
   * Si el closer tiene playbook, las suyas. Si no, las de la casa.
   *
   * Antes, sin playbook no había fases, y sin fases el informe salía sin la
   * sección del guion, sin adherencia y sin nota de ejecución: media pantalla
   * vacía. Del lado del closer eso no se lee como «te falta cargar el
   * playbook», se lee como que el analizador anda mal para él y bien para el
   * resto. Medir contra las fases de la casa es peor que medir contra las
   * suyas y muchísimo mejor que no medir nada.
   */
  const fases = playbook?.fases ?? FASES_POR_DEFECTO
  const analisisId = await crearAnalisis(llamadaId, transcripcion.id, playbook?.id ?? null, usuarioId)
  const contexto = { leadId: llamada.leadId, usuarioId }

  try {
    // Lo que es aritmética se cuenta acá. No se le pregunta al modelo cuántas
    // palabras dijo cada uno: lo hace mal, cuesta plata y cambia entre corridas.
    await guardarConteos(analisisId, medirTurnos(transcripcion.texto, llamada.closer))

    await marcarEstado(analisisId, 'leyendo')
    const lectura = await leer(transcripcion.texto, contexto)

    await marcarEstado(analisisId, 'evaluando')
    const evaluacion = await evaluar(
      transcripcion.texto,
      lectura,
      playbook
        ? { nombre: playbook.nombre, oferta: playbook.oferta, script: playbook.script }
        : null,
      fases,
      contexto,
    )

    const puntaje = await guardarEvaluacion(analisisId, {
      niveles: evaluacion.niveles,
      eventos: lectura.eventos,
      objeciones: evaluacion.objeciones,
      feedback: evaluacion.feedback,
      modelo: MODELO_POR_DEFECTO,
      fases: evaluacion.fases,
      fasesDelPlaybook: fases,
      lecturaJusta: evaluacion.lecturaJusta,
      erroresCriticos: evaluacion.erroresCriticos,
      recomendaciones: evaluacion.recomendaciones,
      conclusion: evaluacion.conclusion,
    })

    return { analisisId, score: puntaje.score }
  } catch (error) {
    const mensaje = error instanceof ErrorDelModelo
      ? error.message
      : error instanceof Error ? error.message : String(error)
    await marcarEstado(analisisId, 'error', mensaje)
    throw error
  }
}
