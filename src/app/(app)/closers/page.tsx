import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { performanceDeClosers, tasasGenerales } from '@/datos/equipo'
import { config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { comoSeLeeElIndice, MINIMO_PARA_PUBLICAR } from '@/motor/ajuste'
import { Tarjeta, Encabezado, Pildora, plata, porcentaje, Vacio } from '@/componentes/Piezas'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * La comparativa de closers.
 *
 * La columna que importa no es «cierre»: es «índice». Un closer que cierra 18%
 * con leads flojos y otro que cierra 22% con leads buenos están ordenados al
 * revés en cualquier tabla que mire el 18 y el 22 — y ordenarlos así no es sólo
 * injusto, es cómo se rompe un equipo: el mejor closer aprende a pelear por los
 * leads buenos en vez de por las llamadas difíciles.
 *
 * El índice compara lo que cerró contra lo que cerraría cualquiera con la
 * mezcla de leads que le tocó. 1,00 es rendir lo esperable.
 */
export default async function Closers({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const hoy = hoyEn()
  const r = rango(periodo, hoy)
  const monedaBase = await config<string>('moneda_base', 'USD')
  const verPlata = puede(usuario, 'verDinero')

  const [filas, generales] = await Promise.all([
    performanceDeClosers(r, monedaBase),
    tasasGenerales(r.hasta),
  ])

  return (
    <div className="apilado">
      <Encabezado kicker="Equipo" titulo={`Closers · ${r.etiqueta}`}
                  bajada="El cierre puesto en contexto de los leads que recibió cada uno." />

      <div className="chips">
        {PERIODOS.map((p) => (
          <Link key={p.clave} href={`/closers?periodo=${p.clave}`}
                className={periodo === p.clave ? 'activo' : ''}>{p.etiqueta}</Link>
        ))}
      </div>

      <div className="aviso dato">
        La vara de la operación en los últimos seis meses es{' '}
        <strong>{Math.round(generales.general * 1000) / 10}% de cierre</strong> sobre{' '}
        {generales.asistencias.toLocaleString('es-AR')} asistencias. Abierta por calidad del lead:{' '}
        {(['alto', 'medio', 'bajo', 'sin_calificar'] as const)
          .filter((n) => generales.porNivel[n] !== undefined)
          .map((n) => `${n.replace('_', ' ')} ${Math.round((generales.porNivel[n] ?? 0) * 1000) / 10}%`)
          .join(' · ')}.
      </div>

      <Tarjeta>
        {filas.length === 0 ? (
          <Vacio>No hay closers cargados. Se dan de alta en Configuración.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Closer</th>
                  <th className="num">Agend.</th><th className="num">Asist.</th><th className="num">%</th>
                  <th className="num">Ofertas</th><th className="num">Cierres</th>
                  <th className="num" title="Ventas ÷ asistencias. Al que no vino no se le pudo vender.">Cierre / asist.</th>
                  <th className="num">Quality</th>
                  <th className="num">Índice</th>
                  {verPlata ? <><th className="num">Facturación</th><th className="num">Ticket</th></> : null}
                  <th className="num">Nota</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/closers/${c.id}?periodo=${periodo}`} style={{ fontWeight: 600 }}>{c.nombre}</Link></td>
                    <td className="num">{c.agendadas}</td>
                    <td className="num">{c.asistencias}</td>
                    <td className="num">{porcentaje(c.asistenciaPct)}</td>
                    <td className="num">{c.ofertas}</td>
                    {/* Cierres por fecha de venta; el % de cierre, sobre las
                        ASISTENCIAS del período. Son dos preguntas distintas y
                        ahora cada columna dice cuál contesta. */}
                    <td className="num">{c.cerradas}</td>
                    <td className="num">{porcentaje(c.cierrePct)}</td>
                    <td className="num">
                      {c.calidadPromedio === null ? <span className="sindato">—</span> : c.calidadPromedio}
                    </td>
                    <td className="num">
                      {c.ajuste.indice === null
                        ? <span className="sindato" title={c.ajuste.porque ?? ''}>pocos datos</span>
                        : <Pildora color={c.ajuste.indice >= 1.05 ? 'verde' : c.ajuste.indice >= 0.95 ? 'gris' : 'rojo'}
                                   titulo={`Esperable con sus leads: ${porcentaje(c.ajuste.esperado)}`}>
                            {c.ajuste.indice.toFixed(2)}
                          </Pildora>}
                    </td>
                    {verPlata ? (
                      <>
                        <td className="num">{plata(c.facturacion, monedaBase)}</td>
                        <td className="num">{c.ticketPromedio === null ? '—' : plata(c.ticketPromedio, monedaBase)}</td>
                      </>
                    ) : null}
                    <td className="num">
                      {c.notaLlamadas === null
                        ? <span className="sindato">—</span>
                        : <span title={`${c.llamadasAnalizadas} llamadas analizadas`}>{c.notaLlamadas.toFixed(1)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Cómo leer el índice">
        <p className="ayuda">
          <strong>1,00</strong> es rendir lo esperable con los leads que recibió. Arriba de 1,05,
          por encima; abajo de 0,95, por debajo. Con menos de {MINIMO_PARA_PUBLICAR} asistencias
          no se publica: un número que se mueve veinte puntos con una venta más se lee igual que
          uno sólido, y eso es peor que no mostrarlo.
        </p>
        <p className="ayuda" style={{ marginTop: 8 }}>
          El nivel de calidad que se usa es el <strong>congelado al asignar el lead</strong>. Si se
          usara el vigente, bastaría con bajarle la calidad a un lead después de perderlo para
          mejorar el propio número.
        </p>
        {filas.some((c) => c.ajuste.indice !== null) ? (
          <>
            <div className="separador" />
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {filas.filter((c) => c.ajuste.indice !== null).map((c) => (
                <li key={c.id} style={{ marginBottom: 3 }}>
                  <strong>{c.nombre}</strong> cerró {porcentaje(c.ajuste.bruto)} y lo esperable con sus
                  leads era {porcentaje(c.ajuste.esperado)}: {comoSeLeeElIndice(c.ajuste.indice!)}.
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Tarjeta>
    </div>
  )
}
