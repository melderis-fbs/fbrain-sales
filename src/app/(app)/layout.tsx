import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { revisar } from '@/lib/revision'
import { BarraLateral } from '@/componentes/BarraLateral'
import { BaseSinAndar } from '@/componentes/BaseSinAndar'
import { CuentaSinVincular } from '@/componentes/CuentaSinVincular'
import { alcanceDe, sinEquipoAsignado } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

export default async function MarcoApp({ children }: { children: React.ReactNode }) {
  const problema = await revisar()
  if (problema) return <BaseSinAndar problema={problema} />

  const usuario = await usuarioActual()
  if (!usuario) redirect('/login')

  return (
    <div className="marco">
      <BarraLateral nombre={usuario.nombre} rol={usuario.rol} />
      <main className="contenido">
        {sinEquipoAsignado(alcanceDe(usuario)) ? <CuentaSinVincular rol={usuario.rol} /> : null}
        {children}
      </main>
    </div>
  )
}
