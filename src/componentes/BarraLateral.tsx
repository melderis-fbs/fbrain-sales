'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NOMBRE_DE_ROL, type Rol } from '@/dominio/roles'
import { salirAccion } from '@/app/login/acciones'

/**
 * La navegación.
 *
 * Cada entrada contesta una sola pregunta, y las que todavía no existen no se
 * muestran: prometer una pestaña vacía es peor que no tenerla.
 *
 * Agrupadas por el momento en que se usan. Un closer entra a la mañana al
 * Tracker y a Seguimientos; dirección entra al Dashboard. Que lo primero de la
 * lista sea lo primero del día ahorra un clic por persona por día.
 */
const ENTRADAS: { href: string; texto: string; grupo: string; roles?: Rol[] }[] = [
  { href: '/dashboard', texto: 'Dashboard', grupo: 'El mes', roles: ['admin', 'direccion', 'head', 'coach'] },
  { href: '/tracker', texto: 'Tracker', grupo: 'El mes' },

  { href: '/leads', texto: 'Leads', grupo: 'El día' },
  { href: '/seguimientos', texto: 'Seguimientos', grupo: 'El día' },
  { href: '/llamadas', texto: 'Llamadas', grupo: 'El día' },

  { href: '/closers', texto: 'Closers', grupo: 'El equipo', roles: ['admin', 'direccion', 'head', 'coach'] },
  { href: '/setters', texto: 'Setters', grupo: 'El equipo', roles: ['admin', 'direccion', 'head'] },
  { href: '/configuracion', texto: 'Configuración', grupo: 'El equipo', roles: ['admin', 'direccion', 'head'] },
]

export function BarraLateral({ nombre, rol }: { nombre: string; rol: Rol }) {
  const ruta = usePathname()
  const visibles = ENTRADAS.filter((e) => !e.roles || e.roles.includes(rol))
  let grupoActual = ''

  return (
    <nav className="lateral">
      <div className="marca">
        FOUNDERS
        <small>Sales OS</small>
      </div>

      <form className="buscador" action="/leads" method="get">
        <input name="q" placeholder="Buscar un lead…" aria-label="Buscar un lead" />
      </form>

      {visibles.map((e) => {
        const cabecera = e.grupo !== grupoActual ? e.grupo : null
        grupoActual = e.grupo
        const activo = ruta === e.href || ruta.startsWith(`${e.href}/`)
        return (
          <div key={e.href}>
            {cabecera ? <div className="grupo">{cabecera}</div> : null}
            <Link href={e.href} className={activo ? 'activo' : ''}>{e.texto}</Link>
          </div>
        )
      })}

      <div className="pie">
        <div className="quien">{nombre}</div>
        <div>{NOMBRE_DE_ROL[rol]}</div>
        <form action={salirAccion} style={{ marginTop: 6 }}>
          <button type="submit" className="sutil">Salir</button>
        </form>
      </div>
    </nav>
  )
}
