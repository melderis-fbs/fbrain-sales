import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { listarLlamadas } from '@/datos/llamadas'
import { catalogos } from '@/datos/catalogos'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { Numero, Tarjeta, Encabezado, Pildora, Vacio, fechaCorta } from '@/componentes/Piezas'
import { comoSeLee } from '@/dominio/rubrica'
import { NOMBRE_DE_TIPO } from '@/dominio/resultados'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * Las llamadas.
 *
 * La lista de lo que pasó, con el estado de su transcripción. Lo que dice la
 * nota —la rúbrica, la distribución, los playbooks— vive en el Analizador: acá
 * se ve qué hay cargado y qué falta.
 */
export default async function Llamadas({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const periodo = (q.periodo ?? 'mes') as NombreDePeriodo
  const r = rango(periodo, hoyEn())

  const [llamadas, cats] = await Promise.all([
    listarLlamadas(alcance, {
      closerId: q.closer ? Number(q.closer) : undefined,
      desde: r.desde, hasta: r.hasta,
      sinAnalizar: q.sinanalizar === '1',
    }, 300),
    catalogos(),
  ])

  const conTranscripcion = llamadas.filter((l) => l.tieneTranscripcion).length
  const analizadas = llamadas.filter((l) => l.score !== null).length

  return (
    <div className="apilado">
      <Encabezado kicker="Llamadas" titulo={r.etiqueta}
                  bajada="Una llamada se registra desde la ficha del lead. Acá se le pega la transcripción y se la analiza.">
        <Link className="boton secundario" href="/analizador">Ir al Analizador</Link>
      </Encabezado>

      <div className="chips">
        {PERIODOS.map((p) => (
          <Link key={p.clave} href={`/llamadas?periodo=${p.clave}${q.closer ? `&closer=${q.closer}` : ''}`}
                className={periodo === p.clave ? 'activo' : ''}>{p.etiqueta}</Link>
        ))}
      </div>

      <form className="filtros" method="get">
        <input type="hidden" name="periodo" value={periodo} />
        <div className="campo">
          <label htmlFor="f-closer">Closer</label>
          <select id="f-closer" name="closer" defaultValue={q.closer ?? ''}>
            <option value="">Todos</option>
            {cats.closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="f-sa">Sólo sin analizar</label>
          <select id="f-sa" name="sinanalizar" defaultValue={q.sinanalizar ?? ''}>
            <option value="">No</option><option value="1">Sí</option>
          </select>
        </div>
        <button type="submit" className="secundario">Filtrar</button>
      </form>

      <div className="rejilla g4">
        <Numero etiqueta="Llamadas" valor={llamadas.length} />
        <Numero etiqueta="Con transcripción" valor={conTranscripcion}
                contra={llamadas.length > 0 ? `faltan ${llamadas.length - conTranscripcion}` : undefined} />
        <Numero etiqueta="Analizadas" valor={analizadas} />
        <Numero etiqueta="Sin analizar" valor={conTranscripcion - analizadas}
                contra={conTranscripcion - analizadas > 0 ? 'tienen transcripción y esperan' : 'al día'} />
      </div>

      <Tarjeta>
        {llamadas.length === 0 ? (
          <Vacio>
            No hay llamadas en el período. Se registran desde la ficha del lead,
            en la pestaña <strong>Llamadas</strong>.
          </Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Lead</th><th>Closer</th><th>#</th><th>Tipo</th>
                    <th>Transcripción</th><th>Nota</th><th></th></tr>
              </thead>
              <tbody>
                {llamadas.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12.5 }}>{fechaCorta(l.fecha)}</td>
                    <td><Link href={`/leads/${l.leadId}`} style={{ fontWeight: 600 }}>{l.lead}</Link></td>
                    <td style={{ fontSize: 12.5 }}>{l.closer ?? <span className="sindato">—</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{l.numero}</td>
                    <td style={{ fontSize: 12.5 }}>{NOMBRE_DE_TIPO[l.tipoSesion]}</td>
                    <td>{l.tieneTranscripcion
                      ? <Pildora color="gris">cargada</Pildora>
                      : <span className="sindato">falta</span>}</td>
                    <td>
                      {l.score !== null
                        ? <Pildora color={l.score >= 8 ? 'verde' : l.score >= 6 ? 'ambar' : 'rojo'}>
                            {l.score.toFixed(1)} · {comoSeLee(l.score)}
                          </Pildora>
                        : l.estadoAnalisis === 'error'
                          ? <Pildora color="rojo">falló</Pildora>
                          : <span className="sindato">sin analizar</span>}
                    </td>
                    <td className="num">
                      <Link href={`/llamadas/${l.id}`}
                            style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                        {l.tieneTranscripcion ? 'Abrir →' : 'Cargar →'}
                      </Link>
                    </td>
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
