import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { llamadasDe, seguimientosVencidos, seniasAbiertas } from '@/datos/tablero'
import { hoyEn } from '@/motor/periodos'
import { Numero, Tarjeta, Pildora, plata, fechaCorta, Vacio } from '@/componentes/Piezas'
import { NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
         NOMBRE_DE_TIPO, type Estado, type Resultado, type TipoSesion } from '@/dominio/resultados'

/** Qué pasa HOY. La pantalla que abre un closer a la mañana. */
export default async function Hoy({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams
  const usuario = await exigirUsuario()
  const alcance = alcanceDe(usuario)
  const elDia = dia ?? hoyEn()

  const [llamadas, vencidos, senias] = await Promise.all([
    llamadasDe(elDia, alcance),
    seguimientosVencidos(elDia, alcance, 100),
    seniasAbiertas(alcance),
  ])

  const cuenta = (predicado: (l: (typeof llamadas)[number]) => boolean) => llamadas.filter(predicado).length
  const pendientes = cuenta((l) => l.estado === 'agendada' && l.resultado === 'pendiente')
  const seniasHoy = senias.filter((s) => s.comprometida === elDia)

  return (
    <div className="apilado">
      <div className="entre">
        <div>
          <div className="kicker">Tracker diario</div>
          <h1>Hoy · {fechaCorta(elDia)}</h1>
        </div>
        <form method="get" className="fila">
          <input type="date" name="dia" defaultValue={elDia} style={{ width: 160 }} />
          <button type="submit" className="secundario">Ver</button>
        </form>
      </div>

      <div className="rejilla g4">
        <Numero etiqueta="Llamadas" valor={llamadas.length} />
        <Numero etiqueta="Pendientes de cargar" valor={pendientes}
                color={pendientes > 0 ? 'amarillo' : undefined}
                contra={pendientes > 0 ? 'todavía sin resultado' : 'todo cargado'} />
        <Numero etiqueta="Asistencias" valor={cuenta((l) => l.estado === 'asistida')} />
        <Numero etiqueta="No shows" valor={cuenta((l) => l.estado === 'no_show')}
                color={cuenta((l) => l.estado === 'no_show') > 0 ? 'rojo' : undefined} />
        <Numero etiqueta="Ventas" valor={cuenta((l) => l.resultado === 'venta')} color="verde" />
        <Numero etiqueta="Señas" valor={cuenta((l) => l.resultado === 'sena')} color="sena" />
        <Numero etiqueta="Seguimientos vencidos" valor={vencidos.length}
                color={vencidos.length > 0 ? 'rojo' : undefined} />
        <Numero etiqueta="Señas que vencen hoy" valor={seniasHoy.length}
                color={seniasHoy.length > 0 ? 'sena' : undefined} />
      </div>

      <Tarjeta titulo="Las llamadas del día">
        {llamadas.length === 0 ? (
          <Vacio>No hay llamadas agendadas para este día.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Hora</th><th>Lead</th><th>Tipo</th><th>Closer</th>
                  <th>Reunión</th><th>Resultado</th><th className="num">Valor</th><th></th>
                </tr>
              </thead>
              <tbody>
                {llamadas.map((l) => (
                  <tr key={l.oportunidadId}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{l.hora?.slice(0, 5) ?? '—'}</td>
                    <td><Link href={`/leads/${l.leadId}`} style={{ fontWeight: 650 }}>{l.lead}</Link></td>
                    <td style={{ fontSize: 13, color: 'var(--gris)' }}>{NOMBRE_DE_TIPO[l.tipoSesion as TipoSesion]}</td>
                    <td style={{ fontSize: 13 }}>{l.closer ?? <span className="sindato">sin asignar</span>}</td>
                    <td><Pildora color={COLOR_DE_ESTADO[l.estado as Estado]}>{NOMBRE_DE_ESTADO[l.estado as Estado]}</Pildora></td>
                    <td><Pildora color={COLOR_DE_RESULTADO[l.resultado as Resultado]}>{NOMBRE_DE_RESULTADO[l.resultado as Resultado]}</Pildora></td>
                    <td className="num">{l.valorPotencial ? plata(l.valorPotencial, l.moneda) : '—'}</td>
                    <td><Link href={`/leads/${l.leadId}`} style={{ fontSize: 13, fontWeight: 650 }}>Cargar →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo={`Seguimientos vencidos (${vencidos.length})`}>
        {vencidos.length === 0 ? (
          <Vacio>No hay seguimientos vencidos. </Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Lead</th><th>Closer</th><th>Tenía que ser</th><th>Próximo paso</th><th className="num">Vencido</th></tr>
              </thead>
              <tbody>
                {vencidos.map((v) => (
                  <tr key={v.oportunidadId}>
                    <td><Link href={`/leads/${v.leadId}`} style={{ fontWeight: 650 }}>{v.lead}</Link></td>
                    <td style={{ fontSize: 13 }}>{v.closer ?? <span className="sindato">sin closer</span>}</td>
                    <td style={{ fontSize: 13 }}>{fechaCorta(v.proximoContacto)}</td>
                    <td style={{ fontSize: 13, color: 'var(--gris)' }}>{v.proximoPaso ?? '—'}</td>
                    <td className="num">
                      <Pildora color={v.diasVencido > 7 ? 'rojo' : 'amarillo'}>
                        {v.diasVencido} {v.diasVencido === 1 ? 'día' : 'días'}
                      </Pildora>
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
