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

  it('consumo del mes con estado y cierre previsto', () => {
    let d = guardarPresupuesto(db, raiz('Alimentación').id, 50)
    d = guardarPresupuesto(d, raiz('Viajes').id, 10_000)
    const l = consumoPresupuestos(d, '2026-11', '2026-11-13')
    const ali = l.find((x) => x.categoria.nombre === 'Alimentación')!
    expect(ali.gastado).toBeGreaterThan(50)
    expect(ali.estado).toBe('superado')
    // El cierre suma a lo gastado el gasto de los días que quedan
    expect(ali.cierre!).toBeGreaterThan(ali.gastado)
    expect(l.find((x) => x.categoria.nombre === 'Viajes')!.estado).toBe('dentro')
    // Las superadas, primero
    expect(l[0].categoria.nombre).toBe('Alimentación')
    // Un mes cerrado no lleva cierre previsto ni recibos pendientes
    expect(consumoPresupuestos(d, '2026-10', '2026-11-13')[0]).toMatchObject({ cierre: null, comprometido: 0 })
  })

  it('propone la media de los 3 meses anteriores, redondeada a 10 €', () => {
    const s = sugerirPresupuestos(db, '2026-11')
    const ali = s.get(raiz('Alimentación').id)!
    expect(ali % 10).toBe(0)
    expect(ali).toBeGreaterThan(100)
    expect(s.has(raiz('Ingresos').id)).toBe(false)
  })
})

describe('excepciones por mes, vista anual y avisos', () => {
  const ali = raiz('Alimentación').id
  it('un mes con otro importe; al quitarlo vuelve al de siempre', async () => {
    const { guardarExcepcionPresupuesto } = await import('../datos/operaciones')
    let d = guardarPresupuesto(db, ali, 50)
    d = guardarExcepcionPresupuesto(d, ali, '2026-11', 5000)
    expect(consumoPresupuestos(d, '2026-11', '2026-11-13')[0]).toMatchObject({ presupuesto: 5000, estado: 'dentro' })
    expect(consumoPresupuestos(d, '2026-10', '2026-11-13')[0].presupuesto).toBe(50)
    d = guardarExcepcionPresupuesto(d, ali, '2026-11', null)
    expect(consumoPresupuestos(d, '2026-11', '2026-11-13')[0].presupuesto).toBe(50)
    expect(() => guardarExcepcionPresupuesto(d, ali, '2026-13', 10)).toThrow(/Mes/)
  })

  it('solo con un mes especial, el presupuesto vale solo ese mes', async () => {
    const { guardarExcepcionPresupuesto } = await import('../datos/operaciones')
    const d = guardarExcepcionPresupuesto(db, raiz('Viajes').id, '2026-08', 1500)
    expect(consumoPresupuestos(d, '2026-08', '2026-11-13').map((l) => l.presupuesto)).toEqual([1500])
    expect(consumoPresupuestos(d, '2026-09', '2026-11-13')).toEqual([])
    // Quitar el importe mensual no borra los meses especiales
    expect(guardarPresupuesto(d, raiz('Viajes').id, null).presupuestos).toHaveLength(1)
  })

  it('vista anual: suma de cada mes desde el primero completo, el actual en proporción', async () => {
    const { presupuestoAnual } = await import('./presupuesto')
    const d = guardarPresupuesto(db, ali, 300)
    const a = presupuestoAnual(d, '2026', '2026-11-13')
    // Datos desde agosto: cuentan septiembre, octubre y noviembre (13 de 30 días)
    expect(a.meses).toBe(3)
    expect(a.lineas[0].presupuesto).toBeCloseTo(300 + 300 + (300 * 13) / 30, 2)
  })

  it('avisos al importar: categorías cerca del límite o superadas', async () => {
    const { avisosPresupuesto } = await import('./presupuesto')
    let d = guardarPresupuesto(db, ali, 50)
    d = guardarPresupuesto(d, raiz('Viajes').id, 100_000)
    const a = avisosPresupuesto(d, ['2026-11'], '2026-11-13')
    expect(a.map((x) => [x.categoria.nombre, x.estado])).toEqual([['Alimentación', 'superado']])
  })
})

