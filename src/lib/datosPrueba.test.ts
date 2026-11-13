import { describe, expect, it } from 'vitest'
import { contieneIdentificativo } from './identificativos'
import { generarDatosPrueba } from './datosPrueba'
import { calcularResumen, periodoMes } from './resumen'
import type { Categoria, Cuenta } from './tipos'

const cuenta = (id: string, alias: string, tipo: Cuenta['tipo'], orden: number): Cuenta => ({
  id, user_id: 'u', alias, entidad: 'BBVA', tipo, activa: true, orden, created_at: '',
})
const CUENTAS = [
  cuenta('c1', 'Cuenta principal', 'cuenta', 1),
  cuenta('c2', 'Cuenta 2', 'cuenta', 2),
  cuenta('t', 'Tarjeta', 'tarjeta_credito', 3),
  cuenta('h', 'Hipoteca', 'hipoteca', 4),
]
const c = (id: string, nombre: string, padre: string | null = null, naturaleza: 'gasto' | 'ingreso' = 'gasto'): Categoria => ({
  id, user_id: 'u', padre_id: padre, nombre, icono: null, color: '#000000', naturaleza, activa: true, orden: 0,
})
const CATEGORIAS = [
  c('viv', 'Vivienda'), c('viv-hip', 'Hipoteca', 'viv'),
  c('ali', 'Alimentación'), c('ali-sup', 'Supermercado', 'ali'),
  c('via', 'Viajes'), c('via-alo', 'Alojamiento', 'via'), c('via-tra', 'Transporte', 'via'),
  c('ing', 'Ingresos', null, 'ingreso'), c('ing-nom', 'Nómina', 'ing', 'ingreso'),
]

let n = 0
const generar = (hasta = '2026-11-13') =>
  generarDatosPrueba({ cuentas: CUENTAS, categorias: CATEGORIAS, desde: '2026-10-01', hasta, nuevoId: () => `id-${++n}` })

describe('generarDatosPrueba', () => {
  const datos = generar()

  it('genera movimientos solo dentro del rango', () => {
    expect(datos.movimientos.length).toBeGreaterThan(80)
    expect(datos.movimientos.every((m) => m.fecha_operacion >= '2026-10-01' && m.fecha_operacion <= '2026-11-13')).toBe(true)
  })

  it('ningún concepto lleva datos identificativos', () => {
    for (const m of datos.movimientos) {
      expect(contieneIdentificativo(m.concepto_original)).toBe(false)
      expect(contieneIdentificativo(m.concepto_limpio)).toBe(false)
    }
  })

  it('no repite la clave de deduplicación', () => {
    const claves = datos.movimientos.map((m) => `${m.cuenta_id}|${m.fecha_operacion}|${m.importe}|${m.concepto_normalizado}|${m.ocurrencia}`)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('una importación por cuenta con movimientos, ninguna para la hipoteca', () => {
    expect(datos.importaciones.map((i) => i.cuenta_id).sort()).toEqual(['c1', 'c2', 't'])
    const total = datos.importaciones.reduce((s, i) => s + i.movimientos_nuevos, 0)
    expect(total).toBe(datos.movimientos.length)
    const ids = new Set(datos.importaciones.map((i) => i.id))
    expect(datos.movimientos.every((m) => ids.has(m.importacion_id))).toBe(true)
  })

  it('la liquidación de noviembre cuadra con la tarjeta de octubre', () => {
    const tarjetaOct = datos.movimientos
      .filter((m) => m.cuenta_id === 't' && m.fecha_operacion.startsWith('2026-10'))
      .reduce((s, m) => s + m.importe, 0)
    const liquidacion = datos.movimientos.find((m) => m.fecha_operacion === '2026-11-03' && m.tipo === 'traspaso_interno')!
    expect(liquidacion.importe).toBeCloseTo(tarjetaOct, 2)
  })

  it('el reembolso de noviembre cubre los gastos de empleado de octubre y queda conciliado', () => {
    const datos = generar('2026-11-30')
    const gastosOct = datos.movimientos.filter((m) => m.tipo === 'gasto_empleado' && m.fecha_operacion.startsWith('2026-10'))
    const reembolso = datos.movimientos.find((m) => m.tipo === 'reembolso_empresa')!
    expect(gastosOct.length).toBeGreaterThan(0)
    expect(reembolso.importe).toBeCloseTo(-gastosOct.reduce((s, m) => s + m.importe, 0), 2)
    const conciliados = datos.conciliaciones.filter((x) => x.reembolso_id === reembolso.id)
    expect(conciliados.map((x) => x.gasto_id).sort()).toEqual(gastosOct.map((m) => m.id).sort())
  })

  it('es determinista', () => {
    const a = generar().movimientos.map((m) => [m.fecha_operacion, m.importe, m.concepto_original])
    const b = generar().movimientos.map((m) => [m.fecha_operacion, m.importe, m.concepto_original])
    expect(a).toEqual(b)
  })

  it('hasta el reembolso, los gastos de empleado de octubre siguen pendientes', () => {
    const r = calcularResumen(periodoMes('2026-10-01'), datos.movimientos, CATEGORIAS, datos.conciliaciones)
    expect(r.empleado.pendiente).toBeCloseTo(r.empleado.gastos)
  })

  it('da un resumen de octubre coherente', () => {
    const datos = generar('2026-11-30')
    const r = calcularResumen(periodoMes('2026-10-01'), datos.movimientos, CATEGORIAS, datos.conciliaciones)
    expect(r.totales.ingresos).toBeCloseTo(4862.37)
    expect(r.totales.gastos).toBeGreaterThan(1500)
    expect(r.empleado.gastos).toBeGreaterThan(0)
    expect(r.empleado.pendiente).toBe(0) // reembolsado y conciliado el 20 de noviembre
  })
})
