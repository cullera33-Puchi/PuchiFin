import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { generarDatosPrueba } from './datosPrueba'
import { contieneIdentificativo } from './identificativos'
import { enlaceClaude, textoOptimizar } from './optimizar'
import { detectarRecurrentes } from './recurrentes'

const db0 = datosIniciales()
const db = { ...db0, ...generarDatosPrueba({ cuentas: db0.cuentas, categorias: db0.categorias, desde: '2025-11-01', hasta: '2026-11-13' }) }

describe('optimizar con Claude', () => {
  const texto = textoOptimizar(db, detectarRecurrentes(db), '2026-11-13')

  it('lleva las instrucciones, los fijos con su coste anual y los gastos hormiga', () => {
    expect(texto).toMatch(/^Estos son mis gastos fijos/)
    expect(texto).toMatch(/Gastos fijos activos \(\d+\)/)
    expect(texto).toMatch(/Netflix \| Suscripciones, Netflix \| Mensual \| último cargo 13,99 €/i)
    expect(texto).toMatch(/Recibo Prestamo Hipotecario \| Vivienda, Hipoteca \| Mensual \| último cargo 1\.148,32 € \| 13\.779,84 € al año/)
  })

  it('sin datos identificativos ni fechas exactas', () => {
    expect(contieneIdentificativo(texto)).toBe(false)
    expect(texto).not.toMatch(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/)
  })

  it('el enlace lleva el texto si cabe', () => {
    expect(enlaceClaude('hola')).toBe('https://claude.ai/new?q=hola')
    expect(enlaceClaude('x'.repeat(9000))).toBe('https://claude.ai/new')
  })
})
