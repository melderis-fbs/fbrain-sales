import 'server-only'
import { filas, pool } from './db'

/**
 * Antes de tocar la base, revisar que esté.
 *
 * Sin esto, una migración sin correr sale como «Application error» con un
 * digest, y el que lo ve no tiene forma de saber qué pasó. Acá sale la pantalla
 * con el motivo y los pasos.
 *
 * Nunca se muestra la cadena de conexión ni la contraseña.
 */

export type Problema = { titulo: string; detalle: string; pasos: string[] }

/** Lo que tiene que existir, y de qué migración sale cada cosa. */
const ESPERADO: { tabla: string; migracion: string }[] = [
  { tabla: 'usuarios', migracion: '0001_fundaciones.sql' },
  { tabla: 'sesiones_login', migracion: '0001_fundaciones.sql' },
  { tabla: 'closers', migracion: '0001_fundaciones.sql' },
  { tabla: 'setters', migracion: '0001_fundaciones.sql' },
  { tabla: 'fuentes', migracion: '0001_fundaciones.sql' },
  { tabla: 'funnels', migracion: '0001_fundaciones.sql' },
  { tabla: 'config', migracion: '0001_fundaciones.sql' },
  { tabla: 'cambios', migracion: '0001_fundaciones.sql' },
  { tabla: 'trabajos', migracion: '0001_fundaciones.sql' },
  { tabla: 'leads', migracion: '0002_lead_y_oportunidad.sql' },
  { tabla: 'llamadas', migracion: '0002_lead_y_oportunidad.sql' },
  { tabla: 'transcripciones', migracion: '0002_lead_y_oportunidad.sql' },
  { tabla: 'ventas', migracion: '0003_dinero_y_objetivos.sql' },
  { tabla: 'senias', migracion: '0003_dinero_y_objetivos.sql' },
  { tabla: 'pagos', migracion: '0003_dinero_y_objetivos.sql' },
  { tabla: 'objetivos', migracion: '0003_dinero_y_objetivos.sql' },
  { tabla: 'lead_calificacion', migracion: '0004_el_lead_es_la_oportunidad.sql' },
  { tabla: 'lead_quality', migracion: '0004_el_lead_es_la_oportunidad.sql' },
  { tabla: 'notas', migracion: '0004_el_lead_es_la_oportunidad.sql' },
  { tabla: 'seguimiento_toques', migracion: '0005_seguimientos.sql' },
  { tabla: 'seguimiento_estado', migracion: '0005_seguimientos.sql' },
  { tabla: 'seguimiento_interacciones', migracion: '0005_seguimientos.sql' },
  { tabla: 'playbooks', migracion: '0006_analizador.sql' },
  { tabla: 'scoring_config', migracion: '0006_analizador.sql' },
  { tabla: 'analisis', migracion: '0006_analizador.sql' },
  { tabla: 'analisis_niveles', migracion: '0006_analizador.sql' },
  { tabla: 'analisis_eventos', migracion: '0006_analizador.sql' },
  { tabla: 'analisis_objeciones', migracion: '0006_analizador.sql' },
  { tabla: 'analisis_feedback', migracion: '0006_analizador.sql' },
  { tabla: 'call_scores', migracion: '0006_analizador.sql' },
  { tabla: 'score_dimensiones', migracion: '0006_analizador.sql' },
  { tabla: 'casos_exito', migracion: '0007_casos_y_comisiones.sql' },
]

/**
 * Migraciones que no tocan el esquema: sólo arreglan datos.
 *
 * La revisión no tiene nada que comprobar en ellas —no crean tabla ni columna—
 * pero igual se nombran acá. El control que corre antes del build exige que
 * toda migración figure en este archivo, y una lista de excepciones escrita a
 * mano es lo que separa «no cambia el esquema» de «me olvidé de declararla».
 */
export const SIN_ESQUEMA = [
  '0008_leads_sin_dueno.sql',
  '0009_cada_reunion_su_fila.sql',
  '0012_la_cadencia_arranca_el_dia_de_la_llamada.sql',
]

/**
 * Columnas que una migración AGREGA a una tabla que ya existía.
 *
 * Sin esto, una base que corrió 0002 pero no 0004 pasa la revisión —las tablas
 * están todas— y después revienta con «column l.estado does not exist», que es
 * justamente el error que esta pantalla existe para evitar.
 */
const COLUMNAS_ESPERADAS: { tabla: string; columna: string; migracion: string }[] = [
  { tabla: 'ventas', columna: 'cuotas', migracion: '0010_programa_y_motivos.sql' },
  { tabla: 'ventas', columna: 'ciclo', migracion: '0011_una_venta_por_ciclo.sql' },
  { tabla: 'senias', columna: 'ciclo', migracion: '0011_una_venta_por_ciclo.sql' },
  { tabla: 'leads', columna: 'estado', migracion: '0004_el_lead_es_la_oportunidad.sql' },
  { tabla: 'leads', columna: 'closer_id', migracion: '0004_el_lead_es_la_oportunidad.sql' },
  { tabla: 'leads', columna: 'ciclo', migracion: '0004_el_lead_es_la_oportunidad.sql' },
  { tabla: 'ventas', columna: 'lead_id', migracion: '0004_el_lead_es_la_oportunidad.sql' },
  { tabla: 'senias', columna: 'lead_id', migracion: '0004_el_lead_es_la_oportunidad.sql' },
  { tabla: 'llamadas', columna: 'lead_id', migracion: '0004_el_lead_es_la_oportunidad.sql' },
]

