import 'server-only'
import { pedirJson, type Bloque } from './cliente'
import { DIMENSIONES, PENALIZACIONES, BONIFICACIONES } from '@/dominio/rubrica'
import type { EventoDetectado, Feedback, NivelConCita, ObjecionDetectada } from '@/datos/analisis'

/**
 * El analizador, en dos pasadas.
 *
 * Por qué dos y no una: en una sola pasada el modelo lee, juzga y resume al
 * mismo tiempo, y lo que devuelve es una impresión general disfrazada de
 * evaluación. Es de donde salía el 7,4.
 *
 *   1. LECTURA    Sólo hechos citables: qué objeciones aparecieron, con qué
 *                 palabras, y cuáles de los eventos del vocabulario cerrado
 *                 ocurrieron. Nada de notas.
 *   2. EVALUACIÓN Con la transcripción y los hechos de la pasada 1, ubicar cada
 *                 dimensión en una de las cinco descripciones de conducta y
 *                 citar la frase que lo sostiene.
 *
 * En ningún momento se le pide un número. La nota la calcula el motor.
 */

const REGLAS = `Sos un evaluador de llamadas de venta consultiva. Trabajás para un equipo comercial
que usa estas evaluaciones para entrenar, no para castigar.

Reglas que no se negocian:

1. Toda afirmación tuya va con una CITA TEXTUAL de la transcripción. Literal,
   copiada, sin arreglar la gramática. Si no podés citar, no lo afirmes.
2. Si no hay evidencia de algo, decilo. "sin_evidencia" es una respuesta
   correcta y frecuente. Inventar un nivel intermedio para no dejar un hueco es
   el peor error que podés cometer acá.
3. No pongas notas, puntajes ni porcentajes. No te los estamos pidiendo y no se
   van a usar.
4. No seas amable. Una llamada mediocre evaluada como buena le cuesta al closer
   tres meses de repetir el mismo error.
5. Hablás en español rioplatense, en segunda persona, directo y sin adornos.`

// ── Pasada 1: leer ──────────────────────────────────────────────────────────

export type Lectura = {
  resumen: string
  objeciones: ObjecionDetectada[]
  eventos: EventoDetectado[]
  momentos: { que: string; cita: string }[]
}

const ESQUEMA_LECTURA = {
  type: 'object',
  properties: {
    resumen: { type: 'string', description: 'Qué pasó en la llamada, en tres o cuatro frases. Sin valoraciones.' },
    objeciones: {
      type: 'array',
      description: 'Cada objeción que apareció. Si no apareció ninguna, array vacío.',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['precio', 'tiempo', 'confianza', 'socio', 'urgencia', 'encaje', 'competencia', 'otra'] },
          textual: { type: 'string', description: 'La objeción con las palabras exactas del prospecto.' },
          objecion_real: { type: 'string', description: 'Qué había detrás, si se puede saber por la conversación. Si no, "no se puede saber".' },
          respuesta: { type: 'string', description: 'Qué contestó el closer, citado.' },
        },
        required: ['tipo', 'textual', 'respuesta'],
      },
    },
    eventos: {
      type: 'array',
      description: 'Sólo los eventos de esta lista que ocurrieron de verdad, cada uno con su cita.',
      items: {
        type: 'object',
        properties: {
          evento: { type: 'string', enum: [...Object.keys(PENALIZACIONES), ...Object.keys(BONIFICACIONES)] },
          cita: { type: 'string', description: 'La frase de la transcripción que lo demuestra. Sin cita el evento no cuenta.' },
          momento: { type: 'string', description: 'En qué parte de la llamada: inicio, medio o final.' },
        },
        required: ['evento', 'cita'],
      },
    },
    momentos: {
      type: 'array',
      description: 'Dos o tres momentos donde la llamada cambió de rumbo.',
      items: {
        type: 'object',
        properties: { que: { type: 'string' }, cita: { type: 'string' } },
        required: ['que', 'cita'],
      },
    },
  },
  required: ['resumen', 'objeciones', 'eventos', 'momentos'],
}

function vocabulario(): string {
  const p = Object.entries(PENALIZACIONES).map(([k, v]) => `- ${k}: ${v.nombre}`).join('\n')
  const b = Object.entries(BONIFICACIONES).map(([k, v]) => `- ${k}: ${v.nombre}`).join('\n')
  return `Eventos que restan:\n${p}\n\nEventos que suman:\n${b}`
}

