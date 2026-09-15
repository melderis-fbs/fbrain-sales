import type { NextConfig } from 'next'

const config: NextConfig = {
  // Las páginas leen de la base en cada pedido: nada de esto se puede pre-generar.
  experimental: { serverActions: { bodySizeLimit: '1mb' } },
}

export default config
