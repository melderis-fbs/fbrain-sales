import type { SVGProps } from 'react'

/**
 * Los íconos de la navegación.
 *
 * Dibujados a mano y no traídos de una librería: son catorce, pesan unos
 * kilobytes, y una dependencia de íconos se arrastra entera al navegador para
 * usar el 2% de lo que trae.
 *
 * Todos de trazo, del mismo grosor y sobre la misma grilla de 24. Un ícono
 * relleno al lado de trece de trazo se ve como un error, y un ícono que se ve
 * como un error distrae de lo que dice al lado.
 */
type Props = SVGProps<SVGSVGElement>

function Base({ children, ...props }: Props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  )
}

export const Iconos = {
  dashboard: (p: Props) => (
    <Base {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Base>
  ),
  tracker: (p: Props) => (
    <Base {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h.01" />
    </Base>
  ),
  leads: (p: Props) => (
    <Base {...p}>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.87M16.5 4.13a4 4 0 0 1 0 7.75" />
    </Base>
  ),
  llamadas: (p: Props) => (
    <Base {...p}>
      <path d="M21.5 16.9v2.5a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 1.6 3.7 2 2 0 0 1 3.6 1.5h2.5a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.2 9.3a16 16 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </Base>
  ),
  analizador: (p: Props) => (
    <Base {...p}>
      <path d="M3 11v2M7 7v10M11 4v16M15 8v8M19 10v4" />
    </Base>
  ),
  closers: (p: Props) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 19a6.5 6.5 0 0 1 12 0" />
    </Base>
  ),
  setters: (p: Props) => (
    <Base {...p}>
      <path d="M15 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="8.5" cy="7" r="3.5" />
      <path d="M19 8v6M22 11h-6" />
    </Base>
  ),
  matching: (p: Props) => (
    <Base {...p}>
      <path d="M16 3h5v5M21 3l-6.5 6.5M8 21H3v-5M3 21l6.5-6.5" />
      <path d="M21 16v5h-5M15 15l6 6M3 8V3h5M9 9 3 3" />
    </Base>
  ),
  seguimientos: (p: Props) => (
    <Base {...p}>
      <path d="M17 2.5 21 6.5l-4 4" />
      <path d="M3 11.5v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 21.5 3 17.5l4-4" />
      <path d="M21 12.5v1a4 4 0 0 1-4 4H3" />
    </Base>
  ),
  metricas: (p: Props) => (
    <Base {...p}>
      <path d="M3 21h18" />
      <rect x="4" y="12" width="4" height="6" rx="1" />
      <rect x="10" y="7" width="4" height="11" rx="1" />
      <rect x="16" y="3" width="4" height="15" rx="1" />
    </Base>
  ),
  casos: (p: Props) => (
    <Base {...p}>
      <path d="M8 3h8v6a4 4 0 0 1-8 0V3Z" />
      <path d="M8 5H5.5a2.5 2.5 0 0 0 0 5H8M16 5h2.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M12 13v4M9 21h6M10 17h4" />
    </Base>
  ),
  comisiones: (p: Props) => (
    <Base {...p}>
      <path d="M12 2v20" />
      <path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.8 5 3.3 5 1.4 5 3.4-2.2 3.3-5 3.3-5-1.2-5-3.1" />
    </Base>
  ),
  configuracion: (p: Props) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </Base>
  ),
  buscar: (p: Props) => (
    <Base {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Base>
  ),
  salir: (p: Props) => (
    <Base {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </Base>
  ),
}

export type NombreDeIcono = keyof typeof Iconos
