import type { Lead } from '@/datos/leads'
import type { Calidad } from '@/motor/calidad'
import { CAMPOS_QUE_PUNTUAN, CAMPOS_LIBRES, COLOR_DE_CALIDAD, NOMBRE_DE_NIVEL } from '@/dominio/calidad'
import { Tarjeta, Pildora, Barra } from './Piezas'

/**
 * Lo que el closer lee cinco minutos antes de entrar.
 *
 * Es de sólo lectura a propósito: lo cargó el setter y no es del closer
 * corregirlo en el medio de la llamada. Lo que sí es suyo —qué pasó— está
 * abajo, en el mismo scroll.
 *
 * Cuando falta, lo dice con todas las letras en vez de mostrar una tarjeta
 * vacía: un closer que entra a ciegas tiene que saber que entra a ciegas.
 */
export function Preparacion({
  lead, calidad, respuestas,
}: {
  lead: Lead
  calidad: Calidad
  respuestas: Record<string, string | null>
}) {
  const contestadas = CAMPOS_QUE_PUNTUAN
    .map((c) => ({
      etiqueta: c.etiqueta,
      valor: c.opciones.find((o) => o.valor === respuestas[c.clave])?.etiqueta ?? null,
    }))
    .filter((x) => x.valor !== null)

  const libres = CAMPOS_LIBRES
    .map((c) => ({ etiqueta: c.etiqueta, valor: respuestas[c.clave], largo: c.largo }))
    .filter((x) => x.valor !== null && x.valor !== '')

  const vacio = contestadas.length === 0 && libres.length === 0

  return (
    <Tarjeta titulo="Antes de la llamada"
             ayuda="Lo que averiguó el setter. Se corrige en la ficha del lead, no acá.">
      {vacio ? (
        <div className="aviso atencion" style={{ marginBottom: 0 }}>
          <strong>Este lead no tiene calificación cargada.</strong> Vas a entrar sin saber si puede
          invertir, si decide solo ni qué problema tiene. No es un detalle de prolijidad: es la
          diferencia entre una llamada de descubrimiento y una de adivinanza.
        </div>
      ) : (
        <>
          {calidad.score !== null && calidad.nivel !== null ? (
            <>
              <div className="entre" style={{ marginBottom: 6 }}>
                <span className="etiqueta">Lead Quality</span>
                <Pildora color={COLOR_DE_CALIDAD[calidad.nivel]}>
                  {NOMBRE_DE_NIVEL[calidad.nivel]} · {calidad.score}
                </Pildora>
              </div>
              <Barra porcentaje={calidad.score} color={COLOR_DE_CALIDAD[calidad.nivel]} />
              <div className="separador" />
            </>
          ) : null}

          {libres.map((x) => (
            <div key={x.etiqueta} style={{ marginBottom: 10 }}>
              <div className="etiqueta">{x.etiqueta}</div>
              <p style={{ margin: '2px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{x.valor}</p>
            </div>
          ))}

          {contestadas.length > 0 ? (
            <table>
              <tbody>
                {contestadas.map((x) => (
                  <tr key={x.etiqueta}>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{x.etiqueta}</td>
                    <td className="num" style={{ fontSize: 12.5, fontWeight: 600 }}>{x.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {calidad.faltan.length > 0 ? (
            <p className="ayuda" style={{ marginTop: 10 }}>
              Sin preguntar: {calidad.faltan.join(' · ')}.
            </p>
          ) : null}
        </>
      )}

      {lead.infoNegocio || lead.links ? (
        <>
          <div className="separador" />
          {lead.infoNegocio ? (
            <div style={{ marginBottom: 8 }}>
              <div className="etiqueta">Información del negocio</div>
              <p style={{ margin: '2px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{lead.infoNegocio}</p>
            </div>
          ) : null}
          {lead.links ? (
            <div>
              <div className="etiqueta">Links</div>
              <p style={{ margin: '2px 0 0', fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--gris)' }}>
                {lead.links}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </Tarjeta>
  )
}
