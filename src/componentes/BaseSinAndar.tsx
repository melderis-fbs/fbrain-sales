import type { Problema } from '@/lib/revision'

/**
 * Cuando la base no está lista, decir qué falta y cómo se arregla.
 *
 * Nunca se muestra la cadena de conexión ni la contraseña: el que está viendo
 * esta pantalla puede no ser el que tiene que verlas.
 */
export function BaseSinAndar({ problema }: { problema: Problema }) {
  return (
    <main style={{ maxWidth: 560, margin: '80px auto', padding: 24 }}>
      <div className="kicker">Founders Sales OS</div>
      <h1>{problema.titulo}</h1>
      <p style={{ color: 'var(--gris)' }}>{problema.detalle}</p>

      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h3>Cómo se arregla</h3>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
          {problema.pasos.map((paso) => (
            <li key={paso}><code>{paso}</code></li>
          ))}
        </ol>
      </div>
    </main>
  )
}
