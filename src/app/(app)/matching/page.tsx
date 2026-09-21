import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { matriz, loQueSeSabe, DIMENSIONES, NOMBRE_DE_CONFIANZA, type Dimension } from '@/datos/matching'
import { rango, hoyEn, PERIODOS, type NombreDePeriodo } from '@/motor/periodos'
import { MINIMO_PARA_PUBLICAR } from '@/motor/ajuste'
import { Tarjeta, Encabezado, Pildora, Numero, Vacio, porcentaje } from '@/componentes/Piezas'

type Busqueda = Promise<Record<string, string | undefined>>

/**
 * Matching: qué closer cierra mejor qué tipo de lead.
 *
 * La promesa fácil acá es un algoritmo que asigne los leads solo. La promesa
 * honesta es esta tabla, que dice qué se sabe y —sobre todo— qué no.
 *
 * Con dos closers, «Kevin cierra mejor los de e-commerce» suele ser cuatro
 * llamadas. Por eso cada celda trae su cantidad, y por debajo del mínimo no
 * muestra una tasa: un número que se mueve treinta puntos con una venta más se
 * lee igual que uno sólido, y es lo que hace que alguien reparta leads con una
 * moneda creyendo que usa datos.
 */
export default async function Matching({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams
  const usuario = await exigirUsuario()
  if (!puede(usuario, 'verTodo')) {
    return (
      <Tarjeta>
        <Vacio>Esta pantalla compara a todo el equipo, así que la ve dirección.</Vacio>
      </Tarjeta>
    )
  }

  const dimension = (DIMENSIONES.find((d) => d.clave === q.por)?.clave ?? 'calidad') as Dimension
  const periodo = (q.periodo ?? 'ultimos_3_meses') as NombreDePeriodo
  const r = rango(periodo, hoyEn())

  const m = await matriz(dimension, r)
  const conclusiones = loQueSeSabe(m)
  const celda = (segmento: string, closerId: number) =>
    m.celdas.find((c) => c.segmento === segmento && c.closerId === closerId)

  return (
    <div className="apilado">
      <Encabezado kicker="Matching" titulo="Quién cierra mejor qué"
                  bajada={`${r.etiqueta} · ${m.asistenciasTotales} asistencias · la vara de la operación es ${m.general}% de cierre`} />

      <div className="chips">
        {DIMENSIONES.map((d) => (
          <Link key={d.clave} href={`/matching?por=${d.clave}&periodo=${periodo}`}
                className={dimension === d.clave ? 'activo' : ''}>{d.nombre}</Link>
        ))}
      </div>
      <div className="chips">
        {PERIODOS.filter((p) => p.clave !== 'hoy' && p.clave !== 'semana').map((p) => (
          <Link key={p.clave} href={`/matching?por=${dimension}&periodo=${p.clave}`}
                className={periodo === p.clave ? 'activo' : ''}>{p.etiqueta}</Link>
        ))}
      </div>

      <div className="aviso dato">
        Una celda muestra su cierre sólo desde <strong>{MINIMO_PARA_PUBLICAR} asistencias</strong>.
        Debajo de eso dice cuántas hay y nada más, a propósito: repartir leads por un número
        sacado de cuatro llamadas es peor que repartirlos por criterio, porque parece que hay
        evidencia.
      </div>

      <Tarjeta titulo="Lo que se puede afirmar hoy"
               ayuda="Sólo las diferencias de más de 5 puntos entre dos closers con datos suficientes.">
        {conclusiones.length === 0 ? (
          <p className="ayuda">
            Todavía nada. O no hay volumen suficiente en ningún segmento, o las diferencias entre
            closers están dentro del ruido. Las dos son respuestas correctas: significan que hoy
            conviene repartir parejo y volver a mirar en unas semanas.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
            {conclusiones.map((c, i) => (
              <li key={i} style={{ marginBottom: 5 }}>{c.texto}</li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {m.closers.length === 0 || m.segmentos.length === 0 ? (
        <Tarjeta>
          <Vacio>
            No hay asistencias con closer asignado en el período.
            {dimension === 'industria'
              ? ' La industria se carga en la ficha del lead, en la pestaña Datos.'
              : ''}
          </Vacio>
        </Tarjeta>
      ) : (
        <Tarjeta titulo={`Cierre por ${DIMENSIONES.find((d) => d.clave === dimension)?.nombre.toLowerCase()}`}
                 ayuda={DIMENSIONES.find((d) => d.clave === dimension)?.ayuda}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>{DIMENSIONES.find((d) => d.clave === dimension)?.nombre}</th>
                  {m.closers.map((c) => <th key={c.id} className="num">{c.nombre}</th>)}
                </tr>
              </thead>
              <tbody>
                {m.segmentos.map((s) => (
                  <tr key={s}>
                    <td style={{ fontWeight: 600 }}>{s}</td>
                    {m.closers.map((c) => {
                      const x = celda(s, c.id)
                      if (!x || x.asistencias === 0) {
                        return <td key={c.id} className="num"><span className="sindato">—</span></td>
                      }
                      return (
                        <td key={c.id} className="num">
                          {x.tasa === null ? (
                            <span className="sindato" title={NOMBRE_DE_CONFIANZA[x.confianza]}>
                              {x.ventas}/{x.asistencias}
                            </span>
                          ) : (
                            <>
                              <Pildora color={x.tasa >= m.general * 1.15 ? 'verde'
                                : x.tasa <= m.general * 0.85 ? 'rojo' : 'gris'}
                                titulo={`${NOMBRE_DE_CONFIANZA[x.confianza]} · suavizado ${x.ajustado}%`}>
                                {x.tasa}%
                              </Pildora>
                              <div style={{ fontSize: 11, color: 'var(--gris-claro)', marginTop: 2 }}>
                                {x.ventas}/{x.asistencias}
                              </div>
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      <div className="rejilla g3">
        <Numero etiqueta="Celdas con datos suficientes"
                valor={m.celdas.filter((c) => c.tasa !== null).length}
                contra={`de ${m.celdas.length} combinaciones`} />
        <Numero etiqueta="Asistencias en el período" valor={m.asistenciasTotales} />
        <Numero etiqueta="Vara de la operación" valor={m.general} unidad="%"
                contra="cierre general, contra el que se compara todo" />
      </div>

      <Tarjeta titulo="Por qué esto todavía no reparte leads solo">
        <p className="ayuda">
          Para asignar automáticamente harían falta dos cosas que hoy no están: volumen —varias
          decenas de asistencias por combinación, no unas pocas— y una regla de negocio sobre qué
          hacer cuando el mejor closer para un lead está lleno. Sin lo segundo, un asignador
          automático le manda todo al mismo y el resto del equipo deja de aprender.
        </p>
        <p className="ayuda" style={{ marginTop: 8 }}>
          Mientras tanto esta pantalla sirve para lo que sirve de verdad: ver si hay un patrón, y
          decidirlo una persona. Cuando haya volumen, el motor de suavizado que ya calcula estas
          celdas es el mismo que haría la asignación.
        </p>
      </Tarjeta>
    </div>
  )
}
