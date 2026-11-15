import { describe, expect, it } from 'vitest'
import { borrarBien, datosIniciales, ErrorDatos, guardarBien, guardarCompromiso, guardarPrestamo } from '../datos/operaciones'
import { contieneIdentificativo, detectarIdentificativos } from './identificativos'
import { calcularPatrimonio, cuotaDe, cuotaPrestamo, finPrestamo, hayPatrimonio, interesesRestantes, mesesEntre, pendientePrestamo, valorBien } from './patrimonio'
import type { BaseDatos, Movimiento } from './tipos'

// Importes inventados
const db0 = datosIniciales()
const hipoteca = db0.cuentas.find((c) => c.tipo === 'hipoteca')!

describe('hipoteca a tipo fijo', () => {
  const p = { capital: 100000, fecha: '2026-11-01', interes: 3, plazo_meses: 240 }

  it('cuota del sistema francés y préstamo sin intereses', () => {
    expect(cuotaDe(100000, 3, 240)).toBe(554.6)
    expect(cuotaDe(12000, 0, 120)).toBe(100)
    expect(cuotaDe(0, 3, 240)).toBe(0)
  })

  it('el capital pendiente baja cada mes y llega a cero en la última cuota', () => {
    expect(pendientePrestamo(p, '2026-11-01')).toBe(100000)
    expect(pendientePrestamo(p, '2026-11-30')).toBe(100000)
    // Primera cuota: 250 de intereses y 304,60 de capital
    expect(pendientePrestamo(p, '2026-12-01')).toBeCloseTo(99695.4, 1)
    expect(pendientePrestamo(p, '2036-11-01')).toBeGreaterThan(50000)
    expect(pendientePrestamo(p, '2046-11-01')).toBe(0)
    expect(pendientePrestamo(p, '2050-01-01')).toBe(0)
    expect(finPrestamo(p)).toBe('2046-11')
    // Intereses que quedan: todas las cuotas menos el capital
    expect(interesesRestantes(p, '2026-11-01')).toBeCloseTo(554.6 * 240 - 100000, 0)
    expect(cuotaPrestamo(p)).toBe(554.6)
  })

  it('meses completos entre dos fechas', () => {
    expect(mesesEntre('2026-11-15', '2026-12-14')).toBe(0)
    expect(mesesEntre('2026-11-15', '2026-12-15')).toBe(1)
    expect(mesesEntre('2026-11-15', '2027-11-15')).toBe(12)
    expect(mesesEntre('2026-11-15', '2026-10-15')).toBe(-1)
  })

  it('se guarda solo en la hipoteca y con datos válidos', () => {
    const db = guardarPrestamo(db0, hipoteca.id, p)
    expect(db.cuentas.find((c) => c.id === hipoteca.id)!.prestamo).toEqual(p)
    expect(guardarPrestamo(db, hipoteca.id, null).cuentas.find((c) => c.id === hipoteca.id)!.prestamo).toBeNull()
    expect(() => guardarPrestamo(db0, db0.cuentas[0].id, p)).toThrow(/Solo las hipotecas/)
    expect(() => guardarPrestamo(db0, hipoteca.id, { ...p, interes: 25 })).toThrow(ErrorDatos)
    expect(() => guardarPrestamo(db0, hipoteca.id, { ...p, plazo_meses: 0 })).toThrow(ErrorDatos)
    expect(() => guardarPrestamo(db0, hipoteca.id, { ...p, capital: 0 })).toThrow(ErrorDatos)
  })
})

