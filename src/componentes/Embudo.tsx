import type { Etapa } from '@/motor/embudo'
import { Barra } from './Piezas'

/**
 * El embudo.
 *
 * Cada etapa dice contra qué se mide, y no siempre es la de arriba: la seña no
 * es un paso obligatorio —la mayoría de las ventas no pasa por ahí— así que
 * ella y la venta se miden sobre las ASISTENCIAS. Medir la venta contra la
 * seña daba «Ventas · 600% de señas», que no es una exageración: es imposible,
 * y un número imposible en la pantalla principal se lleva puesta la confianza
 * en el resto.
 */
export function Embudo({ etapas }: { etapas: Etapa[] }) {
  const techo = Math.max(1, etapas[0]?.cantidad ?? 1)

  return (
    <div className="apilado" style={{ gap: 10 }}>
      {etapas.map((e) => {
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
                    {e.paso}% {e.sobre}
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
