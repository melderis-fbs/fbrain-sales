import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { verLead, puedeVerLead } from '@/datos/leads'
import { calificacionDelLead, recalcularCalidad } from '@/datos/calificacion'
import { notasDelLead } from '@/datos/notas'
import { llamadasDelLead } from '@/datos/llamadas'
import { seguimientoDelLead } from '@/datos/seguimientos'
import { catalogos } from '@/datos/catalogos'
import { hoyEn } from '@/motor/periodos'
import { Encabezado, Pildora, Tarjeta, fechaCorta, hora } from '@/componentes/Piezas'
import { Preparacion } from '@/componentes/Preparacion'
import { Resultado } from '@/componentes/ficha/Resultado'
import { Notas } from '@/componentes/ficha/Notas'
import { Llamadas } from '@/componentes/ficha/Llamadas'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO, NOMBRE_DE_TIPO,
} from '@/dominio/resultados'
import { NOMBRE_DE_URGENCIA, COLOR_DE_URGENCIA } from '@/motor/toques'

/**
 * La llamada, desde el lado del closer.
 *
 * Todo lo que necesita para entrar y para cargar después, en un solo scroll:
 * lo que averiguó el setter, qué pasó, las notas y la transcripción. Sin
 * pestañas, sin buscar el lead en una lista y sin los campos que no son suyos
 * —de dónde vino, qué funnel, quién lo agendó—.
 *
 * Escribe sobre el MISMO lead que la ficha completa. No hay una copia ni un
 * registro paralelo: es la misma fila vista desde el trabajo del closer, y por
 * eso lo que carga acá aparece en el Tracker, en el Dashboard y en la ficha sin
 * que nadie sincronice nada.
 */
export default async function LaLlamada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const leadId = Number(id)
  if (!Number.isInteger(leadId)) notFound()

  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  if (!(await puedeVerLead(leadId, alcance))) notFound()

  const lead = await verLead(leadId)
  if (!lead) notFound()

  const hoy = hoyEn()
  const [calidad, respuestas, notas, llamadas, seguimiento, cats] = await Promise.all([
    recalcularCalidad(leadId),
    calificacionDelLead(leadId),
    notasDelLead(leadId),
    llamadasDelLead(leadId),
    seguimientoDelLead(leadId, hoy),
    catalogos(),
  ])

  const sinCargar = lead.estado === 'agendado' && lead.resultado === 'pendiente'
    && lead.fechaSesion !== null && lead.fechaSesion <= hoy

  return (
    <div className="apilado">
      <Encabezado
        kicker={[NOMBRE_DE_TIPO[lead.tipoSesion], lead.empresa].filter(Boolean).join(' · ')}
        titulo={lead.nombre}
        bajada={[
          lead.fechaSesion ? `${fechaCorta(lead.fechaSesion)} ${hora(lead.horaSesion)}` : 'sin reunión agendada',
          lead.closer ?? 'sin closer',
          lead.telefono,
        ].filter(Boolean).join(' · ')}>
        <Pildora color={COLOR_DE_ESTADO[lead.estado]}>{NOMBRE_DE_ESTADO[lead.estado]}</Pildora>
        <Pildora color={COLOR_DE_RESULTADO[lead.resultado]}>{NOMBRE_DE_RESULTADO[lead.resultado]}</Pildora>
        {lead.ciclo > 1 ? <Pildora color="acento">Ciclo {lead.ciclo}</Pildora> : null}
        <Link className="boton secundario" href={`/leads/${leadId}`}>Ficha completa</Link>
      </Encabezado>

      {sinCargar ? (
        <div className="aviso atencion">
          Esta reunión ya pasó y no tiene resultado cargado. Hasta que se cargue, no cuenta en
          ningún número del Tracker ni del Dashboard.
        </div>
      ) : null}

      {seguimiento && seguimiento.situacion !== 'fuera' ? (
        <div className="aviso dato">
          Está en el pipeline de seguimientos ·{' '}
          <Pildora color={COLOR_DE_URGENCIA[seguimiento.urgencia]}>
            {NOMBRE_DE_URGENCIA[seguimiento.urgencia]}
          </Pildora>{' '}
          {seguimiento.situacion === 'largo'
            ? <>seguimiento largo, vuelve el {fechaCorta(seguimiento.fechaLarga)}</>
            : <>toque {seguimiento.toque}
                {seguimiento.toqueNombre ? ` · ${seguimiento.toqueNombre}` : ''} ·{' '}
                toca el {fechaCorta(seguimiento.fecha)}</>}
          {' · '}
          <Link href="/seguimientos" style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>
            ir al pipeline
          </Link>
        </div>
      ) : null}

      <div className="rejilla g2">
        <Preparacion lead={lead} calidad={calidad} respuestas={respuestas} />

        <Tarjeta titulo="Notas" ayuda="Lo que pasó en la conversación, con autor y fecha.">
          <Notas leadId={leadId} notas={notas} usuarioId={usuario.id} suelto />
        </Tarjeta>
      </div>

      <Resultado lead={lead} closers={cats.closers} hoy={hoy}
                 verPlata={puede(usuario, 'verDinero')}
                 puedeReasignar={puede(usuario, 'reasignarCloser')} />

      <Llamadas leadId={leadId} llamadas={llamadas} hoy={hoy} />
    </div>
  )
}
