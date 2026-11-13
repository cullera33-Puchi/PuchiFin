import { describe, expect, it } from 'vitest'
import { datosIniciales, guardarPresupuesto } from '../datos/operaciones'
import { generarDatosPrueba } from './datosPrueba'
import { consumoPresupuestos, sugerirPresupuestos } from './presupuesto'

const db0 = datosIniciales()
const db = { ...db0, ...generarDatosPrueba({ cuentas: db0.cuentas, categorias: db0.categorias, desde: '2026-08-01', hasta: '2026-11-13' }) }
const raiz = (n: string) => db.categorias.find((c) => !c.padre_id && c.nombre === n)!

describe('presupuesto por categoría', () => {
  it('se fija, se cambia y se quita; solo en categorías de gasto', () => {
    const a = guardarPresupuesto(db, raiz('Restaurantes').id, 300)
    expect(a.presupuestos).toHaveLength(1)
    expect(guardarPresupuesto(a, raiz('Restaurantes').id, 250).presupuestos[0].importe_mensual).toBe(250)
    expect(guardarPresupuesto(a, raiz('Restaurantes').id, null).presupuestos).toHaveLength(0)
    expect(() => guardarPresupuesto(db, raiz('Ingresos').id, 100)).toThrow(/gasto/)
    expect(() => guardarPresupuesto(db, raiz('Ocio').id, -5)).toThrow(/positivo/)
  })

  it('consumo del mes con estado y proyección a final de mes', () => {
    let d = guardarPresupuesto(db, raiz('Alimentación').id, 50)
    d = guardarPresupuesto(d, raiz('Viajes').id, 10_000)
    const l = consumoPresupuestos(d, '2026-11', '2026-11-13')
    const ali = l.find((x) => x.categoria.nombre === 'Alimentación')!
    expect(ali.gastado).toBeGreaterThan(50)
    expect(ali.estado).toBe('superado')
    expect(ali.proyeccion).toBeCloseTo((ali.gastado / 13) * 30, 2)
    expect(l.find((x) => x.categoria.nombre === 'Viajes')!.estado).toBe('dentro')
    // Un mes cerrado no lleva proyección
    expect(consumoPresupuestos(d, '2026-10', '2026-11-13')[0].proyeccion).toBeNull()
  })

  it('propone la media de los 3 meses anteriores, redondeada a 10 €', () => {
    const s = sugerirPresupuestos(db, '2026-11')
    const ali = s.get(raiz('Alimentación').id)!
    expect(ali % 10).toBe(0)
    expect(ali).toBeGreaterThan(100)
    expect(s.has(raiz('Ingresos').id)).toBe(false)
  })
})
