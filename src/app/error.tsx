'use client'

/**
 * Cualquier excepción del servidor sale como una pantalla que se lee, con la
 * referencia para buscarla en los logs, en vez del «Application error» de
 * Vercel con un digest y nada más.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ maxWidth: 560, margin: '80px auto', padding: 24 }}>
      <h1>Algo se rompió en esta pantalla</h1>
      <p style={{ color: 'var(--gris)' }}>
        No es tu culpa y no se perdió nada de lo que estaba guardado.
      </p>
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <div className="etiqueta">Qué pasó</div>
        <p style={{ margin: '4px 0 0', fontSize: 14 }}>{error.message}</p>
        {error.digest ? (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--gris)' }}>
            Referencia para buscar en los logs: <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
      <div className="fila" style={{ marginTop: 16 }}>
        <button onClick={reset}>Volver a intentar</button>
        <a className="boton secundario" href="/">Ir al inicio</a>
      </div>
    </div>
  )
}
