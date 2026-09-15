import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derivar = promisify(pbkdf2)

// 210.000 iteraciones de PBKDF2-SHA512 es lo que recomienda OWASP hoy.
// No se usa bcrypt para no arrastrar una dependencia nativa a Vercel.
const ITERACIONES = 210_000
const LARGO = 64
const DIGEST = 'sha512'

export async function hashDeClave(clave: string): Promise<string> {
  const sal = randomBytes(16)
  const hash = (await derivar(clave, sal, ITERACIONES, LARGO, DIGEST)) as Buffer
  return `pbkdf2$${ITERACIONES}$${sal.toString('hex')}$${hash.toString('hex')}`
}

export async function claveCoincide(clave: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$')
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false
  const iteraciones = Number(partes[1])
  const sal = Buffer.from(partes[2] ?? '', 'hex')
  const esperado = Buffer.from(partes[3] ?? '', 'hex')
  if (!Number.isFinite(iteraciones) || sal.length === 0 || esperado.length === 0) return false

  const hash = (await derivar(clave, sal, iteraciones, esperado.length, DIGEST)) as Buffer
  // Comparación de tiempo constante: comparar con === filtra información.
  return timingSafeEqual(hash, esperado)
}