export async function revisar(): Promise<Problema | null> {
  if (!process.env.DATABASE_URL) {
    return {
      titulo: 'Falta la conexión a la base',
      detalle: 'La variable DATABASE_URL no está cargada, así que la aplicación no tiene a dónde conectarse.',
      pasos: [
        'En Neon: el botón Connect del proyecto, con Connection pooling prendido.',
        'En Supabase: botón Connect → Transaction pooler (puerto 6543).',
        'En local va en .env.local; en Vercel, en Settings → Environment Variables.',
        'Si la acabás de cargar en Vercel, redeployá: las variables se leen al construir.',
      ],
    }
  }

  try {
    await pool().query('select 1')
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    if (/password authentication|SASL|autenticaci/i.test(mensaje)) {
      return {
        titulo: 'La contraseña de la base no es la correcta',
        detalle: 'La cadena llega al servidor pero el usuario o la contraseña no coinciden.',
        pasos: ['Fijate que reemplazaste el marcador de la contraseña en la cadena.',
                'Si no la tenés, regenerala: en Neon, Connection Details → Reset password; en Supabase, Project Settings → Database.',
                'Actualizá DATABASE_URL donde esté cargada.'],
      }
    }
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(mensaje)) {
      return {
        titulo: 'No se llega al servidor de la base',
        detalle: 'El caso más común al publicar es usar la conexión directa en vez de la del pooler. ' +
                 'Desde una función de Vercel hay que entrar por el pooler.',
        pasos: ['En Neon: la cadena con «-pooler» en el nombre del host.',
                'En Supabase: la del Transaction pooler, puerto 6543. La directa (5432) va sólo por IPv6 y desde Vercel no se llega.'],
      }
    }
    return {
      titulo: 'La base no responde',
      detalle: 'La conexión falló antes de poder leer nada.',
      pasos: ['Revisá que el proyecto esté activo y no pausado.',
              'En el plan gratuito de Supabase se pausa solo tras una semana sin uso y hay que despertarlo a mano.'],
    }
  }

  const presentes = new Set(
    (await filas<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    )).map((t) => t.table_name),
  )

  const faltan = ESPERADO.filter((e) => !presentes.has(e.tabla))
  if (faltan.length > 0) {
    const migraciones = [...new Set(faltan.map((f) => f.migracion))].sort()
    return {
      titulo: 'Faltan migraciones por correr',
      detalle: `No están estas tablas: ${faltan.map((f) => f.tabla).join(', ')}. ` +
               `Salen de: ${migraciones.join(', ')}.`,
      pasos: ['Corré `npm run migrar` apuntando a esta misma base.',
              'O, sin terminal: pegá los archivos de supabase/migrations, en orden, en el editor SQL de tu base (Neon: SQL Editor; Supabase: SQL Editor).'],
    }
  }

  const columnas = new Set(
    (await filas<{ tabla: string; columna: string }>(
      `select table_name as tabla, column_name as columna
         from information_schema.columns where table_schema = 'public'`,
    )).map((c) => `${c.tabla}.${c.columna}`),
  )

  const faltanColumnas = COLUMNAS_ESPERADAS.filter((c) => !columnas.has(`${c.tabla}.${c.columna}`))
  if (faltanColumnas.length > 0) {
    const migraciones = [...new Set(faltanColumnas.map((f) => f.migracion))].sort()
    return {
      titulo: 'Faltan migraciones por correr',
      detalle: `Las tablas están, pero les faltan columnas: ` +
               `${faltanColumnas.map((f) => `${f.tabla}.${f.columna}`).join(', ')}. ` +
               `Salen de: ${migraciones.join(', ')}.`,
      pasos: ['Corré `npm run migrar` apuntando a esta misma base.',
              'O pegá los archivos que faltan de supabase/migrations, en orden, en el editor SQL de tu base.'],
    }
  }

  return null
}

/**
 * ¿Ya hay alguien dado de alta?
 *
 * Va aparte de `revisar()` porque no es un problema que haya que arreglar desde
 * una terminal: es el primer paso de la instalación, y se hace en la pantalla
 * `/instalacion`. Pedirle a alguien que corra un comando de Node para poder
 * entrar a su propia aplicación recién publicada es dejarla instalada a medias.
 */
export async function hayUsuarios(): Promise<boolean> {
  const usuarios = await filas<{ n: number }>('select count(*)::int as n from usuarios')
  return (usuarios[0]?.n ?? 0) > 0
}
