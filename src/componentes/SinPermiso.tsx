import Link from 'next/link'
import { NOMBRE_DE_ROL, HOME_DE_ROL, type Rol } from '@/dominio/roles'

/**
 * «Esto no lo hacés vos.»
 *
 * Existe porque la alternativa era peor de lo que parecía: las pantallas que
 * exigían un permiso lo hacían tirando una excepción, y una excepción en el
 * render de una pantalla es un 500 —«Algo se rompió en esta pantalla»—. Del
 * otro lado eso no se lee como «no tenés permiso»: se lee como que la
 * aplicación está rota, y es exactamente lo que hizo que un closer reportara
 * que no podía entrar al Analizador cuando en realidad sí podía.
 *
 * Un permiso que falta es una respuesta, no un error. Se dice con todas las
 * letras, se dice QUIÉN puede, y se deja una salida.
 */
export function SinPermiso({ rol, que, quien = 'Dirección' }: {
  rol: Rol
  /** Qué se estaba intentando hacer, en palabras: «cambiar la configuración». */
  que: string
  quien?: string
}) {
  return (
    <div className="apilado" style={{ maxWidth: 560 }}>
      <div className="aviso atencion">
        <strong>Esto no lo hace tu rol.</strong> {que[0]?.toUpperCase()}{que.slice(1)} lo hace{' '}
        {quien}. Tu cuenta es <strong>{NOMBRE_DE_ROL[rol]}</strong>, y no es un error: es la
        única parte de la aplicación que no tocan closers ni setters, porque no es el dato de
        un lead — es cómo se mide a todos.
      </div>
      <div className="fila">
        <Link className="boton" href={HOME_DE_ROL[rol]}>Volver a lo tuyo</Link>
      </div>
    </div>
  )
}
