'use client'

import { useActionState } from 'react'
import { Aviso, Boton } from './Respuesta'
import { volverAlPipelineAccion } from '@/app/(app)/seguimientos/acciones'

/** Volver a meter un lead en la cadencia, y decir si se pudo. */
export function VolverAMeterlo({ leadId }: { leadId: number }) {
  const [hecho, volver] = useActionState(volverAlPipelineAccion, null)
  return (
    <form action={volver}>
      <input type="hidden" name="leadId" value={leadId} />
      <Boton clase="sutil chico" mientras="…">Volver a meterlo</Boton>
      <Aviso r={hecho} chico />
    </form>
  )
}
