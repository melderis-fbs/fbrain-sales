import { describe, it, expect } from 'vitest'
import { leerPlanilla, leerFecha, leerHora, leerImporte } from './importacion'

const CATALOGOS = {
  fuentes: [{ id: 1, nombre: 'Meta Ads' }],
  funnels: [{ id: 2, nombre: 'VSL' }],
  setters: [{ id: 3, nombre: 'Fabricio' }],
  closers: [{ id: 4, nombre: 'Braian' }, { id: 5, nombre: 'Kevin' }],
}

const planilla = (...lineas: string[]) => lineas.join('\n')

describe('leer una fecha como la escribe la gente', () => {
  it('acepta el formato de acá y el ISO', () => {
    expect(leerFecha('05/08/2026')).toBe('2026-08-05')
    expect(leerFecha('5-8-2026')).toBe('2026-08-05')
    expect(leerFecha('2026-08-05')).toBe('2026-08-05')
    expect(leerFecha('5/8/26')).toBe('2026-08-05')
  })

  it('un día que no existe no se corre al mes siguiente', () => {
    // `new Date` con un 31 de febrero devuelve el 3 de marzo sin quejarse. Eso
    // en una importación es un dato falso que nadie va a revisar.
    expect(leerFecha('31/02/2026')).toBe(null)
    expect(leerFecha('32/01/2026')).toBe(null)
    expect(leerFecha('05/13/2026')).toBe(null)
  })

  it('lo que no se entiende devuelve null, no una fecha inventada', () => {
    expect(leerFecha('agosto')).toBe(null)
    expect(leerFecha('')).toBe(null)
  })
})

describe('leer un importe con el separador que sea', () => {
  it('lee el formato de acá y el inglés', () => {
    expect(leerImporte('3.500')).toBe(3500)      // miles, como en una planilla de acá
    expect(leerImporte('3,500')).toBe(3500)      // miles, en inglés
    expect(leerImporte('3.500,50')).toBe(3500.5)
    expect(leerImporte('3,500.50')).toBe(3500.5)
    expect(leerImporte('3500')).toBe(3500)
  })

  it('el último separador es el decimal, salvo que lo que sigue sean tres dígitos', () => {
    expect(leerImporte('1,5')).toBe(1.5)
    expect(leerImporte('1.5')).toBe(1.5)
  })

  it('se saca el símbolo de moneda y lo que no sea número', () => {
    expect(leerImporte('USD 3.500')).toBe(3500)
    expect(leerImporte('$ 3500')).toBe(3500)
  })

  it('lo que no es un número no vale cero', () => {
    expect(leerImporte('a convenir')).toBe(null)
    expect(leerImporte('')).toBe(null)
  })
})

describe('leer una hora', () => {
  it('acepta lo que se escribe a las apuradas', () => {
    expect(leerHora('14:30')).toBe('14:30')
    expect(leerHora('14.30')).toBe('14:30')
    expect(leerHora('9')).toBe('09:00')
  })
  it('una hora que no existe no se importa', () => {
    expect(leerHora('27:00')).toBe(null)
    expect(leerHora('mediodía')).toBe(null)
  })
})

