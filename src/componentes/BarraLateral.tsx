'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NOMBRE_DE_ROL, type Rol } from '@/dominio/roles'
import { salirAccion } from '@/app/login/acciones'
import { Iconos, type NombreDeIcono } from './Iconos'

/**
 * La navegación.
 *
 * Una lista plana, sin títulos de grupo. Son trece entradas: agrupadas se leen
 * más lento, porque hay que leer el grupo antes de encontrar el ítem.
 *
 * El orden es el del trabajo, no el alfabético ni el de importancia: primero lo
 * que se mira todos los días, después el equipo, y la configuración al final
 * porque se toca una vez por mes.
 */
const ENTRADAS: { href: string; texto: string; icono: NombreDeIcono; roles?: Rol[] }[] = [
  { href: '/dashboard', texto: 'Dashboard', icono: 'dashboard', roles: ['admin', 'direccion', 'head', 'coach'] },
  { href: '/tracker', texto: 'Tracker Diario', icono: 'tracker' },
  { href: '/leads', texto: 'Leads', icono: 'leads' },
  { href: '/llamadas', texto: 'Llamadas', icono: 'llamadas' },
  { href: '/analizador', texto: 'Analizador', icono: 'analizador' },
  { href: '/closers', texto: 'Closers', icono: 'closers', roles: ['admin', 'direccion', 'head', 'coach'] },
  { href: '/setters', texto: 'Setters', icono: 'setters', roles: ['admin', 'direccion', 'head'] },
  { href: '/matching', texto: 'Matching', icono: 'matching', roles: ['admin', 'direccion', 'head', 'coach'] },
  { href: '/seguimientos', texto: 'Seguimientos', icono: 'seguimientos' },
  { href: '/metricas', texto: 'Métricas', icono: 'metricas', roles: ['admin', 'direccion', 'head', 'coach'] },
  { href: '/casos', texto: 'Casos de Éxito', icono: 'casos' },
  { href: '/comisiones', texto: 'Comisiones', icono: 'comisiones', roles: ['admin', 'direccion', 'head'] },
  { href: '/configuracion', texto: 'Configuración', icono: 'configuracion', roles: ['admin', 'direccion', 'head'] },
]

export function BarraLateral({ nombre, rol }: { nombre: string; rol: Rol }) {
  const ruta = usePathname()
  const Buscar = Iconos.buscar
  const Salir = Iconos.salir

  return (
    <nav className="lateral">
      <div className="marca">
        <span className="sello">F</span>
        <span className="nombre">
          Founders
          <small>Sales OS</small>
        </span>
      </div>

      <form className="buscador" action="/leads" method="get">
        <Buscar />
        <input name="q" placeholder="Buscar..." aria-label="Buscar un lead" />
      </form>

      <div className="entradas">
        {ENTRADAS.filter((e) => !e.roles || e.roles.includes(rol)).map((e) => {
          const Icono = Iconos[e.icono]
          const activo = ruta === e.href || ruta.startsWith(`${e.href}/`)
          return (
            <Link key={e.href} href={e.href} className={activo ? 'activo' : ''}
                  aria-current={activo ? 'page' : undefined}>
              <Icono />
              {e.texto}
            </Link>
          )
        })}
      </div>

      <div className="pie">
        <div>
          <div className="quien">{nombre}</div>
          <div className="rol">{NOMBRE_DE_ROL[rol]}</div>
        </div>
        <form action={salirAccion}>
          <button type="submit" className="sutil" title="Salir" aria-label="Salir">
            <Salir />
          </button>
        </form>
      </div>
    </nav>
  )
}
