import { describe, expect, it } from 'vitest'
import { generarDatosPrueba } from '../lib/datosPrueba'
import { calcularExtracto, cierreAnual, evolucionMensual, movimientosDeCategoria, serieCategoria } from '../lib/extracto'
import type { BaseDatos } from '../lib/tipos'
import { alternarFuera, cambiarCategoria, cambiarTipo, guardarNota, marcarFuera, mismoConcepto } from './movimientos'
import { comprobarBaseDatos, datosIniciales } from './operaciones'
import { clasificar, categoriasAprendidas } from '../importacion/reglas'

function base(hasta = '2026-11-13'): BaseDatos {
  const db = datosIniciales()
  const p = generarDatosPrueba({ cuentas: db.cuentas, categorias: db.categorias, desde: '2026-10-01', hasta })
  return { ...db, ...p }
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

describe('fuera del extracto', () => {
  it('deslizar saca un gasto como gasto de empleado y lo devuelve a Normal', () => {
    const db = base()
    const m = db.movimientos.find((x) => x.tipo === 'normal' && x.importe < 0)!
    const a = alternarFuera(db, m.id)
    expect(a.movimientos.find((x) => x.id === m.id)!.tipo).toBe('gasto_empleado')
    expect(alternarFuera(a, m.id).movimientos.find((x) => x.id === m.id)!.tipo).toBe('normal')
  })

  it('un ingreso sale como reembolso', () => {
    const db = base()
    const m = db.movimientos.find((x) => x.tipo === 'normal' && x.importe > 0)!
    expect(alternarFuera(db, m.id).movimientos.find((x) => x.id === m.id)!.tipo).toBe('reembolso_empresa')
  })

  it('en bloque, cada uno según su signo; los traspasos no se tocan', () => {
    const db = base()
    const gasto = db.movimientos.find((x) => x.tipo === 'normal' && x.importe < 0)!
    const ingreso = db.movimientos.find((x) => x.tipo === 'normal' && x.importe > 0)!
    const traspaso = db.movimientos.find((x) => x.tipo === 'traspaso_interno')!
    const r = marcarFuera(db, [gasto.id, ingreso.id, traspaso.id], true)
    const tipo = (id: string) => r.movimientos.find((x) => x.id === id)!.tipo
    expect([tipo(gasto.id), tipo(ingreso.id), tipo(traspaso.id)]).toEqual(['gasto_empleado', 'reembolso_empresa', 'traspaso_interno'])
    expect(() => alternarFuera(db, traspaso.id)).toThrow(/traspaso/i)
    const vuelta = marcarFuera(r, [gasto.id, ingreso.id], false)
    expect(vuelta.movimientos.find((x) => x.id === gasto.id)!.tipo).toBe('normal')
    expect(cambiarTipo(vuelta, [gasto.id], 'pago_deuda').movimientos.find((x) => x.id === gasto.id)!.tipo).toBe('pago_deuda')
  })

  it('notas sin datos identificativos', () => {
    const db = base()
    const id = db.movimientos[0].id
    expect(guardarNota(db, id, 'Cena con el cliente').movimientos[0].nota).toBe('Cena con el cliente')
    expect(() => guardarNota(db, id, 'DNI 12345678Z')).toThrow(/DNI/)
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
