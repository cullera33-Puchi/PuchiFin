import { describe, expect, it } from 'vitest'
import { compararVersiones, limpiarNovedades, novedadesPosteriores } from './version'

describe('compararVersiones', () => {
  it('ordena por mayor, menor y parche', () => {
    expect(compararVersiones('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compararVersiones('1.0', '1.0.0')).toBe(0)
    expect(compararVersiones('v0.2.1', '0.2.0')).toBeGreaterThan(0)
    expect(compararVersiones('0.1.0', '0.2.0')).toBeLessThan(0)
  })

  it('devuelve null con versiones no válidas', () => {
    expect(compararVersiones('beta', '0.1.0')).toBeNull()
  })
})

describe('limpiarNovedades', () => {
  it('descarta entradas mal formadas y ordena de la más reciente a la más antigua', () => {
    const lista = limpiarNovedades([
      { version: '0.1.0', fecha: '2026-11-13', cambios: ['Base'] },
      { version: 'x', cambios: ['no'] },
      { version: '0.3.0', cambios: [] },
      { version: 'v0.2.0', fecha: '2026-11-14', cambios: ['Resúmenes', '  ', 7] },
      null,
    ])
    expect(lista).toEqual([
      { version: '0.2.0', fecha: '2026-11-14', cambios: ['Resúmenes'] },
      { version: '0.1.0', fecha: '2026-11-13', cambios: ['Base'] },
    ])
  })

  it('acepta cualquier cosa sin fallar', () => {
    expect(limpiarNovedades(null)).toEqual([])
    expect(limpiarNovedades({})).toEqual([])
  })
})

describe('novedadesPosteriores', () => {
  it('devuelve solo las versiones que el dispositivo no tiene', () => {
    const lista = limpiarNovedades([
      { version: '0.3.0', cambios: ['c'] },
      { version: '0.2.0', cambios: ['b'] },
      { version: '0.1.0', cambios: ['a'] },
    ])
    expect(novedadesPosteriores(lista, '0.2.0').map((e) => e.version)).toEqual(['0.3.0'])
  })
})
