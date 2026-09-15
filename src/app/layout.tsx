import type { Metadata } from 'next'
import './globales.css'

export const metadata: Metadata = {
  title: 'Founders Sales OS',
  description: 'El sistema operativo comercial de Founders.',
}

export default function RaizLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
