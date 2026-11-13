import { describe, expect, it } from 'vitest'
import { datosIniciales } from './operaciones'
import { categoriasParecidas } from './parecidas'

const db = datosIniciales()
const rutas = (nombre: string) => categoriasParecidas(db, nombre).map((p) => `${p.motivo}: ${p.ruta}`)

describe('categorías parecidas antes de crear una', () => {
  it('la misma sin acentos, mayúsculas ni plural', () => {
    expect(rutas('cafeteria')).toContain('igual: Restaurantes > Cafeterías')
    expect(rutas('REGALO')).toContain('igual: Compras > Regalos')
  })

  it('una dentro de otra y las erratas', () => {
    expect(rutas('Videojuegos')).toContain('parecido: Ocio > Juegos')
    expect(rutas('Supermercados')).toContain('igual: Alimentación > Supermercado')
    expect(rutas('Suscripciónes')).toContain('igual: Suscripciones')
    expect(rutas('Farmcia')).toContain('parecido: Salud > Farmacia')
  })

  it('sinónimos habituales', () => {
    expect(rutas('Gasolina')).toContain('sinonimo: Transporte > Combustible')
    expect(rutas('Gimnasio')).toContain('sinonimo: Ocio > Deporte')
    expect(rutas('Electricidad')).toContain('sinonimo: Suministros > Luz')
  })

  it('lo igual va primero y un nombre nuevo de verdad no da avisos', () => {
    expect(categoriasParecidas(db, 'Juegos')[0].motivo).toBe('igual')
    expect(rutas('Jardinería')).toEqual([])
    expect(rutas('Lotería')).toEqual([])
    expect(rutas('ab')).toEqual([])
  })
})
