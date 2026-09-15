import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { performanceDeSetters } from '@/datos/equipo'
import { config } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Tarjeta, Barra, plata, porcentaje, Vacio } from '@/componentes/Piezas'

/** Verde 100%+ · Amarillo 80–99% · Rojo <80%. Sin objetivo cargado: gris. */
function semaforo(cumplimiento: number | null): { color: 'verde' | 'amarillo' | 'rojo' | 'gris'; palabra: string } {
  if (cumplimiento === null) return { color: 'gris', palabra: 'sin objetivo' }
  if (cumplimiento >= 100) return { color: 'verde', palabra: 'cumplido' }
  if (cumplimiento >= 80) return { color: 'amarillo', palabra: 'cerca' }
  return { color: 'rojo', palabra: 'debajo' }
}

export default async function Setters({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: crudo } = await searchParams
  const usuario = await exigirUsuario()
  exigir(usuario, 'verTodo')

  const periodo = (crudo ?? 'mes') as NombreDePeriodo
  const r = rango(periodo, hoyEn())
  const monedaBase = await config<string>('moneda_base', 'USD')
  const filas = await performanceDeSetters(r, monedaBase)

  return (
    <div className="apilado">
      <div>
        <div className="kicker">Equipo</div>
        <h1>Setters · {r.etiqueta}</h1>
      </div>

      <div className="chips">
        {PERIODOS.map((p) => (
          <Link key={p.clave} href={`/setters?periodo=${p.clave}`} className={periodo === p.clave ? 'activo' : ''}>
            {p.etiqueta}
          </Link>
        ))}
      </div>

      {filas.length === 0 ? (
        <Tarjeta><Vacio>No hay setters cargados. Se dan de alta en Configuración.</Vacio></Tarjeta>
      ) : (
        <div className="rejilla g2">
          {filas.map((s) => {
            const sem = semaforo(s.cumplimiento)
            return (
              <section className="tarjeta" key={s.id}>
                <div className="entre">
                  <h2 style={{ margin: 0 }}>{s.nombre}</h2>
                  <span className={`pildora ${sem.color}`}>{sem.palabra}</span>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="entre" style={{ fontSize: 13 }}>
                    <span className="etiqueta">Agendas</span>
                    <span style={{ fontWeight: 700 }}>
                      {s.agendas}{s.objetivo !== null ? ` / ${s.objetivo}` : ''}
                      {s.cumplimiento !== null ? ` · ${s.cumplimiento}%` : ''}
                    </span>
                  </div>
                  {s.objetivo === null ? (
                    <div className="sindato" style={{ marginTop: 4 }}>
                      Sin objetivo cargado. No es lo mismo que no haber llegado.
                    </div>
                  ) : (
                    <div style={{ marginTop: 4 }}>
                      <Barra porcentaje={s.cumplimiento ?? 0}
                             color={sem.color === 'gris' ? undefined : sem.color} />
                    </div>
                  )}
                </div>

                <div className="rejilla g4" style={{ marginTop: 14 }}>
                  <div><div className="etiqueta">Asistencia</div><div className="numero chico">{porcentaje(s.asistenciaPct)}</div></div>
                  <div><div className="etiqueta">Ofertas</div><div className="numero chico">{s.ofertas}</div></div>
                  <div><div className="etiqueta">Señas</div><div className="numero chico" style={{ color: 'var(--sena)' }}>{s.senas}</div></div>
                  <div><div className="etiqueta">Ventas</div><div className="numero chico" style={{ color: 'var(--verde)' }}>{s.ventas}</div></div>
                </div>

                <div className="contra" style={{ marginTop: 10 }}>
                  Facturación originada: <strong>{plata(s.facturacionOriginada, monedaBase)}</strong>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
