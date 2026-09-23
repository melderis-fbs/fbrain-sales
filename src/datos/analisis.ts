import 'server-only'
import type { PoolClient } from 'pg'
import { escribir, escribirDevolviendo, fila, filas, enTransaccion } from '@/lib/db'
import { condicionDeAlcance, type Alcance } from '@/lib/permisos'
import { puntuar, type Modelo, type NivelAsignado, type Puntaje } from '@/motor/scoring'
import {
  DIMENSIONES, PENALIZACIONES, BONIFICACIONES, TOPES, TOPE_DE_BONIFICACIONES, NIVEL_A_NOTA,
} from '@/dominio/rubrica'
import { adherencia, notaDeFases, type Ejecucion, type Fase } from '@/dominio/fases'
import type { ErrorCritico, LecturaJusta, Recomendacion } from '@/dominio/informe'
import type { Resultado } from '@/dominio/resultados'
import type { FaseEvaluada } from '@/ia/analizar'

/**
 * El analizador, del lado de los datos.
 *
 * La regla que ordena todo este archivo: el modelo guarda NIVELES con CITAS;
 * el motor calcula la nota. Nunca al revés.
 *
 * La consecuencia práctica es `recalcular()`: cambiar un peso y volver a
 * puntuar mil análisis no cuesta una sola llamada al modelo, porque los niveles
 * ya están guardados. Con un analizador que guarda la nota, recalibrar es
 * reanalizar — y reanalizar mil llamadas cuesta plata, así que no se hace
 * nunca, así que el modelo de scoring no se corrige nunca.
 */

// ── El modelo de scoring ────────────────────────────────────────────────────

export type ModeloVigente = { id: number; version: string; modelo: Modelo }

/**
 * Las penalizaciones, vengan como vengan.
 *
 * Las configuraciones guardadas antes tienen `{clave: -0.8}`; ahora cada una
 * lleva además qué dimensión la mide, para no cobrar dos veces el mismo error.
 * Una config vieja se completa con la dimensión que dice el código, así no hay
 * que migrar una tabla para arreglar una cuenta.
 */
function leerPenalizaciones(guardado: unknown): Modelo['penalizaciones'] {
  const entradas = Object.entries((guardado ?? {}) as Record<string, unknown>)
  return Object.fromEntries(entradas.map(([clave, v]) => [
    clave,
    typeof v === 'number'
      ? { valor: v, dimension: PENALIZACIONES[clave]?.dimension }
      : v as { valor: number; dimension?: string },
  ]))
}

/** El modelo tal como está en el código. Es la versión v1. */
export function modeloDelCodigo(): Modelo {
  return {
    dimensiones: DIMENSIONES.map((d) => ({ clave: d.clave, nombre: d.nombre, peso: d.peso })),
    niveles: Object.fromEntries(Object.entries(NIVEL_A_NOTA)),
    penalizaciones: Object.fromEntries(
      Object.entries(PENALIZACIONES).map(([k, v]) => [k, { valor: v.valor, dimension: v.dimension }])),
    bonificaciones: Object.fromEntries(Object.entries(BONIFICACIONES).map(([k, v]) => [k, v.valor])),
    topeBonificaciones: TOPE_DE_BONIFICACIONES,
    topes: TOPES.map((t) => ({ dimension: t.dimension, menorA: t.menorA, tope: t.tope })),
  }
}

/**
 * El modelo vigente, de la base.
 *
 * Si todavía no hay ninguno, se guarda el del código como v1. Así la primera
 * llamada analizada ya queda atada a una versión concreta y comparable, en vez
 * de a «lo que decía el código ese día».
 */
