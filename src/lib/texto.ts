/**
 * Comparar nombres sin decidir por parecido.
 *
 * Dos funciones distintas y la diferencia es importante:
 *
 *  - `clave()` normaliza espacios y nada más. «María» y «Maria» siguen siendo
 *    distintas. Es lo que se usa para decidir si dos registros son el mismo.
 *  - `plegar()` saca acentos y mayúsculas. Es lo que se usa para AVISAR de un
 *    posible duplicado. Nunca para unir dos leads solo.
 *
 * El sistema no adivina que dos personas son la misma: lo informa y decide
 * alguien.
 */

export function clave(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ')
}

export function plegar(texto: string): string {
  return clave(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Un teléfono son sus dígitos. El resto es cómo lo escribió cada uno. */
export function soloDigitos(texto: string | null | undefined): string | null {
  if (!texto) return null
  const d = texto.replace(/\D/g, '')
  return d === '' ? null : d
}

/**
 * Los últimos dígitos de un teléfono.
 *
 * «+54 9 11 5555-1234» y «11 5555 1234» son la misma persona escrita por dos
 * personas distintas: una puso el país y la otra no. Comparar los dígitos
 * completos no los encuentra.
 *
 * Ocho dígitos alcanza para que el aviso sirva y no es un problema que a veces
 * marque de más: esto sólo AVISA de un posible duplicado, no une nada. Un falso
 * aviso cuesta una mirada; un duplicado que no se avisa cuesta un lead partido
 * en dos.
 */
export function colaDelTelefono(texto: string | null | undefined): string | null {
  const d = soloDigitos(texto)
  if (d === null || d.length < 8) return d
  return d.slice(-8)
}

/** Un email se compara en minúscula y sin espacios. */
/**
 * ¿Esto parece un email?
 *
 * A propósito flojo: algo, un arroba, algo, un punto, algo. No valida
 * direcciones —eso lo hace el servidor de correo— sino que distingue un email
 * de «no tiene», «-» o «preguntar», que es lo que trae de verdad la columna
 * «email» de una planilla.
 */
export function pareceEmail(texto: string | null | undefined): boolean {
  if (!texto) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim())
}

/**
 * El email normalizado, para buscar y para detectar duplicados.
 *
 * Lo que NO parece un email no se pliega: queda `null`. Si no, dos leads cuyo
 * email decía «no tiene» se detectaban como la misma persona —mismo email—, y
 * el aviso de duplicado empieza a mentir justo donde tiene que ser creíble.
 */
export function emailPlegado(texto: string | null | undefined): string | null {
  if (!pareceEmail(texto)) return null
  return texto!.trim().toLowerCase()
}

/** Vacío es vacío, no cadena vacía: un dato que no está no se guarda como ''. */
export function oNulo(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined) return null
  const t = texto.trim()
  return t === '' ? null : t
}
