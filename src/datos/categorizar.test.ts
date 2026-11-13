import { describe, expect, it } from 'vitest'
import { claveComercio, normalizarConcepto } from '../lib/conceptos'
import { categoriasAprendidas, clasificar } from '../importacion/reglas'
import type { BaseDatos, Movimiento } from '../lib/tipos'
import { categoriasPasarela, categoriasRapidas, gruposPasarela, gruposPendientes, propuestasRecategorizacion, similares, sugerirPorParecido } from './categorizar'
import { cambiarCategoria, fijarCategoria } from './movimientos'
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

describe('PayPal: cargos repartidos por importe', () => {
  const PP = 'PayPal Europe S.a.r.l. et Cie S.c.a'
  const NETFLIX = cat('Suscripciones > Netflix')
  const JUEGOS = cat('Ocio > Juegos')
  const base: BaseDatos = {
    ...db0,
    movimientos: [
      mov(PP, -12.99, { categoria_id: NETFLIX, origen_categoria: 'manual' }),
      mov(PP, -12.99),
      mov(PP, -12.99),
      mov(PP, -59.9),
      mov(PP, -4.99, { categoria_id: cat('Compras > Hogar'), origen_categoria: 'regla' }),
    ],
  }

  it('lo aprendido de un cargo vale solo para el mismo importe', () => {
    const a = categoriasAprendidas(base)
    const c = (importe: number) => clasificar({ texto: normalizarConcepto(PP), clave: claveComercio(PP), cuenta_id: '', importe }, base.reglas, a).categoria_id
    expect(c(-12.99)).toBe(NETFLIX)
    expect(c(-59.9)).toBeNull()
  })

  it('en Categorizar cada importe es un grupo y solo se sugiere lo del mismo importe', () => {
    const g = gruposPendientes(base)
    expect(g.map((x) => [x.nombre, x.movimientos.length])).toEqual([
      ['PayPal de 12,99 €', 2],
      ['PayPal de 59,90 €', 1],
    ])
    expect(g[0].sugerencia?.categoria_id).toBe(NETFLIX)
    expect(g[1].sugerencia).toBeNull()
  })

  it('«del mismo comercio» es del mismo importe y no hay parecidos', () => {
    const otro = base.movimientos[3]
    const s = similares(base, [otro.id], JUEGOS)
    expect(s.mismoComercio).toEqual([])
    expect(s.parecidos).toEqual([])
    expect(similares(base, [base.movimientos[1].id], JUEGOS).mismoComercio.map((m) => m.id)).toEqual([base.movimientos[2].id])
  })

  it('al corregir un cargo de PayPal se ofrecen también los de otros importes para revisarlos', () => {
    const s = similares(base, [base.movimientos[3].id], JUEGOS)
    expect(s.otrosPasarela.map((m) => m.importe).sort()).toEqual([-12.99, -12.99, -12.99, -4.99])
    // Lo que ya está en esa categoría no se ofrece
    const conJuegos = { ...base, movimientos: base.movimientos.map((m, i) => (i === 4 ? { ...m, categoria_id: JUEGOS } : m)) }
    expect(similares(conJuegos, [base.movimientos[3].id], JUEGOS).otrosPasarela).toHaveLength(3)
  })

  it('la regla que se crea es del importe exacto', () => {
    const r = cambiarCategoria(base, [base.movimientos[3].id], JUEGOS, { crearRegla: true })
    const regla = r.reglas.find((x) => x.origen === 'manual')!
    expect(regla).toMatchObject({ patron: 'paypal europe', importe_min: -59.9, importe_max: -59.9, nombre: 'PayPal de 59,90 €' })
    const c = (importe: number) => clasificar({ texto: normalizarConcepto(PP), clave: claveComercio(PP), cuenta_id: '', importe }, r.reglas, categoriasAprendidas(r)).categoria_id
    expect(c(-59.9)).toBe(JUEGOS)
    expect(c(-7.5)).toBeNull()
  })

  it('agrupa todos los cargos por importe y marca por revisar lo que no decidiste tú', () => {
    const g = gruposPasarela(base)
    expect(g.map((x) => [x.importe, x.movimientos.length, x.porRevisar.length])).toEqual([
      [12.99, 3, 2],
      [59.9, 1, 1],
      [4.99, 1, 1],
    ])
    expect(g[0].sugerencia).toBe(NETFLIX)
  })
})

describe('chips de PayPal', () => {
  it('primero lo ya usado en PayPal y después las categorías típicas de un pago con PayPal', () => {
    const NETFLIX = cat('Suscripciones > Netflix')
    const d: BaseDatos = { ...db0, movimientos: [mov('PayPal Europe', -12.99, { categoria_id: NETFLIX, origen_categoria: 'manual' }), mov('Mercadona', -30, { categoria_id: cat('Alimentación > Supermercado'), origen_categoria: 'manual' })] }
    const c = categoriasPasarela(d, [], 3)
    expect(c).toEqual([NETFLIX, cat('Ocio > Juegos'), cat('Suscripciones > Otras plataformas')])
  })
})
