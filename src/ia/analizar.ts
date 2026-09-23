import 'server-only'
import { pedirJson, type Bloque } from './cliente'
import { DIMENSIONES, PENALIZACIONES, BONIFICACIONES } from '@/dominio/rubrica'
import { EJECUCIONES, type Ejecucion, type Fase } from '@/dominio/fases'
import {
  TECHOS, APROVECHAMIENTOS,
  type ErrorCritico, type LecturaJusta, type Recomendacion, type Techo, type Aprovechamiento,
} from '@/dominio/informe'
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
5. Hablás en español rioplatense, en segunda persona, directo y sin adornos.

6. Un closer no elige el lead que le toca. Antes de juzgar cómo lo hizo,
   establecé QUÉ LE TOCÓ: si el prospecto calificaba, si tenía con qué pagar,
   si decidía solo, si venía frío. Manejar bien una llamada que no tenía venta
   adentro es un buen trabajo, y decir lo contrario entrena a desconfiar de
   estos informes. Esto NO es ser amable: si el lead era bueno y se
   desperdició, decilo más fuerte todavía. Es medir contra lo que había.`

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

export type FaseEvaluada = {
  clave: string
  nombre: string
  peso: number
  nota: number | null
  ejecucion: Ejecucion
  loQueHizo: string | null
  cita: string | null
  loQueDebia: string | null
  analisis: string | null
  seDejoPasar: string | null
}

export type Evaluacion = {
  niveles: NivelConCita[]
  feedback: Feedback
  objeciones: ObjecionDetectada[]
  fases: FaseEvaluada[]
  lecturaJusta: LecturaJusta | null
  erroresCriticos: ErrorCritico[]
  recomendaciones: Recomendacion[]
  conclusion: string | null
}

/** Las fases del playbook, para que el modelo evalúe contra ellas y no contra un ideal. */
function fasesEnTexto(fases: readonly Fase[]): string {
  return fases.map((f, i) =>
    `${i + 1}. [${f.clave}] ${f.nombre} · pesa ${f.peso}%\n` +
    `   Objetivo: ${f.objetivo}\n` +
    `   Cómo se hace acá: ${f.comoSeHace}`).join('\n\n')
}

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

    lectura_justa: {
      type: 'object',
      description: 'Lo PRIMERO que se lee del informe: qué lead le tocó y cuánto de lo posible aprovechó.',
      properties: {
        que_recibio: { type: 'string', description: 'Qué prospecto le tocó, en una frase: si calificaba, si tenía con qué pagar, si decidía solo, si venía frío. Con evidencia de la llamada.' },
        techo_realista: { type: 'string', enum: [...TECHOS], description: 'Hasta dónde se podía llegar con ESTE prospecto, no con uno ideal.' },
        por_que_ese_techo: { type: 'string', description: 'Por qué ése y no uno más alto, citando lo que lo limitaba.' },
        aprovecho_el_techo: { type: 'string', enum: [...APROVECHAMIENTOS] },
        insight: { type: 'string', description: 'Tres o cuatro frases: cómo le fue MEDIDO CONTRA LO QUE TENÍA. Si manejó bien un lead imposible, se dice. Si desperdició uno bueno, se dice más fuerte.' },
      },
      required: ['que_recibio', 'techo_realista', 'por_que_ese_techo', 'aprovecho_el_techo', 'insight'],
    },

    fases: {
      type: 'array',
      description: 'Una entrada por CADA fase del guion, en orden y sin saltear ninguna.',
      items: {
        type: 'object',
        properties: {
          clave: { type: 'string', description: 'La clave de la fase, tal cual figura entre corchetes en el guion.' },
          ejecucion: { type: 'string', enum: [...EJECUCIONES], description: '¿Se hizo este paso? Es otra pregunta que qué tan bien se hizo.' },
          nota: { type: 'number', minimum: 0, maximum: 10, description: 'Qué tan bien se hizo, de 0 a 10. Omitila si la transcripción no alcanza.' },
          lo_que_hizo: { type: 'string', description: 'Qué hizo el closer en esta fase.' },
          cita: { type: 'string', description: 'La frase textual que lo sostiene.' },
          lo_que_debia: { type: 'string', description: 'Qué decía el guion que había que hacer acá.' },
          analisis: { type: 'string', description: 'La diferencia entre las dos cosas y qué costó.' },
          se_dejo_pasar: { type: 'string', description: 'La oportunidad que estaba ahí y no se tomó. Vacío si no hubo.' },
        },
        required: ['clave', 'ejecucion'],
      },
    },

    errores_criticos: {
      type: 'array',
      description: 'Los errores que de verdad costaron algo. Dos o tres, no una lista de todo.',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'El error en media línea.' },
          detalle: { type: 'string', description: 'Qué pasó y qué costó.' },
        },
        required: ['titulo', 'detalle'],
      },
    },
    recomendaciones: {
      type: 'array',
      description: 'Dos o tres cosas para la próxima, accionables y en palabras que se puedan usar tal cual.',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          detalle: { type: 'string' },
        },
        required: ['titulo', 'detalle'],
      },
    },
    conclusion: { type: 'string', description: 'El cierre del informe: qué demuestra esta llamada sobre cómo trabaja este closer.' },
  },
  required: ['niveles', 'lo_mejor', 'lo_que_costo', 'error_principal', 'una_sola_cosa', 'lectura_justa', 'fases'],
}

export async function evaluar(
  transcripcion: string,
  lectura: Lectura,
  /** El guion escrito del closer, si lo tiene cargado. Puede no tenerlo. */
  guion: { nombre: string; oferta: string | null; script: string } | null,
  /**
   * Las fases contra las que se mide. Van aparte del guion a propósito: un
   * closer sin playbook cargado igual tiene fases —las de la casa— y sin esto
   * su informe salía sin la mitad que más se mira.
   */
  fases: Fase[],
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
    lectura_justa?: {
      que_recibio: string; techo_realista: string; por_que_ese_techo: string
      aprovecho_el_techo: string; insight: string
    }
    fases?: {
      clave: string; ejecucion: string; nota?: number
      lo_que_hizo?: string; cita?: string; lo_que_debia?: string
      analisis?: string; se_dejo_pasar?: string
    }[]
    errores_criticos?: { titulo: string; detalle: string }[]
    recomendaciones?: { titulo: string; detalle: string }[]
    conclusion?: string
  }>({
    sistema: [
      { type: 'text', text: REGLAS },
      { type: 'text', text:
        `Segunda pasada: EVALUAR. Tres cosas distintas, en este orden.\n\n` +
        `1. LA LECTURA JUSTA. Antes que nada, qué prospecto le tocó y hasta dónde se podía ` +
        `llegar con ÉSE. Después, cuánto de eso aprovechó. Es lo primero que se lee del ` +
        `informe y lo que evita que un buen trabajo con un lead malo se vea como un mal ` +
        `trabajo.\n\n` +
        `2. LAS FASES DEL GUION. Una entrada por cada fase, en orden y sin saltear ninguna, ` +
        `aunque la fase no haya ocurrido —ahí justamente va «no_ejecutado»—. «Ejecución» es si ` +
        `el paso se hizo; «nota» es qué tan bien. Son dos preguntas y se contestan por ` +
        `separado: una fase puede estar ejecutada y mal hecha.\n\n` +
        `3. LA RÚBRICA. Para cada dimensión, elegí cuál de las cinco descripciones describe ` +
        `MEJOR lo que pasó, y citá la frase que lo sostiene. No promedies entre dos niveles: ` +
        `elegí uno. Si la transcripción no alcanza, marcá sin_evidencia.\n\n` +
        (fases.length > 0
          ? `LAS FASES DEL GUION DE ESTE CLOSER\n\n${fasesEnTexto(fases)}\n\n`
          : '') +
        `RÚBRICA\n\n${rubricaEnTexto()}` },
    ],
    mensaje: [
      ...(guion ? [{
        type: 'text' as const,
        text: `<playbook>\nEl guion con el que trabaja este closer. Las FASES se evalúan contra ` +
              `esto —es el guion de este equipo, no un ideal—; la RÚBRICA se evalúa contra la ` +
              `venta consultiva, que es otra pregunta.\n\nOferta: ${guion.oferta ?? 'sin especificar'}\n\n${guion.script}\n</playbook>`,
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

  // Igual que con las dimensiones: la fase que el modelo no devolvió no se
  // inventa. Queda como no ejecutada y sin nota, que es lo que se sabe.
  const texto = (v: unknown): string | null => {
    const t = typeof v === 'string' ? v.trim() : ''
    return t === '' ? null : t
  }
  const fasesEvaluadas: FaseEvaluada[] = fases.map((f) => {
    const e = datos.fases?.find((x) => x.clave === f.clave)
    const ejecucion = EJECUCIONES.includes(e?.ejecucion as Ejecucion)
      ? (e!.ejecucion as Ejecucion) : 'no_ejecutado'
    const nota = typeof e?.nota === 'number' && Number.isFinite(e.nota)
      ? Math.max(0, Math.min(10, Math.round(e.nota * 10) / 10)) : null
    return {
      clave: f.clave, nombre: f.nombre, peso: f.peso,
      nota, ejecucion,
      loQueHizo: texto(e?.lo_que_hizo),
      cita: texto(e?.cita),
      loQueDebia: texto(e?.lo_que_debia),
      analisis: texto(e?.analisis),
      seDejoPasar: texto(e?.se_dejo_pasar),
    }
  })

  const lj = datos.lectura_justa
  const lecturaJusta: LecturaJusta | null = lj === undefined ? null : {
    queRecibio: lj.que_recibio,
    techo: (TECHOS.includes(lj.techo_realista as Techo) ? lj.techo_realista : 'seguimiento') as Techo,
    porQueEseTecho: lj.por_que_ese_techo,
    aprovecho: (APROVECHAMIENTOS.includes(lj.aprovecho_el_techo as Aprovechamiento)
      ? lj.aprovecho_el_techo : 'casi') as Aprovechamiento,
    insight: lj.insight,
  }

  const conTitulo = <T extends { titulo?: unknown; detalle?: unknown }>(xs: T[] | undefined) =>
    (xs ?? [])
      .filter((x) => typeof x.titulo === 'string' && x.titulo.trim() !== '')
      .map((x) => ({ titulo: String(x.titulo).trim(), detalle: String(x.detalle ?? '').trim() }))

  return {
    niveles,
    objeciones,
    fases: fasesEvaluadas,
    lecturaJusta,
    erroresCriticos: conTitulo<ErrorCritico>(datos.errores_criticos),
    recomendaciones: conTitulo<Recomendacion>(datos.recomendaciones),
    conclusion: texto(datos.conclusion),
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
