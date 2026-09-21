import type { LineaDeHistorial } from '@/datos/cambios'
import { Tarjeta, Vacio, cuando } from '../Piezas'

/**
 * Todo lo que se tocó, con quién y por qué.
 *
 * Nunca se pierde información: si un lead era de Kevin y ahora es de Braian,
 * queda escrito. Sólo se anota lo que efectivamente cambió — guardar «cambió
 * nombre de María a María» llena la historia de ruido y hace que la que importa
 * no se encuentre.
 */
export function Historial({ lineas }: { lineas: LineaDeHistorial[] }) {
  return (
    <div style={{ maxWidth: 900 }}>
      <Tarjeta titulo={`${lineas.length} ${lineas.length === 1 ? 'cambio' : 'cambios'}`}>
        {lineas.length === 0 ? (
          <Vacio>No hay cambios registrados todavía.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Antes</th><th>Después</th><th>Motivo</th></tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{cuando(l.cuando)}</td>
                    <td style={{ fontSize: 12.5 }}>{l.usuario ?? <span className="sindato">—</span>}</td>
                    <td style={{ fontSize: 12.5, fontWeight: 600 }}>{l.campo}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{l.anterior ?? <span className="sindato">vacío</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{l.nuevo ?? <span className="sindato">vacío</span>}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--gris)' }}>{l.motivo ?? '—'}</td>
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
