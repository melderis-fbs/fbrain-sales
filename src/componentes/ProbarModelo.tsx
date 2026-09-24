'use client'

import { useState, useTransition } from 'react'
import { probarConexionAccion } from '@/app/(app)/analizador/acciones'
import type { Diagnostico } from '@/ia/prueba'

/**
 * «Lo cambié en Vercel y sigue sin andar.»
 *
 * Entre editar una variable y que el analizador la use hay tres cosas que
 * pueden fallar —la clave, el workspace, el deploy— y las tres dan el mismo
 * error. Este botón hace un pedido mínimo al modelo y muestra qué contestó la
 * API y QUÉ ESTÁ USANDO la aplicación ahora mismo.
 *
 * Lo segundo es la mitad del valor: si la huella de la clave no termina como
 * la que acabás de pegar, el problema no es la clave —es que el build no la
 * tomó— y cambiarla de nuevo no iba a arreglar nada.
 */
export function ProbarModelo() {
  const [r, setR] = useState<Diagnostico | null>(null)
  const [corriendo, empezar] = useTransition()

  return (
    <div>
      <button type="button" className="secundario" disabled={corriendo}
              onClick={() => empezar(async () => setR(await probarConexionAccion()))}>
        {corriendo ? 'Probando…' : 'Probar la conexión'}
      </button>

      {r ? (
        <div className={r.ok ? 'aviso dato' : 'aviso problema'} style={{ marginTop: 10 }}>
          <strong>{r.titulo}</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>{r.detalle}</p>
          {/* Lo que dijo la API, TEXTUAL. Lo de arriba es nuestra lectura del
              error, y una lectura puede estar equivocada: si clasificamos mal,
              el de arriba explica muy bien un problema que no es el que hay.
              Esto es feo y está en inglés, y es lo único que no depende de que
              hayamos acertado. */}
          {r.motivo ? (
            <div className="slack" style={{ marginTop: 10 }}>
              <span className="etiqueta">Lo que contestó Anthropic, textual</span>
              <pre style={{ marginTop: 4 }}>{r.motivo}</pre>
            </div>
          ) : null}
          <p style={{ margin: '8px 0 0', fontSize: 12.5 }}>
            Deploy <code>{r.config.deploy}</code> · build <code>{r.config.build}</code> ·
            clave <code>{r.config.clave}</code> · workspace <code>{r.config.workspace}</code> ·
            modelo <code>{r.config.modelo}</code>.
          </p>
          {/* El build va aparte del commit a propósito. Antes acá figuraba
              sólo el commit, dos pantallas mostraban el mismo y contestaban
              distinto, y ese renglón hacía parecer imposible lo que estaba
              pasando: un mismo commit se publica muchas veces, y cada
              «Redeploy» después de tocar una variable trae otras variables
              adentro. El que hay que comparar es el build. */}
          <p style={{ margin: '6px 0 0', fontSize: 12.5 }}>
            Esto <strong>no depende del rol</strong>: la clave es del servidor y en un mismo
            build contesta lo mismo para todos, sea admin o closer. Si a otra persona le dice
            algo distinto, están en <strong>builds distintos</strong> — y el commit no sirve
            para verlo, porque el mismo commit se publica muchas veces y las variables se
            congelan en cada publicación. Compará el renglón <code>build</code>, no el commit.
            El que quedó en el viejo lo deja recargando a fondo (Ctrl+Shift+R) o cerrando y
            abriendo la pestaña. Y si la clave no termina como la que cargaste, este build
            todavía no la tomó: volvé a desplegar.
          </p>
        </div>
      ) : (
        <p className="ayuda" style={{ marginTop: 8 }}>
          Hace un pedido de un token al modelo —cuesta una fracción de centavo— y dice qué
          contestó la API y qué clave está usando este deploy.
        </p>
      )}
    </div>
  )
}
