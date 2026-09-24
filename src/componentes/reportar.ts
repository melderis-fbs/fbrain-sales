import type { LeadEnLista } from '@/datos/leads'
import type { Estado, Resultado, MotivoPerdida, TipoSesion } from '@/dominio/resultados'

/**
 * Lo que el reporte de una llamada necesita saber del lead.
 *
 * Vive en un módulo aparte —sin `'use client'`— porque lo usan los dos lados:
 * las pantallas son de servidor y arman los datos, el formulario es de
 * cliente y los dibuja. Exportar la función desde el componente parecía más
 * corto y no funciona: React no deja llamar desde el servidor una función que
 * declaraste del cliente, y la pantalla revienta entera.
 */
export type LeadParaReportar = {
  id: number
  nombre: string
  empresa: string | null
  closer: string | null
  tipoSesion: TipoSesion
  fuente: string | null
  moneda: string
  fechaSesion: string | null
  estado: Estado
  resultado: Resultado
  huboOferta: boolean
  seguimientoLargo: string | null
  motivoPerdida: MotivoPerdida | null
  venta: { importe: number; fecha: string; programa: string | null; cuotas: number | null } | null
  /** Lo que ya está cargado del plan de pagos, para abrir mostrándolo. */
  plan: { n: number; importe: number; fecha: string; medio: string | null; pagado: boolean }[]
}

/**
 * De lo que la lista sabe del lead a lo que el reporte necesita.
 *
 * Lo usan las cuatro pantallas que listan llamadas —Llamadas, sus atrasadas,
 * la agenda del Tracker y las que quedaron sin cargar— y tienen que abrir el
 * mismo formulario con los mismos datos. El reporte no consulta nada por su
 * cuenta: una lista de cuarenta llamadas no dispara cuarenta consultas para
 * dibujar cuarenta botones.
 */
export function paraReportar(l: LeadEnLista): LeadParaReportar {
  return {
    id: l.id, nombre: l.nombre, empresa: l.empresa, closer: l.closer,
    tipoSesion: l.tipoSesion, fuente: l.fuente,
    moneda: l.moneda, fechaSesion: l.fechaSesion,
    estado: l.estado, resultado: l.resultado,
    huboOferta: l.huboOferta, seguimientoLargo: l.seguimientoLargo,
    motivoPerdida: l.motivoPerdida,
    venta: l.vendido !== null && l.ventaFecha !== null
      ? { importe: l.vendido, fecha: l.ventaFecha,
          programa: l.ventaPrograma, cuotas: l.ventaCuotas }
      : null,
    plan: l.plan,
  }
}
