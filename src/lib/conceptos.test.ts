import { describe, expect, it } from 'vitest'
import { normalizarConcepto } from './conceptos'

describe('normalizarConcepto', () => {
  it('quita acentos, signos y espacios de más', () => {
    expect(normalizarConcepto('  CAFETERÍA  Luna, S.L. ')).toBe('cafeteria luna s l')
    expect(normalizarConcepto('Nómina   octubre')).toBe('nomina octubre')
  })

  it('conserva los asteriscos del enmascarado', () => {
    expect(normalizarConcepto('TARJ ************1234')).toBe('tarj ************1234')
  })
})
