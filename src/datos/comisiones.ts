import 'server-only'
import { escribir, filas } from '@/lib/db'
import { anotar } from './cambios'
import { config } from './catalogos'
import type { Rango } from '@/motor/periodos'

/**
 * Las comisiones.
 *
 * Las reglas viven en `config`, no en el código: un porcentaje escrito en un
 * archivo .ts es algo que nadie del equipo comercial puede corregir un viernes
 * a la tarde, que es exactamente cuando hace falta.
 *
 * Una decisión que no es un detalle: por defecto se comisiona sobre lo
 * **cobrado**, no sobre lo facturado. Comisionar sobre lo facturado paga por
 * plata que todavía no entró, y en un plan de tres cuotas eso es pagar por
 * adelantado tres veces. Se puede cambiar, y la pantalla dice cuál está puesto.
 *
 * Esto CALCULA, no paga. No hay estado de «liquidado» todavía: mientras las
 * reglas se estén acomodando, una liquidación guardada sería un número viejo
 * que alguien va a usar.
 */

export type Reglas = {
  /** Contra qué se calcula: lo cobrado o lo vendido. */
  sobre: 'cash' | 'facturacion'
  closer: number
  setter: number
  /** Lo que cobra quien reflota un lead perdido, aparte de lo demás. */
  repesca: number
  head: number
}

export const REGLAS_POR_DEFECTO: Reglas = { sobre: 'cash', closer: 10, setter: 3, repesca: 2, head: 0 }

export async function reglas(): Promise<Reglas> {
  const guardadas = await config<Partial<Reglas>>('comisiones', {})
  return { ...REGLAS_POR_DEFECTO, ...guardadas }
}

export async function guardarReglas(nuevas: Reglas, usuarioId: number): Promise<void> {
  if (nuevas.sobre !== 'cash' && nuevas.sobre !== 'facturacion') {
    throw new Error('La base de cálculo tiene que ser «cash» o «facturacion».')
  }
  for (const [quien, valor] of Object.entries(nuevas)) {
    if (quien === 'sobre') continue
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 100) {
      throw new Error(`El porcentaje de ${quien} tiene que estar entre 0 y 100.`)
    }
  }

  await escribir(
    `insert into config (clave, valor, usuario_id) values ('comisiones', $1::jsonb, $2)
     on conflict (clave) do update set valor = excluded.valor, usuario_id = excluded.usuario_id,
                                       actualizado_en = now()`,
    [JSON.stringify(nuevas), usuarioId],
  )
  await anotar([{ entidad: 'config', entidadId: 0, campo: 'comisiones',
                  anterior: null, nuevo: JSON.stringify(nuevas) }], usuarioId)
}

export type Linea = {
  quien: string
  rol: 'closer' | 'setter' | 'repesca'
  /** La plata sobre la que se calcula, ya en la moneda base. */
  base: number
  porcentaje: number
  comision: number
  /** Cuántas operaciones la componen, para poder auditarla. */
  operaciones: number
}

export type Liquidacion = {
  reglas: Reglas
  lineas: Linea[]
  total: number
  moneda: string
  /** La plata del período contra la que se comisionó. */
  baseTotal: number
}

/**
 * Cuánto le toca a cada uno en el período.
 *
 * Tres conceptos, y son tres consultas distintas a propósito:
 *  - el CLOSER cobra sobre los leads que cerró;
 *  - el SETTER, sobre los leads que agendó y terminaron en venta;
 *  - la REPESCA la cobra quien reflotó el lead, que suele no ser ninguno de los
 *    dos anteriores, y por eso el dato de quién lo reflotó se guarda desde que
 *    el lead vuelve a abrirse.
 */
export async function liquidacion(rango: Rango, monedaBase = 'USD'): Promise<Liquidacion> {
  const r = await reglas()

  // La plata del período: por la fecha del cobro, o por la de la venta.
  //
  // `desde` y `donde` van separados porque cada consulta mete su propio join
  // en el medio —el closer, el setter, quien reflotó—. Pegar el join después
  // del `where` es SQL inválido, y es exactamente lo que rompía esta pantalla.
  const desde = r.sobre === 'cash'
    ? `from pagos m
       join ventas v on v.id = m.venta_id and v.borrado_en is null
       join leads l on l.id = v.lead_id and l.borrado_en is null`
    : `from ventas m
       join leads l on l.id = m.lead_id and l.borrado_en is null`

  const donde = r.sobre === 'cash'
    ? `where m.borrado_en is null and m.estado = 'cobrado' and m.moneda = $3
         and m.fecha between $1 and $2`
    : `where m.borrado_en is null and m.moneda = $3 and m.fecha between $1 and $2`

  const valores = [rango.desde, rango.hasta, monedaBase]

  const [porCloser, porSetter, porRepesca, total] = await Promise.all([
    filas<{ quien: string; base: number; operaciones: number }>(
      `select c.nombre as quien, sum(m.importe) as base, count(*)::int as operaciones
         ${desde} join closers c on c.id = l.closer_id
         ${donde}
        group by 1 order by 2 desc`, valores),
    filas<{ quien: string; base: number; operaciones: number }>(
      `select s.nombre as quien, sum(m.importe) as base, count(*)::int as operaciones
         ${desde} join setters s on s.id = l.setter_id
         ${donde}
        group by 1 order by 2 desc`, valores),
    // La repesca la cobra quien reflotó el lead, y sólo si efectivamente hubo
    // un ciclo nuevo: un lead que nunca se cerró no se reflotó.
    filas<{ quien: string; base: number; operaciones: number }>(
      `select u.nombre as quien, sum(m.importe) as base, count(*)::int as operaciones
         ${desde} join usuarios u on u.id = l.reflotado_por
         ${donde} and l.ciclo > 1
        group by 1 order by 2 desc`, valores),
    filas<{ base: number }>(
      `select coalesce(sum(m.importe), 0) as base ${desde} ${donde}`, valores),
  ])

  const armar = (f: typeof porCloser, rol: Linea['rol'], porcentaje: number): Linea[] =>
    f.map((x) => ({
      quien: x.quien, rol, porcentaje,
      base: Number(x.base),
      comision: Math.round(Number(x.base) * porcentaje) / 100,
      operaciones: Number(x.operaciones),
    }))

  const lineas = [
    ...armar(porCloser, 'closer', r.closer),
    ...armar(porSetter, 'setter', r.setter),
    ...armar(porRepesca, 'repesca', r.repesca),
  ].filter((l) => l.base > 0)

  return {
    reglas: r,
    lineas,
    total: Math.round(lineas.reduce((s, l) => s + l.comision, 0) * 100) / 100,
    moneda: monedaBase,
    baseTotal: Number(total[0]?.base ?? 0),
  }
}

export const NOMBRE_DE_CONCEPTO: Record<Linea['rol'], string> = {
  closer: 'Cierre',
  setter: 'Agenda',
  repesca: 'Repesca',
}
