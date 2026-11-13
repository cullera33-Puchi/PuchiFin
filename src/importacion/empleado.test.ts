import { describe, expect, it } from 'vitest'
import { alternarEmpleado, cambiarCategoria, marcarPersonal } from '../datos/movimientos'
import { datosIniciales, nuevoId } from '../datos/operaciones'
import type { BaseDatos, Movimiento } from '../lib/tipos'
import { candidatosEmpleado, contextoEmpleado, puntuarEmpleado, zonaCasa } from './empleado'
import { categoriasAprendidas, clasificar } from './reglas'

const db0 = datosIniciales()
const [principal, , tarjeta] = db0.cuentas
const cat = (nombre: string) => db0.categorias.find((c) => c.nombre === nombre)!.id

function mov(p: Partial<Movimiento>): Movimiento {
  return {
    id: nuevoId(), cuenta_id: tarjeta.id, importacion_id: null, fecha_operacion: '2026-11-17', fecha_valor: null,
    concepto_original: p.concepto_limpio ?? 'X', concepto_limpio: 'X', concepto_normalizado: 'x', ocurrencia: 1, importe: -10,
    saldo: null, categoria_id: null, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null, reembolso_cerrado: false,
    mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '', ...p,
  }
}

describe('puntuación de gastos de empleado', () => {
  const ctx = contextoEmpleado(db0)

  it('taxis y cafeterías en día laborable con la tarjeta de crédito superan el umbral', () => {
    expect(puntuarEmpleado(mov({ concepto_limpio: 'Taxi Barcelona' }), ctx).puntuacion).toBeGreaterThanOrEqual(0.75)
    expect(puntuarEmpleado(mov({ concepto_limpio: 'Cafe Roma', categoria_id: cat('Cafeterías') }), ctx).puntuacion).toBeCloseTo(0.65)
  })

  it('el fin de semana y la cuenta personal restan', () => {
    const sabado = puntuarEmpleado(mov({ concepto_limpio: 'Cafe Roma', categoria_id: cat('Cafeterías'), fecha_operacion: '2026-11-14' }), ctx)
    expect(sabado.puntuacion).toBeLessThan(0.5)
    const cuenta = puntuarEmpleado(mov({ concepto_limpio: 'Cafe Roma', categoria_id: cat('Cafeterías'), cuenta_id: principal.id }), ctx)
    expect(cuenta.puntuacion).toBeCloseTo(0.45)
  })

  it('no puntúa ni ingresos ni compras de otro tipo', () => {
    expect(puntuarEmpleado(mov({ concepto_limpio: 'Mercadona', categoria_id: cat('Supermercado') }), ctx).puntuacion).toBe(0)
    expect(puntuarEmpleado(mov({ concepto_limpio: 'Taxi', importe: 20 }), ctx).puntuacion).toBe(0)
  })
})

describe('zona de casa', () => {
  it('se deduce de las poblaciones habituales y puntúa lo de fuera', () => {
    const movs = [...Array(9)].map(() => mov({ poblacion: 'villarriba', concepto_limpio: 'Condis' })).concat([mov({ poblacion: 'madrid' })])
    const db: BaseDatos = { ...db0, movimientos: movs }
    expect([...zonaCasa(db)]).toEqual(['villarriba'])
    const ctx = contextoEmpleado(db)
    const fuera = puntuarEmpleado(mov({ concepto_limpio: 'Cafe Roma', categoria_id: cat('Cafeterías'), cuenta_id: principal.id, poblacion: 'madrid' }), ctx)
    expect(fuera.puntuacion).toBeCloseTo(0.65)
    expect(fuera.motivos).toContain('fuera de casa (madrid)')
  })

  it('con las poblaciones de los ajustes, usa esas', () => {
    const db = { ...db0, ajustes: { ...db0.ajustes, zona_casa: ['Villabajo'] } }
    expect([...zonaCasa(db)]).toEqual(['villabajo'])
  })
})

