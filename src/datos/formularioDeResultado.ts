import 'server-only'
import { PROGRAMAS, desdeSalida,
         type Estado, type Resultado, type MotivoPerdida,
         type Salida, type ComoSigue, type Programa } from '@/dominio/resultados'
import type { ResultadoCargado } from './resultado'

/**
 * Leer el resultado de una llamada desde un formulario.
 *
 * Vive fuera de las acciones porque hay DOS pantallas que lo cargan —la
 * pestaña Resultado de la ficha y el reporte del closer en Llamadas— y las
 * dos tienen que guardar exactamente lo mismo. Cuando cada una parseaba lo
 * suyo, «venta sin importe» era un error en una pantalla y un lead a medio
 * guardar en la otra, y eso no se descubre hasta que el número del mes no
 * cierra.
 *
 * Lo que valida es lo que hace que el número no mienta, y nada más: una venta
 * sin importe no se puede facturar, una pérdida sin motivo no se puede contar,
 * cuotas que suman más que la venta son plata que no existe.
 */

function texto(datos: FormData, campo: string): string | null {
  const v = datos.get(campo)
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function numero(datos: FormData, campo: string): number | null {
  const s = texto(datos, campo)
  if (s === null) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export type ResultadoDelFormulario = {
  cambios: ResultadoCargado
  /** La salida elegida, para lo que pasa después de guardar (la segunda llamada). */
  salida: Salida | null
  resultado: Resultado | null
  fechaSegunda: string | null
  horaSegunda: string | null
  proximoPaso: string | null
}

export function leerResultado(datos: FormData): ResultadoDelFormulario {
  // En la pantalla el closer elige UNA cosa —«Venta», «Seguimiento largo»,
  // «Segunda llamada»— y acá se abre en las dos columnas que guarda la base.
  const elegida = texto(datos, 'salida') as Salida | null
  const { resultado, comoSigue } = elegida
    ? desdeSalida(elegida)
    : { resultado: texto(datos, 'resultado') as Resultado | null,
        comoSigue: (texto(datos, 'comoSigue') ?? 'cadencia') as ComoSigue }

  const moneda = texto(datos, 'moneda') ?? 'USD'
  const importe = numero(datos, 'importe')
  const fecha = texto(datos, 'fecha')

  if ((resultado === 'venta' || resultado === 'sena') && (importe === null || fecha === null)) {
    throw new Error(
      resultado === 'venta'
        ? 'Una venta necesita importe y fecha: sin eso no se puede contar en facturación.'
        : 'Una seña necesita importe y fecha.',
    )
  }
  if (resultado === 'perdida' && texto(datos, 'motivoPerdida') === null) {
    throw new Error('Un lead perdido necesita su motivo: es lo que después dice por qué se pierde.')
  }
  const programa = texto(datos, 'programa')
  if (programa !== null && !PROGRAMAS.includes(programa as Programa)) {
    throw new Error('El programa es GROWTH o ELITE.')
  }

  // El plan de pagos: una fila por cuota, con lo que ya entró marcado como
  // cobrado. Sólo entran las que tienen monto y fecha; una cuota a medio
  // escribir no es un pago y guardarla igual ensucia la cobranza.
  const cuotas = numero(datos, 'cuotas')
  const plan: { n: number; importe: number; fecha: string; medio: string | null; pagado: boolean }[] = []
  for (let n = 1; n <= (cuotas ?? 1); n++) {
    const m = numero(datos, `cuota${n}Importe`)
    const f = texto(datos, `cuota${n}Fecha`)
    if (m === null || m <= 0) continue
    if (f === null) throw new Error(`Falta la fecha del pago ${n}: el cash se cuenta el mes en que entra.`)
    plan.push({ n, importe: m, fecha: f, medio: texto(datos, `cuota${n}Medio`),
                pagado: datos.get(`cuota${n}Pagado`) === 'si' })
  }
  const pactado = plan.reduce((a, c) => a + c.importe, 0)
  if (importe !== null && pactado > importe) {
    throw new Error(`Las cuotas suman más que la venta: ${pactado} contra ${importe}.`)
  }

  // Una segunda llamada necesita su fecha antes de tocar nada: si falla a la
  // mitad, la reunión de hoy queda cerrada y el lead sin agenda.
  const fechaSegunda = texto(datos, 'fechaSegunda')
  if (elegida === 'segunda' && fechaSegunda === null) {
    throw new Error('Una segunda llamada necesita la fecha de la segunda llamada.')
  }

  const cambios: ResultadoCargado = {
    estado: (texto(datos, 'estado') ?? undefined) as Estado | undefined,
    resultado: resultado ?? undefined,
    ...(resultado === 'seguimiento'
      ? { comoSigue: comoSigue ?? 'cadencia', volverEl: texto(datos, 'volverEl') }
      : {}),
    huboOferta: datos.has('huboOferta') ? datos.get('huboOferta') === 'on' : undefined,
    motivoPerdida: (texto(datos, 'motivoPerdida') ?? null) as MotivoPerdida | null,
    // Lo que el formulario no mandó, no se toca. Los campos del resultado que
    // no se eligió ni se dibujan, y un campo ausente que se guardaba como
    // vacío le borraba al lead el próximo contacto que ya tenía.
    ...(datos.has('proximoContacto') ? { proximoContacto: texto(datos, 'proximoContacto') } : {}),
    ...(datos.has('proximoPaso') ? { proximoPaso: texto(datos, 'proximoPaso') } : {}),
    ...(datos.has('observaciones') ? { observaciones: texto(datos, 'observaciones') } : {}),
    ...(resultado === 'venta' && importe !== null && fecha !== null
      ? { venta: { importe, moneda, fecha, programa, cuotas, plan } }
      : {}),
    ...(resultado === 'sena' && importe !== null && fecha !== null
      ? { sena: {
            importe, moneda, fecha,
            saldoPendiente: numero(datos, 'saldoPendiente'),
            fechaComprometida: texto(datos, 'fechaComprometida'),
          } }
      : {}),
  }

  return {
    cambios, salida: elegida, resultado,
    fechaSegunda, horaSegunda: texto(datos, 'horaSegunda'),
    proximoPaso: texto(datos, 'proximoPaso'),
  }
}
