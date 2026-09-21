import type { Etapa } from '@/motor/embudo'
import { Barra } from './Piezas'

/**
 * El embudo.
 *
 * Los porcentajes son de PASO, no sobre el total: 83 asistidas sobre 100
 * agendadas es 83%, y 76 ofertas sobre 83 asistidas es 91%. Siempre contra la
 * etapa anterior, porque eso es lo que dice dónde se pierde — que es la única
 * pregunta que un embudo contesta bien.
 */
export function Embudo({ etapas }: { etapas: Etapa[] }) {
  const techo = Math.max(1, etapas[0]?.cantidad ?? 1)

  return (
    <div className="apilado" style={{ gap: 10 }}>
      {etapas.map((e, i) => {
        const anterior = i === 0 ? null : etapas[i - 1]
        // La caída, no el paso: es lo que hay que mirar.
        const caida = e.paso === null ? null : 100 - e.paso
        return (
          <div key={e.clave}>
            <div className="entre" style={{ marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{e.etiqueta}</span>
              <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <strong>{e.cantidad.toLocaleString('es-AR')}</strong>
                {e.paso !== null ? (
                  <span style={{ color: 'var(--gris)', marginLeft: 6, fontSize: 12 }}>
                    {e.paso}% de {anterior?.etiqueta.toLowerCase()}
                  </span>
                ) : null}
              </span>
            </div>
            <Barra porcentaje={(e.cantidad / techo) * 100}
                   color={caida !== null && caida > 60 ? 'rojo' : caida !== null && caida > 35 ? 'ambar' : 'acento'} />
          </div>
        )
      })}
    </div>
  )
}
