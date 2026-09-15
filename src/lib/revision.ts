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
  { tabla: 'oportunidades', migracion: '0002_lead_y_oportunidad.sql' },
  { tabla: 'oportunidad_participaciones', migracion: '0002_lead_y_oportunidad.sql' },
  { tabla: 'llamadas', migracion: '0002_lead_y_oportunidad.sql' },
  { tabla: 'transcripciones', migracion: '0002_lead_y_oportunidad.sql' },
  { tabla: 'ventas', migracion: '0003_dinero_y_objetivos.sql' },
  { tabla: 'senias', migracion: '0003_dinero_y_objetivos.sql' },
  { tabla: 'pagos', migracion: '0003_dinero_y_objetivos.sql' },
  { tabla: 'objetivos', migracion: '0003_dinero_y_objetivos.sql' },
]

export async function revisar(): Promise<Problema | null> {
  if (!process.env.DATABASE_URL) {
    return {
      titulo: 'Falta la conexión a la base',
      detalle: 'La variable DATABASE_URL no está cargada, así que la aplicación no tiene a dónde conectarse.',
      pasos: [
        'En Supabase: botón Connect, arriba del proyecto.',
        'Copiá la cadena del pooler en modo transacción (puerto 6543).',
        'En local va en .env.local; en Vercel, en Settings → Environment Variables.',
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
        pasos: ['Regenerá la contraseña en Supabase → Project Settings → Database.',
                'Actualizá DATABASE_URL donde esté cargada.'],
      }
    }
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(mensaje)) {
      return {
        titulo: 'No se llega al servidor de la base',
        detalle: 'El caso más común al publicar es usar la conexión directa en vez del pooler. ' +
                 'La directa (puerto 5432) va sólo por IPv6 y desde Vercel no se llega.',
        pasos: ['Usá la cadena del pooler en modo transacción, puerto 6543.'],
      }
    }
    return {
      titulo: 'La base no responde',
      detalle: 'La conexión falló antes de poder leer nada.',
      pasos: ['Revisá que el proyecto de Supabase esté activo y no pausado.'],
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
              'O pegá el resultado de `npm run esquema` en el SQL Editor de Supabase.'],
    }
  }

  const usuarios = await filas<{ n: number }>('select count(*)::int as n from usuarios')
  if ((usuarios[0]?.n ?? 0) === 0) {
    return {
      titulo: 'Todavía no hay ningún usuario',
      detalle: 'Las tablas están creadas pero nadie puede entrar porque no hay a quién dejar entrar.',
      pasos: ['Corré: npm run seed -- tu@email.com "Tu Nombre" tuclave'],
    }
  }

  return null
}
