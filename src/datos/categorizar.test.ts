import { describe, expect, it } from 'vitest'
import { normalizarConcepto } from '../lib/conceptos'
import type { BaseDatos, Movimiento } from '../lib/tipos'
import { categoriasRapidas, gruposPendientes, propuestasRecategorizacion, similares, sugerirPorParecido } from './categorizar'
import { fijarCategoria } from './movimientos'
import { datosIniciales } from './operaciones'

const db0 = datosIniciales()
const cat = (ruta: string) => {
  const [p, h] = ruta.split(' > ')
  const padre = db0.categorias.find((c) => !c.padre_id && c.nombre === p)!
  return h ? db0.categorias.find((c) => c.padre_id === padre.id && c.nombre === h)!.id : padre.id
}
let n = 0
const mov = (concepto: string, importe: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`, cuenta_id: db0.cuentas[0].id, importacion_id: null, fecha_operacion: `2026-10-${String((n % 28) + 1).padStart(2, '0')}`, fecha_valor: null,
  concepto_original: concepto, concepto_limpio: concepto, concepto_normalizado: normalizarConcepto(concepto), ocurrencia: 1, importe, saldo: null,
  categoria_id: null, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null, reembolso_cerrado: false, mes_imputacion: null,
  poblacion: null, revisado_empleado: false, created_at: '', ...extra,
})
const SUPER = cat('Alimentación > Supermercado')
const db: BaseDatos = {
  ...db0,
  movimientos: [
    mov('Mercadona', -30, { categoria_id: SUPER, origen_categoria: 'manual' }),
    mov('Mercadona Valencia', -12),
    mov('Mercadona Valencia', -8),
    mov('Mercadona Castellon', -20),
    mov('Gasolinera Petronor', -50),
    mov('Gasolinera Petronor', -45),
    mov('Gasolinera Petronor', -40),
    mov('Comercio Zeta', -3),
    mov('Gasolinera Petronor', -60, { categoria_id: cat('Transporte > Combustible'), origen_categoria: 'regla' }),
    mov('Bizum Recibido Cena', 25),
  ],
}

describe('categorizar lo pendiente', () => {
  it('agrupa los pendientes por comercio, de más a menos movimientos', () => {
    const g = gruposPendientes(db)
    expect(g.map((x) => [x.nombre, x.movimientos.length])).toEqual([
      ['Gasolinera Petronor', 3],
      ['Mercadona Valencia', 2],
      ['Bizum Recibido Cena', 1], // con el mismo número, primero los de más importe
      ['Mercadona Castellon', 1],
      ['Comercio Zeta', 1],
    ])
  })

  it('sugiere por parecido con lo ya categorizado', () => {
    const g = gruposPendientes(db)
    expect(g[0].sugerencia).toMatchObject({ categoria_id: cat('Transporte > Combustible'), confianza: 1 })
    expect(g[1].sugerencia).toMatchObject({ categoria_id: SUPER, parecido: 'Mercadona' })
    expect(g[1].sugerencia!.confianza).toBeGreaterThanOrEqual(0.8)
    expect(g.find((x) => x.nombre === 'Comercio Zeta')!.sugerencia).toBeNull() // nada parecido
    expect(sugerirPorParecido(db, 'bizum recibido cena', 'ingreso')).toBeNull() // un ingreso no toma una categoría de gasto
  })

  it('similares: pendientes del mismo comercio y parecidos; lo categorizado solo aparte', () => {
    const valencia = db.movimientos.find((m) => m.concepto_limpio === 'Mercadona Valencia')!
    const s = similares(db, [valencia.id], SUPER)
    expect(s.mismoComercio.map((m) => m.concepto_limpio)).toEqual(['Mercadona Valencia'])
    expect(s.parecidos.map((m) => m.concepto_limpio)).toEqual(['Mercadona Castellon'])
    expect(s.yaCategorizados).toEqual([]) // el Mercadona categorizado es de otra clave y ya tiene esa categoría
    const gasolinera = db.movimientos.find((m) => m.concepto_limpio === 'Gasolinera Petronor' && !m.categoria_id)!
    const g = similares(db, [gasolinera.id], cat('Transporte > Peajes'))
    expect(g.mismoComercio).toHaveLength(2)
    expect(g.yaCategorizados).toHaveLength(1) // el de Combustible: solo si el usuario lo activa
  })

  it('categorías rápidas: primero las últimas elegidas y después las más usadas, de gasto o de ingreso', () => {
    const peajes = cat('Transporte > Peajes')
    const r = categoriasRapidas(db, 'gasto', [peajes])
    expect(r[0]).toBe(peajes)
    expect(r).toContain(SUPER)
    expect(categoriasRapidas(db, 'ingreso', [peajes])).not.toContain(peajes)
  })

  it('sin parecido, sugiere lo que digan las reglas de la app', () => {
    const conRegla = { ...db, movimientos: [...db.movimientos, mov('Farmacia Lopez', -9)] }
    const g = gruposPendientes(conRegla).find((x) => x.nombre === 'Farmacia Lopez')!
    expect(g.sugerencia).toMatchObject({ categoria_id: cat('Salud > Farmacia'), parecido: 'regla de la app' })
  })
})

describe('mejoras para lo ya categorizado', () => {
  const plataformas = cat('Suscripciones > Otras plataformas')
  const base: BaseDatos = {
    ...db0,
    movimientos: [
      mov('Netflix', -13.99, { categoria_id: plataformas, origen_categoria: 'regla' }),
      mov('Netflix', -13.99, { categoria_id: plataformas, origen_categoria: 'regla' }),
      mov('Filmin', -7.99, { categoria_id: cat('Ocio > Cine y espectáculos'), origen_categoria: 'manual' }), // decisión del usuario: no se propone
      mov('Spotify', -10.99, { categoria_id: cat('Suscripciones > Spotify'), origen_categoria: 'regla' }), // ya está bien
    ],
  }
  it('propone llevar a su plataforma lo que la app categorizó de forma general, sin tocar lo manual', () => {
    const p = propuestasRecategorizacion(base)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ desde: plataformas, hacia: cat('Suscripciones > Netflix') })
    expect(p[0].movimientos).toHaveLength(2)
  })
  it('lo que el usuario confirma ya no se vuelve a proponer', () => {
    const p = propuestasRecategorizacion(base)
    const fijado = fijarCategoria(base, p[0].movimientos.map((m) => m.id))
    expect(propuestasRecategorizacion(fijado)).toEqual([])
  })

  it('si el usuario corrige a mano un movimiento de un comercio, se propone lo mismo para los de ese comercio que puso la app', () => {
    const conManual = { ...base, movimientos: [...base.movimientos, mov('Netflix', -13.99, { categoria_id: cat('Ocio > Cine y espectáculos'), origen_categoria: 'manual' })] }
    const p = propuestasRecategorizacion(conManual)
    expect(p[0]).toMatchObject({ hacia: cat('Ocio > Cine y espectáculos') })
    expect(p[0].movimientos).toHaveLength(2)
  })
})