export async function leer(
  transcripcion: string,
  contexto: { leadId?: number | null; usuarioId?: number | null },
): Promise<Lectura> {
  const { datos } = await pedirJson<{
    resumen: string
    objeciones: { tipo: string; textual: string; objecion_real?: string; respuesta: string }[]
    eventos: { evento: string; cita: string; momento?: string }[]
    momentos: { que: string; cita: string }[]
  }>({
    sistema: [
      { type: 'text', text: REGLAS },
      { type: 'text', text: `Primera pasada: LEER. Todavía no evaluás nada.\n\n${vocabulario()}` },
    ],
    mensaje: [
      // La transcripción va al final y marcada para caché: la segunda pasada
      // manda la misma y así se paga una sola vez.
      { type: 'text', text: 'Leé esta llamada y devolvé sólo hechos citables.' },
      { type: 'text', text: `<transcripcion>\n${transcripcion}\n</transcripcion>`,
        cache_control: { type: 'ephemeral' } },
    ],
    herramienta: {
      nombre: 'registrar_lectura',
      descripcion: 'Registra los hechos observables de la llamada, cada uno con su cita textual.',
      esquema: ESQUEMA_LECTURA,
    },
    para: 'analizador · lectura',
    ...contexto,
  })

  return {
    resumen: datos.resumen,
    objeciones: datos.objeciones.map((o) => ({
      tipo: o.tipo, textual: o.textual, objecionReal: o.objecion_real ?? null,
      respuesta: o.respuesta, mejorRespuesta: null,
    })),
    // Sin cita el evento no entra. La regla se aplica acá y otra vez al
    // guardar: el modelo a veces manda el campo vacío en vez de omitir el ítem.
    eventos: datos.eventos
      .filter((e) => typeof e.cita === 'string' && e.cita.trim() !== '')
      .map((e) => ({ evento: e.evento, cita: e.cita, momento: e.momento ?? null })),
    momentos: datos.momentos,
  }
}

// ── Pasada 2: evaluar ───────────────────────────────────────────────────────

export type Evaluacion = { niveles: NivelConCita[]; feedback: Feedback; objeciones: ObjecionDetectada[] }

function rubricaEnTexto(): string {
  return DIMENSIONES.map((d) => {
    const anclas = d.anclas.map((a, i) => `   ${i}. ${a}`).join('\n')
    return `${d.clave} — ${d.nombre}\n${anclas}`
  }).join('\n\n')
}

const ESQUEMA_EVALUACION = {
  type: 'object',
  properties: {
    niveles: {
      type: 'array',
      description: 'Una entrada por dimensión de la rúbrica. Todas, sin excepción.',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: DIMENSIONES.map((d) => d.clave) },
          nivel: { type: 'integer', minimum: 0, maximum: 4,
                   description: 'El número de la descripción que MEJOR describe lo que pasó. No un promedio.' },
          cita: { type: 'string', description: 'La frase de la transcripción que ubica la llamada en ese nivel.' },
          justificacion: { type: 'string', description: 'Una frase: por qué ese nivel y no el de al lado.' },
          sin_evidencia: { type: 'boolean', description: 'true si la transcripción no alcanza para ubicarla. Entonces nivel y cita se ignoran.' },
        },
        required: ['dimension', 'sin_evidencia'],
      },
    },
    objeciones: {
      type: 'array',
      description: 'Para cada objeción de la lectura, cómo se podría haber respondido mejor.',
      items: {
        type: 'object',
        properties: {
          textual: { type: 'string' },
          mejor_respuesta: { type: 'string', description: 'Qué decir la próxima vez. Concreto, en palabras que se puedan usar tal cual.' },
        },
        required: ['textual', 'mejor_respuesta'],
      },
    },
    lo_mejor: { type: 'array', items: { type: 'string' }, description: 'Hasta tres cosas que hizo bien, con la cita adentro de la frase.' },
    lo_que_costo: { type: 'array', items: { type: 'string' }, description: 'Hasta tres cosas que le costaron.' },
    error_principal: { type: 'string', description: 'El error que más le costó esta llamada. Uno solo.' },
    que_hubiera_hecho: { type: 'string', description: 'Qué hubieras hecho vos en ese momento exacto.' },
    momento_clave: { type: 'string', description: 'El momento donde se decidió la llamada, citado.' },
    frase_alternativa: { type: 'string', description: 'Una frase concreta para reemplazar la que dijo en ese momento.' },
    una_sola_cosa: { type: 'string', description: 'Si sólo pudiera cambiar una cosa en la próxima llamada, cuál.' },
  },
  required: ['niveles', 'lo_mejor', 'lo_que_costo', 'error_principal', 'una_sola_cosa'],
}

