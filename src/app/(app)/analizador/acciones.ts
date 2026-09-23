'use server'

import { exigirUsuario } from '@/lib/auth'
import { probarConexion, type Diagnostico } from '@/ia/prueba'

/**
 * Probar la conexión con el modelo desde la pantalla.
 *
 * Sin permiso especial: cualquiera que entre al Analizador y vea que no anda
 * tiene que poder averiguar por qué sin pedirle a otro que mire los logs. No
 * devuelve la clave, sólo su huella.
 */
export async function probarConexionAccion(): Promise<Diagnostico> {
  await exigirUsuario()
  return probarConexion()
}
