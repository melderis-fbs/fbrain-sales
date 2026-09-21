import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { catalogos } from '@/datos/catalogos'
import { Encabezado } from '@/componentes/Piezas'
import { AltaDeLead } from '@/componentes/AltaDeLead'

export default async function LeadNuevo() {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')
  const cats = await catalogos()

  return (
    <div className="apilado">
      <Encabezado kicker="Leads" titulo="Registrar lead"
                  bajada="Los datos básicos. La calificación y el resultado se cargan después, en su ficha." />
      <div style={{ maxWidth: 760 }}>
        <AltaDeLead catalogos={cats} />
      </div>
    </div>
  )
}
