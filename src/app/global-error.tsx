'use client'

export default function ErrorGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 40, maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24 }}>La aplicación no pudo arrancar</h1>
        <p style={{ color: '#666' }}>{error.message}</p>
        {error.digest ? <p style={{ fontSize: 12, color: '#999' }}>Referencia: {error.digest}</p> : null}
        <button onClick={reset} style={{ padding: '8px 16px', borderRadius: 99, marginTop: 12 }}>
          Volver a intentar
        </button>
      </body>
    </html>
  )
}
