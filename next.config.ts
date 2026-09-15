import type { NextConfig } from 'next'

/**
 * Sin configuración.
 *
 * Todas las páginas leen de la base en cada pedido y ya lo declaran una por una
 * con `dynamic = 'force-dynamic'`. Lo que había acá —`experimental.serverActions`
 * con el tope de 1 MB— es exactamente el valor por defecto, así que no cambiaba
 * nada y prendía la advertencia de «experiments» en cada build.
 *
 * Lo que sí es grande —transcripciones, planillas— no va a entrar por una acción
 * de servidor sino por un route handler, que no tiene ese tope.
 */
const config: NextConfig = {}

export default config
