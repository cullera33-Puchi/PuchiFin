import { describe, expect, it } from 'vitest'
import casos from '../../tests/fixtures/casos_identificativos.json'
import {
  contieneIdentificativo,
  detectarIdentificativos,
  enmascarar,
  luhnValido,
  validarAlias,
} from './identificativos'

describe('detectarIdentificativos', () => {
  it.each(casos.positivos)('detecta $tipo en "$texto"', ({ texto, tipo }) => {
    const hallazgos = detectarIdentificativos(texto)
    expect(hallazgos.map((h) => h.tipo)).toContain(tipo)
  })

  it.each(casos.negativos)('no marca "%s"', (texto) => {
    expect(contieneIdentificativo(texto)).toBe(false)
  })

  it('no expone el dato completo en la muestra', () => {
    const [h] = detectarIdentificativos('TRANSF ES9121000418450200051332')
    expect(h.muestra).not.toContain('2100')
    expect(h.muestra.endsWith('1332')).toBe(true)
  })

  it('encuentra varios datos en el mismo texto, en orden', () => {
    const hallazgos = detectarIdentificativos('12345678Z PAGA CON 4111 1111 1111 1111')
    expect(hallazgos.map((h) => h.tipo)).toEqual(['dni', 'tarjeta'])
  })

  it('acepta null y undefined', () => {
    expect(contieneIdentificativo(null)).toBe(false)
    expect(contieneIdentificativo(undefined)).toBe(false)
  })
})

describe('luhnValido', () => {
  it('valida tarjetas de prueba conocidas', () => {
    expect(luhnValido('4111111111111111')).toBe(true)
    expect(luhnValido('4111111111111112')).toBe(false)
  })
})

describe('enmascarar', () => {
  it('deja visibles los cuatro últimos caracteres', () => {
    expect(enmascarar('4111 1111 1111 1111')).toBe('************1111')
    expect(enmascarar('123')).toBe('***')
  })
})

describe('validarAlias', () => {
  it.each(['Cuenta principal', 'Cuenta 2', 'Tarjeta', 'Hipoteca'])('acepta "%s"', (alias) => {
    expect(validarAlias(alias)).toBeNull()
  })

  it('rechaza alias vacíos o demasiado largos', () => {
    expect(validarAlias('  ')).not.toBeNull()
    expect(validarAlias('x'.repeat(41))).not.toBeNull()
  })

  it('rechaza IBAN, tarjetas y series largas de dígitos', () => {
    expect(validarAlias('ES91 2100 0418 4502 0005 1332')).toMatch(/IBAN/)
    expect(validarAlias('Visa 4111111111111111')).toMatch(/tarjeta/)
    expect(validarAlias('Cuenta 0200051332')).toMatch(/dígitos/)
  })
})