export async function modeloVigente(): Promise<ModeloVigente> {
  const f = await fila<Record<string, any>>(
    'select * from scoring_config where vigente order by creado_en desc limit 1',
  )
  if (f) {
    return {
      id: f.id, version: f.version,
      modelo: {
        dimensiones: f.dimensiones,
        niveles: f.niveles,
        penalizaciones: leerPenalizaciones(f.penalizaciones),
        bonificaciones: f.bonificaciones.valores ?? f.bonificaciones,
        topeBonificaciones: Number(f.bonificaciones.tope ?? TOPE_DE_BONIFICACIONES),
        topes: f.topes,
      },
    }
  }

  const m = modeloDelCodigo()
  const creado = await escribirDevolviendo<{ id: number }>(
    `insert into scoring_config (version, dimensiones, niveles, penalizaciones, bonificaciones, topes, vigente)
     values ('v1', $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, true) returning id`,
    [
      JSON.stringify(m.dimensiones), JSON.stringify(m.niveles), JSON.stringify(m.penalizaciones),
      JSON.stringify({ valores: m.bonificaciones, tope: m.topeBonificaciones }),
      JSON.stringify(m.topes),
    ],
  )
  return { id: creado.id, version: 'v1', modelo: m }
}

// ── El ciclo de un análisis ─────────────────────────────────────────────────

export type EstadoDeAnalisis = 'subida' | 'leyendo' | 'evaluando' | 'analizada' | 'error'

export async function crearAnalisis(
  llamadaId: number,
  transcripcionId: number,
  playbookId: number | null,
  usuarioId: number,
): Promise<number> {
  const creado = await escribirDevolviendo<{ id: number }>(
    `insert into analisis (llamada_id, transcripcion_id, playbook_id, estado, creado_por)
     values ($1,$2,$3,'subida',$4) returning id`,
    [llamadaId, transcripcionId, playbookId, usuarioId],
  )
  return creado.id
}

export async function marcarEstado(
  analisisId: number, estado: EstadoDeAnalisis, error?: string | null, cx?: PoolClient,
): Promise<void> {
  await escribir(
    'update analisis set estado = $1, error = $2 where id = $3',
    [estado, error ?? null, analisisId], { esperadas: 1, cliente: cx },
  )
}

export async function guardarConteos(
  analisisId: number,
  c: { turnosCloser: number; turnosProspecto: number; palabrasCloser: number; palabrasProspecto: number },
): Promise<void> {
  await escribir(
    `update analisis set turnos_closer = $1, turnos_prospecto = $2,
                         palabras_closer = $3, palabras_prospecto = $4 where id = $5`,
    [c.turnosCloser, c.turnosProspecto, c.palabrasCloser, c.palabrasProspecto, analisisId],
  )
}

export type NivelConCita = {
  dimension: string
  nivel: number | null
  cita: string | null
  justificacion: string | null
  sinEvidencia: boolean
}

export type EventoDetectado = { evento: string; cita: string | null; momento: string | null }

export type ObjecionDetectada = {
  tipo: string | null
  textual: string | null
  objecionReal: string | null
  respuesta: string | null
  mejorRespuesta: string | null
}

export type Feedback = {
  loMejor: string[]
  loQueCosto: string[]
  errorPrincipal: string | null
  queHubieraHecho: string | null
  momentoClave: string | null
  fraseAlternativa: string | null
  unaSolaCosa: string | null
}

/**
 * Guardar lo que devolvió el modelo y puntuar.
 *
 * Todo en una transacción: un análisis con niveles pero sin nota, o con nota
 * pero sin las citas que la sostienen, es peor que no tener análisis — se ve
 * completo y no se puede auditar.
 */