describe('bienes', () => {
  it('alta, valoraciones con su fecha y una sola vivienda habitual', () => {
    let db = guardarBien(db0, { alias: 'Vivienda habitual', tipo: 'inmueble', habitual: true, valor: 300000, fecha: '2026-01-15' })
    const id = db.ajustes.bienes[0].id
    db = guardarBien(db, { alias: 'Vivienda habitual', tipo: 'inmueble', habitual: true, valor: 320000, fecha: '2026-11-01' }, id)
    expect(db.ajustes.bienes[0].valoraciones).toEqual([
      { fecha: '2026-01-15', valor: 300000 },
      { fecha: '2026-11-01', valor: 320000 },
    ])
    // Antes de la primera valoración, la primera; después, la última hasta esa fecha
    expect(valorBien(db.ajustes.bienes[0], '2025-12-31')).toBe(300000)
    expect(valorBien(db.ajustes.bienes[0], '2026-06-30')).toBe(300000)
    expect(valorBien(db.ajustes.bienes[0], '2026-11-30')).toBe(320000)
    // La misma fecha sustituye su valoración
    db = guardarBien(db, { alias: 'Vivienda habitual', tipo: 'inmueble', habitual: true, valor: 325000, fecha: '2026-11-01' }, id)
    expect(db.ajustes.bienes[0].valoraciones).toHaveLength(2)
    // Otra vivienda habitual quita la marca a la anterior
    db = guardarBien(db, { alias: 'Piso nuevo', tipo: 'inmueble', habitual: true, valor: 200000, fecha: '2026-11-01' })
    expect(db.ajustes.bienes.map((b) => b.habitual)).toEqual([false, true])
    // Solo los inmuebles pueden ser vivienda habitual
    db = guardarBien(db, { alias: 'Fondo indexado', tipo: 'inversion', habitual: true, valor: 15000, fecha: '2026-11-01' })
    expect(db.ajustes.bienes[2].habitual).toBe(false)
    expect(borrarBien(db, id).ajustes.bienes).toHaveLength(2)
    expect(hayPatrimonio(db)).toBe(true)
    expect(hayPatrimonio(db0)).toBe(false)
  })

  it('no admite nombres repetidos, valores no válidos ni la referencia catastral', () => {
    const db = guardarBien(db0, { alias: 'Casa', tipo: 'inmueble', habitual: true, valor: 1, fecha: '2026-11-01' })
    expect(() => guardarBien(db, { alias: 'casa', tipo: 'inmueble', habitual: false, valor: 1, fecha: '2026-11-01' })).toThrow(/Ya hay un bien/)
    expect(() => guardarBien(db0, { alias: 'X', tipo: 'inmueble', habitual: false, valor: -1, fecha: '2026-11-01' })).toThrow(ErrorDatos)
    expect(() => guardarBien(db0, { alias: 'X', tipo: 'inmueble', habitual: false, valor: 1, fecha: '2026-13-01' })).toThrow(ErrorDatos)
    expect(() => guardarBien(db0, { alias: 'Piso 9872023VH5797S0001WX', tipo: 'inmueble', habitual: false, valor: 1, fecha: '2026-11-01' })).toThrow(/referencia catastral/)
  })
})

describe('referencia catastral', () => {
  it('se detecta urbana, con o sin cargo, y rústica; no en textos normales', () => {
    expect(detectarIdentificativos('9872023VH5797S0001WX')[0].tipo).toBe('catastro')
    expect(contieneIdentificativo('Ref 9872023 VH5797S 0001 WX')).toBe(true)
    expect(contieneIdentificativo('parcela 9872023VH5797S')).toBe(true)
    expect(contieneIdentificativo('13077A01800039 0000 BP')).toBe(true)
    expect(contieneIdentificativo('MERCADONA 1234 BARCELONA')).toBe(false)
    expect(contieneIdentificativo('Recibo IBI 2026')).toBe(false)
  })
})

