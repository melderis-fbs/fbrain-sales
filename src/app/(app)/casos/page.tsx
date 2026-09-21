import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { listarCasos, verCaso, industriasQueFaltan } from '@/datos/casos'
import { Tarjeta, Encabezado, Pildora, Vacio, fechaCorta, Numero } from '@/componentes/Piezas'
import { FormularioDeCaso } from '@/componentes/FormularioDeCaso'
import { activarCasoAccion } from './acciones'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * Los casos de éxito.
 *
 * No es una galería de marketing: es munición para el seguimiento. El toque 3
 * de la cadencia dice «caso de éxito similar», y sin esta pantalla el closer
 * tiene que acordarse de uno y redactarlo de cero cada vez — que es por qué ese
 * toque no se hace.
 */
export default async function Casos({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  await exigirUsuario()

  const editando = q.editar ? await verCaso(Number(q.editar)) : null
  const [casos, faltan] = await Promise.all([listarCasos(), industriasQueFaltan()])
  const activos = casos.filter((c) => c.activo)

  return (
    <div className="apilado">
      <Encabezado kicker="Casos de Éxito" titulo={`${activos.length} listos para usar`}
                  bajada="Lo que el closer manda en el toque 3 de la cadencia, sin tener que escribirlo de nuevo." />

      <div className="rejilla g3">
        <Numero etiqueta="Casos activos" valor={activos.length} />
        <Numero etiqueta="Con métrica" valor={activos.filter((c) => c.metrica).length}
                contra="el número del antes y el después" />
        <Numero etiqueta="Con mensaje listo" valor={activos.filter((c) => c.mensaje).length}
                contra="se copian y se mandan" />
      </div>

      {faltan.length > 0 ? (
        <div className="aviso atencion">
          Hay leads en seguimiento de industrias sin ningún caso escrito:{' '}
          <strong>{faltan.map((f) => `${f.industria} (${f.leads})`).join(' · ')}</strong>.
          Son los casos que más falta hacen, ordenados por cuánta gente los está esperando.
        </div>
      ) : null}

      <div className="rejilla g2">
        <div className="apilado">
          {casos.length === 0 ? (
            <Tarjeta><Vacio>Todavía no hay ningún caso cargado.</Vacio></Tarjeta>
          ) : (
            casos.map((c) => (
              <Tarjeta key={c.id}
                       titulo={c.titulo}
                       accion={
                         <div className="fila" style={{ gap: 6 }}>
                           <Link href={`/casos?editar=${c.id}`}
                                 style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>Editar</Link>
                           <form action={activarCasoAccion}>
                             <input type="hidden" name="id" value={c.id} />
                             <input type="hidden" name="activo" value={c.activo ? '0' : '1'} />
                             <button type="submit" className="sutil" style={{ fontSize: 12 }}>
                               {c.activo ? 'Archivar' : 'Reactivar'}
                             </button>
                           </form>
                         </div>
                       }>
                <div className="fila" style={{ marginBottom: 8 }}>
                  {c.industria ? <Pildora color="acento">{c.industria}</Pildora> : null}
                  {c.cliente ? <span style={{ fontSize: 12.5, color: 'var(--gris)' }}>{c.cliente}</span> : null}
                  {!c.activo ? <Pildora color="gris">archivado</Pildora> : null}
                </div>

                {c.metrica ? (
                  <div className="numero chico" style={{ marginBottom: 8 }}>{c.metrica}</div>
                ) : (
                  <p className="ayuda" style={{ marginBottom: 8 }}>
                    Sin métrica cargada. «Le fue muy bien» no convence a nadie.
                  </p>
                )}

                {c.situacion ? (
                  <>
                    <div className="etiqueta">Cómo estaba antes</div>
                    <p style={{ margin: '2px 0 8px', fontSize: 13.5 }}>{c.situacion}</p>
                  </>
                ) : null}
                {c.resultado ? (
                  <>
                    <div className="etiqueta">Qué cambió</div>
                    <p style={{ margin: '2px 0 8px', fontSize: 13.5 }}>{c.resultado}</p>
                  </>
                ) : null}
                {c.cita ? <p className="cita">«{c.cita}»</p> : null}

                {c.mensaje ? (
                  <>
                    <div className="separador" />
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--acento)' }}>
                        El mensaje listo para mandar
                      </summary>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 8,
                                    fontFamily: 'inherit', background: 'var(--gris-fondo)',
                                    padding: 10, borderRadius: 8 }}>{c.mensaje}</pre>
                    </details>
                  </>
                ) : null}

                {c.link ? (
                  <p className="ayuda" style={{ marginTop: 8 }}>
                    <a href={c.link} target="_blank" rel="noreferrer"
                       style={{ color: 'var(--acento)', fontWeight: 600 }}>Ver el material →</a>
                  </p>
                ) : null}
                <p className="ayuda" style={{ marginTop: 8 }}>Cargado el {fechaCorta(c.creadoEn)}.</p>
              </Tarjeta>
            ))
          )}
        </div>

        <div>
          <Tarjeta titulo={editando ? `Editar «${editando.titulo}»` : 'Agregar un caso'}
                   accion={editando
                     ? <Link href="/casos" style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--acento)' }}>
                         Cancelar
                       </Link>
                     : undefined}>
            <FormularioDeCaso key={editando?.id ?? 'nuevo'} caso={editando ?? undefined} />
          </Tarjeta>
        </div>
      </div>
    </div>
  )
}
