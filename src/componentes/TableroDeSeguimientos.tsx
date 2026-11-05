'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useState } from 'react'
import type { Tarjeta as Ficha } from '@/datos/seguimientos'
import type { Toque } from '@/motor/toques'
import { Aviso, Boton, type Respuesta } from './Respuesta'
import { Pildora, fechaCorta } from './Piezas'
import { ESTADOS_TOQUE, NOMBRE_DE_TOQUE } from '@/dominio/seguimientos'
import { COLOR_DE_CALIDAD } from '@/dominio/calidad'
import { registrarToqueAccion, registrarTandaAccion } from '@/app/(app)/seguimientos/acciones'

/**
 * El tablero: una columna por toque, y el tablero entero se desliza.
 *
 * Las doce columnas no entran en una pantalla y no tienen que entrar:
 * apretarlas hasta que entren las vuelve ilegibles, y resumirlas en una barra
 * de doce bloquecitos deja de ser un tablero. Lo que tiene que estar bien es
 * CÓMO se recorre.
 *
 * Por eso el tablero no se queda con la barra. Antes `.tablero` tenía
 * `overflow-x` propio, y su barra caía al pie de la fila de columnas: con un
 * toque de treinta leads eso son cinco mil píxeles hacia abajo, así que para
 * correr el tablero había que bajar hasta el fondo, y al llegar ya no se veía
 * de qué columna era cada tarjeta. Dos barras peleando.
 *
 * Ahora la que corre es la página: su barra la dibuja el navegador abajo de
 * la ventana, está siempre en el mismo lugar y se llega desde cualquier punto
 * del tablero. Una sola barra, y el menú se queda quieto al correrla.
 */
export function TableroDeSeguimientos({
  columnas, largos, hoy,
}: {
  columnas: { toque: Toque; tarjetas: Ficha[] }[]
  largos: Ficha[]
  hoy: string
}) {
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  /**
   * El resultado de la tanda vive acá y no en la barra.
   *
   * La barra desaparece cuando se limpia la selección, y la selección se
   * limpia justo cuando la tanda salió bien: el «3 registrados» se veía un
   * instante y se iba con ella.
   */
  const [hecho, enTanda] = useActionState(registrarTandaAccion, null)

  // Lo que se ve es lo que se puede elegir: al cambiar de filtro, una
  // selección invisible que sigue viva es una tanda que toca leads que quien
  // la lanzó no está mirando.
  const visibles = useMemo(
    () => new Set([...columnas.flatMap((c) => c.tarjetas), ...largos].map((f) => f.leadId)),
    [columnas, largos],
  )
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

  return (
    <>
      <Aviso r={hecho} />

      <div className="tablero">
        {columnas.map((c) => (
          <Columna key={c.toque.orden} orden={String(c.toque.orden)} nombre={c.toque.nombre}
                   abajo={`DÍA ${c.toque.dias}`} tarjetas={c.tarjetas}
                   elegidos={elegidos} alternar={alternar} />
        ))}
        {largos.length > 0 ? (
          <Columna orden="★" nombre="Seguimiento largo" abajo="FUERA DE LA CADENCIA"
                   tarjetas={largos} elegidos={elegidos} alternar={alternar} />
        ) : null}
      </div>

      {elegidos.size > 0 ? (
        <Tanda ids={[...elegidos]} hoy={hoy} hecho={hecho} enTanda={enTanda}
               limpiar={() => setElegidos(new Set())} />
      ) : null}
    </>
  )
}

/**
 * Cuántas tarjetas se ven antes de plegar el resto.
 *
 * Con treinta en una columna, el tablero mide cinco mil píxeles de alto y las
 * otras doce columnas quedan al lado de un campo de blanco: para comparar el
 * toque 1 con el 7 hay que recorrer la pantalla entera. Plegadas, las trece
 * se miran juntas y la que hay que trabajar se abre de un clic. El número de
 * arriba sigue diciendo cuántos hay de verdad.
 */
const A_LA_VISTA = 6