export async function guardarEvaluacion(
  analisisId: number,
  datos: {
    niveles: NivelConCita[]
    eventos: EventoDetectado[]
    objeciones: ObjecionDetectada[]
    feedback: Feedback
    modelo?: string | null
    /** Lo que el modelo dijo de cada fase del guion. */
    fases?: FaseEvaluada[]
    /** Las fases del playbook, para calcular adherencia sobre los pesos reales. */
    fasesDelPlaybook?: Fase[]
    lecturaJusta?: LecturaJusta | null
    erroresCriticos?: ErrorCritico[]
    recomendaciones?: Recomendacion[]
    conclusion?: string | null
  },
): Promise<Puntaje> {
  const vigente = await modeloVigente()

  // Sin cita, el nivel no entra. Es la regla que impide que el modelo afirme
  // sin mostrar dónde lo vio.
  const asignados: NivelAsignado[] = datos.niveles.map((n) => ({
    dimension: n.dimension,
    nivel: n.sinEvidencia || n.cita === null || n.cita.trim() === '' ? null : n.nivel,
  }))
  const eventos = datos.eventos
    .filter((e) => e.cita !== null && e.cita.trim() !== '')
    .map((e) => e.evento)

  const puntaje = puntuar(asignados, eventos, vigente.modelo)

  await enTransaccion(async (cx) => {
    await escribir('delete from analisis_niveles where analisis_id = $1', [analisisId],
      { esperadas: 'cualquiera', cliente: cx })
    for (const n of datos.niveles) {
      await escribir(
        `insert into analisis_niveles (analisis_id, dimension, nivel, cita, justificacion, sin_evidencia)
         values ($1,$2,$3,$4,$5,$6)`,
        [analisisId, n.dimension, n.nivel, n.cita, n.justificacion,
         n.sinEvidencia || n.cita === null || n.cita.trim() === ''],
        { esperadas: 1, cliente: cx },
      )
    }

    await escribir('delete from analisis_eventos where analisis_id = $1', [analisisId],
      { esperadas: 'cualquiera', cliente: cx })
    for (const e of datos.eventos) {
      await escribir(
        'insert into analisis_eventos (analisis_id, evento, cita, momento) values ($1,$2,$3,$4)',
        [analisisId, e.evento, e.cita, e.momento], { esperadas: 1, cliente: cx },
      )
    }

    await escribir('delete from analisis_objeciones where analisis_id = $1', [analisisId],
      { esperadas: 'cualquiera', cliente: cx })
    for (const o of datos.objeciones) {
      await escribir(
        `insert into analisis_objeciones (analisis_id, tipo, textual, objecion_real, respuesta, mejor_respuesta)
         values ($1,$2,$3,$4,$5,$6)`,
        [analisisId, o.tipo, o.textual, o.objecionReal, o.respuesta, o.mejorRespuesta],
        { esperadas: 1, cliente: cx },
      )
    }

    const fb = datos.feedback
    await escribir(
      `insert into analisis_feedback
         (analisis_id, lo_mejor, lo_que_costo, error_principal, que_hubiera_hecho,
          momento_clave, frase_alternativa, una_sola_cosa)
       values ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7,$8)
       on conflict (analisis_id) do update set
         lo_mejor = excluded.lo_mejor, lo_que_costo = excluded.lo_que_costo,
         error_principal = excluded.error_principal, que_hubiera_hecho = excluded.que_hubiera_hecho,
         momento_clave = excluded.momento_clave, frase_alternativa = excluded.frase_alternativa,
         una_sola_cosa = excluded.una_sola_cosa`,
      [analisisId, JSON.stringify(fb.loMejor), JSON.stringify(fb.loQueCosto),
       fb.errorPrincipal, fb.queHubieraHecho, fb.momentoClave, fb.fraseAlternativa, fb.unaSolaCosa],
      { esperadas: 1, cliente: cx },
    )

    // ── Las fases del guion ────────────────────────────────────────────
    const fases = datos.fases ?? []
    await escribir('delete from analisis_fases where analisis_id = $1', [analisisId],
      { esperadas: 'cualquiera', cliente: cx })
    for (const [i, f] of fases.entries()) {
      await escribir(
        `insert into analisis_fases
           (analisis_id, clave, nombre, peso, orden, nota, ejecucion,
            lo_que_hizo, cita, lo_que_debia, analisis, se_dejo_pasar)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [analisisId, f.clave, f.nombre, f.peso, i, f.nota, f.ejecucion,
         f.loQueHizo, f.cita, f.loQueDebia, f.analisis, f.seDejoPasar],
        { esperadas: 1, cliente: cx },
      )
    }

    const delPlaybook = datos.fasesDelPlaybook ?? []
    const pct = delPlaybook.length === 0 ? null
      : adherencia(delPlaybook, fases.map((f) => ({ clave: f.clave, ejecucion: f.ejecucion })))
    const notaFases = delPlaybook.length === 0 ? null
      : notaDeFases(delPlaybook, fases.map((f) => ({ clave: f.clave, nota: f.nota })))

    await guardarPuntaje(analisisId, vigente.id, puntaje, cx)

    const lj = datos.lecturaJusta ?? null
    await escribir(
      `update analisis set estado = 'analizada', error = null,
              modelo = coalesce($1, modelo),
              adherencia_pct = $3, nota_fases = $4,
              valoracion_perfil = $5,
              errores_criticos = $6::jsonb, recomendaciones = $7::jsonb, conclusion = $8,
              lectura_justa = $9::jsonb
        where id = $2`,
      [datos.modelo ?? null, analisisId, pct, notaFases,
       lj?.queRecibio ?? null,
       JSON.stringify(datos.erroresCriticos ?? []),
       JSON.stringify(datos.recomendaciones ?? []),
       datos.conclusion ?? null,
       lj === null ? null : JSON.stringify(lj)],
      { esperadas: 1, cliente: cx },
    )
  })

  return puntaje
}

async function guardarPuntaje(
  analisisId: number, configId: number, p: Puntaje, cx?: PoolClient,
): Promise<void> {
  const creado = await escribirDevolviendo<{ id: number }>(
    `insert into call_scores
       (analisis_id, scoring_config_id, score, base, penalizacion, bonificacion, tope_aplicado, vigente)
     values ($1,$2,$3,$4,$5,$6,$7,true)
     on conflict (analisis_id, scoring_config_id) do update set
       score = excluded.score, base = excluded.base, penalizacion = excluded.penalizacion,
       bonificacion = excluded.bonificacion, tope_aplicado = excluded.tope_aplicado,
       vigente = true, creado_en = now()
     returning id`,
    [analisisId, configId, p.score, p.base, p.penalizacion, p.bonificacion, p.topeAplicado],
    cx,
  )
  await escribir('delete from score_dimensiones where call_score_id = $1', [creado.id],
    { esperadas: 'cualquiera', cliente: cx })
  for (const d of p.dimensiones) {
    await escribir(
      'insert into score_dimensiones (call_score_id, dimension, score, peso, aporte) values ($1,$2,$3,$4,$5)',
      [creado.id, d.dimension, d.score ?? 0, d.peso, d.aporte], { esperadas: 1, cliente: cx },
    )
  }
}

/**
 * Recalibrar sin volver a llamar al modelo.
 *
 * Lo más barato que tiene el sistema y la razón de todo el diseño: se guarda la
 * nueva versión del modelo de scoring, se releen los niveles ya guardados y se
 * vuelve a puntuar todo. Las notas viejas NO se pisan —quedan con su versión—,
 * así que se pueden comparar las dos distribuciones antes de adoptar la nueva.
 */
export async function recalcular(configId: number): Promise<number> {
  const config = await fila<Record<string, any>>('select * from scoring_config where id = $1', [configId])
  if (!config) throw new Error('Esa versión del modelo de scoring no existe.')

  const modelo: Modelo = {
    dimensiones: config.dimensiones,
    niveles: config.niveles,
    penalizaciones: leerPenalizaciones(config.penalizaciones),
    bonificaciones: config.bonificaciones.valores ?? config.bonificaciones,
    topeBonificaciones: Number(config.bonificaciones.tope ?? TOPE_DE_BONIFICACIONES),
    topes: config.topes,
  }

  const ids = await filas<{ id: number }>(`select id from analisis where estado = 'analizada'`)
  for (const { id } of ids) {
    const [niveles, eventos] = await Promise.all([
      filas<{ dimension: string; nivel: number | null; sin_evidencia: boolean }>(
        'select dimension, nivel, sin_evidencia from analisis_niveles where analisis_id = $1', [id],
      ),
      filas<{ evento: string }>('select evento from analisis_eventos where analisis_id = $1', [id]),
    ])
    const p = puntuar(
      niveles.map((n) => ({ dimension: n.dimension, nivel: n.sin_evidencia ? null : n.nivel })),
      eventos.map((e) => e.evento),
      modelo,
    )
    await enTransaccion(async (cx) => {
      // Las notas de otras versiones dejan de ser la vigente, pero se quedan.
      await escribir('update call_scores set vigente = false where analisis_id = $1', [id],
        { esperadas: 'cualquiera', cliente: cx })
      await guardarPuntaje(id, configId, p, cx)
    })
  }

  await escribir('update scoring_config set vigente = false where vigente and id <> $1', [configId],
    { esperadas: 'cualquiera' })
  await escribir('update scoring_config set vigente = true where id = $1', [configId])

  return ids.length
}

// ── Leer ────────────────────────────────────────────────────────────────────

export type AnalisisCompleto = {
  id: number
  llamadaId: number
  leadId: number
  lead: string
  closer: string | null
  fecha: string | null
  estado: EstadoDeAnalisis
  error: string | null
  modelo: string | null
  version: string | null
  /**
   * Si se midió contra el playbook del closer o contra las fases de la casa.
   *
   * No es un detalle técnico: cambia cómo se lee la adherencia. Medido contra
   * un guion que el closer no escribió, un 60% dice menos de lo que parece.
   */
  conPlaybook: boolean
  creadoEn: string
  turnosCloser: number | null
  turnosProspecto: number | null
  palabrasCloser: number | null
  palabrasProspecto: number | null
  score: number | null
  base: number | null
  penalizacion: number
  bonificacion: number
  topeAplicado: number | null
  niveles: (NivelConCita & { nombre: string; peso: number; nota: number | null; aporte: number })[]
  eventos: (EventoDetectado & { nombre: string; valor: number })[]
  objeciones: ObjecionDetectada[]
  feedback: Feedback | null

  // ── El informe por fases del guion ────────────────────────────────────
  /** Cuánto del guion se ejecutó, ponderado por peso. */
  adherenciaPct: number | null
  /** Qué tan bien se hizo lo que se hizo. Es otra pregunta que la de arriba. */
  notaFases: number | null
  fases: {
    clave: string; nombre: string; peso: number; orden: number
    nota: number | null; ejecucion: Ejecucion
    loQueHizo: string | null; cita: string | null; loQueDebia: string | null
    analisis: string | null; seDejoPasar: string | null
  }[]
  /** Qué lead le tocó y hasta dónde se podía llegar con ése. */
  lecturaJusta: LecturaJusta | null
  /** En qué quedó la llamada, según la ficha del lead. */
  resultado: Resultado
  erroresCriticos: ErrorCritico[]
  recomendaciones: Recomendacion[]
  conclusion: string | null
}

export async function verAnalisis(id: number): Promise<AnalisisCompleto | null> {
  const a = await fila<Record<string, any>>(
    `select a.*, ll.lead_id, ll.fecha, l.nombre as lead, l.resultado, c.nombre as closer,
            cs.score, cs.base, cs.penalizacion, cs.bonificacion, cs.tope_aplicado, cs.id as score_id,
            sc.version
       from analisis a
       join llamadas ll on ll.id = a.llamada_id
       join leads l on l.id = ll.lead_id
       left join closers c on c.id = ll.closer_id
       left join lateral (select * from call_scores x where x.analisis_id = a.id and x.vigente
                           order by x.creado_en desc limit 1) cs on true
       left join scoring_config sc on sc.id = cs.scoring_config_id
      where a.id = $1`,
    [id],
  )
  if (!a) return null

  const [niveles, eventos, objeciones, feedback, aportes, fases] = await Promise.all([
    filas<Record<string, any>>('select * from analisis_niveles where analisis_id = $1', [id]),
    filas<Record<string, any>>('select * from analisis_eventos where analisis_id = $1', [id]),
    filas<Record<string, any>>('select * from analisis_objeciones where analisis_id = $1', [id]),
    fila<Record<string, any>>('select * from analisis_feedback where analisis_id = $1', [id]),
    a.score_id
      ? filas<Record<string, any>>('select * from score_dimensiones where call_score_id = $1', [a.score_id])
      : Promise.resolve([]),
    filas<Record<string, any>>(
      'select * from analisis_fases where analisis_id = $1 order by orden', [id]),
  ])

  return {
    adherenciaPct: a.adherencia_pct === null || a.adherencia_pct === undefined
      ? null : Number(a.adherencia_pct),
    notaFases: a.nota_fases === null || a.nota_fases === undefined ? null : Number(a.nota_fases),
    fases: fases.map((f) => ({
      clave: f.clave, nombre: f.nombre, peso: Number(f.peso), orden: Number(f.orden),
      nota: f.nota === null ? null : Number(f.nota),
      ejecucion: f.ejecucion as Ejecucion,
      loQueHizo: f.lo_que_hizo, cita: f.cita, loQueDebia: f.lo_que_debia,
      analisis: f.analisis, seDejoPasar: f.se_dejo_pasar,
    })),
    lecturaJusta: (a.lectura_justa ?? null) as LecturaJusta | null,
    /** En qué quedó la llamada. Va arriba del informe: es el titular. */
    resultado: a.resultado as Resultado,
    erroresCriticos: (a.errores_criticos ?? []) as ErrorCritico[],
    recomendaciones: (a.recomendaciones ?? []) as Recomendacion[],
    conclusion: a.conclusion ?? null,

    id: a.id, llamadaId: a.llamada_id, leadId: a.lead_id, lead: a.lead, closer: a.closer,
    fecha: a.fecha, estado: a.estado, error: a.error, modelo: a.modelo, version: a.version ?? null, conPlaybook: a.playbook_id !== null,
    creadoEn: a.creado_en.toISOString(),
    turnosCloser: a.turnos_closer, turnosProspecto: a.turnos_prospecto,
    palabrasCloser: a.palabras_closer, palabrasProspecto: a.palabras_prospecto,
    score: a.score === null || a.score === undefined ? null : Number(a.score),
    base: a.base === null || a.base === undefined ? null : Number(a.base),
    penalizacion: Number(a.penalizacion ?? 0),
    bonificacion: Number(a.bonificacion ?? 0),
    topeAplicado: a.tope_aplicado === null || a.tope_aplicado === undefined ? null : Number(a.tope_aplicado),
    niveles: DIMENSIONES.map((d) => {
      const n = niveles.find((x) => x.dimension === d.clave)
      const ap = aportes.find((x) => x.dimension === d.clave)
      return {
        dimension: d.clave, nombre: d.nombre, peso: d.peso,
        nivel: n?.nivel ?? null, cita: n?.cita ?? null, justificacion: n?.justificacion ?? null,
        sinEvidencia: n?.sin_evidencia ?? true,
        nota: ap && !n?.sin_evidencia ? Number(ap.score) : null,
        aporte: ap ? Number(ap.aporte) : 0,
      }
    }),
    eventos: eventos.map((e) => {
      const p = PENALIZACIONES[e.evento]
      const b = BONIFICACIONES[e.evento]
      return {
        evento: e.evento, cita: e.cita, momento: e.momento,
        nombre: p?.nombre ?? b?.nombre ?? e.evento,
        valor: p?.valor ?? b?.valor ?? 0,
      }
    }),
    objeciones: objeciones.map((o) => ({
      tipo: o.tipo, textual: o.textual, objecionReal: o.objecion_real,
      respuesta: o.respuesta, mejorRespuesta: o.mejor_respuesta,
    })),
    feedback: feedback ? {
      loMejor: feedback.lo_mejor ?? [], loQueCosto: feedback.lo_que_costo ?? [],
      errorPrincipal: feedback.error_principal, queHubieraHecho: feedback.que_hubiera_hecho,
      momentoClave: feedback.momento_clave, fraseAlternativa: feedback.frase_alternativa,
      unaSolaCosa: feedback.una_sola_cosa,
    } : null,
  }
}

export type AnalisisEnLista = {
  id: number
  llamadaId: number
  leadId: number
  lead: string
  closer: string | null
  fecha: string | null
  estado: EstadoDeAnalisis
  score: number | null
  creadoEn: string
}

export async function listarAnalisis(
  alcance: Alcance,
  filtros: { closerId?: number; desde?: string; hasta?: string } = {},
  limite = 100,
): Promise<AnalisisEnLista[]> {

  const valores: unknown[] = []
  const condiciones: string[] = []
  const alc = condicionDeAlcance(alcance, { closer: 'll.closer_id', setter: 'l.setter_id', creador: 'l.creado_por' }, 1)
  valores.push(...alc.parametros)
  condiciones.push(alc.condicion)
  if (filtros.closerId !== undefined) { valores.push(filtros.closerId); condiciones.push(`ll.closer_id = $${valores.length}`) }
  if (filtros.desde) { valores.push(filtros.desde); condiciones.push(`ll.fecha >= $${valores.length}`) }
  if (filtros.hasta) { valores.push(filtros.hasta); condiciones.push(`ll.fecha <= $${valores.length}`) }
  valores.push(limite)

  const f = await filas<Record<string, any>>(
    `select a.id, a.llamada_id, a.estado, a.creado_en, ll.lead_id, ll.fecha,
            l.nombre as lead, c.nombre as closer, cs.score
       from analisis a
       join llamadas ll on ll.id = a.llamada_id
       join leads l on l.id = ll.lead_id and l.borrado_en is null
       left join closers c on c.id = ll.closer_id
       left join lateral (select score from call_scores x where x.analisis_id = a.id and x.vigente
                           order by x.creado_en desc limit 1) cs on true
      where ${condiciones.join(' and ')}
      order by a.creado_en desc limit $${valores.length}`,
    valores,
  )

  return f.map((x) => ({
    id: x.id, llamadaId: x.llamada_id, leadId: x.lead_id, lead: x.lead, closer: x.closer,
    fecha: x.fecha, estado: x.estado,
    score: x.score === null || x.score === undefined ? null : Number(x.score),
    creadoEn: x.creado_en.toISOString(),
  }))
}

/**
 * Cómo está distribuida la calidad de las llamadas.
 *
 * Es el control de que el analizador sirve: si todas las notas caen entre 7 y
 * 8, el analizador no está midiendo, está saludando.
 */
export async function distribucion(desde: string, hasta: string, closerId?: number): Promise<{
  tramo: string; cantidad: number
}[]> {
  const valores: unknown[] = [desde, hasta]
  let filtro = ''
  if (closerId !== undefined) { valores.push(closerId); filtro = `and ll.closer_id = $${valores.length}` }

  const f = await filas<{ tramo: string; cantidad: number }>(
    `select case when cs.score < 5 then '0–5'
                 when cs.score < 6 then '5–6'
                 when cs.score < 7 then '6–7'
                 when cs.score < 8 then '7–8'
                 when cs.score < 9 then '8–9'
                 else '9–10' end as tramo,
            count(*) as cantidad
       from call_scores cs
       join analisis a on a.id = cs.analisis_id
       join llamadas ll on ll.id = a.llamada_id
      where cs.vigente and ll.fecha between $1 and $2 ${filtro}
      group by 1 order by 1`,
    valores,
  )
  return f.map((x) => ({ tramo: x.tramo, cantidad: Number(x.cantidad) }))
}
