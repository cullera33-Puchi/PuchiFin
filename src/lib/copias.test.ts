import { describe, expect, it } from 'vitest'
import { copiasSobrantes, metaDe, validarCopia, type Copia, type MetaCopia } from './copias'

const copia = (datos: Copia['datos'] = { cuentas: [{ alias: 'Cuenta principal' }], movimientos: [{}, {}], categorias: [] }): Copia => ({
  app: 'puchifin', esquema: 5, exportado: '2026-11-13T10:00:00Z', version_app: '0.2.0', datos,
})

describe('validarCopia', () => {
  it('acepta una copia de PuchiFin', () => {
    expect(validarCopia(copia())).toBeNull()
  })

  it('rechaza otros archivos', () => {
    expect(validarCopia(null)).toMatch(/no es una copia/)
    expect(validarCopia({ app: 'tareas', datos: {} })).toMatch(/no es una copia/)
    expect(validarCopia({ app: 'puchifin', datos: { cuentas: {} } })).toMatch(/dañada/)
  })

  it('rechaza una copia con datos identificativos antes de enviarla', () => {
    expect(validarCopia(copia({ cuentas: [{ alias: 'ES91 2100 0418 4502 0005 1332' }] }))).toMatch(/IBAN/)
  })
})

describe('metaDe', () => {
  it('resume la copia y la diaria usa el día como clave', () => {
    const m = metaDe(copia(), 'u1', 'diaria', '2026-11-13T08:00:00.000Z')
    expect(m).toMatchObject({ clave: '2026-11-13#diaria', usuario: 'u1', movimientos: 2, cuentas: 1, categorias: 0, version: '0.2.0' })
    expect(metaDe(copia(), 'u1', 'manual', '2026-11-13T08:00:00.000Z').clave).toBe('2026-11-13T08:00:00.000Z#manual')
  })
})

describe('copiasSobrantes', () => {
  const meta = (dia: number, tipo: MetaCopia['tipo']): MetaCopia => ({
    clave: `${dia}-${tipo}`, usuario: 'u', tipo, creada: `2026-11-${String(dia).padStart(2, '0')}T08:00:00Z`, dia: '', version: '', movimientos: 0, cuentas: 0, categorias: 0,
  })

  it('conserva las 7 diarias más recientes', () => {
    const lista = Array.from({ length: 9 }, (_, i) => meta(i + 1, 'diaria'))
    expect(copiasSobrantes(lista).sort()).toEqual(['1-diaria', '2-diaria'])
  })

  it('las manuales no cuentan en el límite de las diarias', () => {
    const lista = [...Array.from({ length: 7 }, (_, i) => meta(i + 1, 'diaria')), meta(1, 'manual'), meta(2, 'antes de restaurar')]
    expect(copiasSobrantes(lista)).toEqual([])
  })
})