function Columna({
  orden, nombre, abajo, tarjetas, elegidos, alternar,
}: {
  orden: string
  nombre: string
  abajo: string
  tarjetas: Ficha[]
  elegidos: Set<number>
  alternar: (id: number) => void
}) {
  const tarde = tarjetas.filter((t) => t.urgencia === 'vencido').length
  const primeras = tarjetas.slice(0, A_LA_VISTA)
  const resto = tarjetas.slice(A_LA_VISTA)

  return (
    <div data-toque={orden} className={tarjetas.length === 0 ? 'columna vacia' : 'columna'}>
      {/* La cabeza se queda pegada arriba mientras se recorre su columna: en
          una columna larga, al bajar se perdía de vista de qué toque eran las
          tarjetas que se estaban mirando. */}
      <div className="cabeza">
        <div className="arriba">
          <span className="orden">{orden}</span>
          <span className="que" title={nombre}>{nombre}</span>
          <span className="cuantos">{tarjetas.length}</span>
        </div>
        <div className="abajo">
          {abajo}
          {tarde > 0 ? <> · <span className="tarde">{tarde} tarde</span></> : null}
        </div>
      </div>

      <div className="cuerpo">
        {tarjetas.length === 0 ? <div className="nadie">—</div> : null}
        {primeras.map((t) => (
          <FichaDeLead key={t.leadId} t={t} elegido={elegidos.has(t.leadId)}
                       alternar={() => alternar(t.leadId)} />
        ))}
        {resto.length > 0 ? (
          <details className="mas">
            <summary>Ver las {tarjetas.length} · {resto.length} más</summary>
            <div className="cuerpo" style={{ marginTop: 8 }}>
              {resto.map((t) => (
                <FichaDeLead key={t.leadId} t={t} elegido={elegidos.has(t.leadId)}
                             alternar={() => alternar(t.leadId)} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  )
}

function FichaDeLead({ t, elegido, alternar }: { t: Ficha; elegido: boolean; alternar: () => void }) {
  const [hecho, registrar] = useActionState(registrarToqueAccion, null)

  const clase = t.urgencia === 'vencido' ? 'ficha vencida'
    : t.urgencia === 'hoy' ? 'ficha hoy'
    : t.urgencia === 'proximo' ? 'ficha proxima' : 'ficha'

  return (
    <div className={`${clase}${elegido ? ' elegida' : ''}`}>
      <div className="entre" style={{ alignItems: 'flex-start', gap: 7 }}>
        <input type="checkbox" checked={elegido} onChange={alternar}
               aria-label={`Elegir a ${t.nombre}`} className="tilde" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link href={`/leads/${t.leadId}?pestana=seguimiento&volver=seguimientos`} className="nombre">
            {t.nombre}
          </Link>
          <div className="meta">
            {[t.empresa, t.closer ?? 'sin closer'].filter(Boolean).join(' · ')}
          </div>
        </div>
        {t.calidadNivel ? (
          <strong style={{ color: `var(--${COLOR_DE_CALIDAD[t.calidadNivel]})`, fontSize: 11 }}>LQ</strong>
        ) : null}
      </div>

      <div className="paso">
        {t.situacion === 'largo' ? (
          <>
            <span className="cual">Vuelve</span>
            <span className="cuando">{fechaCorta(t.fechaLarga)}</span>
          </>
        ) : (
          <>
            <span className="cual">
              {t.atraso > 0 ? <span style={{ color: 'var(--rojo)' }}>Tarde</span>
                : t.atraso === 0 ? <span style={{ color: 'var(--acento)' }}>Toca hoy</span>
                : 'Toca'}
            </span>
            <span className="cuando">
              {t.atraso > 0 ? `${t.atraso} ${t.atraso === 1 ? 'día' : 'días'}` : fechaCorta(t.fecha)}
            </span>
          </>
        )}
      </div>

      {/* Lo que pasó antes, que es lo que decide qué hacer ahora. Cuatro «no
          contestó» seguidos y un «sigue interesado» son dos leads distintos, y
          hasta acá los dos se veían igual: el rastro estaba en la ficha, a dos
          clics y una vuelta. */}
      {t.ultimos.length > 0 ? (
        <div className="rastro" title={t.ultimos.map((u) =>
          `${u.cuando} · toque ${u.toque} · ${NOMBRE_DE_TOQUE[u.estado]}${u.nota ? ` · ${u.nota}` : ''}`,
        ).join('\n')}>
          {t.ultimos.slice(0, 3).map((u, i) => (
            <Pildora key={i} color={u.estado === 'no_interesado' ? 'rojo'
              : u.estado === 'agendo' ? 'verde'
              : u.estado === 'no_contesto' ? 'gris' : 'acento'}>
              {NOMBRE_DE_TOQUE[u.estado]}
            </Pildora>
          ))}
        </div>
      ) : null}
      {t.ultimos[0]?.nota ? <div className="nota-toque">«{t.ultimos[0].nota}»</div> : null}

      <form action={registrar} className="acciones">
        <input type="hidden" name="leadId" value={t.leadId} />
        <label className="oculto" htmlFor={`s-${t.leadId}`}>Qué pasó con {t.nombre}</label>
        <select id={`s-${t.leadId}`} name="estado" defaultValue="no_contesto">
          {ESTADOS_TOQUE.map((e) => <option key={e} value={e}>{NOMBRE_DE_TOQUE[e]}</option>)}
        </select>
        <Boton clase="chico" mientras="…">Registrar</Boton>
      </form>
      <Aviso r={hecho} chico />
    </div>
  )
}

/**
 * La barra de la tanda.
 *
 * Aparece cuando hay algo elegido y se queda pegada abajo: se marcan veinte
 * recorriendo el tablero y la barra sigue ahí cuando se termina de marcar.
 *
 * «Posponer» está acá y no en cada tarjeta porque es la otra mitad de
 * ponerse al día: de treinta atrasados, a la mitad no hay que tocarlos esta
 * semana sino en marzo, y hasta ahora eso era abrir treinta fichas.
 */
function Tanda({ ids, hoy, hecho, enTanda, limpiar }: {
  ids: number[]
  hoy: string
  hecho: Respuesta
  enTanda: (datos: FormData) => void
  limpiar: () => void
}) {
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
