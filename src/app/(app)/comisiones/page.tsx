import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { liquidacion, NOMBRE_DE_CONCEPTO } from '@/datos/comisiones'
import { config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Tarjeta, Encabezado, Pildora, Numero, Vacio, plata } from '@/componentes/Piezas'
import { ReglasDeComision } from '@/componentes/ReglasDeComision'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * Las comisiones del período.
 *
 * Esto CALCULA, no paga. No hay estado de «liquidado» todavía: mientras las
 * reglas se estén acomodando, una liquidación guardada sería un número viejo
 * que alguien va a usar para pagar.
 */
export default async function Comisiones({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const r = rango(periodo, hoyEn())
  const monedaBase = await config<string>('moneda_base', 'USD')

  const l = await liquidacion(r, monedaBase)
  const puedeConfigurar = puede(usuario, 'configurar')

  const porPersona = new Map<string, { quien: string; comision: number; conceptos: typeof l.lineas }>()
  for (const linea of l.lineas) {
    const actual = porPersona.get(linea.quien) ?? { quien: linea.quien, comision: 0, conceptos: [] }
    actual.comision += linea.comision
    actual.conceptos.push(linea)
    porPersona.set(linea.quien, actual)
  }
  const personas = [...porPersona.values()].sort((a, b) => b.comision - a.comision)

  return (
    <div className="apilado">
      <Encabezado kicker="Comisiones" titulo={`${r.etiqueta} · ${plata(l.total, l.moneda)}`}
                  bajada={`Sobre ${plata(l.baseTotal, l.moneda)} de ${l.reglas.sobre === 'cash' ? 'cobros' : 'ventas'} del período`} />

      <div className="chips">
        {PERIODOS.map((p) => (
          <Link key={p.clave} href={`/comisiones?periodo=${p.clave}`}
                className={periodo === p.clave ? 'activo' : ''}>{p.etiqueta}</Link>
        ))}
      </div>

      <div className="aviso dato">
        Esta pantalla <strong>calcula, no paga</strong>. No guarda liquidaciones: mientras las
        reglas se estén acomodando, un número guardado es un número viejo que alguien va a usar.
        Se comisiona sobre <strong>{l.reglas.sobre === 'cash' ? 'lo cobrado' : 'lo facturado'}</strong>.
      </div>

      <div className="rejilla g4">
        <Numero etiqueta="A pagar" valor={plata(l.total, l.moneda)} chico />
        <Numero etiqueta={l.reglas.sobre === 'cash' ? 'Cobrado en el período' : 'Vendido en el período'}
                valor={plata(l.baseTotal, l.moneda)} chico />
        <Numero etiqueta="Personas" valor={personas.length} />
        <Numero etiqueta="Peso sobre la base"
                valor={l.baseTotal === 0 ? null : Math.round((l.total / l.baseTotal) * 1000) / 10}
                unidad="%" contra="cuánto de lo que entra se va en comisiones" />
      </div>

      <div className="rejilla g2">
        <Tarjeta titulo="Lo que le toca a cada uno"
                 ayuda="Un closer cobra por lo que cerró; un setter, por lo que agendó; la repesca, quien la hizo.">
          {personas.length === 0 ? (
            <Vacio>
              No hay {l.reglas.sobre === 'cash' ? 'cobros' : 'ventas'} en el período, así que no
              hay comisiones que calcular.
            </Vacio>
          ) : (
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>Quién</th><th>Concepto</th><th className="num">Base</th>
                      <th className="num">%</th><th className="num">Comisión</th></tr>
                </thead>
                <tbody>
                  {personas.map((p) => p.conceptos.map((c, i) => (
                    <tr key={`${p.quien}-${c.rol}`}>
                      {/* El nombre una sola vez por persona: repetirlo en cada
                          concepto hace que la columna se lea como si hubiera
                          tres personas distintas con el mismo nombre. */}
                      <td style={{ fontWeight: 600 }}>{i === 0 ? p.quien : ''}</td>
                      <td>
                        <Pildora color={c.rol === 'repesca' ? 'acento' : 'gris'}>
                          {NOMBRE_DE_CONCEPTO[c.rol]}
                        </Pildora>
                        <span style={{ fontSize: 11.5, color: 'var(--gris-claro)', marginLeft: 6 }}>
                          {c.operaciones} {c.operaciones === 1 ? 'operación' : 'operaciones'}
                        </span>
                      </td>
                      <td className="num">{plata(c.base, l.moneda)}</td>
                      <td className="num">{c.porcentaje}%</td>
                      <td className="num"><strong>{plata(c.comision, l.moneda)}</strong></td>
                    </tr>
                  )))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total</td>
                    <td className="num">{plata(l.total, l.moneda)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="ayuda" style={{ marginTop: 10 }}>
            La <strong>base</strong> de cada línea es la plata de las operaciones donde esa persona
            participó, no una parte de un total repartido. Por eso las bases se superponen: la misma
            venta paga cierre y agenda, que es lo que se acordó.
          </p>
        </Tarjeta>

        <Tarjeta titulo="Las reglas"
                 ayuda={puedeConfigurar
                   ? 'Se cambian acá y los números de al lado se recalculan solos.'
                   : 'Las cambia dirección desde esta misma pantalla.'}>
          {puedeConfigurar ? (
            <ReglasDeComision reglas={l.reglas} />
          ) : (
            <table>
              <tbody>
                <tr><td>Se comisiona sobre</td>
                    <td className="num">{l.reglas.sobre === 'cash' ? 'lo cobrado' : 'lo facturado'}</td></tr>
                <tr><td>Closer</td><td className="num">{l.reglas.closer}%</td></tr>
                <tr><td>Setter</td><td className="num">{l.reglas.setter}%</td></tr>
                <tr><td>Repesca</td><td className="num">{l.reglas.repesca}%</td></tr>
              </tbody>
            </table>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
