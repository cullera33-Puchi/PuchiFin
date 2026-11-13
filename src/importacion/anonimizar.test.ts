import { describe, expect, it } from 'vitest'
import { contieneIdentificativo } from '../lib/identificativos'
import { anonimizarConcepto, aplicarAlias, enmascararNumeros, quitarNombres } from './anonimizar'

const ALIAS = [
  { alias: 'Empresa', patrones: ['ACME Consulting'] },
  { alias: 'Familia', patrones: ['María García López'] },
  { alias: 'Otros', patrones: [] },
]

describe('enmascararNumeros', () => {
  it.each([
    ['TRANSFERENCIA A ES91 2100 0418 4502 0005 1332', 'TRANSFERENCIA A **** **** **** **** **** 1332'],
    ['COMPRA TARJ. 4940 1912 3456 7890 MERCADONA', 'COMPRA TARJ. **** **** **** 7890 MERCADONA'],
    ['TARJETA 4940XXXXXXXX1234', 'TARJETA ************1234'],
    ['CTA. 0182-1234-56-7890123456', 'CTA. ****-****-**-******3456'],
    ['TITULAR 12345678Z', 'TITULAR *********'],
    ['NIE X1234567L PAGO', 'NIE ********* PAGO'],
  ])('%s', (entrada, salida) => {
    const r = enmascararNumeros(entrada)
    expect(r).toBe(salida)
    expect(contieneIdentificativo(r)).toBe(false)
  })

  it('no toca importes, fechas ni referencias cortas', () => {
    expect(enmascararNumeros('RECIBO 13/11/2026 REF 12345 IMPORTE 1.234,56')).toBe('RECIBO 13/11/2026 REF 12345 IMPORTE 1.234,56')
  })

  it('enmascara IBAN parciales', () => {
    const r = enmascararNumeros('TRANSF ES21 0049 1500')
    expect(r).not.toContain('0049')
  })
})

describe('terceros', () => {
  it('sustituye el nombre por su alias sin distinguir mayúsculas ni acentos', () => {
    expect(aplicarAlias('TRANSFERENCIA DE ACME CONSULTING SL NOMINA', ALIAS)).toBe('TRANSFERENCIA DE Empresa SL NOMINA')
    expect(aplicarAlias('BIZUM DE MARIA GARCIA LOPEZ CENA', ALIAS)).toBe('BIZUM DE Familia CENA')
  })

  it('no sustituye dentro de otra palabra', () => {
    expect(aplicarAlias('ACMEX CONSULTING', [{ alias: 'Empresa', patrones: ['ACME'] }])).toBe('ACMEX CONSULTING')
  })

  it('quita el nombre sin alias y conserva el concepto desde la palabra clave', () => {
    expect(quitarNombres('TRANSFERENCIA DE JUAN PEREZ RUIZ NOMINA OCTUBRE', ALIAS)).toBe('TRANSFERENCIA DE NOMINA OCTUBRE')
    expect(quitarNombres('BIZUM ENVIADO A PEDRO SANCHEZ', ALIAS)).toBe('BIZUM ENVIADO A')
    expect(quitarNombres('TRANSFERENCIA RECIBIDA DE ANA LOPEZ - REGALO', ALIAS)).toBe('TRANSFERENCIA RECIBIDA DE - REGALO')
  })

  it('deja el alias si ya está', () => {
    expect(quitarNombres('TRANSFERENCIA DE Empresa NOMINA OCTUBRE', ALIAS)).toBe('TRANSFERENCIA DE Empresa NOMINA OCTUBRE')
  })

  it('no toca conceptos que no son transferencias', () => {
    expect(quitarNombres('MERCADONA VALENCIA', ALIAS)).toBe('MERCADONA VALENCIA')
  })
})

describe('anonimizarConcepto', () => {
  it('combina todo y no deja datos identificativos', () => {
    const r = anonimizarConcepto('TRANSFERENCIA DE ACME CONSULTING NOMINA - ORDENANTE ES91 2100 0418 4502 0005 1332', ALIAS)
    expect(r).toContain('Empresa')
    expect(contieneIdentificativo(r)).toBe(false)
  })
})
