import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { listarLeads } from '@/datos/leads'
import { catalogos } from '@/datos/catalogos'
import { Pildora, Tarjeta, plata, fechaCorta, Vacio } from '@/componentes/Piezas'
import { NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
         type Estado, type Resultado } from '@/dominio/resultados'
import { hoyEn } from '@/motor/periodos'

type Busqueda = Promise<Record<string, string | undefined>>

export default async function Leads({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const hoy = hoyEn()

  const [leads, cats] = await Promise.all([
    listarLeads(alcance, {
      texto: q.q,
      fuenteId: q.fuente ? Number(q.fuente) : undefined,
      funnelId: q.funnel ? Number(q.funnel) : undefined,
      setterId: q.setter ? Number(q.setter) : undefined,
      closerId: q.closer ? Number(q.closer) : undefined,
      resultado: q.resultado as Resultado | undefined,
      soloAbiertas: q.abiertas === '1',
    }),
    catalogos(),
  ])

  return (
    <div className="apilado">
      <div className="entre">
        <div>
          <div className="kicker">Leads</div>
          <h1>{leads.length} {leads.length === 1 ? 'lead' : 'leads'}</h1>
        </div>
        <Link className="boton" href="/leads/nuevo">Registrar lead</Link>
      </div>

      <form className="filtros" method="get">
        <div className="campo" style={{ minWidth: 220 }}>
          <label htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={q.q ?? ''} placeholder="Nombre, email o teléfono" />
        </div>
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
        <div className="campo">
          <label htmlFor="f-resultado">Resultado</label>
          <select id="f-resultado" name="resultado" defaultValue={q.resultado ?? ''}>
            <option value="">Todos</option>
            {(Object.keys(NOMBRE_DE_RESULTADO) as Resultado[]).map((r) => (
              <option key={r} value={r}>{NOMBRE_DE_RESULTADO[r]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="secundario">Filtrar</button>
      </form>

      <Tarjeta>
        {leads.length === 0 ? (
          <Vacio>
            No hay leads con esos filtros. <Link href="/leads/nuevo">Registrar el primero →</Link>
          </Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Fuente</th><th>Setter</th><th>Funnel</th>
                  <th>Closer</th><th>Reunión</th><th>Resultado</th>
                  <th>Próximo contacto</th><th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const vencido = l.proximoContacto !== null && l.proximoContacto < hoy
                  return (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/leads/${l.id}`} style={{ fontWeight: 650 }}>{l.nombre}</Link>
                        {l.oportunidades > 1 ? (
                          <span style={{ color: 'var(--gris)', fontSize: 12 }}> · {l.oportunidades} sesiones</span>
                        ) : null}
                      </td>
                      <td style={{ fontSize: 13 }}>{l.fuente ?? <span className="sindato">—</span>}</td>
                      <td style={{ fontSize: 13 }}>{l.setter ?? <span className="sindato">—</span>}</td>
                      <td style={{ fontSize: 13 }}>{l.funnel ?? <span className="sindato">—</span>}</td>
                      <td style={{ fontSize: 13 }}>{l.closer ?? <span className="sindato">sin asignar</span>}</td>
                      <td>{l.estado ? <Pildora color={COLOR_DE_ESTADO[l.estado as Estado]}>{NOMBRE_DE_ESTADO[l.estado as Estado]}</Pildora> : <span className="sindato">sin sesión</span>}</td>
                      <td>{l.resultado ? <Pildora color={COLOR_DE_RESULTADO[l.resultado as Resultado]}>{NOMBRE_DE_RESULTADO[l.resultado as Resultado]}</Pildora> : '—'}</td>
                      <td style={{ fontSize: 13 }}>
                        {l.proximoContacto
                          ? (vencido
                              ? <Pildora color="rojo">{fechaCorta(l.proximoContacto)} · vencido</Pildora>
                              : fechaCorta(l.proximoContacto))
                          : <span className="sindato">—</span>}
                      </td>
                      <td className="num">{l.valorPotencial ? plata(l.valorPotencial, l.moneda ?? 'USD') : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  )
}
