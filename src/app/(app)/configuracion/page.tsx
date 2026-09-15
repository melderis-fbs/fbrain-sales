import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { filas } from '@/lib/db'
import { catalogos, config } from '@/datos/catalogos'
import { hoyEn, rango } from '@/motor/periodos'
import { Tarjeta, plata, fechaCorta, Vacio } from '@/componentes/Piezas'
import { equipo } from '@/datos/personas'
import { Equipo } from '@/componentes/Equipo'
import { altaDeCatalogoAccion, objetivoAccion, monedaBaseAccion } from './acciones'

export default async function Configuracion() {
  const usuario = await exigirUsuario()
  exigir(usuario, 'configurar')

  const hoy = hoyEn()
  const mes = rango('mes', hoy)
  const [cats, monedaBase, personas, objetivos] = await Promise.all([
    catalogos(),
    config<string>('moneda_base', 'USD'),
    equipo(),
    filas<{ id: number; ambito: string; tipo: string; desde: string; hasta: string; valor: number; moneda: string; quien: string | null }>(
      `select o.id, o.ambito, o.tipo, o.desde, o.hasta, o.valor, o.moneda,
              coalesce(c.nombre, s.nombre) as quien
         from objetivos o
         left join closers c on o.ambito = 'closer' and c.id = o.ambito_id
         left join setters s on o.ambito = 'setter' and s.id = o.ambito_id
        order by o.desde desc, o.ambito limit 40`,
    ),
  ])

  return (
    <div className="apilado">
      <div>
        <div className="kicker">Configuración</div>
        <h1>Las variables del negocio</h1>
        <p style={{ color: 'var(--gris)', marginTop: 2 }}>
          Todo lo que está acá se cambia sin tocar código.
        </p>
      </div>

      <Equipo personas={personas} yo={usuario.id} />

      <div className="rejilla g2">
        <Tarjeta titulo="Fuentes">
          <Lista items={cats.fuentes.map((f) => f.nombre)} />
          <form action={altaDeCatalogoAccion} className="fila" style={{ marginTop: 10 }}>
            <input type="hidden" name="tabla" value="fuentes" />
            <input name="nombre" placeholder="Meta Ads, Webinar…" required style={{ flex: 1, minWidth: 140 }} />
            <button type="submit" className="secundario">Agregar</button>
          </form>
        </Tarjeta>

        <Tarjeta titulo="Funnels">
          <Lista items={cats.funnels.map((f) => f.nombre)} />
          <form action={altaDeCatalogoAccion} className="fila" style={{ marginTop: 10 }}>
            <input type="hidden" name="tabla" value="funnels" />
            <input name="nombre" placeholder="Nombre del funnel" required style={{ flex: 1, minWidth: 140 }} />
            <button type="submit" className="secundario">Agregar</button>
          </form>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Moneda base">
        <p style={{ marginTop: 0, fontSize: 14, color: 'var(--gris)' }}>
          Es la moneda en la que se leen los totales del tablero. Los importes en otra moneda
          <strong> no se convierten</strong>: se muestran aparte, porque una suma con una cotización
          inventada es un número que parece correcto y no lo es.
        </p>
        <form action={monedaBaseAccion} className="fila">
          <select name="moneda" defaultValue={monedaBase} style={{ width: 120 }}>
            <option>USD</option><option>ARS</option><option>EUR</option>
          </select>
          <button type="submit" className="secundario">Guardar</button>
        </form>
      </Tarjeta>

      <Tarjeta titulo="Objetivos">
        {objetivos.length === 0 ? (
          <Vacio>
            Todavía no hay objetivos cargados. Sin objetivo, el tablero no puede decir si vamos bien.
          </Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Ámbito</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th className="num">Valor</th></tr>
              </thead>
              <tbody>
                {objetivos.map((o) => (
                  <tr key={o.id}>
                    <td>{o.ambito === 'empresa' ? 'Empresa' : `${o.ambito}: ${o.quien ?? '—'}`}</td>
                    <td>{o.tipo}</td>
                    <td>{fechaCorta(o.desde)}</td>
                    <td>{fechaCorta(o.hasta)}</td>
                    <td className="num">
                      {o.tipo === 'ventas' || o.tipo === 'agendas' ? o.valor : plata(o.valor, o.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={objetivoAccion} style={{ marginTop: 16, borderTop: '1px solid var(--borde)', paddingTop: 14 }}>
          <h3>Cargar un objetivo</h3>
          <div className="rejilla g4">
            <div className="campo">
              <label htmlFor="o-ambito">Ámbito</label>
              <select id="o-ambito" name="ambito" defaultValue="empresa">
                <option value="empresa">Empresa</option>
                <option value="closer">Closer</option>
                <option value="setter">Setter</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="o-quien">Quién (si no es empresa)</label>
              <select id="o-quien" name="ambitoId" defaultValue="">
                <option value="">—</option>
                <optgroup label="Closers">
                  {cats.closers.map((c) => <option key={`c${c.id}`} value={c.id}>{c.nombre}</option>)}
                </optgroup>
                <optgroup label="Setters">
                  {cats.setters.map((s) => <option key={`s${s.id}`} value={s.id}>{s.nombre}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="o-tipo">Tipo</label>
              <select id="o-tipo" name="tipo" defaultValue="facturacion">
                <option value="facturacion">Facturación</option>
                <option value="cash">Cash collected</option>
                <option value="ventas">Ventas</option>
                <option value="agendas">Agendas</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="o-periodo">Período</label>
              <select id="o-periodo" name="periodo" defaultValue="mes">
                <option value="mes">Mes</option>
                <option value="semana">Semana</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="o-desde">Desde</label>
              <input id="o-desde" name="desde" type="date" defaultValue={mes.desde} required />
            </div>
            <div className="campo">
              <label htmlFor="o-hasta">Hasta</label>
              <input id="o-hasta" name="hasta" type="date" defaultValue={mes.hasta} required />
            </div>
            <div className="campo">
              <label htmlFor="o-valor">Valor</label>
              <input id="o-valor" name="valor" inputMode="decimal" placeholder="160000" required />
            </div>
            <div className="campo">
              <label htmlFor="o-moneda">Moneda</label>
              <select id="o-moneda" name="moneda" defaultValue={monedaBase}>
                <option>USD</option><option>ARS</option><option>EUR</option>
              </select>
            </div>
          </div>
          <button type="submit">Guardar objetivo</button>
        </form>
      </Tarjeta>
    </div>
  )
}

function Lista({ items }: { items: string[] }) {
  if (items.length === 0) return <div className="sindato">Ninguno cargado todavía.</div>
  return (
    <div className="chips">
      {items.map((i) => (
        <span key={i} style={{
          padding: '4px 11px', borderRadius: 99, border: '1px solid var(--borde)', fontSize: 13,
        }}>{i}</span>
      ))}
    </div>
  )
}
