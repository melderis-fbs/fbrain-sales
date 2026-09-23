import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, puede } from '@/lib/permisos'
import { verLead, puedeVerLead, loQueCuelgaDelLead } from '@/datos/leads'
import { calificacionDelLead, recalcularCalidad } from '@/datos/calificacion'
import { notasDelLead } from '@/datos/notas'
import { llamadasDelLead } from '@/datos/llamadas'
import { seguimientoDelLead, interaccionesDelLead, toques } from '@/datos/seguimientos'
import { historialDelLead } from '@/datos/cambios'
import { catalogos } from '@/datos/catalogos'
import { hoyEn } from '@/motor/periodos'
import { plataQueNoCuadra } from '@/dominio/resultados'
import { Iconos, type NombreDeIcono } from '@/componentes/Iconos'
import { CabeceraDeLead } from '@/componentes/CabeceraDeLead'
import { AccionDelCloser } from '@/componentes/AccionDelCloser'
import { PlataQueNoCuadra } from '@/componentes/PlataQueNoCuadra'
import { Resumen } from '@/componentes/ficha/Resumen'
import { Calificacion } from '@/componentes/ficha/Calificacion'
import { Resultado } from '@/componentes/ficha/Resultado'
import { Seguimiento } from '@/componentes/ficha/Seguimiento'
import { Llamadas } from '@/componentes/ficha/Llamadas'
import { Notas } from '@/componentes/ficha/Notas'
import { Datos } from '@/componentes/ficha/Datos'
import { Historial } from '@/componentes/ficha/Historial'

type Busqueda = Promise<{ pestana?: string; volver?: string }>

/**
 * La ficha del lead.
 *
 * Arriba, lo que hace falta saber; abajo, en pestañas, lo que se completa en
 * momentos distintos y por personas distintas.
 *
 * En el medio, la ACCIÓN DEL CLOSER: cinco botones con lo que puede pasar. Es
 * lo que hace que el resultado se cargue al colgar y no «después» — y lo que se
 * carga después no se carga, que es cómo el tablero termina siempre incompleto.
 * El formulario largo sigue existiendo, en su pestaña, para lo que la acción
 * rápida no cubre: el próximo paso, los cobros, el saldo de una seña.
 */
