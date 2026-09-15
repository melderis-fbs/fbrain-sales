import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { revisar } from '@/lib/revision'
import { HOME_DE_ROL } from '@/dominio/roles'
import { BaseSinAndar } from '@/componentes/BaseSinAndar'

export const dynamic = 'force-dynamic'

/**
 * Cada rol abre en la pregunta que le toca, no todos en el mismo tablero.
 *
 * La revisión va primero, igual que en /login y en el marco de la aplicación.
 * Sin ella, la raíz —que es la primera URL que abre cualquiera después de
 * publicar— reventaba con «Falta DATABASE_URL» en vez de decir qué falta y
 * cómo se carga. Es la pantalla que más importa que se lea bien, porque es la
 * que se ve cuando todavía no está configurado nada.
 */
export default async function Inicio() {
  const problema = await revisar()
  if (problema) return <BaseSinAndar problema={problema} />

  const usuario = await usuarioActual()
  if (!usuario) redirect('/login')
  redirect(HOME_DE_ROL[usuario.rol])
}
