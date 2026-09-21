import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { verLead, puedeVerLead } from '@/datos/leads'
import { calificacionDelLead, recalcularCalidad } from '@/datos/calificacion'
import { notasDelLead } from '@/datos/notas'
import { llamadasDelLead } from '@/datos/llamadas'
import { seguimientoDelLead, interaccionesDelLead, toques } from '@/datos/seguimientos'
import { historialDelLead } from '@/datos/cambios'
import { catalogos } from '@/datos/catalogos'
import { hoyEn } from '@/motor/periodos'
import { Encabezado, Pildora } from '@/componentes/Piezas'
import { Resumen } from '@/componentes/ficha/Resumen'
import { Calificacion } from '@/componentes/ficha/Calificacion'
import { Resultado } from '@/componentes/ficha/Resultado'
import { Seguimiento } from '@/componentes/ficha/Seguimiento'
import { Llamadas } from '@/componentes/ficha/Llamadas'
import { Notas } from '@/componentes/ficha/Notas'
import { Datos } from '@/componentes/ficha/Datos'
import { Historial } from '@/componentes/ficha/Historial'
import { NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO } from '@/dominio/resultados'

const PESTANAS = [
  { clave: 'resumen', texto: 'Resumen' },
  { clave: 'calificacion', texto: 'Calificación' },
  { clave: 'resultado', texto: 'Resultado' },
  { clave: 'seguimiento', texto: 'Seguimiento' },
  { clave: 'llamadas', texto: 'Llamadas' },
  { clave: 'notas', texto: 'Notas' },
  { clave: 'datos', texto: 'Datos' },
  { clave: 'historial', texto: 'Historial' },
] as const

type Busqueda = Promise<{ pestana?: string }>

/**
 * La ficha del lead.
 *
 * En pestañas porque se completa en momentos distintos y por personas
 * distintas: el setter carga la calificación antes, el closer el resultado el
 * día de la reunión, y las notas las escribe cualquiera cuando pasa algo.
 * Un único formulario largo pide todo a la vez a alguien que sólo sabe una
 * parte, y lo que sale de ahí son campos completados por completar.
 */
export default async function FichaDeLead({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Busqueda }) {
  const { id } = await params
  const { pestana } = await searchParams
  const leadId = Number(id)
  if (!Number.isInteger(leadId)) notFound()

  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  if (!(await puedeVerLead(leadId, alcance))) notFound()

  const lead = await verLead(leadId)
  if (!lead) notFound()

  const cual = (PESTANAS.find((p) => p.clave === pestana)?.clave ?? 'resumen') as typeof PESTANAS[number]['clave']
  const hoy = hoyEn()
  const verPlata = puede(usuario, 'verDinero')

  return (
    <div className="apilado">
      <Encabezado kicker={lead.empresa ?? 'Lead'} titulo={lead.nombre}
                  bajada={[lead.email, lead.telefono].filter(Boolean).join(' · ') || undefined}>
        <Pildora color={COLOR_DE_ESTADO[lead.estado]}>{NOMBRE_DE_ESTADO[lead.estado]}</Pildora>
        <Pildora color={COLOR_DE_RESULTADO[lead.resultado]}>{NOMBRE_DE_RESULTADO[lead.resultado]}</Pildora>
        {lead.ciclo > 1 ? <Pildora color="acento">Ciclo {lead.ciclo}</Pildora> : null}
      </Encabezado>

      <nav className="pestanas">
        {PESTANAS.map((p) => (
          <Link key={p.clave} href={`/leads/${leadId}?pestana=${p.clave}`}
                className={cual === p.clave ? 'activo' : ''}>{p.texto}</Link>
        ))}
      </nav>

      {cual === 'resumen' ? await panelResumen() : null}
      {cual === 'calificacion' ? await panelCalificacion() : null}
      {cual === 'resultado' ? await panelResultado() : null}
      {cual === 'seguimiento' ? await panelSeguimiento() : null}
      {cual === 'llamadas' ? <Llamadas leadId={leadId} llamadas={await llamadasDelLead(leadId)} hoy={hoy} /> : null}
      {cual === 'notas' ? <Notas leadId={leadId} notas={await notasDelLead(leadId)} usuarioId={usuario.id} /> : null}
      {cual === 'datos' ? <Datos lead={lead!} catalogos={await catalogos()} /> : null}
      {cual === 'historial' ? <Historial lineas={await historialDelLead(leadId)} /> : null}
    </div>
  )

  async function panelResumen() {
    const [calidad, seguimiento] = await Promise.all([
      recalcularCalidad(leadId),
      seguimientoDelLead(leadId, hoy),
    ])
    return <Resumen lead={lead!} calidad={calidad} seguimiento={seguimiento} verPlata={verPlata} />
  }

  async function panelCalificacion() {
    return <Calificacion leadId={leadId} respuestas={await calificacionDelLead(leadId)} />
  }

  async function panelResultado() {
    const cats = await catalogos()
    return (
      <Resultado lead={lead!} closers={cats.closers} hoy={hoy} verPlata={verPlata}
                 puedeReasignar={puede(usuario, 'reasignarCloser')} />
    )
  }

  async function panelSeguimiento() {
    const [estado, interacciones, cadencia] = await Promise.all([
      seguimientoDelLead(leadId, hoy),
      interaccionesDelLead(leadId),
      toques(),
    ])
    return <Seguimiento leadId={leadId} estado={estado} interacciones={interacciones} cadencia={cadencia} />
  }
}
