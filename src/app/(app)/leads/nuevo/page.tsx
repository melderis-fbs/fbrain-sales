import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { alcanceDe, exigir, sinEquipoAsignado } from '@/lib/permisos'
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

  // Sin figura vinculada, el lead quedaría sin dueño y no lo vería nunca más.
  // Mostrarle el formulario igual es ofrecerle algo que no puede funcionar: la
  // pantalla que ya explica el problema está arriba, y acá sobra repetirla.
  if (sinEquipoAsignado(alcance)) {
    return (
      <div className="apilado">
        <Link href="/leads" className="volver">← Volver a Leads</Link>
        <Encabezado kicker="Leads" titulo="Registrar lead"
                    bajada="Falta un paso antes de poder cargar." />
        <div className="tarjeta">
          <p style={{ margin: 0 }}>
            Mientras tu cuenta no esté vinculada a tu figura comercial, un lead que cargues queda
            sin dueño: se guarda, pero no aparece en tu lista ni en tus números, y no hay forma de
            que lo encuentres. Por eso no se carga desde acá todavía.
          </p>
          <p className="ayuda" style={{ marginTop: 10, marginBottom: 0 }}>
            Lo resuelve dirección en <strong>Configuración → El equipo</strong>. Si tu figura
            aparece desactivada, hay que <strong>volver a activarla</strong>: desactivada, el
            sistema no la usa aunque esté vinculada.
          </p>
        </div>
      </div>
    )
  }

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
