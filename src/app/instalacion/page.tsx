import { redirect } from 'next/navigation'
import { revisar, hayUsuarios } from '@/lib/revision'
import { BaseSinAndar } from '@/componentes/BaseSinAndar'
import { PrimerUsuario } from '@/componentes/PrimerUsuario'

export const dynamic = 'force-dynamic'

/** El último paso de la instalación: quién es el primero que entra. */
export default async function Instalacion() {
  const problema = await revisar()
  if (problema) return <BaseSinAndar problema={problema} />

  // Si ya hay alguien, esta pantalla no existe más.
  if (await hayUsuarios()) redirect('/login')

  return (
    <main style={{ maxWidth: 400, margin: '80px auto', padding: 20 }}>
      <div className="kicker">Founders Sales OS</div>
      <h1>Creá el primer usuario</h1>
      <p style={{ color: 'var(--gris)', marginTop: 0, marginBottom: 22 }}>
        Las tablas ya están. Falta alguien que pueda entrar: esta primera cuenta
        queda como <strong>admin</strong>. Después de crearla, esta pantalla se cierra
        y los usuarios que siguen los das de alta desde adentro.
      </p>
      <PrimerUsuario />
    </main>
  )
}
