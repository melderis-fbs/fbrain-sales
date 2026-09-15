import { describe, it, expect } from 'vitest'
import { clave, plegar, soloDigitos, colaDelTelefono, emailPlegado, oNulo } from './texto'

describe('clave: para decidir si son el mismo', () => {
  it('normaliza espacios y nada más', () => {
    expect(clave('  María   Fernández ')).toBe('María Fernández')
  })

  it('NO pliega acentos: María y Maria siguen siendo distintas', () => {
    // El sistema no decide por parecido. Avisa y decide una persona.
    expect(clave('María')).not.toBe(clave('Maria'))
  })
})

describe('plegar: para avisar de un posible duplicado', () => {
  it('saca acentos y mayúsculas', () => {
    expect(plegar('María Fernández')).toBe('maria fernandez')
    expect(plegar('MARIA FERNANDEZ')).toBe('maria fernandez')
  })
})

describe('teléfono y email', () => {
  it('un teléfono son sus dígitos', () => {
    expect(soloDigitos('+54 9 11 5555-1234')).toBe('5491155551234')
    expect(soloDigitos('sin número')).toBeNull()
  })

  it('un email se compara en minúscula', () => {
    expect(emailPlegado('  Maria@Founders.COM ')).toBe('maria@founders.com')
  })
})

describe('oNulo', () => {
  it('vacío es null, no cadena vacía', () => {
    expect(oNulo('   ')).toBeNull()
    expect(oNulo('algo')).toBe('algo')
  })
})

describe('la cola del teléfono', () => {
  it('encuentra el mismo número escrito con y sin país', () => {
    expect(colaDelTelefono('+54 9 11 5555-1234')).toBe('55551234')
    expect(colaDelTelefono('11 5555 1234')).toBe('55551234')
    expect(colaDelTelefono('+54 9 11 5555-1234')).toBe(colaDelTelefono('11 5555 1234'))
  })

  it('un número corto se compara entero', () => {
    expect(colaDelTelefono('4321')).toBe('4321')
    expect(colaDelTelefono(null)).toBeNull()
  })
})
