import 'server-only'

/**
 * Qué versión del código está corriendo.
 *
 * Existe porque costó tres idas y vueltas: se arreglaba un número, se
 * publicaba, y del otro lado seguía mal. No estaba mal el arreglo —estaba
 * mirando un deploy anterior— y no había forma de saberlo desde la
 * aplicación. «Sigue apareciendo mal» y «todavía no salió» se ven igual en la
 * pantalla, y son dos problemas distintos que se arreglan en lugares
 * distintos.
 *
 * Las variables las pone Vercel sola en cada build. Fuera de Vercel no hay
 * nada que poner, y decirlo es mejor que inventar un número.
 */
export type Version = {
  /** El commit, cortito. Es el único dato que de verdad identifica el deploy. */
  commit: string | null
  rama: string | null
  /** El título del commit: dice qué trae, sin ir a buscarlo a GitHub. */
  mensaje: string | null
  /** `production`, `preview` o `development`. */
  entorno: string
}

export function versionQueCorre(): Version {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null
  return {
    commit: sha === null ? null : sha.slice(0, 7),
    rama: process.env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    // El mensaje viene entero; acá sólo sirve el título.
    mensaje: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0]?.trim() || null,
    entorno: process.env.VERCEL_ENV?.trim() || 'local',
  }
}
