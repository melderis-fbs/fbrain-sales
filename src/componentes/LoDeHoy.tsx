import Link from 'next/link'
import type { LeadEnLista } from '@/datos/leads'
import { CargaRapida } from './CargaRapida'
import { Pildora, plata, hora } from './Piezas'
import {
  NOMBRE_DE_ESTADO, NOMBRE_DE_RESULTADO, COLOR_DE_ESTADO, COLOR_DE_RESULTADO,
} from '@/dominio/resultados'

/**
 * Lo que está pasando en comercial ahora.
 *
 * La agenda del día en orden de hora, y en cada renglón lo único que importa
 * de esa reunión: si ya pasó y qué dio, o si todavía no pasó. Es la pantalla
 * que se deja abierta.
 *
 * Las que ya pasaron y nadie cargó están arriba y con el desplegable puesto:
 * cargar tiene que costar un clic desde acá, porque lo que se deja «para
 * después» no se carga, y un tablero incompleto se mira igual que uno
 * completo —esa es la parte cara—.
 */
export function LoDeHoy({
  leads, hoy, ahora, cerradoHoy, moneda, verPlata,
}: {
  leads: LeadEnLista[]
  hoy: string
  /** «HH:MM», para saber cuáles ya pasaron. */
  ahora: string
  cerradoHoy: number
  moneda: string
  verPlata: boolean
}) {
  const yaPaso = (l: LeadEnLista) => (l.horaSesion ?? '00:00') <= ahora
  const sinCargar = leads.filter((l) => l.estado === 'agendado' && l.resultado === 'pendiente' && yaPaso(l))
  const cargadas = leads.filter((l) => !(l.estado === 'agendado' && l.resultado === 'pendiente'))
  const porVenir = leads.filter((l) => l.estado === 'agendado' && l.resultado === 'pendiente' && !yaPaso(l))

  return (
    <div className="hoy">
      <div className="hoy-numeros">
        <div className="hoy-num">
          <div className="hoy-etiqueta">Reuniones hoy</div>
          <div className="hoy-valor">{leads.length}</div>
        </div>
        <div className="hoy-num">
          <div className="hoy-etiqueta">Ya pasaron</div>
          <div className="hoy-valor">{cargadas.length + sinCargar.length}</div>
        </div>
        <div className={sinCargar.length > 0 ? 'hoy-num pide' : 'hoy-num'}>
          <div className="hoy-etiqueta">Falta cargar</div>
          <div className="hoy-valor">{sinCargar.length}</div>
        </div>
        {verPlata ? (
          <div className="hoy-num">
            <div className="hoy-etiqueta">Cerrado hoy</div>
            <div className="hoy-valor chico">{plata(cerradoHoy, moneda)}</div>
          </div>
        ) : null}
      </div>

      {leads.length === 0 ? (
        <p className="ayuda" style={{ marginTop: 12 }}>
          Hoy no hay reuniones agendadas.{' '}
          <Link href="/leads/nuevo" style={{ fontWeight: 650, color: 'var(--acento)' }}>Registrar un lead →</Link>
        </p>
      ) : (
        <div className="agenda">
          {[...sinCargar, ...porVenir, ...cargadas].map((l) => {
            const falta = sinCargar.includes(l)
            const viene = porVenir.includes(l)
            return (
              <div key={l.id} className={falta ? 'cita pide' : viene ? 'cita viene' : 'cita'}>
                <div className="cita-hora">{l.horaSesion ? hora(l.horaSesion) : '—'}</div>
                <div className="cita-quien">
                  <Link href={`/leads/${l.id}?volver=tracker`} style={{ fontWeight: 650 }}>{l.nombre}</Link>
                  <div className="cita-detalle">
                    {[l.empresa, l.closer].filter(Boolean).join(' · ') || 'sin closer asignado'}
                  </div>
                </div>
                <div className="cita-estado">
                  {falta ? (
                    <CargaRapida leadId={l.id} estado={l.estado} resultado={l.resultado}
                                 moneda={l.moneda} hoy={hoy} compacto />
                  ) : viene ? (
                    <span className="sindato">por venir</span>
                  ) : (
                    <>
                      <Pildora color={COLOR_DE_ESTADO[l.estado]}>{NOMBRE_DE_ESTADO[l.estado]}</Pildora>
                      {l.resultado !== 'pendiente' ? (
                        <Pildora color={COLOR_DE_RESULTADO[l.resultado]}>{NOMBRE_DE_RESULTADO[l.resultado]}</Pildora>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
