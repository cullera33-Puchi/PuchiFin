import { describe, expect, it } from 'vitest'
import { crearArchivo } from '../datos/archivo'
import { datosIniciales } from '../datos/operaciones'
import { copiasSobrantes, hayCopiaReciente, metaDe, type MetaCopia } from './copias'

describe('metaDe', () => {
  it('resume la copia y la diaria usa el día como clave', () => {
    const archivo = crearArchivo(datosIniciales())
    const m = metaDe(archivo, 'diaria', '2026-11-13T08:00:00.000Z')
    expect(m).toMatchObject({ clave: '2026-11-13#diaria', movimientos: 0, cuentas: 4, categorias: 86, reglas: archivo.datos.reglas.length })
    expect(metaDe(archivo, 'manual', '2026-11-13T08:00:00.000Z').clave).toBe('2026-11-13T08:00:00.000Z#manual')
  })
})

describe('copiasSobrantes', () => {
  const meta = (dia: number, tipo: MetaCopia['tipo'], hora = '08'): MetaCopia => ({
    clave: `${dia}-${tipo}-${hora}`, tipo, creada: `2026-11-${String(dia).padStart(2, '0')}T${hora}:00:00Z`, dia: '', version: '', movimientos: 0, cuentas: 0, categorias: 0,
  })

  it('conserva solo las 3 más recientes, de cualquier tipo', () => {
    const lista = [meta(1, 'diaria'), meta(2, 'manual'), meta(3, 'diaria'), meta(4, 'antes de importar'), meta(5, 'diaria')]
    expect(copiasSobrantes(lista).sort()).toEqual(['1-diaria-08', '2-manual-08'])
    expect(copiasSobrantes(lista.slice(2))).toEqual([])
  })

  it('una copia de hace menos de 15 minutos cuenta como reciente', () => {
    const ahora = Date.parse('2026-11-05T08:10:00Z')
    expect(hayCopiaReciente([meta(5, 'diaria')], ahora)).toBe(true)
    expect(hayCopiaReciente([meta(5, 'diaria')], ahora + 10 * 60 * 1000)).toBe(false)
    expect(hayCopiaReciente([], ahora)).toBe(false)
  })
})
