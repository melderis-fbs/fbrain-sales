import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { catalogos } from '@/datos/catalogos'
import { LeadNuevo } from '@/componentes/LeadNuevo'

export default async function NuevoLead() {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')
  const cats = await catalogos()

  return (
    <div className="apilado" style={{ maxWidth: 760 }}>
      <div>
        <div className="kicker">Leads</div>
        <h1>Registrar lead</h1>
      </div>
      <LeadNuevo catalogos={cats} />
    </div>
  )
}
