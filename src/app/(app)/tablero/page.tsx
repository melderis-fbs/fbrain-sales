import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { numeros, objetivoDe, seguimientosVencidos, seniasAbiertas } from '@/datos/tablero'
import { catalogos, config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { ritmo, diasHabilesTranscurridos } from '@/motor/objetivo'
import { Numero, Tarjeta, plata, porcentaje, fechaCorta } from '@/componentes/Piezas'
import { Embudo } from '@/componentes/Embudo'
import { Objetivo } from '@/componentes/Objetivo'

type Busqueda = Promise<Record<string, string | undefined>>

export default async function Tablero({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)

  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const hoy = hoyEn()
  const r = rango(periodo, hoy)
  const monedaBase = await config<string>('moneda_base', 'USD')

  const filtros = {
    closerId: q.closer ? Number(q.closer) : undefined,
    setterId: q.setter ? Number(q.setter) : undefined,
    fuenteId: q.fuente ? Number(q.fuente) : undefined,
    funnelId: q.funnel ? Number(q.funnel) : undefined,
  }

  const [{ tarjetas, etapas }, objetivo, cats, vencidos, senias] = await Promise.all([
    numeros(r, alcance, filtros, monedaBase),
    objetivoDe(r, 'facturacion'),
    catalogos(),
    seguimientosVencidos(hoy, alcance, 6),
    seniasAbiertas(alcance),
  ])

  const habiles = diasHabilesTranscurridos(r.desde, hoy, r.hasta)
  const totalHabiles = diasHabilesTranscurridos(r.desde, r.hasta, r.hasta)
  const elRitmo = ritmo(objetivo, tarjetas.facturacion, habiles, totalHabiles)

  const conFiltro = (cambio: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...q, ...cambio })) if (v) p.set(k, v)
    return `/tablero?${p.toString()}`
  }

  return (
    <div className="apilado">
      <div>
        <div className="kicker">Founders Sales OS</div>
        <h1>Tablero · {r.etiqueta}</h1>
      </div>

      <div className="chips">
        {PERIODOS.map((p) => (
          <Link key={p.clave} href={conFiltro({ periodo: p.clave })}
                className={periodo === p.clave ? 'activo' : ''}>
            {p.etiqueta}
          </Link>
        ))}
      </div>

      <form className="filtros" method="get">
        <input type="hidden" name="periodo" value={periodo} />
        {([
          ['closer', 'Closer', cats.closers],
          ['setter', 'Setter', cats.setters],
          ['fuente', 'Fuente', cats.fuentes],
          ['funnel', 'Funnel', cats.funnels],
        ] as const).map(([nombre, etiqueta, opciones]) => (
          <div className="campo" key={nombre}>
            <label htmlFor={`f-${nombre}`}>{etiqueta}</label>
            <select id={`f-${nombre}`} name={nombre} defaultValue={q[nombre] ?? ''}>
              <option value="">Todos</option>
              {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
        ))}
        <button type="submit" className="secundario">Filtrar</button>
      </form>

      {tarjetas.otrasMonedas.length > 0 ? (
        <div className="aviso atencion">
          Hay importes en otra moneda que <strong>no están sumados</strong> arriba:{' '}
          {tarjetas.otrasMonedas.map((m) => plata(m.importe, m.moneda)).join(' · ')}.
          Sumarlos con una cotización inventada daría un número que parece correcto y no lo es.
        </div>
      ) : null}

      <div className="rejilla g4">
        <Numero etiqueta="Llamadas agendadas" valor={tarjetas.agendadas} />
        <Numero etiqueta="No shows" valor={tarjetas.noShows} contra={porcentaje(tarjetas.noShowsPct)}
                color={tarjetas.noShows > 0 ? 'rojo' : undefined} />
        <Numero etiqueta="Cancelaciones" valor={tarjetas.cancelaciones} contra={porcentaje(tarjetas.cancelacionesPct)} />
        <Numero etiqueta="Asistencias" valor={tarjetas.asistencias}
                contra={`${porcentaje(tarjetas.asistenciaPct)} de las agendadas`} />
        <Numero etiqueta="Ofertas" valor={tarjetas.ofertas}
                contra={`${porcentaje(tarjetas.ofertasPct)} de las asistencias`} />
        <Numero etiqueta="Señas" valor={tarjetas.senas} color="sena"
                contra={plata(tarjetas.senasImporte, monedaBase)} />
        <Numero etiqueta="Ventas" valor={tarjetas.ventas} color="verde"
                contra={`${porcentaje(tarjetas.cierrePct)} de cierre sobre asistencias`} />
        {puede(usuario, 'verDinero') ? (
          <>
            <Numero etiqueta="Facturación" valor={plata(tarjetas.facturacion, monedaBase)} chico
                    contra="vendido en el período" />
            <Numero etiqueta="Cash collected" valor={plata(tarjetas.cashCollected, monedaBase)} chico
                    contra="cobrado de verdad · la seña no entra acá" />
          </>
        ) : null}
      </div>

      {puede(usuario, 'verDinero') ? <Objetivo ritmo={elRitmo} moneda={monedaBase} /> : null}

      <div className="rejilla g2">
        <Tarjeta titulo="Embudo">
          <Embudo etapas={etapas} />
        </Tarjeta>

        <div className="apilado">
          <Tarjeta titulo="Seguimientos vencidos"
                   accion={<Link href="/hoy" style={{ fontSize: 13, fontWeight: 650 }}>Ver todos →</Link>}>
            {vencidos.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--gris)' }}>Ninguno vencido. </p>
            ) : (
              <table>
                <tbody>
                  {vencidos.map((v) => (
                    <tr key={v.oportunidadId}>
                      <td><Link href={`/leads/${v.leadId}`}>{v.lead}</Link></td>
                      <td style={{ color: 'var(--gris)', fontSize: 13 }}>{v.closer ?? 'sin closer'}</td>
                      <td className="num"><span className="pildora rojo">{v.diasVencido} d</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Tarjeta>

          <Tarjeta titulo="Señas abiertas">
            {senias.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--gris)' }}>No hay señas pendientes de convertir.</p>
            ) : (
              <table>
                <tbody>
                  {senias.map((s) => (
                    <tr key={s.oportunidadId}>
                      <td><Link href={`/leads/${s.leadId}`}>{s.lead}</Link></td>
                      <td className="num">{plata(s.importe, s.moneda)}</td>
                      <td className="num" style={{ fontSize: 13, color: 'var(--gris)' }}>
                        {s.comprometida ? `paga ${fechaCorta(s.comprometida)}` : 'sin fecha'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  )
}
