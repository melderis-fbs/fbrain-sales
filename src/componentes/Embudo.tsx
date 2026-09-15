import type { Etapa } from '@/motor/embudo'
import { Vacio } from './Piezas'

/**
 * El embudo, con la cantidad de cada etapa y el % de paso entre etapas.
 *
 * El porcentaje va ENTRE dos etapas, no debajo de una: lo que se lee es dónde
 * se pierde, y eso vive en el paso, no en el total.
 */
export function Embudo({ etapas }: { etapas: Etapa[] }) {
  const maximo = Math.max(...etapas.map((e) => e.cantidad), 1)
  if (etapas.every((e) => e.cantidad === 0)) {
    return <Vacio>Todavía no hay oportunidades en este período.</Vacio>
  }

  return (
    <div>
      {etapas.map((etapa, i) => (
        <div key={etapa.clave}>
          {i > 0 ? (
            <div style={{ padding: '3px 0 3px 12px', fontSize: 12, color: 'var(--gris)', fontWeight: 650 }}>
              ↓ {etapa.paso === null ? 'sin datos' : `${etapa.paso}%`}
            </div>
          ) : null}
          <div className="fila" style={{ gap: 12, alignItems: 'center' }}>
            <div style={{ width: 92, fontSize: 13, fontWeight: 650 }}>{etapa.etiqueta}</div>
            <div style={{ flex: 1, minWidth: 80 }}>
              <div className="barra">
                <i style={{
                  width: `${(etapa.cantidad / maximo) * 100}%`,
                  background: etapa.clave === 'senas' ? 'var(--sena)' : etapa.clave === 'ventas' ? 'var(--verde)' : 'var(--negro)',
                }} />
              </div>
            </div>
            <div style={{ width: 52, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {etapa.cantidad}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
