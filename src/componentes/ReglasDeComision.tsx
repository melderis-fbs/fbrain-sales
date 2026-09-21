'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { guardarReglasAccion } from '@/app/(app)/comisiones/acciones'
import { useCampos } from './campos'
import type { Reglas } from '@/datos/comisiones'

function Boton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar las reglas'}</button>
}

/**
 * Las reglas de comisión, editables sin tocar código.
 *
 * Un porcentaje escrito en un archivo .ts es algo que nadie del equipo
 * comercial puede corregir un viernes a la tarde, que es exactamente cuando
 * hace falta.
 */
export function ReglasDeComision({ reglas }: { reglas: Reglas }) {
  const [mensaje, accion] = useActionState<string | null, FormData>(guardarReglasAccion, null)
  const { campo, form } = useCampos({
    sobre: reglas.sobre,
    closer: String(reglas.closer),
    setter: String(reglas.setter),
    repesca: String(reglas.repesca),
    head: String(reglas.head),
  }, mensaje)

  return (
    <form action={accion} ref={form}>
      {mensaje ? <div className="aviso dato">{mensaje}</div> : null}

      <div className="campo">
        <label htmlFor="sobre">Se comisiona sobre</label>
        <select {...campo('sobre')}>
          <option value="cash">Lo cobrado · cash collected</option>
          <option value="facturacion">Lo vendido · facturación</option>
        </select>
        <div className="nota">
          Sobre lo <strong>facturado</strong> se paga por plata que todavía no entró: en un plan
          de tres cuotas, es pagar por adelantado. Por eso viene en «lo cobrado».
        </div>
      </div>

      <div className="dos">
        <div className="campo">
          <label htmlFor="closer">Closer · %</label>
          <input {...campo('closer')} inputMode="decimal" required />
        </div>
        <div className="campo">
          <label htmlFor="setter">Setter · %</label>
          <input {...campo('setter')} inputMode="decimal" required />
        </div>
        <div className="campo">
          <label htmlFor="repesca">Repesca · %</label>
          <input {...campo('repesca')} inputMode="decimal" required />
          <div className="nota">La cobra quien reflotó el lead, aparte de lo demás.</div>
        </div>
        <div className="campo">
          <label htmlFor="head">Head comercial · %</label>
          <input {...campo('head')} inputMode="decimal" required />
          <div className="nota">Todavía no se reparte: se guarda para cuando se decida cómo.</div>
        </div>
      </div>

      <Boton />
    </form>
  )
}
