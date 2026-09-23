'use client'

import { useState } from 'react'
import { FASES_POR_DEFECTO, type Fase } from '@/dominio/fases'

/**
 * Las fases del guion, editables.
 *
 * Es contra esto que se mide la adherencia, así que tiene que poder cambiarlo
 * el equipo y no un programador: el día que el script cambie, el informe mide
 * el script nuevo o deja de servir.
 *
 * Arranca con las fases del playbook vigente —o las de por defecto si todavía
 * no hay— porque una pantalla en blanco acá termina en un playbook sin fases,
 * y un playbook sin fases da 0% de adherencia sin que eso signifique nada.
 */
export function FasesDelPlaybook({ iniciales }: { iniciales?: Fase[] }) {
  const [fases, setFases] = useState<Fase[]>(
    iniciales && iniciales.length > 0 ? iniciales : FASES_POR_DEFECTO)

  const total = fases.reduce((s, f) => s + (Number(f.peso) || 0), 0)

  const cambiar = (i: number, campo: keyof Fase, valor: string) =>
    setFases(fases.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)))

  return (
    <div>
      <div className="entre" style={{ marginBottom: 8 }}>
        <span className="etiqueta">Las fases del guion</span>
        <span style={{ fontSize: 12.5, color: total === 100 ? 'var(--gris)' : 'var(--rojo)' }}>
          los pesos suman {total}%{total === 100 ? '' : ' · tienen que sumar 100'}
        </span>
      </div>

      <div className="apilado" style={{ gap: 10 }}>
        {fases.map((f, i) => (
          <div key={i} className="tarjeta plana" style={{ padding: 10 }}>
            <div className="fila" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
              <div className="campo" style={{ flex: 1, marginBottom: 0 }}>
                <label className="oculto" htmlFor={`f${i}n`}>Nombre de la fase {i + 1}</label>
                <input id={`f${i}n`} name={`fase${i}Nombre`} value={f.nombre} placeholder="Nombre de la fase"
                       onChange={(e) => cambiar(i, 'nombre', e.target.value)} />
              </div>
              <div className="campo" style={{ marginBottom: 0, width: 92 }}>
                <label className="oculto" htmlFor={`f${i}p`}>Peso</label>
                <input id={`f${i}p`} name={`fase${i}Peso`} value={String(f.peso)} inputMode="numeric"
                       placeholder="%" onChange={(e) => cambiar(i, 'peso', e.target.value)} />
              </div>
              <button type="button" className="sutil" style={{ fontSize: 11.5 }}
                      onClick={() => setFases(fases.filter((_, j) => j !== i))}>
                Sacar
              </button>
            </div>
            <div className="campo" style={{ marginTop: 8, marginBottom: 0 }}>
              <label className="oculto" htmlFor={`f${i}o`}>Qué tiene que lograr</label>
              <input id={`f${i}o`} name={`fase${i}Objetivo`} value={f.objetivo}
                     placeholder="Qué tiene que lograr esta fase"
                     onChange={(e) => cambiar(i, 'objetivo', e.target.value)} />
            </div>
            <div className="campo" style={{ marginTop: 6, marginBottom: 0 }}>
              <label className="oculto" htmlFor={`f${i}c`}>Cómo se hace acá</label>
              <input id={`f${i}c`} name={`fase${i}Como`} value={f.comoSeHace}
                     placeholder="Cómo se hace acá: la pregunta literal, la fórmula, el orden"
                     onChange={(e) => cambiar(i, 'comoSeHace', e.target.value)} />
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="secundario chico" style={{ marginTop: 10 }}
              onClick={() => setFases([
                ...fases,
                { clave: '', nombre: '', peso: 0, objetivo: '', comoSeHace: '' } as Fase,
              ])}>
        Agregar una fase
      </button>

      <div className="nota" style={{ marginTop: 8 }}>
        El informe evalúa cada fase contra lo que dice acá: «qué tiene que lograr» es el criterio
        y «cómo se hace acá» es la forma de ustedes. Cuanto más literal la segunda —la pregunta
        exacta, la fórmula— más útil es medir si se siguió.
      </div>
    </div>
  )
}
