import { describe, expect, it } from 'vitest'
import { crearArchivo } from '../datos/archivo'
import { datosIniciales } from '../datos/operaciones'
import { copiasSobrantes, metaDe, type MetaCopia } from './copias'

describe('metaDe', () => {
  it('resume la copia y la diaria usa el día como clave', () => {
    const archivo = crearArchivo(datosIniciales())
    const m = metaDe(archivo, 'diaria', '2026-11-13T08:00:00.000Z')
    expect(m).toMatchObject({ clave: '2026-11-13#diaria', movimientos: 0, cuentas: 4, categorias: 86, reglas: archivo.datos.reglas.length })
    expect(metaDe(archivo, 'manual', '2026-11-13T08:00:00.000Z').clave).toBe('2026-11-13T08:00:00.000Z#manual')
  })
})

describe('copiasSobrantes', () => {
  const meta = (dia: number, tipo: MetaCopia['tipo']): MetaCopia => ({
    clave: `${dia}-${tipo}`, tipo, creada: `2026-11-${String(dia).padStart(2, '0')}T08:00:00Z`, dia: '', version: '', movimientos: 0, cuentas: 0, categorias: 0,
  })

  it('conserva las 7 diarias más recientes', () => {
    const lista = Array.from({ length: 9 }, (_, i) => meta(i + 1, 'diaria'))
    expect(copiasSobrantes(lista).sort()).toEqual(['1-diaria', '2-diaria'])
  })

  it('las manuales no cuentan en el límite de las diarias', () => {
    const lista = [...Array.from({ length: 7 }, (_, i) => meta(i + 1, 'diaria')), meta(1, 'manual'), meta(2, 'antes de importar')]
    expect(copiasSobrantes(lista)).toEqual([])
  })
})
