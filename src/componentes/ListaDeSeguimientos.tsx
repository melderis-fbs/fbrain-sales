'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useState } from 'react'
import type { Tarjeta as Ficha } from '@/datos/seguimientos'
import { Aviso, Boton, type Respuesta } from './Respuesta'
import { Pildora, fechaCorta } from './Piezas'
import { ESTADOS_TOQUE, NOMBRE_DE_TOQUE } from '@/dominio/seguimientos'
import { COLOR_DE_CALIDAD } from '@/dominio/calidad'
import { registrarToqueAccion, registrarTandaAccion } from '@/app/(app)/seguimientos/acciones'

/**
 * La lista de trabajo del pipeline.
 *
 * Reemplaza a las tarjetas en columnas, y el motivo es el que se repitió dos
 * veces seguidas: «cuando una columna tiene muchos leads no te deja mover» y
 * «no se ven bien los pasos». Las dos salen de lo mismo. Doce columnas
 * legibles no entran en una pantalla, y una tarjeta ocupa seis renglones para
 * decir lo que un renglón dice igual.
 *
 * En filas entran treinta leads en una pantalla, se ordenan por lo que más
 * atrasado está, y —lo que no existía— se pueden marcar varios y resolverlos
 * de una vez. Treinta atrasados con una tarjeta cada uno son sesenta clics
 * para decir sesenta veces «no contestó»: eso no se hace, lo que se hace es
 * dejar de abrir la pantalla.
 *
 * Los pasos no se perdieron: están todos arriba, en la barra, que es donde se
 * ve de un vistazo dónde se junta la gente.
 */
export function ListaDeSeguimientos({ fichas, hoy }: { fichas: Ficha[]; hoy: string }) {
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  /**
   * El resultado de la tanda vive acá y no en la barra.
   *
   * La barra desaparece cuando se limpia la selección, y la selección se
   * limpia justo cuando la tanda salió bien: el «3 registrados» se veía un
   * instante y se iba con ella. Una confirmación que no llega a leerse es lo
   * mismo que no confirmar.
   */
  const [hecho, enTanda] = useActionState(registrarTandaAccion, null)

  // Lo que se ve es lo que se puede elegir: al cambiar de filtro, una
  // selección invisible que sigue viva es una tanda que toca leads que quien
  // la lanzó no está mirando.
  const visibles = useMemo(() => new Set(fichas.map((f) => f.leadId)), [fichas])
  useEffect(() => {
    setElegidos((previos) => {
      const quedan = new Set([...previos].filter((id) => visibles.has(id)))
      return quedan.size === previos.size ? previos : quedan
    })
  }, [visibles])

  const alternar = (id: number) => setElegidos((p) => {
    const s = new Set(p)
    if (s.has(id)) s.delete(id); else s.add(id)
    return s
  })

  const todosElegidos = fichas.length > 0 && elegidos.size === fichas.length
  const elegirTodos = () => setElegidos(todosElegidos ? new Set() : new Set(fichas.map((f) => f.leadId)))

  return (
    <>
      <Aviso r={hecho} />
      {/* Sin `tabla-scroll` a propósito: si el que recorta fuera este `div`,
          su barra quedaría al pie de una lista de cinco mil píxeles y habría
          que bajar hasta el final para usarla. Dejándolo pasar, el que recorta
          es la página y la barra es la del navegador, abajo de la ventana,
          siempre en el mismo lugar. */}
      <div>
        <table className="seguimientos">
          <thead>
            <tr>
              <th className="tilde">
                <input type="checkbox" checked={todosElegidos} onChange={elegirTodos}
                       aria-label="Elegir todos" />
              </th>
              <th>Lead</th>
              <th>Paso</th>
              <th>Cuándo</th>
              <th>Últimos toques</th>
              <th>Qué pasó ahora</th>
            </tr>
          </thead>
          <tbody>
            {fichas.map((f) => (
              <Renglon key={f.leadId} f={f} elegido={elegidos.has(f.leadId)}
                       alternar={() => alternar(f.leadId)} />
            ))}
          </tbody>
        </table>
      </div>

      {elegidos.size > 0 ? (
        <Tanda ids={[...elegidos]} hoy={hoy} hecho={hecho} enTanda={enTanda}
               limpiar={() => setElegidos(new Set())} />
      ) : null}
    </>
  )
}

