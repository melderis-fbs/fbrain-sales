import 'server-only'

/**
 * El aviso de que falta la clave del modelo.
 *
 * Está acá y no en un README porque el que abre esta pantalla y toca «Analizar»
 * es el que necesita saberlo, y en ese momento. Un error genérico de «algo
 * falló» manda a alguien a leer logs para enterarse de que falta una variable
 * de entorno.
 *
 * No muestra la clave ni parte de ella: sólo si está o no.
 */
export function SinClave() {
  if (process.env.ANTHROPIC_API_KEY) return null

  return (
    <div className="aviso atencion">
      <strong>Falta la clave de Claude, así que el analizador no puede leer la llamada.</strong>
      <p style={{ margin: '6px 0 0', fontSize: 13 }}>
        Todo lo demás de la aplicación funciona igual. Para prenderlo:
      </p>
      <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
        <li>
          Sacá una clave en <strong>console.anthropic.com</strong> → <em>API keys</em> →
          {' '}<em>Create key</em>. Empieza con <code>sk-ant-</code>.
        </li>
        <li>
          En Vercel, el proyecto → <strong>Settings</strong> → <strong>Environment Variables</strong>.
          Nombre <code>ANTHROPIC_API_KEY</code>, valor la clave, y marcá los tres entornos.
        </li>
        <li>
          <strong>Redeployá.</strong> Las variables se leen al construir: el deploy que ya estaba
          hecho no se entera.
        </li>
      </ol>
      <p style={{ margin: '6px 0 0', fontSize: 13 }}>
        Cada análisis queda anotado con sus tokens y su costo en <code>llamadas_modelo</code>,
        así se ve el mes que empieza a subir.
      </p>
    </div>
  )
}
