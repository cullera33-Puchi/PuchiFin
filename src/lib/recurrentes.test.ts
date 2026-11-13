import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { normalizarConcepto } from './conceptos'
import { detectarRecurrentes, fijoYVariable, resumenFijos } from './recurrentes'
import type { BaseDatos, Movimiento } from './tipos'

const db0 = datosIniciales()
const cuenta = db0.cuentas[0].id
let n = 0
const mov = (concepto: string, importe: number, fecha: string): Movimiento => ({
  id: `m${++n}`, cuenta_id: cuenta, importacion_id: null, fecha_operacion: fecha, fecha_valor: null, concepto_original: concepto, concepto_limpio: concepto,
  concepto_normalizado: normalizarConcepto(concepto), ocurrencia: 1, importe, saldo: null, categoria_id: null, tipo: 'normal', regla_id: null,
  origen_categoria: null, nota: null, reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '',
})
const meses = (concepto: string, importes: number[], dia = '05', desde = 4) =>
  importes.map((imp, i) => mov(concepto, -imp, `2026-${String(desde + i).padStart(2, '0')}-${dia}`))

const db: BaseDatos = {
  ...db0,
  movimientos: [
    ...meses('NETFLIX', [12.99, 12.99, 12.99, 12.99, 13.99, 13.99, 15.99]), // abril a octubre, sube en octubre
    ...meses('RECIBO ENERGIA ELECTRICA', [61.2, 74.5, 88.1, 92.4, 70.3, 66.0, 58.9], '12'), // variable
    ...meses('MERCADONA', [80, 20, 140, 35, 210, 60, 95], '08'), // no es fijo: importes muy dispares
    mov('MERCADONA', -45, '2026-05-21'),
    mov('SEGURO HOGAR ZETA', -212.4, '2025-03-14'),
    mov('SEGURO HOGAR ZETA', -219.8, '2026-03-16'), // anual
    ...meses('GIMNASIO ZETA', [39.9, 39.9, 39.9], '02', 4), // abril a junio y se da de baja
    mov('PayPal Europe S.a.r.l. et Cie S.c.a', -4.99, '2026-08-20'),
    mov('PayPal Europe S.a.r.l. et Cie S.c.a', -4.99, '2026-09-20'),
    mov('PayPal Europe S.a.r.l. et Cie S.c.a', -4.99, '2026-10-20'),
    mov('PayPal Europe S.a.r.l. et Cie S.c.a', -37.5, '2026-09-02'), // compra suelta por PayPal
    mov('CINES ABC', -9, '2026-10-30'),
  ],
}

describe('gastos fijos y recurrentes', () => {
  const r = detectarRecurrentes(db)
  const por = (nombre: string) => r.find((x) => x.nombre.toUpperCase().startsWith(nombre.toUpperCase()))

  it('detecta suscripciones, recibos variables, anuales y PayPal por importe', () => {
    expect(por('NETFLIX')).toMatchObject({ periodicidad: 'mensual', variable: false, importe: 15.99, activo: true, veces: 7, proxima: '2026-11-05' })
    expect(por('RECIBO ENERGIA')).toMatchObject({ periodicidad: 'mensual', variable: true })
    expect(por('SEGURO HOGAR')).toMatchObject({ periodicidad: 'anual', importe: 219.8 })
    expect(por('PayPal de 4,99')).toMatchObject({ periodicidad: 'mensual', variable: false, alMes: 4.99 })
    expect(por('MERCADONA')).toBeUndefined()
    expect(por('CINES')).toBeUndefined()
    expect(r.some((x) => x.nombre.includes('37,50'))).toBe(false)
  })

  it('subidas de precio y bajas', () => {
    expect(por('NETFLIX')!.subida).toEqual({ antes: 13.99, ahora: 15.99, fecha: '2026-10-05' })
    expect(por('RECIBO ENERGIA')!.subida).toBeNull() // baja
    // El gimnasio dejó de cobrarse en junio y los datos llegan hasta finales de octubre
    expect(por('GIMNASIO')!.activo).toBe(false)
  })

  it('resumen: coste mensual de lo activo, próximos cargos y fijo frente a variable', () => {
    const s = resumenFijos(r, '2026-10-31', 30)
    expect(s.activos.every((x) => x.activo)).toBe(true)
    expect(s.proximos.map((x) => x.nombre.slice(0, 7))).toEqual(['NETFLIX', 'RECIBO ', 'PayPal '])
    const octubre = db.movimientos.filter((m) => m.fecha_operacion.startsWith('2026-10'))
    const fv = fijoYVariable(octubre, r)
    expect(fv.fijo).toBeCloseTo(15.99 + 58.9 + 4.99, 2)
    expect(fv.variable).toBeCloseTo(95 + 9, 2)
  })
})

describe('recurrentes en los datos de prueba', () => {
  it('recibos y suscripciones sí; supermercados y restaurantes no', async () => {
    const { generarDatosPrueba } = await import('./datosPrueba')
    const d = { ...db0, ...generarDatosPrueba({ cuentas: db0.cuentas, categorias: db0.categorias, desde: '2025-11-01', hasta: '2026-11-13' }) }
    const nombres = detectarRecurrentes(d).filter((x) => x.activo).map((x) => x.nombre.toLowerCase())
    for (const n of ['hipotecario', 'comunidad', 'colegio', 'seguro medico', 'energia', 'fibra', 'netflix', 'spotify', 'paypal de 7,99']) expect(nombres.some((x) => x.includes(n))).toBe(true)
    for (const n of ['mercadona', 'lidl', 'cafeteria', 'restaurante', 'farmacia']) expect(nombres.some((x) => x.includes(n))).toBe(false)
  })
})

describe('avisos de recurrentes', () => {
  it('subida reciente, cargo que no llega y posible suscripción nueva', async () => {
    const { avisosRecurrentes } = await import('./recurrentes')
    const d: BaseDatos = {
      ...db,
      movimientos: [
        ...db.movimientos,
        // Spotify cobraba el día 11 y en octubre no ha llegado (los datos llegan al 30 de octubre)
        ...meses('SPOTIFY', [10.99, 10.99, 10.99, 10.99, 10.99], '11', 5),
        mov('APP NUEVA ZETA', -7.99, '2026-09-15'),
        mov('APP NUEVA ZETA', -7.99, '2026-10-15'),
      ],
    }
    const a = avisosRecurrentes(d)
    const de = (tipo: string, nombre: string) => a.find((x) => x.tipo === tipo && x.nombre.toUpperCase().startsWith(nombre))
    expect(de('subida', 'NETFLIX')?.texto).toBe('Sube de 13,99 € a 15,99 € el 05/10')
    expect(de('no_llega', 'SPOTIFY')?.texto).toBe('Se esperaba hacia el 12/10 y no ha llegado')
    expect(de('nuevo', 'APP NUEVA')).toBeDefined()
    expect(de('no_llega', 'NETFLIX')).toBeUndefined()
    // El gimnasio se dio de baja: no avisa de que falta
    expect(de('no_llega', 'GIMNASIO')).toBeUndefined()
  })
})