export default async function FichaDeLead({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Busqueda }) {
  const { id } = await params
  const { pestana, volver } = await searchParams
  const leadId = Number(id)
  if (!Number.isInteger(leadId)) notFound()

  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  if (!(await puedeVerLead(leadId, alcance))) notFound()

  const lead = await verLead(leadId)
  if (!lead) notFound()

  const hoy = hoyEn()
  const verPlata = puede(usuario, 'verDinero')

  const [calidad, respuestas, notas, llamadas, seguimiento, interacciones] = await Promise.all([
    recalcularCalidad(leadId),
    calificacionDelLead(leadId),
    notasDelLead(leadId),
    llamadasDelLead(leadId),
    seguimientoDelLead(leadId, hoy),
    interaccionesDelLead(leadId),
  ])

  // Una seña convertida ya es una venta: se mira la venta, no se cuenta dos veces.
  const senaAbierta = lead.sena && lead.sena.estado !== 'convertida' ? lead.sena : null
  const noCuadra = plataQueNoCuadra(lead.resultado, {
    venta: lead.venta?.importe ?? 0,
    sena: senaAbierta?.importe ?? 0,
  })

  const PESTANAS: { clave: string; texto: string; icono: NombreDeIcono; cuenta?: number }[] = [
    { clave: 'resumen', texto: 'Resumen', icono: 'dashboard' },
    { clave: 'calificacion', texto: 'Calificación', icono: 'setters' },
    { clave: 'llamadas', texto: 'Llamadas', icono: 'llamadas', cuenta: llamadas.length },
    { clave: 'seguimiento', texto: 'Seguimiento', icono: 'seguimientos', cuenta: interacciones.length },
    { clave: 'notas', texto: 'Notas', icono: 'casos', cuenta: notas.length },
    { clave: 'resultado', texto: 'Resultado', icono: 'comisiones' },
    { clave: 'datos', texto: 'Datos', icono: 'configuracion' },
    { clave: 'historial', texto: 'Historial', icono: 'metricas' },
  ]

  const cual = PESTANAS.find((p) => p.clave === pestana)?.clave ?? 'resumen'
  const Volver = Iconos.volver
  const aDonde = volver === 'llamadas' ? { href: '/llamadas', texto: 'Volver a Llamadas' }
    : volver === 'tracker' ? { href: '/tracker', texto: 'Volver al Tracker' }
    : volver === 'seguimientos' ? { href: '/seguimientos', texto: 'Volver a Seguimientos' }
    : { href: '/leads', texto: 'Volver a Leads' }

  return (
    <div className="apilado">
      <Link href={aDonde.href} className="volver">
        <Volver />{aDonde.texto}
      </Link>

      <CabeceraDeLead lead={lead} calidad={calidad} />

      {noCuadra && verPlata ? (
        <PlataQueNoCuadra
          leadId={leadId} que={noCuadra} resultado={lead.resultado}
          importe={noCuadra === 'venta' ? lead.venta!.importe : senaAbierta!.importe}
          moneda={noCuadra === 'venta' ? lead.venta!.moneda : senaAbierta!.moneda}
          fecha={noCuadra === 'venta' ? lead.venta!.fecha : senaAbierta!.fecha}
          puedeConPlata={puede(usuario, 'editarDinero')} />
      ) : null}

      {puede(usuario, 'cargarResultado') ? (
        <AccionDelCloser leadId={leadId} moneda={lead.moneda} hoy={hoy}
                         resultadoActual={lead.resultado} />
      ) : null}

      <nav className="pestanas">
        {PESTANAS.map((p) => {
          const Icono = Iconos[p.icono]
          const parametros = new URLSearchParams({ pestana: p.clave })
          if (volver) parametros.set('volver', volver)
          return (
            <Link key={p.clave} href={`/leads/${leadId}?${parametros}`}
                  className={cual === p.clave ? 'activo' : ''}>
              <Icono />
              {p.texto}
              {p.cuenta !== undefined ? <span className="cuenta-pestana"> ({p.cuenta})</span> : null}
            </Link>
          )
        })}
      </nav>

      {cual === 'resumen' ? (
        <Resumen lead={lead} calidad={calidad} respuestas={respuestas} notas={notas}
                 seguimiento={seguimiento} verPlata={verPlata} />
      ) : null}
      {cual === 'calificacion' ? <Calificacion leadId={leadId} respuestas={respuestas} /> : null}
      {cual === 'llamadas' ? <Llamadas leadId={leadId} llamadas={llamadas} hoy={hoy} /> : null}
      {cual === 'seguimiento' ? (
        <Seguimiento leadId={leadId} estado={seguimiento} interacciones={interacciones}
                     cadencia={await toques()} />
      ) : null}
      {cual === 'notas' ? <Notas leadId={leadId} notas={notas} usuarioId={usuario.id} /> : null}
      {cual === 'resultado' ? (
        <Resultado lead={lead} closers={(await catalogos()).closers} hoy={hoy} verPlata={verPlata}
                   puedeReasignar={puede(usuario, 'reasignarCloser')} />
      ) : null}
      {cual === 'datos' ? (
        <Datos lead={lead} catalogos={await catalogos()} cuelga={await loQueCuelgaDelLead(leadId)}
               puedeBorrar={puede(usuario, 'borrarLead')}
               puedeConPlata={puede(usuario, 'editarDinero')}
               puedeReasignar={puede(usuario, 'reasignarCloser')} />
      ) : null}
      {cual === 'historial' ? <Historial lineas={await historialDelLead(leadId)} /> : null}
    </div>
  )
}
