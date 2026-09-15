import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { performanceDeClosers } from '@/datos/equipo'
import { config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Tarjeta, plata, porcentaje, Vacio } from '@/componentes/Piezas'

export default async function Closers({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: crudo } = await searchParams
  const usuario = await exigirUsuario()
  exigir(usuario, 'verTodo')

  const periodo = (crudo ?? 'mes') as NombreDePeriodo
  const r = rango(periodo, hoyEn())
  const monedaBase = await config<string>('moneda_base', 'USD')
  const filas = await performanceDeClosers(r, monedaBase)

  return (
    <div className="apilado">
      <div>
        <div className="kicker">Equipo</div>
        <h1>Closers · {r.etiqueta}</h1>
      </div>

      <div className="chips">
        {PERIODOS.map((p) => (
          <Link key={p.clave} href={`/closers?periodo=${p.clave}`} className={periodo === p.clave ? 'activo' : ''}>
            {p.etiqueta}
          </Link>
        ))}
      </div>

      <div className="aviso">
        Acá está el <strong>cierre bruto</strong>. El cierre ajustado por calidad del lead —el que permite
        comparar a dos closers que reciben leads distintos— necesita el Lead Quality Score, que entra
        en la Fase 4. Mostrarlo ahora sería inventar el ajuste.
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
                  <th className="num">Agendadas</th>
                  <th className="num">Asistencias</th>
                  <th className="num">% asistencia</th>
                  <th className="num">Ofertas</th>
                  <th className="num">% oferta</th>
                  <th className="num">Señas</th>
                  <th className="num">Ventas</th>
                  <th className="num">% cierre</th>
                  <th className="num">% cierre s/oferta</th>
                  <th className="num">Facturación</th>
                  <th className="num">Cash</th>
                  <th className="num">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 650 }}>{c.nombre}</td>
                    <td className="num">{c.agendadas}</td>
                    <td className="num">{c.asistencias}</td>
                    <td className="num">{porcentaje(c.asistenciaPct)}</td>
                    <td className="num">{c.ofertas}</td>
                    <td className="num">{porcentaje(c.ofertaPct)}</td>
                    <td className="num" style={{ color: 'var(--sena)' }}>{c.senas}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{c.ventas}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{porcentaje(c.cierrePct)}</td>
                    <td className="num">{porcentaje(c.cierreSobreOfertaPct)}</td>
                    <td className="num">{plata(c.facturacion, monedaBase)}</td>
                    <td className="num">{plata(c.cash, monedaBase)}</td>
                    <td className="num">{c.ticketPromedio === null ? '—' : plata(c.ticketPromedio, monedaBase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  )
}
