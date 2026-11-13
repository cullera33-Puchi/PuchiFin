import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { generarDatosPrueba } from './datosPrueba'
import { filasMovimientos, libroExcel } from './exportarExcel'

describe('exportación a Excel', () => {
  it('una fila por movimiento con categoría, subcategoría y tipo, y se puede volver a leer', () => {
    const db = datosIniciales()
    const p = generarDatosPrueba({ cuentas: db.cuentas, categorias: db.categorias, desde: '2026-10-01', hasta: '2026-10-31' })
    const filas = filasMovimientos({ ...db, ...p }, p.movimientos)
    expect(filas).toHaveLength(p.movimientos.length + 1)
    const nomina = filas.find((f) => String(f[3]).startsWith('Transferencia de Empresa Nomina'))!
    expect(nomina.slice(4, 7)).toEqual(['Ingresos', 'Nómina', 'Normal'])
    const libro = XLSX.read(libroExcel([{ nombre: 'Movimientos', filas }]), { type: 'array' })
    const leidas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets.Movimientos, { header: 1 })
    expect(leidas).toHaveLength(filas.length)
  })
})
