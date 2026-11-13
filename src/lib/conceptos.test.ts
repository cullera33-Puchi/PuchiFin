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

import { claveComercio, primeraPalabra } from './conceptos'
import { fechaEfectiva, finDeMes, mesSiguiente } from './imputacion'

describe('claveComercio', () => {
  it('quita números de tienda, referencias, formas jurídicas y relleno', () => {
    expect(claveComercio('Mercadona 1234 La Plaza')).toBe('mercadona plaza')
    expect(claveComercio('PayPal Europe S.a.r.l. et Cie S.C.A')).toBe('paypal europe')
    expect(claveComercio('Tienda Centro 01234')).toBe('tienda centro')
    expect(claveComercio('Pago con tarjeta ************1234 Cafe Roma')).toBe('cafe roma')
    expect(primeraPalabra('mercadona plaza')).toBe('mercadona')
    expect(primeraPalabra('bar')).toBeNull()
  })
})

describe('imputación al mes siguiente', () => {
  it('fecha efectiva y fin de mes', () => {
    expect(fechaEfectiva({ fecha_operacion: '2026-10-30', mes_imputacion: '2026-11' })).toBe('2026-11-01')
    expect(fechaEfectiva({ fecha_operacion: '2026-10-30', mes_imputacion: null })).toBe('2026-10-30')
    expect(finDeMes('2026-10-27', 5)).toBe(true)
    expect(finDeMes('2026-10-26', 5)).toBe(false)
    expect(finDeMes('2026-02-24', 5)).toBe(true)
    expect(finDeMes('2026-10-31', 0)).toBe(false)
    expect(mesSiguiente('2026-12-31')).toBe('2027-01')
  })
})
