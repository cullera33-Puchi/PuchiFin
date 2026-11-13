import { describe, expect, it } from 'vitest'
import { generarDatosPrueba } from '../lib/datosPrueba'
import { calcularExtracto, cierreAnual, evolucionMensual, movimientosDeCategoria, serieCategoria } from '../lib/extracto'
import type { BaseDatos, Movimiento } from '../lib/tipos'
import {
  alternarEmpleado,
  cambiarCategoria,
  cambiarTipo,
  cerrarReembolso,
  conciliar,
  desconciliar,
  gastosPendientes,
  guardarNota,
  indicadoresEmpleado,
  mismoConcepto,
  proponerConciliacion,
} from './movimientos'
import { comprobarBaseDatos, datosIniciales } from './operaciones'
import { clasificar, categoriasAprendidas } from '../importacion/reglas'

function base(hasta = '2026-11-13'): BaseDatos {
  const db = datosIniciales()
  const p = generarDatosPrueba({ cuentas: db.cuentas, categorias: db.categorias, desde: '2026-10-01', hasta })
  // Sin las conciliaciones generadas, para probar la conciliación a mano
  return { ...db, ...p, conciliaciones: [] }
}
const cat = (db: BaseDatos, nombre: string) => db.categorias.find((c) => c.nombre === nombre)!

describe('corrección de categorías', () => {
  it('cambia una, todas las del mismo concepto y crea la regla para los futuros', () => {
    const db = base()
    const merca = db.movimientos.filter((m) => m.concepto_normalizado === 'mercadona')
    expect(merca.length).toBeGreaterThan(1)
    expect(mismoConcepto(db, [merca[0].id])).toHaveLength(merca.length - 1)

    const regalos = cat(db, 'Regalos')
    const solo = cambiarCategoria(db, [merca[0].id], regalos.id)
    expect(solo.movimientos.filter((m) => m.categoria_id === regalos.id)).toHaveLength(1)

    const todo = cambiarCategoria(db, [merca[0].id], regalos.id, { mismoConcepto: true, crearRegla: true })
    expect(todo.movimientos.filter((m) => m.concepto_normalizado === 'mercadona').every((m) => m.categoria_id === regalos.id && m.origen_categoria === 'manual')).toBe(true)
    const regla = todo.reglas.find((r) => r.origen === 'manual')!
    expect(regla).toMatchObject({ patron: 'mercadona', tipo_patron: 'exacto', categoria_id: regalos.id })
    // La próxima importación usa la regla manual antes que las de la app
    const c = clasificar({ texto: 'mercadona', clave: 'mercadona', cuenta_id: db.cuentas[2].id, importe: -20 }, todo.reglas, categoriasAprendidas(todo))
    expect(c.categoria_id).toBe(regalos.id)
    expect(comprobarBaseDatos(todo)).toEqual([])
  })

  it('lo corregido a mano se aprende aunque no se cree regla', () => {
    const db = base()
    const m = db.movimientos.find((x) => x.concepto_normalizado === 'cines abc')!
    const r = cambiarCategoria(db, [m.id], cat(db, 'Cultura').id)
    expect(categoriasAprendidas(r).porClave.get('cines abc')).toBe(cat(db, 'Cultura').id)
  })
})

describe('tipos y empleado', () => {
  it('deslizar marca y desmarca gasto de empleado', () => {
    const db = base()
    const m = db.movimientos.find((x) => x.tipo === 'normal' && x.importe < 0)!
    const a = alternarEmpleado(db, m.id)
    expect(a.movimientos.find((x) => x.id === m.id)!.tipo).toBe('gasto_empleado')
    expect(alternarEmpleado(a, m.id).movimientos.find((x) => x.id === m.id)!.tipo).toBe('normal')
  })

  it('notas sin datos identificativos', () => {
    const db = base()
    const id = db.movimientos[0].id
    expect(guardarNota(db, id, 'Cena con el cliente').movimientos[0].nota).toBe('Cena con el cliente')
    expect(() => guardarNota(db, id, 'DNI 12345678Z')).toThrow(/DNI/)
  })
})

