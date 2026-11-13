/**
 * Genera los Excel de prueba con formato BBVA en tests/fixtures/ (datos inventados).
 * npm run excel:prueba  →  regenera los ficheros
 * npm test              →  solo comprueba que se pueden generar y leer
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { escribirXlsx, generarExcelPrueba } from '../src/importacion/excelPrueba'
import { leerFichero } from '../src/importacion/lector'

describe('Excel de prueba', () => {
  it('se generan y se leen como ficheros de BBVA', () => {
    const excels = generarExcelPrueba({ desde: '2026-10-01', hasta: '2026-11-13' })
    expect(excels.map((e) => leerFichero(escribirXlsx(e.filas)).plantilla.origen)).toEqual(['bbva_cuenta', 'bbva_cuenta', 'bbva_tarjeta'])
    if (process.env.GENERAR_EXCEL) {
      const dir = process.env.GENERAR_EXCEL === '1' ? 'tests/fixtures' : process.env.GENERAR_EXCEL
      mkdirSync(dir, { recursive: true })
      for (const e of excels) writeFileSync(`${dir}/${e.nombre}`, escribirXlsx(e.filas))
    }
  })
})