describe('cierre previsto y estado por categoría (v0.36.0)', async () => {
  const { normalizarConcepto } = await import('./conceptos')
  const { totalPresupuesto } = await import('./presupuesto')
  type Mov = (typeof db.movimientos)[number]
  type Rec = import('./recurrentes').Recurrente
  let n = 0
  const mov = (fecha: string, concepto: string, importe: number, categoria: string): Mov => ({
    id: `p${++n}`, cuenta_id: db0.cuentas[0].id, importacion_id: null, fecha_operacion: fecha, fecha_valor: null,
    concepto_original: concepto, concepto_limpio: concepto, concepto_normalizado: normalizarConcepto(concepto), ocurrencia: 1,
    importe, saldo: null, categoria_id: categoria, tipo: 'normal', regla_id: null, origen_categoria: 'manual', nota: null,
    reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '',
  })
  const vivienda = raiz('Vivienda').id
  const suministros = raiz('Suministros').id
  const restaurantes = raiz('Restaurantes').id
  // Agosto es el primer mes (no cuenta para el ritmo); septiembre y octubre, completos; noviembre, hasta el 14
  const hipoteca = ['2026-09-05', '2026-10-05', '2026-11-05'].map((f) => mov(f, 'RECIBO HIPOTECA', -950, vivienda))
  const luz = ['2026-09-20', '2026-10-20'].map((f) => mov(f, 'RECIBO LUZ', -60, suministros))
  const cenas = [
    mov('2026-08-20', 'BAR UNO', -10, restaurantes),
    mov('2026-09-10', 'BAR UNO', -150, restaurantes),
    mov('2026-09-25', 'BAR UNO', -150, restaurantes),
    mov('2026-10-10', 'BAR UNO', -100, restaurantes),
    mov('2026-10-25', 'BAR UNO', -200, restaurantes),
    mov('2026-11-14', 'BAR UNO', -200, restaurantes),
  ]
  // Un cargo de primeros de mes que no está detectado como recibo (solo dos veces antes)
  const hijos = raiz('Hijos').id
  const colegio = ['2026-09-03', '2026-10-03', '2026-11-03'].map((f) => mov(f, 'COLEGIO', -440, hijos))
  const base = { ...db0, movimientos: [...hipoteca, ...luz, ...cenas, ...colegio] }
  const rec = (ids: string[], categoria_id: string, importe: number, ultima: string, proxima: string) =>
    ({ ids, categoria_id, importe, ultima, proxima, activo: true }) as unknown as Rec
  const recurrentes = [rec(hipoteca.map((m) => m.id), vivienda, 950, '2026-11-05', '2026-12-05'), rec(luz.map((m) => m.id), suministros, 60, '2026-10-20', '2026-11-20')]
  const linea = (d: typeof base, nombre: string) => consumoPresupuestos(d, '2026-11', '2026-11-14', recurrentes).find((l) => l.categoria.nombre === nombre)!

  it('un recibo ya pagado no se proyecta: la hipoteca del día 5 cierra en su importe y va bien', () => {
    const d = guardarPresupuesto(base, vivienda, 1000)
    expect(linea(d, 'Vivienda')).toMatchObject({ gastado: 950, comprometido: 0, cierre: 950, estado: 'dentro' })
  })

  it('un recibo que falta cuenta como comprometido y puede poner la categoría en riesgo', () => {
    expect(linea(guardarPresupuesto(base, suministros, 100), 'Suministros')).toMatchObject({ gastado: 0, comprometido: 60, cierre: 60, estado: 'dentro' })
    expect(linea(guardarPresupuesto(base, suministros, 50), 'Suministros')).toMatchObject({ comprometido: 60, estado: 'riesgo' })
  })

  it('lo que falta de gasto variable es lo que se gastó esos mismos días en los meses anteriores', () => {
    const holgado = linea(guardarPresupuesto(base, restaurantes, 400), 'Restaurantes')
    // 200 gastados; del 15 a fin de mes se gastaron 150 en septiembre y 200 en octubre
    expect(holgado.cierre).toBe(200 + (150 + 200) / 2)
    expect(holgado.estado).toBe('dentro')
    expect(linea(guardarPresupuesto(base, restaurantes, 300), 'Restaurantes').estado).toBe('riesgo')
    expect(linea(guardarPresupuesto(base, restaurantes, 150), 'Restaurantes').estado).toBe('superado')
  })

  it('un cargo de primeros de mes sin detectar como recibo tampoco se vuelve a contar', () => {
    expect(linea(guardarPresupuesto(base, hijos, 450), 'Hijos')).toMatchObject({ gastado: 440, cierre: 440, estado: 'dentro' })
  })

  it('justo en el presupuesto y sin más cargos previstos, no es un aviso', () => {
    expect(linea(guardarPresupuesto(base, vivienda, 950), 'Vivienda').estado).toBe('dentro')
  })

  it('la referencia del mes suma al presupuesto lo habitual de las categorías sin presupuesto', async () => {
    const { referenciaConPresupuesto } = await import('./presupuesto')
    const solo = guardarPresupuesto(base, restaurantes, 400)
    // Septiembre y octubre: 1.750 € al mes, de ellos 300 en Restaurantes; el resto, 1.450
    expect(referenciaConPresupuesto(solo, '2026-11', consumoPresupuestos(solo, '2026-11', '2026-11-14', recurrentes))).toEqual({ importe: 1850, presupuesto: 400, resto: 1450 })
    let todo = guardarPresupuesto(solo, vivienda, 1000)
    todo = guardarPresupuesto(todo, suministros, 100)
    todo = guardarPresupuesto(todo, hijos, 450)
    expect(referenciaConPresupuesto(todo, '2026-11', consumoPresupuestos(todo, '2026-11', '2026-11-14', recurrentes))).toEqual({ importe: 1950, presupuesto: 1950, resto: 0 })
    expect(referenciaConPresupuesto(base, '2026-11', [])).toBeNull()
  })

  it('el total suma presupuestos, gasto y cierres, y cuenta los avisos', () => {
    let d = guardarPresupuesto(base, vivienda, 1000)
    d = guardarPresupuesto(d, suministros, 50)
    d = guardarPresupuesto(d, restaurantes, 150)
    const t = totalPresupuesto(consumoPresupuestos(d, '2026-11', '2026-11-14', recurrentes))
    expect(t).toMatchObject({ presupuesto: 1200, gastado: 1150, superadas: 1, enRiesgo: 1 })
    expect(t.cierre!).toBeGreaterThan(1150 + 60)
    expect(totalPresupuesto(consumoPresupuestos(d, '2026-10', '2026-11-14', recurrentes)).cierre).toBeNull()
  })
})
