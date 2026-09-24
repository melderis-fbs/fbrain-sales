import 'server-only'

/**
 * Qué versión está corriendo.
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
  /** El commit, cortito. Dice QUÉ CÓDIGO corre. */
  commit: string | null
  /**
   * El id del build. Dice QUÉ BUILD corre, que no es lo mismo.
   *
   * Esta distinción costó una ronda entera. Dos pantallas mostraban el mismo
   * commit y contestaban distinto, y el commit hacía parecer imposible lo que
   * estaba pasando. Pero un mismo commit se publica muchas veces: cada vez
   * que se toca una variable de entorno y se le da «Redeploy» sale un build
   * nuevo, con el mismo commit y con OTRAS variables adentro. Las variables
   * se congelan en el build, no en el código.
   *
   * Así que el commit no alcanza para contestar «¿estamos en el mismo
   * deploy?» —que es la pregunta detrás de «a mí me anda y a vos no»— y esto
   * sí.
   */
  despliegue: string | null
  rama: string | null
  /** El título del commit: dice qué trae, sin ir a buscarlo a GitHub. */
  mensaje: string | null
  /** `production`, `preview` o `development`. */
  entorno: string
}

/**
 * El id de build, cortito y comparable.
 *
 * Se muestra para que dos personas comparen dos renglones, no para buscarlo
 * en ningún lado: con la cola alcanza y sobra para ver si coinciden.
 */
function corto(id: string): string {
  const limpio = id.replace(/^dpl_/, '')
  return limpio.length <= 10 ? limpio : `…${limpio.slice(-10)}`
}

export function versionQueCorre(): Version {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null
  // VERCEL_DEPLOYMENT_ID es el dato bueno. Si no está, la URL del deploy
  // también es única por build y sirve igual para comparar.
  const build = process.env.VERCEL_DEPLOYMENT_ID?.trim() || process.env.VERCEL_URL?.trim() || null
  return {
    commit: sha === null ? null : sha.slice(0, 7),
    despliegue: build === null ? null : corto(build),
    rama: process.env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    // El mensaje viene entero; acá sólo sirve el título.
    mensaje: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0]?.trim() || null,
    entorno: process.env.VERCEL_ENV?.trim() || 'local',
  }
}
