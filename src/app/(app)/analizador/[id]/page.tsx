import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe } from '@/lib/permisos'
import { verLlamada, transcripcionDe } from '@/datos/llamadas'
import { puedeVerLead } from '@/datos/leads'
import { verAnalisis } from '@/datos/analisis'
import { fila } from '@/lib/db'
import { Tarjeta, Encabezado, Pildora, Vacio, fechaCorta } from '@/componentes/Piezas'
import { SubirTranscripcion, Analizar } from '@/componentes/SubirTranscripcion'
import { SinClave } from '@/componentes/SinClave'
import { Informe } from '@/componentes/Informe'
import { Imprimir } from '@/componentes/Imprimir'
import { comoSeLee } from '@/dominio/rubrica'
import { NOMBRE_DE_TIPO } from '@/dominio/resultados'

/**
 * Cuánto puede tardar el análisis antes de que la plataforma lo corte.
 *
 * Son DOS llamadas al modelo sobre una transcripción entera —una para leer y
 * otra para evaluar— y con una llamada de una hora eso son minutos. Sin esto,
 * Vercel mata la función a los quince segundos: el navegador se queda sin
 * respuesta y la pantalla queda en negro, sin error, sin aviso y sin análisis.
 *
 * Va acá y no en la acción porque el límite es del segmento de ruta desde el
 * que se invoca. Si el plan permite menos, Vercel lo recorta al máximo suyo.
 */
export const maxDuration = 300

/**
 * Una llamada y su análisis.
 *
 * Todo lo que el análisis afirma viene con la frase de la transcripción que lo
 * sostiene. Es la diferencia entre un informe que se puede discutir con el
 * closer y uno que hay que creerle: cuando el modelo dice que no profundizó el
 * dolor, abajo está la frase donde pasó de largo.
 */
export default async function Llamada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const llamadaId = Number(id)
  if (!Number.isInteger(llamadaId)) notFound()

  const usuario = await exigirUsuario()
  const llamada = await verLlamada(llamadaId)
  if (!llamada) notFound()
  if (!(await puedeVerLead(llamada.leadId, alcanceDe(usuario)))) notFound()

  const [transcripcion, analisis] = await Promise.all([
    transcripcionDe(llamadaId),
    llamada.analisisId ? verAnalisis(llamada.analisisId) : Promise.resolve(null),
  ])

  // Las dimensiones que el modelo no pudo ubicar. No cuentan como cero: salen
  // del promedio, y la pantalla lo dice para que la nota se pueda leer bien.
  const sinEvidencia = analisis?.niveles.filter((n) => n.sinEvidencia).length ?? 0

  const costo = await fila<{ total: number }>(
    `select coalesce(sum(costo_usd), 0) as total from llamadas_modelo where lead_id = $1`,
    [llamada.leadId],
  )

  return (
    <div className="apilado">
      <Encabezado kicker={`Llamada ${llamada.numero} · ${NOMBRE_DE_TIPO[llamada.tipoSesion]}`}
                  titulo={llamada.lead}
                  bajada={`${fechaCorta(llamada.fecha)} · ${llamada.closer ?? 'sin closer'}` +
                          (llamada.duracionSeg ? ` · ${Math.round(llamada.duracionSeg / 60)} min` : '')}>
        <Link className="boton secundario" href={`/leads/${llamada.leadId}`}>Ir al lead</Link>
        <Link className="boton secundario" href={`/leads/${llamada.leadId}`}>Ver la ficha</Link>
      </Encabezado>

      {!transcripcion ? (
        <div style={{ maxWidth: 780 }}>
          <Tarjeta titulo="Cargar la transcripción"
                   ayuda="Así entra hoy: la reunión se graba en Meet, la transcripción se copia y se pega.">
            <SubirTranscripcion llamadaId={llamadaId} />
          </Tarjeta>
        </div>
      ) : (
        <>
          <SinClave />

          <div className="entre">
            <p className="ayuda">
              Transcripción de {transcripcion.caracteres.toLocaleString('es-AR')} caracteres,
              cargada el {fechaCorta(transcripcion.creadoEn)}.
              {costo && costo.total > 0
                ? ` Lo que se gastó en modelo con este lead: USD ${costo.total.toFixed(3)}.`
                : ''}
            </p>
            <div className="fila">
              {analisis && analisis.score !== null ? <Imprimir /> : null}
              <Analizar llamadaId={llamadaId} rehacer={analisis !== null} />
            </div>
          </div>

          {analisis?.estado === 'error' ? (
            <div className="aviso problema">
              El análisis falló: {analisis.error}. Se puede volver a intentar sin cargar la
              transcripción de nuevo.
            </div>
          ) : null}

          {/* Un análisis que quedó «leyendo» o «evaluando» y no volvió es uno
              que se cortó a la mitad: casi siempre porque la plataforma mató
              la función por tiempo. Sin este aviso la pantalla queda igual que
              antes de apretar —sin nota, sin error, sin nada— y del otro lado
              eso se lee como que la aplicación se colgó. */}
          {analisis && (analisis.estado === 'leyendo' || analisis.estado === 'evaluando') ? (
            <div className="aviso atencion">
              <strong>Hay un análisis empezado que no terminó</strong> (quedó en «{analisis.estado}»,
              arrancó el {fechaCorta(analisis.creadoEn)}).
              <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                Si lo acabás de lanzar, esperá: son dos llamadas al modelo sobre la transcripción
                entera y con una llamada larga tarda un par de minutos. Si ya pasó de eso, se cortó
                por tiempo: tocá <strong>Volver a analizar</strong>. No hay que cargar la
                transcripción de nuevo.
              </p>
            </div>
          ) : null}

          {/* Antes de apretar, cuánto va a tardar. Una transcripción de una
              hora son dos llamadas largas al modelo, y una espera que nadie
              anunció se lee como una pantalla colgada. */}
          {transcripcion.caracteres > 30000 ? (
            <p className="ayuda">
              Es una transcripción larga: el análisis puede tardar un par de minutos.
              Dejá la pestaña abierta mientras corre.
            </p>
          ) : null}

          {analisis && analisis.score !== null ? (
            <Informe a={analisis} />
          ) : analisis === null ? (
            <Tarjeta>
              <Vacio>
                La transcripción está cargada y la llamada todavía no se analizó.
              </Vacio>
            </Tarjeta>
          ) : null}

          <Tarjeta titulo="La transcripción">
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--gris)' }}>
                Ver el texto completo
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, marginTop: 10,
                            fontFamily: 'inherit', color: 'var(--tinta)' }}>
                {transcripcion.texto}
              </pre>
            </details>
          </Tarjeta>
        </>
      )}
    </div>
  )
}
