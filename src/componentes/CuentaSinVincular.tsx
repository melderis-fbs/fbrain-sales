import Link from 'next/link'
import { NOMBRE_DE_ROL, type Rol } from '@/dominio/roles'

/**
 * «Tu cuenta no está vinculada a nadie.»
 *
 * Un closer o un setter ven lo suyo, y «lo suyo» se decide por la figura
 * comercial que tienen vinculada, no por el nombre de la cuenta. Sin esa
 * vinculación el alcance es vacío: todas las pantallas aparecen en cero y los
 * leads que cargue no los va a ver nunca más.
 *
 * Hasta ahora el sistema no lo decía en ningún lado, y eso es lo peor que
 * puede hacer: una pantalla vacía por permisos se lee igual que una pantalla
 * vacía por falta de datos, y el que la mira concluye que la aplicación no
 * anda. Esto lo dice, y dice cómo se arregla.
 */
export function CuentaSinVincular({ rol }: { rol: Rol }) {
  return (
    <div className="aviso problema">
      <strong>Tu cuenta no está vinculada a ningún {rol === 'setter' ? 'setter' : 'closer'}.</strong>{' '}
      Por eso todas las pantallas te aparecen vacías y los leads que cargues no te van a aparecer
      después: el sistema no sabe cuáles son tuyos. No es un problema de datos y no se arregla
      cargando más.{' '}
      Dirección lo resuelve en <strong>Configuración → El equipo</strong>, vinculando tu cuenta
      ({NOMBRE_DE_ROL[rol]}) con tu figura comercial.{' '}
      <Link href="/configuracion" style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>
        Ir a Configuración →
      </Link>
    </div>
  )
}
