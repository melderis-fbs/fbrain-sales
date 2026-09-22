import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, exigir } from '@/lib/permisos'
import { catalogos } from '@/datos/catalogos'
import { Encabezado } from '@/componentes/Piezas'
import { AltaDeLead, type QuienCarga } from '@/componentes/AltaDeLead'

export default async function LeadNuevo() {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')
  const cats = await catalogos()

  // Para un closer o un setter, de quién es el lead no se elige: es suyo. Si
  // pudiera asignárselo a otro lo perdería de vista para siempre, y eso se lee
  // como «se cargó mal» o directamente como «no se creó».
  const alcance = alcanceDe(usuario)
  const yo: QuienCarga = alcance.todo ? { tipo: 'todo' }
    : 'closerId' in alcance
      ? { tipo: 'closer', id: alcance.closerId,
          nombre: cats.closers.find((c) => c.id === alcance.closerId)?.nombre ?? usuario.nombre }
    : 'setterId' in alcance
      ? { tipo: 'setter', id: alcance.setterId,
          nombre: cats.setters.find((c) => c.id === alcance.setterId)?.nombre ?? usuario.nombre }
    : { tipo: 'nadie' }

  return (
    <div className="apilado">
      <Encabezado kicker="Leads" titulo="Registrar lead"
                  bajada="Los datos básicos. La calificación y el resultado se cargan después, en su ficha." />
      <div style={{ maxWidth: 760 }}>
        <AltaDeLead catalogos={cats} yo={yo} />
      </div>
    </div>
  )
}