describe('aprender de lo revisado', () => {
  it('un comercio marcado como personal deja de proponerse; uno de empleado se propone más', () => {
    const a = mov({ concepto_limpio: 'Cafe Roma', categoria_id: cat('Cafeterías') })
    const b = mov({ concepto_limpio: 'Cafe Roma', categoria_id: cat('Cafeterías'), fecha_operacion: '2026-11-18' })
    const c = mov({ concepto_limpio: 'Bar Luz', categoria_id: cat('Restaurantes') })
    let db: BaseDatos = { ...db0, movimientos: [a, b, c] }
    expect(candidatosEmpleado(db).map((x) => x.m.id).sort()).toEqual([a.id, b.id, c.id].sort())

    db = marcarPersonal(db, [a.id])
    expect(candidatosEmpleado(db).map((x) => x.m.id)).toEqual([c.id]) // el mismo comercio ya no se propone
    db = alternarEmpleado(db, c.id)
    const nuevo = puntuarEmpleado(mov({ concepto_limpio: 'Bar Luz', categoria_id: cat('Restaurantes'), cuenta_id: principal.id }), contextoEmpleado(db))
    expect(nuevo.puntuacion).toBeGreaterThanOrEqual(0.8)
    expect(nuevo.motivos.join()).toContain('1 de 1 fueron de empleado')
  })
})

describe('categorías aprendidas por comercio', () => {
  it('lo corregido en un Mercadona sirve para otro Mercadona, en cualquier cuenta', () => {
    const m1 = mov({ concepto_limpio: 'Mercadona 1234 La Plaza', cuenta_id: principal.id })
    const db = cambiarCategoria({ ...db0, reglas: [], movimientos: [m1] }, [m1.id], cat('Regalos'))
    const ap = categoriasAprendidas(db)
    expect(ap.porClave.get('mercadona plaza')).toBe(cat('Regalos'))
    const otro = clasificar({ texto: 'mercadona 2210 pago con tarjeta', clave: 'mercadona', cuenta_id: tarjeta.id, importe: -5 }, [], ap)
    expect(otro).toMatchObject({ categoria_id: cat('Regalos'), origen_categoria: 'aprendida' })
  })

  it('si la primera palabra lleva a categorías distintas, no adivina', () => {
    const a = mov({ concepto_limpio: 'Casa Pepe' })
    const b = mov({ concepto_limpio: 'Casa Del Libro' })
    let db: BaseDatos = { ...db0, reglas: [], movimientos: [a, b] }
    db = cambiarCategoria(db, [a.id], cat('Restaurantes'))
    db = cambiarCategoria(db, [b.id], cat('Cultura'))
    expect(clasificar({ texto: 'casa nueva', clave: 'casa nueva', cuenta_id: tarjeta.id, importe: -5 }, [], categoriasAprendidas(db)).categoria_id).toBeNull()
  })

  it('lo pasado a mano al mes siguiente se repite en el mismo comercio', () => {
    const m = mov({ concepto_limpio: 'Alquiler Garaje', fecha_operacion: '2026-10-30', mes_imputacion: '2026-11' })
    const ap = categoriasAprendidas({ ...db0, movimientos: [m] })
    expect(clasificar({ texto: 'alquiler garaje', clave: 'alquiler garaje', cuenta_id: principal.id, importe: -60 }, [], ap).mes_siguiente).toBe(true)
  })
})

describe('sugerencias dudosas en la importación', () => {
  it('las que no se aceptan quedan para revisar; las seguras desactivadas enseñan', async () => {
    const { confirmarImportacion } = await import('./importar')
    const base = { ...db0, movimientos: [] }
    const dudosa = { ...mov({ concepto_limpio: 'Cafe Roma' }), fila: 1, sugerencia: { tipo: 'gasto_empleado' as const, motivo: '', regla_id: null, confianza: 0.6 } }
    const segura = { ...mov({ concepto_limpio: 'Taxi Sol', fecha_operacion: '2026-11-18' }), fila: 2, sugerencia: { tipo: 'gasto_empleado' as const, motivo: '', regla_id: null, confianza: 0.85 } }
    const p = { origen: 'bbva_tarjeta' as const, nombrePlantilla: '', cuenta_id: tarjeta.id, nuevos: [dudosa, segura], duplicados: 0, repetidos: [], anteriores: 0, ilegibles: [], fecha_desde: null, fecha_hasta: null, traspasos: [], avisos: [], problemas: [], alMesSiguiente: [] }
    const r = confirmarImportacion(base, p, { aceptadas: new Set() })
    expect(r.movimientos.find((m) => m.id === dudosa.id)!.revisado_empleado).toBe(false)
    expect(r.movimientos.find((m) => m.id === segura.id)!.revisado_empleado).toBe(true)
    expect(candidatosEmpleado(r).map((c) => c.m.id)).toEqual([dudosa.id])
  })
})
