import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { porVersion, porVersionYClave } from './cache'
import { nombreCategoria } from './vista'

describe('cálculos por versión de los datos', () => {
  it('se calcula una vez por versión y de nuevo cuando los datos cambian', () => {
    let veces = 0
    const f = porVersion((db) => {
      veces++
      return db.movimientos.length
    })
    const db = datosIniciales()
    f(db)
    f(db)
    expect(veces).toBe(1)
    f({ ...db })
    expect(veces).toBe(2)
    let claves = 0
    const g = porVersionYClave((_, clave) => {
      claves++
      return clave
    })
    g(db, '2026-10')
    g(db, '2026-10')
    g(db, '2026-11')
    expect(claves).toBe(2)
  })
})

describe('nombre de la categoría', () => {
  it('no repite el nombre cuando la subcategoría se llama como su categoría', () => {
    const db = datosIniciales()
    const restaurantes = db.categorias.find((c) => !c.padre_id && c.nombre === 'Restaurantes')!
    const igual = db.categorias.find((c) => c.padre_id === restaurantes.id && c.nombre === 'Restaurantes')!
    const cafeterias = db.categorias.find((c) => c.padre_id === restaurantes.id && c.nombre === 'Cafeterías')!
    expect(nombreCategoria(db, igual.id)).toBe('Restaurantes')
    expect(nombreCategoria(db, cafeterias.id)).toBe('Restaurantes, Cafeterías')
  })
})