describe('patrimonio neto', () => {
  let n = 0
  const mov = (fecha: string, importe: number, cuenta: string, extra: Partial<Movimiento> = {}): Movimiento => ({
    id: `p${++n}`, cuenta_id: cuenta, importacion_id: null, fecha_operacion: fecha, fecha_valor: null, concepto_original: `X${n}`, concepto_limpio: `X${n}`,
    concepto_normalizado: `x${n}`, ocurrencia: 1, importe, saldo: null, categoria_id: null, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null,
    reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '', ...extra,
  })

  it('liquidez más bienes menos hipoteca y deuda familiar, y su evolución', () => {
    const [principal, segunda] = db0.cuentas
    let db: BaseDatos = {
      ...db0,
      movimientos: [
        mov('2026-09-30', 100, principal.id, { saldo: 5000 }),
        mov('2026-09-30', 100, segunda.id, { saldo: 20000 }),
        mov('2026-10-31', 100, principal.id, { saldo: 6000 }),
        mov('2026-10-31', 100, segunda.id, { saldo: 21000 }),
        mov('2026-11-10', -2000, principal.id, { saldo: 4000, tipo: 'pago_deuda' }),
      ],
    }
    db = guardarCompromiso(db, db.compromisos[0].id, { deuda_inicial: 30000, fecha_referencia: '2026-10-01', colchon: 1000, cuenta_colchon_id: segunda.id, ventana_mes_inicio: 6, ventana_mes_fin: 8, mes_referencia: 8 })
    db = guardarBien(db, { alias: 'Vivienda habitual', tipo: 'inmueble', habitual: true, valor: 300000, fecha: '2026-10-01' })
    db = guardarBien(db, { alias: 'Plan de pensiones', tipo: 'pension', habitual: false, valor: 10000, fecha: '2026-10-01' })
    db = guardarPrestamo(db, hipoteca.id, { capital: 100000, fecha: '2026-11-01', interes: 3, plazo_meses: 240 })
    const p = calcularPatrimonio(db, '2026-11-15')
    expect(p.liquidez).toBe(25000)
    expect(p.inmuebles).toHaveLength(1)
    expect(p.otros[0].valor).toBe(10000)
    expect(p.hipotecas[0]).toMatchObject({ pendiente: 100000, cuota: 554.6, fin: '2046-11' })
    expect(p.deudaFamiliar).toBe(28000)
    expect(p.activos).toBe(335000)
    expect(p.deudas).toBe(128000)
    expect(p.neto).toBe(207000)
    // Septiembre: la deuda aún entera y la hipoteca con algo más pendiente (antes de su fecha)
    const sep = p.evolucion.find((e) => e.mes === '2026-09')!
    expect(sep.liquidez).toBe(25000)
    expect(sep.deudas).toBeGreaterThan(130000)
    expect(p.evolucion.at(-1)!.neto).toBe(p.neto)
    // Sin hipoteca ni bienes, el patrimonio es la liquidez menos la deuda
    const solo = calcularPatrimonio({ ...db0, movimientos: db.movimientos }, '2026-11-15')
    expect(solo.neto).toBe(25000)
    expect(solo.hipotecasSinDatos).toHaveLength(1)
  })
})

describe('situación completa para Claude', async () => {
  const { textoPatrimonio } = await import('./analizar')
  const { generarDatosPrueba } = await import('./datosPrueba')
  const { SIN_SIMULACION } = await import('./plan')
  const HOY = '2026-11-20'
  let db: BaseDatos = { ...db0, ...generarDatosPrueba({ cuentas: db0.cuentas, categorias: db0.categorias, desde: '2026-08-01', hasta: HOY }) }
  db = guardarBien(db, { alias: 'Casa de Sitges', tipo: 'inmueble', habitual: true, valor: 300000, fecha: '2026-10-01' })
  db = guardarBien(db, { alias: 'Fondo de mi banco', tipo: 'inversion', habitual: false, valor: 12345.67, fecha: '2026-10-01' })
  db = guardarPrestamo(db, hipoteca.id, { capital: 100000, fecha: '2026-11-01', interes: 2.5, plazo_meses: 300 })

  it('patrimonio con importes exactos y sin nombres de bienes', () => {
    const t = textoPatrimonio(db, HOY, SIN_SIMULACION)
    expect(t).toContain('Inmueble 1, vivienda habitual: valor estimado 300.000,00 €')
    expect(t).toContain('Inversión 1: 12.345,67 €')
    expect(t).toMatch(/Hipoteca a tipo fijo del 2,5 %: quedan 100\.000,00 €, cuota de [\d.]+,\d\d € al mes/)
    expect(t).toContain('Patrimonio neto:')
    expect(t).toContain('Gasto medio al mes por categoría')
    expect(t).toContain('No tengo todavía una operación concreta.')
    expect(t).not.toContain('Sitges')
    expect(t).not.toContain('Fondo de mi banco')
    expect(contieneIdentificativo(t)).toBe(false)
  })

  it('con una compra simulada, la operación y sus cifras', () => {
    const compra = { precio: 250000, mes: '2027-09', entrada_pct: 20, gastos_pct: 12, interes: 3, anios: 25, gastos_mes: 150, alquiler_mes: 900, uso: 'alquilar' as const }
    const t = textoPatrimonio(db, HOY, { ...SIN_SIMULACION, compra })
    expect(t).toContain('Operación que quiero valorar: comprar una vivienda para alquilar de 250.000,00 €')
    expect(t).toContain('entrada de 50.000,00 €, gastos de compra de 30.000,00 €, hipoteca de 200.000,00 € a 25 años al 3 %')
    expect(t).toContain('Alquiler previsto: 900,00 € al mes.')
  })
})
