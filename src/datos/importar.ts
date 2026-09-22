import 'server-only'
import { filas as consultar } from '@/lib/db'
import { plegar, emailPlegado, colaDelTelefono } from '@/lib/texto'
import { crearLead } from './leads'
import { cargarResultado, registrarPago } from './resultado'
import { agregarNota } from './notas'
import type { FilaLeida } from '@/dominio/importacion'

/**
 * Escribir lo que se leyó de la planilla.
 *
 * Fila por fila, no todo en una transacción sola. Suena peor de lo que es: la
 * pantalla ya validó todo antes, así que una falla acá es algo raro, y si pasa
 * queda dicho en qué línea. Volver a pegar la misma planilla no duplica nada,
 * porque las que ya entraron salen marcadas como repetidas — o sea que
 * reintentar es el camino normal, no un problema.
 */

export type YaEstaba = { leadId: number; nombre: string; porque: 'email' | 'telefono' | 'nombre' }

/**
 * Cuáles de estas filas ya están cargadas.
 *
 * Una sola consulta para toda la planilla: preguntar de a una por sesenta
 * filas es lo que hace que la vista previa tarde diez segundos y nadie la
 * espere.
 */
export async function yaCargados(filas: FilaLeida[]): Promise<(YaEstaba | null)[]> {
  const emails = [...new Set(filas.map((f) => emailPlegado(f.email)).filter((x): x is string => x !== null))]
  const telefonos = [...new Set(filas.map((f) => colaDelTelefono(f.telefono)).filter((x): x is string => x !== null))]
  const nombres = [...new Set(filas.map((f) => plegar(f.nombre)).filter((x) => x !== ''))]

  const existentes = await consultar<{ id: number; nombre: string; email_pleg: string | null; cola: string | null; nombre_pleg: string }>(
    `select id, nombre, email_pleg, right(telefono_pleg, 8) as cola, nombre_pleg
       from leads
      where borrado_en is null
        and (email_pleg = any($1::text[]) or right(telefono_pleg, 8) = any($2::text[])
             or nombre_pleg = any($3::text[]))`,
    [emails, telefonos, nombres],
  )

  const porEmail = new Map<string, { id: number; nombre: string }>()
  const porTelefono = new Map<string, { id: number; nombre: string }>()
  const porNombre = new Map<string, { id: number; nombre: string }>()
  for (const x of existentes) {
    const corto = { id: x.id, nombre: x.nombre }
    if (x.email_pleg) porEmail.set(x.email_pleg, corto)
    if (x.cola) porTelefono.set(x.cola, corto)
    porNombre.set(x.nombre_pleg, corto)
  }

  // De la señal más fuerte a la más débil. El nombre parecido no decide nada
  // solo: se informa y elige la persona.
  const señal = (
    mapa: Map<string, { id: number; nombre: string }>, clave: string | null,
    porque: YaEstaba['porque'],
  ): YaEstaba | null => {
    const x = clave === null ? undefined : mapa.get(clave)
    return x === undefined ? null : { leadId: x.id, nombre: x.nombre, porque }
  }

  return filas.map((f) =>
    señal(porEmail, emailPlegado(f.email), 'email')
    ?? señal(porTelefono, colaDelTelefono(f.telefono), 'telefono')
    ?? señal(porNombre, plegar(f.nombre) || null, 'nombre'))
}

export type ReporteDeImportacion = {
  importadas: number
  salteadas: number
  fallidas: { linea: number; nombre: string; porque: string }[]
}

/**
 * Importar. Crea el lead y, si la planilla lo trae, le carga el resultado
 * completo: qué pasó con la reunión, qué pasó con la venta, el importe y el
 * cobro. Cargar sesenta leads y después abrir sesenta fichas para poner el
 * resultado no es cargar el histórico: es cargarlo dos veces.
 */
export async function importar(
  filas: FilaLeida[],
  usuarioId: number,
): Promise<ReporteDeImportacion> {
  const reporte: ReporteDeImportacion = { importadas: 0, salteadas: 0, fallidas: [] }

  for (const f of filas) {
    try {
      const leadId = await crearLead({
        nombre: f.nombre, email: f.email, telefono: f.telefono, pais: f.pais,
        empresa: f.empresa, industria: f.industria,
        fuenteId: f.fuenteId, funnelId: f.funnelId,
        setterId: f.setterId, closerId: f.closerId,
        fechaSesion: f.fechaSesion, horaSesion: f.horaSesion,
        tipoSesion: f.tipoSesion, valorPotencial: f.valorPotencial, moneda: f.moneda,
      }, usuarioId)

      if (f.estado !== null || f.resultado !== null) {
        // Si trae resultado y no dice qué pasó con la reunión, asistió: no se
        // vende ni se pierde una reunión a la que nadie fue.
        const estado = f.estado ?? (f.resultado !== null && f.resultado !== 'pendiente' ? 'asistio' : undefined)
        const cuando = f.fechaVenta ?? f.fechaSesion ?? undefined

        await cargarResultado(leadId, {
          estado,
          resultado: f.resultado ?? undefined,
          huboOferta: f.resultado === 'venta' || f.resultado === 'sena' ? true : undefined,
          motivoPerdida: f.motivoPerdida,
          observaciones: f.observaciones,
          ...(f.resultado === 'venta' && f.importe !== null && cuando
            ? { venta: { importe: f.importe, moneda: f.moneda, fecha: cuando } } : {}),
          ...(f.resultado === 'sena' && f.importe !== null && cuando
            ? { sena: { importe: f.importe, moneda: f.moneda, fecha: cuando } } : {}),
        }, usuarioId)

        if (f.cobrado !== null && f.resultado === 'venta') {
          await registrarPago(leadId, {
            importe: f.cobrado, moneda: f.moneda,
            fecha: f.fechaCobro ?? cuando ?? f.fechaSesion!,
            medio: 'Importado',
          }, usuarioId)
        }
      } else if (f.observaciones !== null) {
        // Sin resultado, las observaciones no tienen dónde ir: van como nota.
        await agregarNota(leadId, f.observaciones, usuarioId)
      }

      reporte.importadas += 1
    } catch (e) {
      reporte.fallidas.push({
        linea: f.linea, nombre: f.nombre,
        porque: e instanceof Error ? e.message : 'No se pudo importar.',
      })
    }
  }

  return reporte
}
