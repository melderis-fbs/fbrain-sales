import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { exigir } from '@/lib/permisos'
import { catalogos, config } from '@/datos/catalogos'
import { Encabezado } from '@/componentes/Piezas'
import { Importacion } from '@/componentes/Importacion'

export default async function ImportarLeads() {
  const usuario = await exigirUsuario()
  exigir(usuario, 'editarLead')
  const [cats, moneda] = await Promise.all([catalogos(), config<string>('moneda_base', 'USD')])

  return (
    <div className="apilado">
      <Link href="/leads" className="volver">← Volver a Leads</Link>
      <Encabezado kicker="Leads" titulo="Cargar el histórico"
                  bajada="Pegá la planilla y mirá cómo queda antes de escribir nada. Entra el lead y también lo que pasó: si asistió, si se vendió, cuánto y cuánto se cobró." />
      <Importacion moneda={moneda} closers={cats.closers} setters={cats.setters} />
    </div>
  )
}
