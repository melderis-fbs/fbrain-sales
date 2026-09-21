import type { Nota } from '@/datos/notas'
import { Tarjeta, Vacio, cuando } from '../Piezas'
import { agregarNotaAccion, borrarNotaAccion } from '@/app/(app)/leads/acciones'

/**
 * Las notas del lead.
 *
 * Texto libre: lo que pasa en una conversación no entra en una lista de
 * opciones. Lo que no es libre es quién la escribió y cuándo — sin eso, tres
 * meses después nadie sabe si «dijo que llamaba él» es de enero o de ayer.
 */
export function Notas({ leadId, notas, usuarioId }: { leadId: number; notas: Nota[]; usuarioId: number }) {
  return (
    <div style={{ maxWidth: 780 }}>
      <Tarjeta titulo="Escribir una nota">
        <form action={agregarNotaAccion}>
          <input type="hidden" name="leadId" value={leadId} />
          <div className="campo">
            <textarea name="texto" required placeholder="Qué pasó, qué dijo, qué hay que tener en cuenta…" />
          </div>
          <button type="submit">Guardar la nota</button>
        </form>
      </Tarjeta>

      <div style={{ height: 12 }} />

      <Tarjeta titulo={`${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}`}>
        {notas.length === 0 ? (
          <Vacio>Todavía no hay notas en este lead.</Vacio>
        ) : (
          <div className="apilado" style={{ gap: 10 }}>
            {notas.map((n, i) => (
              <div key={n.id}>
                {i > 0 ? <div className="separador" /> : null}
                <div className="entre">
                  <span style={{ fontSize: 12, color: 'var(--gris)' }}>
                    <strong style={{ color: 'var(--negro)' }}>{n.autor ?? 'Alguien'}</strong>
                    {' · '}{cuando(n.cuando)}
                  </span>
                  <form action={borrarNotaAccion}>
                    <input type="hidden" name="leadId" value={leadId} />
                    <input type="hidden" name="notaId" value={n.id} />
                    <button type="submit" className="sutil" style={{ fontSize: 11.5 }}>Borrar</button>
                  </form>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{n.texto}</p>
              </div>
            ))}
          </div>
        )}
        <p className="ayuda" style={{ marginTop: 12 }}>
          Cada uno borra sólo las suyas: el id del autor va en la consulta, así que
          una nota ajena no se borra ni intentándolo. {usuarioId > 0 ? '' : ''}
        </p>
      </Tarjeta>
    </div>
  )
}
