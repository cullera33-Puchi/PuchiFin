import { describe, expect, it } from 'vitest'
import { formatearFecha, formatearImporte, formatearMes } from './formato'

describe('formatearImporte', () => {
  it('usa punto de miles, coma decimal y símbolo al final', () => {
    expect(formatearImporte(1234.56)).toBe('1.234,56 €')
    expect(formatearImporte(75000)).toBe('75.000,00 €')
  })

  it('agrupa también los importes de cuatro cifras', () => {
    expect(formatearImporte(1000)).toBe('1.000,00 €')
  })

  it('mantiene el signo de los gastos', () => {
    expect(formatearImporte(-45.2)).toBe('-45,20 €')
  })

  it('no muestra cero negativo', () => {
    expect(formatearImporte(-0.001)).toBe('0,00 €')
  })
})

describe('fechas', () => {
  it('formatea fechas ISO en dd/mm/aaaa', () => {
    expect(formatearFecha('2026-10-01')).toBe('01/10/2026')
  })

  it('formatea el mes en español', () => {
    expect(formatearMes('2026-11')).toBe('noviembre de 2026')
  })
})
