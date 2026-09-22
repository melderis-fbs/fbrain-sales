import Link from 'next/link'
import { NOMBRE_DE_ROL, type Rol } from '@/dominio/roles'

/**
 * «Tu cuenta no está vinculada a nadie.»
 *
 * Ya no es un impedimento para trabajar: cargar un lead funciona igual, y lo
 * que uno carga lo ve siempre. Pero sigue importando, y por dos cosas que no
 * se ven solas:
 *
 *  - los leads que cargue NO se le atribuyen en los números del equipo, así
 *    que su columna en el recorrido del mes va a estar en cero aunque trabaje;
 *  - nadie le puede ASIGNAR un lead, porque no hay a qué figura asignárselo.
 *
 * Y la parte que no era evidente desde ningún lado: una figura vinculada pero
 * DESACTIVADA cuenta como no vinculada. Ahí estuvo trabado un closer días
 * enteros.
 */
export function CuentaSinVincular({ rol }: { rol: Rol }) {
  return (
    <div className="aviso atencion">
      <strong>Tu cuenta no está vinculada a ningún {rol === 'setter' ? 'setter' : 'closer'}.</strong>{' '}
      Podés cargar leads igual y los vas a ver, pero <strong>no se te van a contar</strong> en los
      números del equipo, y nadie te puede asignar un lead porque no hay a qué figura asignártelo.{' '}
      Dirección lo resuelve en <strong>Configuración → El equipo</strong>, vinculando tu cuenta
      ({NOMBRE_DE_ROL[rol]}) con tu figura comercial. Si tu figura ya está vinculada pero{' '}
      <strong>desactivada</strong>, hay que volver a activarla: desactivada, el sistema no la usa.{' '}
      <Link href="/configuracion" style={{ color: 'inherit', fontWeight: 650, textDecoration: 'underline' }}>
        Ir a Configuración →
      </Link>
    </div>
  )
}