describe('conciliación de reembolsos', () => {
  it('propone los gastos pendientes que suman el reembolso, del más antiguo al más reciente', () => {
    const db = base()
    const reembolso = db.movimientos.find((m) => m.tipo === 'reembolso_empresa')!
    const octubre = db.movimientos.filter((m) => m.tipo === 'gasto_empleado' && m.fecha_operacion.startsWith('2026-10'))
    const p = proponerConciliacion(db, reembolso.id)
    expect(p.exacta).toBe(true)
    expect(p.gastos.sort()).toEqual(octubre.map((m) => m.id).sort())

    const c = conciliar(db, reembolso.id, p.gastos)
    const ind = indicadoresEmpleado(c, '2026-11-13')
    const noviembre = db.movimientos.filter((m) => m.tipo === 'gasto_empleado' && m.fecha_operacion.startsWith('2026-11'))
    expect(ind.pendienteNumero).toBe(noviembre.length)
    expect(ind.reembolsadoAnio).toBeCloseTo(reembolso.importe)
    expect(ind.reembolsosDeMas).toEqual([])
    expect(gastosPendientes(c).every((p) => p.gasto.fecha_operacion.startsWith('2026-11'))).toBe(true)
    expect(desconciliar(c, reembolso.id).conciliaciones).toHaveLength(0)
  })

  it('si no cuadra, la diferencia queda visible', () => {
    const db = base()
    const reembolso = db.movimientos.find((m) => m.tipo === 'reembolso_empresa')!
    const [g1, g2] = gastosPendientes(db)
    // Reembolso de más: solo un gasto
    const deMas = conciliar(db, reembolso.id, [g1.gasto.id])
    expect(indicadoresEmpleado(deMas, '2026-11-13').reembolsosDeMas[0].sinAplicar).toBeCloseTo(reembolso.importe - g1.pendiente)
    // Gasto cerrado sin reembolso completo
    const cerrado = cerrarReembolso(db, g2.gasto.id, true)
    expect(indicadoresEmpleado(cerrado, '2026-11-13').diferencias[0].noReembolsado).toBeCloseTo(g2.pendiente)
  })

  it('reparte un reembolso menor que los gastos y deja el resto pendiente', () => {
    const db = base()
    const pend = gastosPendientes(db)
    const total = pend.slice(0, 2).reduce((s, p) => s + p.pendiente, 0)
    const reembolso: Movimiento = { ...db.movimientos[0], id: 'r1', tipo: 'reembolso_empresa', importe: Math.round((total - 10) * 100) / 100, fecha_operacion: '2026-11-12', ocurrencia: 7 }
    const db2 = { ...db, movimientos: [...db.movimientos, reembolso] }
    const c = conciliar(db2, 'r1', [pend[0].gasto.id, pend[1].gasto.id])
    const restante = gastosPendientes(c).find((p) => p.gasto.id === pend[1].gasto.id)!
    expect(restante.pendiente).toBeCloseTo(10)
  })

  it('al dejar de ser reembolso se quitan sus conciliaciones', () => {
    const db = base()
    const reembolso = db.movimientos.find((m) => m.tipo === 'reembolso_empresa')!
    const c = conciliar(db, reembolso.id, proponerConciliacion(db, reembolso.id).gastos)
    expect(cambiarTipo(c, [reembolso.id], 'normal').conciliaciones).toHaveLength(0)
  })

  it('antigüedad y gastos atrasados', () => {
    const db = base()
    const ind = indicadoresEmpleado(db, '2026-12-20')
    expect(ind.antiguedad).toBeGreaterThan(60)
    expect(ind.atrasados).toBeGreaterThan(0)
  })
})

describe('extracto y análisis', () => {
  const db = base('2026-12-31')

  it('compara con la media de los meses anteriores con datos', () => {
    const oct = calcularExtracto(db, '2026-10')
    expect(oct.media).toBeNull()
    expect(oct.hayAnterior).toBe(false)
    const dic = calcularExtracto(db, '2026-12')
    expect(dic.mesesMedia).toBe(2)
    const nov = calcularExtracto(db, '2026-11')
    expect(dic.media!.gastos).toBeCloseTo((oct.totales.gastos + nov.totales.gastos) / 2, 1)
    expect(dic.haySiguiente).toBe(true) // la nómina del 31 de diciembre cuenta en enero
  })

  it('el mes en curso se compara con los mismos días de los meses anteriores', () => {
    const completa = calcularExtracto(db, '2026-12')
    const enCurso = calcularExtracto(db, '2026-12', '2026-12-13')
    expect([enCurso.enCurso, enCurso.diaCorte]).toEqual([true, 13])
    // La nómina cuenta el día 1 (se cobró a fin del mes anterior): está en los días 1 a 13
    expect(enCurso.media!.ingresos).toBeCloseTo(completa.media!.ingresos)
    expect(enCurso.media!.gastos).toBeLessThan(completa.media!.gastos)
  })

  it('desglosa por categoría con peso y media', () => {
    const nov = calcularExtracto(db, '2026-11')
    const suma = nov.categorias.reduce((s, c) => s + c.importe, 0)
    expect(suma).toBeCloseTo(nov.totales.gastos, 1)
    expect(nov.categorias.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1)
    const viv = nov.categorias.find((c) => c.nombre === 'Vivienda')!
    expect(viv.media).not.toBeNull()
    const movs = movimientosDeCategoria(db, '2026-11', viv.id)
    expect(-movs.reduce((s, m) => s + m.importe, 0)).toBeCloseTo(viv.importe)
  })

  it('evolución, serie de una categoría y cierre anual', () => {
    expect(evolucionMensual(db).map((p) => p.mes)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01'])
    const serie = serieCategoria(db, cat(db, 'Vivienda').id)
    expect(serie[2].mediaMovil).toBeCloseTo((serie[0].importe + serie[1].importe + serie[2].importe) / 3, 1)
    expect(cierreAnual(db)[0]).toMatchObject({ anio: '2026', meses: 3 })
    expect(cierreAnual(db)[1]).toMatchObject({ anio: '2027', meses: 1 })
  })
})
