import { exigirUsuario } from '@/lib/auth'
import { figuraDe, puede } from '@/lib/permisos'
import { catalogos } from '@/datos/catalogos'
import { Encabezado } from '@/componentes/Piezas'
import { SinPermiso } from '@/componentes/SinPermiso'
import { AltaDeLead, type QuienCarga } from '@/componentes/AltaDeLead'

export default async function LeadNuevo() {
  const usuario = await exigirUsuario()
  if (!puede(usuario, 'editarLead')) {
    return <SinPermiso rol={usuario.rol} que="registrar leads" />
  }
  const cats = await catalogos()

  // Para un closer o un setter, de quién es el lead no se elige: es suyo. Lo
  // decide su figura, no lo que pueda ver: ahora ven toda la operación y lo
  // que cargan sigue entrando a su nombre.
  const figura = figuraDe(usuario)
  const yo: QuienCarga = figura.tipo === 'closer'
    ? { tipo: 'closer', id: figura.closerId,
        nombre: cats.closers.find((c) => c.id === figura.closerId)?.nombre ?? usuario.nombre }
    : figura.tipo === 'setter'
    ? { tipo: 'setter', id: figura.setterId,
        nombre: cats.setters.find((c) => c.id === figura.setterId)?.nombre ?? usuario.nombre }
    : usuario.rol === 'closer' || usuario.rol === 'setter' ? { tipo: 'nadie' }
    : { tipo: 'todo' }

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
