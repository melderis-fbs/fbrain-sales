import type { Ritmo } from '@/motor/objetivo'
import { Barra, plata } from './Piezas'

const PALABRA: Record<Ritmo['estado'], string> = {
  sobre: 'sobre ritmo',
  en_ritmo: 'en ritmo',
  debajo: 'debajo del ritmo',
}
const COLOR: Record<Ritmo['estado'], 'verde' | 'amarillo' | 'rojo'> = {
  sobre: 'verde', en_ritmo: 'verde', debajo: 'rojo',
}

/**
 * El objetivo del mes.
 *
 * Lo importante no es el 65%: es el 65% contra el 55% que correspondería a esta
 * altura del mes. Por eso la barra lleva una marca en el ritmo esperado.
 */
export function Objetivo({ ritmo, moneda }: { ritmo: Ritmo | null; moneda: string }) {
  if (!ritmo) {
    return (
      <section className="tarjeta">
        <div className="etiqueta">Objetivo del mes</div>
        <div className="sindato" style={{ marginTop: 6 }}>
          No hay objetivo cargado para este período.
        </div>
        <div className="contra">Se carga en Configuración. Sin objetivo no se puede decir si vamos bien.</div>
      </section>
    )
  }

  return (
    <section className="tarjeta">
      <div className="entre">
        <div>
          <div className="etiqueta">Objetivo del mes</div>
          <div className="numero">
            {plata(ritmo.logrado, moneda)}
            <span style={{ fontSize: '.5em', color: 'var(--gris)', fontWeight: 700 }}> / {plata(ritmo.objetivo, moneda)}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="numero chico">{ritmo.alcanzado}%</div>
          <span className={`pildora ${COLOR[ritmo.estado]}`}>
            {ritmo.desvio > 0 ? '+' : ''}{ritmo.desvio} pts · {PALABRA[ritmo.estado]}
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', marginTop: 12 }}>
        <Barra porcentaje={ritmo.alcanzado} color={COLOR[ritmo.estado]} />
        {/* La marca del ritmo esperado: dónde deberíamos estar hoy. */}
        <div
          title={`Ritmo esperado a esta altura del mes: ${ritmo.ritmoEsperado}%`}
          style={{
            position: 'absolute', top: -3, bottom: -3,
            left: `${Math.min(100, ritmo.ritmoEsperado)}%`,
            width: 2, background: 'var(--negro)',
          }}
        />
      </div>

      <div className="contra">
        Día {ritmo.diasTranscurridos} de {ritmo.diasTotales} hábiles · ritmo esperado {ritmo.ritmoEsperado}%
      </div>
    </section>
  )
}
