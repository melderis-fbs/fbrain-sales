import type { Ritmo } from '@/motor/objetivo'
import { Barra, plata } from './Piezas'

/**
 * El objetivo contra el ritmo esperado.
 *
 * Lo que importa no es el porcentaje alcanzado: es el porcentaje alcanzado
 * CONTRA dónde debería estar a esta altura del mes. 67% el día 12 de 22 está
 * muy bien; 67% el día 21 está muy mal, y las dos veces dice 67%.
 */
export function Objetivo({
  ritmo, moneda, titulo = 'Objetivo del mes', enPlata = true,
}: { ritmo: Ritmo | null; moneda: string; titulo?: string; enPlata?: boolean }) {
  if (!ritmo) {
    return (
      <div className="tarjeta">
        <div className="etiqueta">{titulo}</div>
        <p className="ayuda" style={{ marginTop: 6 }}>
          No hay objetivo cargado para este período. Se carga en{' '}
          <a href="/configuracion" style={{ color: 'var(--acento)', fontWeight: 600 }}>Configuración</a>.
        </p>
      </div>
    )
  }

  const color = ritmo.estado === 'sobre' ? 'verde' : ritmo.estado === 'debajo' ? 'rojo' : 'acento'
  const mostrar = (n: number) => (enPlata ? plata(n, moneda) : n.toLocaleString('es-AR'))

  return (
    <div className="tarjeta">
      <div className="entre" style={{ marginBottom: 8 }}>
        <div>
          <div className="etiqueta">{titulo}</div>
          <div className="numero chico" style={{ marginTop: 2 }}>
            {mostrar(ritmo.logrado)}
            <span style={{ color: 'var(--gris)', fontWeight: 600, fontSize: 14 }}>
              {' '}de {mostrar(ritmo.objetivo)}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`pildora ${color}`}>
            {ritmo.desvio > 0 ? '+' : ''}{ritmo.desvio} pts {ritmo.estado === 'en_ritmo' ? 'en ritmo' :
              ritmo.estado === 'sobre' ? 'sobre el ritmo' : 'debajo del ritmo'}
          </span>
          <div className="contra">
            día {ritmo.diasTranscurridos} de {ritmo.diasTotales} hábiles
          </div>
        </div>
      </div>

      <Barra porcentaje={ritmo.alcanzado} color={color} />
      <div className="contra" style={{ marginTop: 5 }}>
        {ritmo.alcanzado}% alcanzado · a esta altura del mes debería ir por {ritmo.ritmoEsperado}%
      </div>
    </div>
  )
}
