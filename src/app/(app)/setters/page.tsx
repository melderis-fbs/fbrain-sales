import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { performanceDeSetters } from '@/datos/equipo'
import { config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Tarjeta, Encabezado, Pildora, plata, porcentaje, Vacio } from '@/componentes/Piezas'
import { nivelDeCalidad, COLOR_DE_CALIDAD } from '@/dominio/calidad'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * Los setters.
 *
 * La columna propia del setter no es «cuántas agendó»: es la CALIDAD de lo que
 * agendó. Veinte llamadas con gente que no puede pagar son veinte horas de
 * closer tiradas, y una tabla que sólo cuenta agendas premia exactamente eso.
 */
export default async function Setters({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const r = rango(periodo, hoyEn())
  const monedaBase = await config<string>('moneda_base', 'USD')
  const verPlata = puede(usuario, 'verDinero')

  const filas = await performanceDeSetters(r, monedaBase)
  const sinCalificar = filas.reduce((s, f) => s + f.sinCalificar, 0)

  return (
    <div className="apilado">
      <Encabezado kicker="Equipo" titulo={`Setters · ${r.etiqueta}`}
                  bajada="Cuántas agendó, y sobre todo con qué calidad." />

      <div className="chips">
        {PERIODOS.map((p) => (
          <Link key={p.clave} href={`/setters?periodo=${p.clave}`}
                className={periodo === p.clave ? 'activo' : ''}>{p.etiqueta}</Link>
        ))}
      </div>

      {sinCalificar > 0 ? (
        <div className="aviso atencion">
          Hay <strong>{sinCalificar}</strong>{' '}
          {sinCalificar === 1 ? 'lead sin calificar' : 'leads sin calificar'} en el período.
          Sin la calificación no hay Lead Quality, y sin Lead Quality el cierre de los closers
          no se puede poner en contexto: se los termina comparando por un número crudo.
        </div>
      ) : null}

      <Tarjeta>
        {filas.length === 0 ? (
          <Vacio>No hay setters cargados. Se dan de alta en Configuración.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Setter</th>
                  <th className="num">Agendas</th><th className="num">Objetivo</th><th className="num">Cumpl.</th>
                  <th className="num">Asist.</th><th className="num">%</th>
                  <th className="num">No shows</th>
                  <th className="num">Cierres</th>
                  <th className="num" title="Ventas ÷ asistencias de lo que agendó. Que no hayan venido se mide aparte, en la columna de asistencia.">Cierre / asist.</th>
                  <th className="num">Quality</th><th className="num">Sin calificar</th>
                  <th className="num">Repescas</th>
                  {verPlata ? <th className="num">Facturación</th> : null}
                </tr>
              </thead>
              <tbody>
                {filas.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.nombre}</td>
                    <td className="num">{s.agendas}</td>
                    <td className="num">
                      {s.objetivo === null ? <span className="sindato">sin objetivo</span> : s.objetivo}
                    </td>
                    <td className="num">{porcentaje(s.cumplimiento)}</td>
                    <td className="num">{s.asistencias}</td>
                    <td className="num">{porcentaje(s.asistenciaPct)}</td>
                    <td className="num">{s.noShows}</td>
                    {/* Cierres por fecha de venta, igual que la facturación
                        que originó. El % de cierre mide sobre las ASISTENCIAS,
                        no sobre las agendas: al que no vino no se le pudo
                        vender. Que no haya venido sí es del setter, y eso lo
                        dice la columna de asistencia. */}
                    <td className="num">{s.cerradas}</td>
                    <td className="num">{porcentaje(s.cierrePct)}</td>
                    <td className="num">
                      {s.calidadPromedio === null
                        ? <span className="sindato">—</span>
                        : <Pildora color={COLOR_DE_CALIDAD[nivelDeCalidad(s.calidadPromedio)]}>
                            {s.calidadPromedio}
                          </Pildora>}
                    </td>
                    <td className="num">
                      {s.sinCalificar > 0 ? <Pildora color="ambar">{s.sinCalificar}</Pildora> : '—'}
                    </td>
                    <td className="num">{s.repescas > 0 ? s.repescas : '—'}</td>
                    {verPlata ? <td className="num">{plata(s.facturacionOriginada, monedaBase)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Cómo se leen estas columnas">
        <p className="ayuda">
          <strong>Objetivo</strong> sale de Configuración, no de una constante en el código. Un setter
          sin objetivo cargado muestra «sin objetivo», no 0%: no es lo mismo «no llegó» que
          «nadie le puso objetivo».
        </p>
        <p className="ayuda" style={{ marginTop: 8 }}>
          <strong>Quality</strong> es el promedio del Lead Quality de lo que agendó, y es su número
          propio. <strong>Repescas</strong> son los leads que ya habían estado cerrados y volvieron a
          abrirse: esa repesca la cobra quien la hace.
        </p>
        <p className="ayuda" style={{ marginTop: 8 }}>
          <strong>Cierre</strong> es de los closers, no del setter, y está acá igual porque un setter
          que agenda bien tiene un cierre alto detrás. Es una consecuencia de su trabajo, no su mérito.
        </p>
      </Tarjeta>
    </div>
  )
}
