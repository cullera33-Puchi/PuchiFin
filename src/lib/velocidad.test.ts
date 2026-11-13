import { describe, expect, it } from 'vitest'
import { crearVelocidad, esLanzamiento } from './velocidad'

describe('velocidad del dedo', () => {
  it('un gesto rápido supera el umbral y uno parado antes de soltar no', () => {
    const v = crearVelocidad(0, 0)
    for (let t = 16; t <= 80; t += 16) v.mover(t * 1.2, t) // 1,2 px por ms
    expect(v.valor(90)).toBeGreaterThan(0.4)
    expect(esLanzamiento(v.valor(90), 96, 1)).toBe(true)
    expect(v.valor(200)).toBe(0) // quieto más de 80 ms
    expect(esLanzamiento(1, 20, 1)).toBe(false) // muy corto
    expect(esLanzamiento(-1, -50, 1)).toBe(false) // sentido contrario
  })
})
