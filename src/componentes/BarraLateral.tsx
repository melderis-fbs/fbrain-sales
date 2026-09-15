'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NOMBRE_DE_ROL, type Rol } from '@/dominio/roles'
import { salirAccion } from '@/app/login/acciones'

/**
 * La navegación.
 *
 * Cada entrada contesta una sola pregunta. Las que todavía no existen no se
 * muestran: no se promete lo que no hay.
 */
const ENTRADAS: { href: string; texto: string; roles?: Rol[] }[] = [
  { href: '/tablero', texto: 'Tablero', roles: ['admin', 'direccion', 'head', 'coach'] },
  { href: '/hoy', texto: 'Hoy' },
  { href: '/leads', texto: 'Leads' },
  { href: '/closers', texto: 'Closers', roles: ['admin', 'direccion', 'head', 'coach'] },
  { href: '/setters', texto: 'Setters', roles: ['admin', 'direccion', 'head'] },
  { href: '/configuracion', texto: 'Configuración', roles: ['admin', 'direccion', 'head'] },
]

export function BarraLateral({ nombre, rol }: { nombre: string; rol: Rol }) {
  const ruta = usePathname()

  return (
    <nav className="lateral">
      <div className="marca">
        FOUNDERS
        <small>Sales OS</small>
      </div>

      {ENTRADAS.filter((e) => !e.roles || e.roles.includes(rol)).map((e) => (
        <Link key={e.href} href={e.href} className={ruta === e.href || ruta.startsWith(`${e.href}/`) ? 'activo' : ''}>
          {e.texto}
        </Link>
      ))}

      <div className="pie">
        <div style={{ color: '#fff', fontWeight: 650 }}>{nombre}</div>
        <div>{NOMBRE_DE_ROL[rol]}</div>
        <form action={salirAccion} style={{ marginTop: 8 }}>
          <button type="submit" className="secundario" style={{ fontSize: 12, padding: '4px 12px' }}>Salir</button>
        </form>
      </div>
    </nav>
  )
}
