import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { resumenAnual } from './anual'
import { generarDatosPrueba } from './datosPrueba'

describe('resumen del año', () => {
  it('totales, meses, categorías y comercios del año', () => {
    const base = datosIniciales()
    const db = { ...base, ...generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: '2025-06-01', hasta: '2026-11-13' }) }
    const r = resumenAnual(db, '2026', '2026-11-14')
    expect(r.enCurso).toBe(true)
    expect(r.meses).toBe(11)
    expect(r.totales.gastos).toBeGreaterThan(0)
    expect(r.anterior).not.toBeNull()
    expect(r.categorias.length).toBeGreaterThan(0)
    expect(r.comercios.length).toBe(5)
    expect(r.mejorMes!.ahorro).toBeGreaterThanOrEqual(r.peorMes!.ahorro)
    expect(r.gastoMedioMes).toBeCloseTo(r.totales.gastos / 11, 1)
    expect(r.capital?.fin).toBeTypeOf('number')
    const anterior = resumenAnual(db, '2025', '2026-11-14')
    expect(anterior.enCurso).toBe(false)
    expect(anterior.meses).toBe(7)
  })

  it('genera el PDF del año en una página', async () => {
    const { generarPdfAnual } = await import('./pdf')
    const base = datosIniciales()
    const db = { ...base, ...generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: '2025-06-01', hasta: '2026-11-13' }) }
    const doc = generarPdfAnual(resumenAnual(db, '2026', '2026-11-14'), { hayDatosPrueba: true, generado: '2026-11-14' })
    const texto = new TextDecoder('latin1').decode(new Uint8Array(doc.output('arraybuffer')))
    expect(texto).toContain('Resumen del a')
    expect(texto).toContain('Comercios con m')
    expect(doc.getNumberOfPages()).toBe(1)
  })
})