describe('leer la planilla', () => {
  it('sin encabezados no adivina qué es cada columna', () => {
    // Importar tomando la primera fila como datos mete un lead llamado
    // «Nombre» y corre todo lo demás un lugar.
    const r = leerPlanilla(planilla('María\t05/08/2026'), CATALOGOS)
    expect(r.problema).toMatch(/encabezados/i)
    expect(r.filas).toEqual([])
  })

  it('entiende los encabezados como ya se llaman en la planilla del equipo', () => {
    const r = leerPlanilla(planilla(
      'Cliente\tMail\tCelular\tFecha de la reunión\tAsistió\tResultado\tMonto',
      'María Fernández\tmaria@ej.com\t1155551234\t05/08/2026\tSí\tVendido\tUSD 3.500',
    ), CATALOGOS)
    expect(r.problema).toBe(null)
    const f = r.filas[0]!
    expect(f.nombre).toBe('María Fernández')
    expect(f.email).toBe('maria@ej.com')
    expect(f.fechaSesion).toBe('2026-08-05')
    expect(f.estado).toBe('asistio')
    expect(f.resultado).toBe('venta')
    expect(f.importe).toBe(3500)
    expect(f.errores).toEqual([])
  })

  it('una columna que no conoce se ignora y lo dice, en vez de romper la importación', () => {
    const r = leerPlanilla(planilla(
      'Nombre\tSigno del zodíaco',
      'María\tPiscis',
    ), CATALOGOS)
    expect(r.columnasIgnoradas).toEqual(['Signo del zodíaco'])
    expect(r.filas[0]?.errores).toEqual([])
  })

  it('el closer se busca por nombre, y uno que no existe frena la fila', () => {
    // El closer decide de quién es el lead. Importarlo sin closer sería
    // repetir el error que hizo que Braian no viera lo que cargaba.
    const r = leerPlanilla(planilla(
      'Nombre\tCloser',
      'María\tBraian',
      'Pedro\tBriann',
    ), CATALOGOS)
    expect(r.filas[0]?.closerId).toBe(4)
    expect(r.filas[1]?.errores.join(' ')).toMatch(/Briann/)
    expect(r.filas[1]?.errores.join(' ')).toMatch(/Configuración/)
  })

  it('sin columna de closer, el lead es de quien está importando', () => {
    const r = leerPlanilla(planilla('Nombre', 'María'), CATALOGOS, { closerId: 4 })
    expect(r.filas[0]?.closerId).toBe(4)
  })

  it('una fuente que no existe avisa pero no frena: es un dato de análisis', () => {
    const r = leerPlanilla(planilla(
      'Nombre\tFuente',
      'María\tInstagram',
    ), CATALOGOS)
    expect(r.filas[0]?.errores).toEqual([])
    expect(r.filas[0]?.avisos.join(' ')).toMatch(/ninguna fuente que se llame «Instagram»/)
    expect(r.filas[0]?.fuenteId).toBe(null)
  })

  it('una venta sin importe no entra: es facturación que no se puede contar', () => {
    const r = leerPlanilla(planilla(
      'Nombre\tFecha\tResultado\tMonto',
      'María\t05/08/2026\tVendido\t',
    ), CATALOGOS)
    expect(r.filas[0]?.errores.join(' ')).toMatch(/importe/i)
  })

  it('un cobro sin venta tampoco: el cobro tiene que ser de algo', () => {
    const r = leerPlanilla(planilla(
      'Nombre\tFecha\tCobrado',
      'María\t05/08/2026\t2000',
    ), CATALOGOS)
    expect(r.filas[0]?.errores.join(' ')).toMatch(/cobro/i)
  })

  it('una fecha mal escrita frena la fila y dice cuál y cómo se escribe', () => {
    const r = leerPlanilla(planilla(
      'Nombre\tFecha',
      'María\t5 de agosto',
    ), CATALOGOS)
    expect(r.filas[0]?.errores.join(' ')).toMatch(/5 de agosto/)
    expect(r.filas[0]?.errores.join(' ')).toMatch(/05\/08\/2026/)
  })

  it('cada fila sabe en qué línea de la planilla está', () => {
    // Sin esto, «hay tres filas con error» no sirve para nada: hay que
    // poder ir a buscarlas.
    const r = leerPlanilla(planilla('Nombre', 'A', 'B', 'C'), CATALOGOS)
    expect(r.filas.map((f) => f.linea)).toEqual([2, 3, 4])
  })

  it('lee también planillas separadas por punto y coma', () => {
    const r = leerPlanilla(planilla('Nombre;Fecha', 'María;05/08/2026'), CATALOGOS)
    expect(r.filas[0]?.nombre).toBe('María')
    expect(r.filas[0]?.fechaSesion).toBe('2026-08-05')
  })

  it('el estado se entiende escrito como lo escribe un closer apurado', () => {
    const r = leerPlanilla(planilla(
      'Nombre\tEstado',
      'A\tno show', 'B\tNo vino', 'C\tcanceló', 'D\tReagendó', 'E\tvino',
    ), CATALOGOS)
    expect(r.filas.map((f) => f.estado))
      .toEqual(['no_show', 'no_show', 'cancelado', 'reagendado', 'asistio'])
  })

  it('un estado que no se entiende frena la fila en vez de dejarlo en agendado', () => {
    // Importarlo como «agendado» lo metería en «reuniones sin cargar» para
    // siempre, y el equipo no sabría por qué.
    const r = leerPlanilla(planilla('Nombre\tEstado', 'A\tmas o menos'), CATALOGOS)
    expect(r.filas[0]?.errores.join(' ')).toMatch(/mas o menos/)
  })
})


describe('la columna «email» de una planilla trae de todo', () => {
  it('lo que no es un email no se guarda como email, y se avisa', () => {
    // Guardarlo tenía dos costos y los dos se pagaban después: dos leads con
    // «no tiene» se detectaban como la misma persona, y la ficha quedaba con
    // un campo que el navegador considera inválido, así que el formulario
    // entero dejaba de guardar y no había forma de saber por qué.
    const { filas } = leerPlanilla(
      'Nombre\tEmail\nMaría\tno tiene', CATALOGOS)
    expect(filas[0]?.email).toBe(null)
    expect(filas[0]?.avisos.join(' ')).toContain('no es un email')
  })

  it('y un email de verdad entra como estaba', () => {
    const { filas } = leerPlanilla(
      'Nombre\tEmail\nMaría\tmaria@ejemplo.com', CATALOGOS)
    expect(filas[0]?.email).toBe('maria@ejemplo.com')
    expect(filas[0]?.avisos).toEqual([])
  })
})

describe('la hora', () => {
  it('«2 pm» son las 14, no las 2 de la madrugada', () => {
    // Sin esto la reunión de la tarde entraba a la madrugada, la agenda del
    // día quedaba mal ordenada y nadie sospechaba del importador.
    expect(leerHora('2 pm')).toBe('14:00')
    expect(leerHora('2:30 PM')).toBe('14:30')
    expect(leerHora('12 am')).toBe('00:00')
    expect(leerHora('12 pm')).toBe('12:00')
    expect(leerHora('9 am')).toBe('09:00')
    expect(leerHora('14:30')).toBe('14:30')
  })
})
