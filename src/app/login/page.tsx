import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { revisar, hayUsuarios } from '@/lib/revision'
import { HOME_DE_ROL } from '@/dominio/roles'
import { FormularioDeEntrada } from '@/componentes/FormularioDeEntrada'
import { BaseSinAndar } from '@/componentes/BaseSinAndar'

export const dynamic = 'force-dynamic'

export default async function Login() {
  // Antes de pedirle la clave a nadie, revisar que la base esté. Si falta una
  // migración, que lo diga acá y no cuando ya escribió la contraseña.
  const problema = await revisar()
  if (problema) return <BaseSinAndar problema={problema} />

  // Sin nadie dado de alta no tiene sentido pedir una clave: falta el primer
  // usuario, y eso se hace acá al lado.
  if (!(await hayUsuarios())) redirect('/instalacion')

  const usuario = await usuarioActual()
  if (usuario) redirect(HOME_DE_ROL[usuario.rol])

  return (
    <main style={{ maxWidth: 360, margin: '96px auto', padding: 20 }}>
      <div className="kicker">Founders</div>
      <h1>Sales OS</h1>
      <p style={{ color: 'var(--gris)', marginTop: 0, marginBottom: 22 }}>
        Entrá con tu cuenta del equipo.
      </p>
      <FormularioDeEntrada />
    </main>
  )
}