function Renglon({ f, elegido, alternar }: { f: Ficha; elegido: boolean; alternar: () => void }) {
  const [hecho, registrar] = useActionState(registrarToqueAccion, null)

  const cuando = f.situacion === 'largo'
    ? <span>Vuelve el <strong>{fechaCorta(f.fechaLarga)}</strong></span>
    : f.atraso > 0
      ? <span className="tarde">Tarde {f.atraso} {f.atraso === 1 ? 'día' : 'días'}</span>
      : f.atraso === 0
        ? <span className="hoy">Toca hoy</span>
        : <span className="espera">{fechaCorta(f.fecha)}</span>

  return (
    <tr className={elegido ? 'elegido' : undefined}>
      <td className="tilde">
        <input type="checkbox" checked={elegido} onChange={alternar}
               aria-label={`Elegir a ${f.nombre}`} />
      </td>
      <td>
        <Link href={`/leads/${f.leadId}?pestana=seguimiento&volver=seguimientos`}
              style={{ fontWeight: 650 }}>{f.nombre}</Link>
        <div className="meta">
          {[f.empresa, f.closer ?? 'sin closer'].filter(Boolean).join(' · ')}
          {f.calidadNivel ? (
            <strong style={{ color: `var(--${COLOR_DE_CALIDAD[f.calidadNivel]})`, marginLeft: 6 }}>
              LQ
            </strong>
          ) : null}
        </div>
      </td>
      <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{f.toque}</td>
      <td className="cuando">{cuando}</td>
      <td>
        {/* Lo que pasó antes, que es lo que decide qué hacer ahora. Cuatro «no
            contestó» seguidos y un «sigue interesado» son dos leads distintos,
            y hasta acá los dos se veían igual. */}
        {f.ultimos.length === 0 ? <span className="sindato">sin toques</span> : (
          <span className="rastro" title={f.ultimos.map((u) =>
            `${u.cuando} · toque ${u.toque} · ${NOMBRE_DE_TOQUE[u.estado]}${u.nota ? ` · ${u.nota}` : ''}`,
          ).join('\n')}>
            {f.ultimos.map((u, i) => (
              <Pildora key={i} color={u.estado === 'no_interesado' ? 'rojo'
                : u.estado === 'agendo' ? 'verde'
                : u.estado === 'no_contesto' ? 'gris' : 'acento'}>
                {NOMBRE_DE_TOQUE[u.estado]}
              </Pildora>
            ))}
          </span>
        )}
        {f.ultimos[0]?.nota ? <div className="meta nota">«{f.ultimos[0].nota}»</div> : null}
      </td>
      <td>
        <form action={registrar} className="carga">
          <input type="hidden" name="leadId" value={f.leadId} />
          <label className="oculto" htmlFor={`e-${f.leadId}`}>Qué pasó con {f.nombre}</label>
          <select id={`e-${f.leadId}`} name="estado" defaultValue="no_contesto">
            {ESTADOS_TOQUE.map((e) => <option key={e} value={e}>{NOMBRE_DE_TOQUE[e]}</option>)}
          </select>
          <label className="oculto" htmlFor={`n-${f.leadId}`}>Nota</label>
          <input id={`n-${f.leadId}`} name="nota" placeholder="Nota" style={{ maxWidth: 110 }} />
          <Boton clase="chico" mientras="…">Registrar</Boton>
          <Aviso r={hecho} chico />
        </form>
      </td>
    </tr>
  )
}

/**
 * La barra de la tanda.
 *
 * Aparece cuando hay algo elegido y se queda pegada abajo: se eligen veinte
 * recorriendo la lista y la barra sigue ahí cuando se termina de elegir. Una
 * barra que hay que ir a buscar al principio de la lista es una barra que no
 * se usa.
 *
 * «Posponer» está acá y no en cada fila porque es la otra mitad de ponerse al
 * día: de treinta atrasados, a la mitad no hay que tocarlos esta semana sino
 * en marzo, y hasta ahora eso era abrir treinta fichas.
 */
function Tanda({ ids, hoy, hecho, enTanda, limpiar }: {
  ids: number[]
  hoy: string
  hecho: Respuesta
  enTanda: (datos: FormData) => void
  limpiar: () => void
}) {
  // Si salió bien, la selección ya no existe: esos leads se movieron de paso.
  // El mensaje no se va con ella: vive arriba, en la lista.
  useEffect(() => { if (hecho?.ok) limpiar() }, [hecho, limpiar])

  return (
    <div className="tanda-barra">
      <form action={enTanda}>
        {ids.map((id) => <input key={id} type="hidden" name="leadId" value={id} />)}
        <div className="fila">
          <strong>{ids.length} {ids.length === 1 ? 'elegido' : 'elegidos'}</strong>

          <span className="separa" />

          <label className="oculto" htmlFor="t-estado">Qué pasó con todos</label>
          <select id="t-estado" name="estado" defaultValue="no_contesto">
            {ESTADOS_TOQUE.map((e) => <option key={e} value={e}>{NOMBRE_DE_TOQUE[e]}</option>)}
          </select>
          <label className="oculto" htmlFor="t-nota">Nota para todos</label>
          <input id="t-nota" name="nota" placeholder="Nota (opcional)" style={{ maxWidth: 150 }} />
          <Boton clase="chico" mientras="Registrando…">Registrar en los {ids.length}</Boton>

          <span className="separa" />

          <label className="oculto" htmlFor="t-fecha">Posponer hasta</label>
          <input id="t-fecha" name="fecha" type="date" defaultValue={hoy} style={{ maxWidth: 148 }} />
          <button type="submit" name="que" value="posponer" className="secundario chico">
            Posponer
          </button>

          <button type="button" className="sutil chico" onClick={limpiar}>Limpiar</button>
        </div>
        {hecho && !hecho.ok ? <Aviso r={hecho} chico /> : null}
      </form>
    </div>
  )
}