export async function evaluar(
  transcripcion: string,
  lectura: Lectura,
  playbook: { nombre: string; oferta: string | null; script: string } | null,
  contexto: { leadId?: number | null; usuarioId?: number | null },
): Promise<Evaluacion> {
  const { datos } = await pedirJson<{
    niveles: { dimension: string; nivel?: number; cita?: string; justificacion?: string; sin_evidencia: boolean }[]
    objeciones?: { textual: string; mejor_respuesta: string }[]
    lo_mejor: string[]
    lo_que_costo: string[]
    error_principal: string
    que_hubiera_hecho?: string
    momento_clave?: string
    frase_alternativa?: string
    una_sola_cosa: string
  }>({
    sistema: [
      { type: 'text', text: REGLAS },
      { type: 'text', text:
        `Segunda pasada: EVALUAR.\n\n` +
        `Para cada dimensión, elegí cuál de las cinco descripciones describe MEJOR lo que pasó, ` +
        `y citá la frase que lo sostiene. No promedies entre dos niveles: elegí uno. ` +
        `Si la transcripción no alcanza, marcá sin_evidencia.\n\n` +
        `RÚBRICA\n\n${rubricaEnTexto()}` },
    ],
    mensaje: [
      ...(playbook ? [{
        type: 'text' as const,
        text: `<playbook>\nEste es el guion con el que trabaja este closer. Evaluá contra la ` +
              `venta consultiva, no contra el guion al pie de la letra — el guion es contexto de ` +
              `qué se ofrece.\n\nOferta: ${playbook.oferta ?? 'sin especificar'}\n\n${playbook.script}\n</playbook>`,
      }] : []),
      { type: 'text', text:
        `<lectura>\n${JSON.stringify({
          resumen: lectura.resumen,
          objeciones: lectura.objeciones,
          eventos: lectura.eventos,
          momentos: lectura.momentos,
        }, null, 1)}\n</lectura>` },
      { type: 'text', text: `<transcripcion>\n${transcripcion}\n</transcripcion>`,
        cache_control: { type: 'ephemeral' } },
    ],
    herramienta: {
      nombre: 'registrar_evaluacion',
      descripcion: 'Ubica la llamada en la rúbrica, con una cita por dimensión, y devuelve el feedback.',
      esquema: ESQUEMA_EVALUACION,
    },
    maxTokens: 10000,
    para: 'analizador · evaluación',
    ...contexto,
  })

  // Toda dimensión que el modelo no haya devuelto queda sin evidencia. No se
  // completa con un nivel intermedio: un hueco tapado no se distingue de un
  // dato, y después esa nota se usa para decidir un entrenamiento.
  const niveles: NivelConCita[] = DIMENSIONES.map((d) => {
    const n = datos.niveles.find((x) => x.dimension === d.clave)
    const sin = !n || n.sin_evidencia || typeof n.nivel !== 'number' ||
                typeof n.cita !== 'string' || n.cita.trim() === ''
    return {
      dimension: d.clave,
      nivel: sin ? null : n!.nivel!,
      cita: sin ? null : n!.cita!,
      justificacion: n?.justificacion ?? null,
      sinEvidencia: sin,
    }
  })

  const objeciones: ObjecionDetectada[] = lectura.objeciones.map((o) => ({
    ...o,
    mejorRespuesta: datos.objeciones?.find((x) => x.textual === o.textual)?.mejor_respuesta ?? null,
  }))

  return {
    niveles,
    objeciones,
    feedback: {
      loMejor: datos.lo_mejor ?? [],
      loQueCosto: datos.lo_que_costo ?? [],
      errorPrincipal: datos.error_principal ?? null,
      queHubieraHecho: datos.que_hubiera_hecho ?? null,
      momentoClave: datos.momento_clave ?? null,
      fraseAlternativa: datos.frase_alternativa ?? null,
      unaSolaCosa: datos.una_sola_cosa ?? null,
    },
  }
}

export type { Bloque }
