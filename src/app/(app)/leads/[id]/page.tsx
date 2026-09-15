import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { verLead, puedeVerLead } from '@/datos/leads'
import { oportunidadesDelLead } from '@/datos/oportunidades'
import { historialDelLead } from '@/datos/cambios'
import { catalogos } from '@/datos/catalogos'
import { FichaDelLead } from '@/componentes/FichaDelLead'
import { Oportunidades } from '@/componentes/Oportunidades'
import { Pildora, Tarjeta, plata, fechaCorta, Vacio } from '@/componentes/Piezas'
import { NOMBRE_DE_RESULTADO, COLOR_DE_RESULTADO, type Resultado } from '@/dominio/resultados'

const PESTANAS = [
  { clave: 'resumen', texto: 'Resumen' },
  { clave: 'ficha', texto: 'Ficha' },
  { clave: 'sesiones', texto: 'Sesiones' },
  { clave: 'historial', texto: 'Historial' },
] as const

export default async function PerfilDelLead({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ p?: string }>
}) {
  const { id } = await params
  const { p } = await searchParams
  const leadId = Number(id)
  if (!Number.isFinite(leadId)) notFound()

  const usuario = await exigirUsuario()
  if (!(await puedeVerLead(leadId, alcanceDe(usuario)))) notFound()

  const [lead, oportunidades, cats] = await Promise.all([
    verLead(leadId), oportunidadesDelLead(leadId), catalogos(),
  ])
  if (!lead) notFound()

  const pestana = (PESTANAS.find((x) => x.clave === p)?.clave ?? 'resumen')
  const historial = pestana === 'historial' ? await historialDelLead(leadId) : []

  const ultima = oportunidades[0]
  const permisos = {
    cargarResultado: puede(usuario, 'cargarResultado'),
    reasignar: puede(usuario, 'reasignarCloser'),
    editarLead: puede(usuario, 'editarLead'),
  }

  return (
    <div className="apilado">
      <div>
        <Link href="/leads" style={{ fontSize: 13, color: 'var(--gris)' }}>← Leads</Link>
        <h1 style={{ marginTop: 6 }}>{lead.nombre}</h1>
        <div className="fila">
          {ultima ? (
            <Pildora color={COLOR_DE_RESULTADO[ultima.resultado as Resultado]}>
              {NOMBRE_DE_RESULTADO[ultima.resultado as Resultado]}
            </Pildora>
          ) : <span className="sindato">sin sesiones</span>}
          {ultima?.closer ? <span style={{ fontSize: 13, color: 'var(--gris)' }}>Closer: {ultima.closer}</span> : null}
          {lead.empresa ? <span style={{ fontSize: 13, color: 'var(--gris)' }}>{lead.empresa}</span> : null}
          <span style={{ fontSize: 13, color: 'var(--gris)' }}>
            Alta {fechaCorta(lead.creadoEn.slice(0, 10))}
          </span>
        </div>
        {/* Lead Quality y Match todavía no existen: entran en las fases 4 y 5.
            No se muestra un lugar vacío prometiendo un número que no hay. */}
      </div>

      <nav className="pestanas">
        {PESTANAS.map((x) => (
          <Link key={x.clave} href={`/leads/${leadId}?p=${x.clave}`} className={pestana === x.clave ? 'activo' : ''}>
            {x.texto}
          </Link>
        ))}
      </nav>

      {pestana === 'resumen' ? (
        <div className="rejilla g2">
          <Tarjeta titulo="Contacto">
            <table>
              <tbody>
                <Linea etiqueta="Email" valor={lead.email} />
                <Linea etiqueta="Teléfono" valor={lead.telefono} />
                <Linea etiqueta="País" valor={lead.pais} />
                <Linea etiqueta="Fuente" valor={cats.fuentes.find((f) => f.id === lead.fuenteId)?.nombre ?? null} />
                <Linea etiqueta="Funnel" valor={cats.funnels.find((f) => f.id === lead.funnelId)?.nombre ?? null} />
                <Linea etiqueta="Setter" valor={cats.setters.find((s) => s.id === lead.setterId)?.nombre ?? null} />
              </tbody>
            </table>
          </Tarjeta>

          <Tarjeta titulo="Lo que sabemos">
            {[['Notas del setter', lead.notas], ['Información del negocio', lead.infoNegocio],
              ['Links', lead.links], ['Información adicional', lead.infoExtra]]
              .filter(([, v]) => v)
              .map(([e, v]) => (
                <div key={e as string} style={{ marginBottom: 12 }}>
                  <div className="etiqueta">{e}</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{v}</div>
                </div>
              ))}
            {!lead.notas && !lead.infoNegocio && !lead.links && !lead.infoExtra ? (
              <Vacio>Todavía no hay nada cargado. Se edita desde la pestaña Ficha.</Vacio>
            ) : null}
          </Tarjeta>

          {ultima ? (
            <Tarjeta titulo="Última sesión">
              <table>
                <tbody>
                  <Linea etiqueta="Fecha" valor={ultima.fechaAgenda ? fechaCorta(ultima.fechaAgenda) : null} />
                  <Linea etiqueta="Closer" valor={ultima.closer} />
                  <Linea etiqueta="Valor potencial"
                         valor={ultima.valorPotencial ? plata(ultima.valorPotencial, ultima.moneda) : null} />
                  <Linea etiqueta="Próximo contacto"
                         valor={ultima.proximoContacto ? fechaCorta(ultima.proximoContacto) : null} />
                  <Linea etiqueta="Próximo paso" valor={ultima.proximoPaso} />
                </tbody>
              </table>
            </Tarjeta>
          ) : null}
        </div>
      ) : null}

      {pestana === 'ficha' ? (
        <FichaDelLead lead={lead} catalogos={cats} puedeEditar={permisos.editarLead} />
      ) : null}

      {pestana === 'sesiones' ? (
        <Oportunidades leadId={leadId} oportunidades={oportunidades} closers={cats.closers} permisos={permisos} />
      ) : null}

      {pestana === 'historial' ? (
        <Tarjeta titulo="Todo lo que se cambió">
          {historial.length === 0 ? (
            <Vacio>Todavía no hay cambios registrados.</Vacio>
          ) : (
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Antes</th><th>Después</th><th>Motivo</th></tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {new Date(h.cuando).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ fontSize: 13 }}>{h.usuario ?? <span className="sindato">—</span>}</td>
                      <td style={{ fontSize: 13, fontWeight: 650 }}>{h.campo}</td>
                      <td style={{ fontSize: 13, color: 'var(--gris)' }}>{h.anterior ?? <span className="sindato">vacío</span>}</td>
                      <td style={{ fontSize: 13 }}>{h.nuevo ?? <span className="sindato">vacío</span>}</td>
                      <td style={{ fontSize: 13, color: 'var(--gris)' }}>{h.motivo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      ) : null}
    </div>
  )
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <tr>
      <td style={{ color: 'var(--gris)', fontSize: 13, width: 140 }}>{etiqueta}</td>
      <td>{valor ?? <span className="sindato">sin cargar</span>}</td>
    </tr>
  )
}
