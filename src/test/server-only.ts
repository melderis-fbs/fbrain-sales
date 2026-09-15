/**
 * `server-only` en las pruebas.
 *
 * El paquete real tira si lo importa un módulo de cliente. Bajo vitest no hay
 * bundler que distinga las dos cosas, así que resolvería siempre a la versión
 * que rompe. Este archivo lo reemplaza y no hace nada: la garantía la sigue
 * dando Next.js en el build, que es donde importa.
 */
export {}
