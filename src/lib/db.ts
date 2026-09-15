import pg, { Pool, type PoolClient, type QueryResultRow } from 'pg'

// Cómo llegan los valores de Postgres a JavaScript.
// Sin esto, un `numeric` llega como texto —y «104000» + «81000» da
// «10400081000»— y una `date` llega como Date en la zona del servidor, que es
// de donde salen los errores de un día.
pg.types.setTypeParser(20, (v) => Number(v))    // int8
pg.types.setTypeParser(1700, (v) => Number(v))  // numeric
pg.types.setTypeParser(1082, (v) => v)          // date: se queda en aaaa-mm-dd

/**
 * La conexión a Postgres.
 *
 * Se entra por conexión directa desde el servidor con `pg`, no con
 * `supabase-js`. Es a propósito: `supabase-js` devuelve el error y sigue, así
 * que un permiso mal puesto termina informando «155 filas aplicadas» sobre una
 * base vacía. `pg` tira excepción, y además acá toda escritura declara cuántas
 * filas tenía que tocar y se verifica.
 *
 * Un sistema que decide a quién mandarle un lead no puede tener escrituras que
 * fallan en silencio.
 */

export class ErrorDeEscritura extends Error {
  constructor(mensaje: string, readonly detalle: { sql: string; esperadas: number; tocadas: number }) {
    super(mensaje)
    this.name = 'ErrorDeEscritura'
  }
}

/**
 * Ojo con el TLS, porque no es obvio: cuando se pasa `connectionString`, `pg`
 * pisa lo que le pongamos acá con lo que diga la cadena. Si la cadena trae
 * `sslmode=`, manda la cadena, porque es alguien eligiendo a propósito. Si no
 * dice nada, ciframos igual pero sin validar el certificado —que es lo que
 * necesita la conexión directa de Supabase, con su propia autoridad— y en un
 * Postgres local, nada. Neon trae `sslmode` en la cadena, así que decide ella y
 * el certificado se valida de verdad.
 */
export function opcionesDePool(url: string) {
  const esLocal = /@(localhost|127\.0\.0\.1)/.test(url)
  const laCadenaDecideElTls = /[?&]sslmode=/.test(url)

  return {
    connectionString: url,
    ...(laCadenaDecideElTls ? {} : { ssl: esLocal ? undefined : { rejectUnauthorized: false } }),
    // En Vercel cada instancia es un proceso corto y Supabase tiene un tope de
    // conexiones para todos: pocas por instancia.
    max: Number(process.env.DB_MAX_CONEXIONES ?? (process.env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 30_000,
  }
}

function crearPool(): Pool {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL. Es la cadena de conexión del pooler de tu Postgres: ' +
        'en Neon, el botón Connect con Connection pooling prendido; ' +
        'en Supabase, Connect → Transaction pooler (puerto 6543).',
    )
  }
  return new Pool(opcionesDePool(url))
}

const global_ = globalThis as unknown as { __poolSalesOs?: Pool }
export function pool(): Pool {
  if (!global_.__poolSalesOs) global_.__poolSalesOs = crearPool()
  return global_.__poolSalesOs
}

/** Lectura. Devuelve las filas. */
export async function filas<T extends QueryResultRow>(
  sql: string,
  parametros: readonly unknown[] = [],
  cliente?: PoolClient,
): Promise<T[]> {
  const ejecutor = cliente ?? pool()
  const r = await ejecutor.query<T>(sql, parametros as unknown[])
  return r.rows
}

/** Lectura de una sola fila, o null. */
export async function fila<T extends QueryResultRow>(
  sql: string,
  parametros: readonly unknown[] = [],
  cliente?: PoolClient,
): Promise<T | null> {
  const r = await filas<T>(sql, parametros, cliente)
  return r[0] ?? null
}

/**
 * Escritura verificada.
 *
 * `esperadas` dice cuántas filas tiene que tocar la sentencia. Si toca otra
 * cantidad, esto no sigue de largo: rompe. Una escritura que no escribió no se
 * puede contar como aplicada.
 */
export async function escribir(
  sql: string,
  parametros: readonly unknown[] = [],
  opciones: { esperadas?: number | 'cualquiera'; cliente?: PoolClient } = {},
): Promise<number> {
  const { esperadas = 1, cliente } = opciones
  const ejecutor = cliente ?? pool()
  const r = await ejecutor.query(sql, parametros as unknown[])
  const tocadas = r.rowCount ?? 0
  if (esperadas !== 'cualquiera' && tocadas !== esperadas) {
    throw new ErrorDeEscritura(`La escritura tocó ${tocadas} fila(s) y tenía que tocar ${esperadas}.`, {
      sql: sql.trim().split('\n')[0] ?? sql,
      esperadas,
      tocadas,
    })
  }
  return tocadas
}

/** Escritura verificada que devuelve la fila (para los RETURNING). */
export async function escribirDevolviendo<T extends QueryResultRow>(
  sql: string,
  parametros: readonly unknown[] = [],
  cliente?: PoolClient,
): Promise<T> {
  const ejecutor = cliente ?? pool()
  const r = await ejecutor.query<T>(sql, parametros as unknown[])
  const primera = r.rows[0]
  if (!primera) {
    throw new ErrorDeEscritura('La escritura no devolvió ninguna fila.', {
      sql: sql.trim().split('\n')[0] ?? sql,
      esperadas: 1,
      tocadas: 0,
    })
  }
  return primera
}

/** Todo o nada. */
export async function enTransaccion<T>(trabajo: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool().connect()
  try {
    await cliente.query('begin')
    const resultado = await trabajo(cliente)
    await cliente.query('commit')
    return resultado
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}
