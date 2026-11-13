import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { normalizarConcepto } from '../lib/conceptos'
import type { BaseDatos, Movimiento } from '../lib/tipos'
import { actualizarLogica, aplicarReglasAPendientes, sincronizarReglasApp } from './pendientes'

const db0 = datosIniciales()
const cat = (nombre: string) => db0.categorias.find((c) => c.nombre === nombre)!.id
let n = 0
const mov = (concepto: string, importe: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`, cuenta_id: db0.cuentas[0].id, importacion_id: null, fecha_operacion: '2026-11-10', fecha_valor: null,
  concepto_original: concepto, concepto_limpio: concepto, concepto_normalizado: normalizarConcepto(concepto), ocurrencia: 1,
  importe, saldo: null, categoria_id: null, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null,
  reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '', ...extra,
})

describe('mejoras de una versión nueva sobre los datos que ya hay', () => {
  const manual = mov('MERCADONA VALENCIA', -40, { categoria_id: cat('Ropa'), origen_categoria: 'manual' }) // decisión del usuario, aunque la regla diga otra cosa
  const porRegla = mov('REPSOL ESTACION', -50, { categoria_id: cat('Peajes'), origen_categoria: 'regla' })
  const empleado = mov('TAXI MADRID', -20, { tipo: 'gasto_empleado' })
  const pendiente = mov('MERCADONA CASTELLON', -35)
  const traspaso = mov('Traspaso a cuenta', -500)
  const raro = mov('COMERCIO DESCONOCIDO XYZ', -9)
  const db: BaseDatos = { ...db0, movimientos: [manual, porRegla, empleado, pendiente, traspaso, raro] }

  it('solo toca lo pendiente de categorizar', () => {
    const r = aplicarReglasAPendientes(db)
    const por = new Map(r.db.movimientos.map((m) => [m.id, m]))
    expect(por.get(manual.id)).toEqual(manual)
    expect(por.get(porRegla.id)).toEqual(porRegla)
    expect(por.get(empleado.id)).toEqual(empleado)
    expect(por.get(raro.id)).toEqual(raro)
    // Lo aprendido de tus correcciones manda sobre la regla de la app: otro Mercadona que pasaste a mano
    expect(por.get(pendiente.id)).toMatchObject({ categoria_id: cat('Ropa'), origen_categoria: 'aprendida' })
    expect(por.get(traspaso.id)!.tipo).toBe('traspaso_interno')
    expect(r).toMatchObject({ categorizados: 1, traspasos: 1 })
  })

  it('pone al día las reglas de la app sin reactivar las desactivadas ni perder lo aprendido', () => {
    const viejas = db.reglas.map((r) =>
      r.nombre === 'Liquidación de tarjeta' ? { ...r, patron: 'antiguo', activa: false, descartes: 2 } : r,
    ).filter((r) => r.nombre !== 'Traspaso entre cuentas')
    const r = sincronizarReglasApp({ ...db, reglas: viejas })
    const liq = r.db.reglas.find((x) => x.nombre === 'Liquidación de tarjeta')!
    expect(liq.patron).not.toBe('antiguo')
    expect(liq).toMatchObject({ activa: false, descartes: 2 })
    expect(r.db.reglas.some((x) => x.nombre === 'Traspaso entre cuentas')).toBe(true)
    expect(r).toMatchObject({ nuevas: 1, actualizadas: 1 })
    expect(sincronizarReglasApp(db)).toMatchObject({ nuevas: 0, actualizadas: 0 })
  })

  it('quita las reglas de la app retiradas (sugerencias de gasto de empleado y reembolso)', () => {
    const vieja = { ...db.reglas[0], id: 'vieja', nombre: 'Viajes de trabajo: transporte', tipo_movimiento: 'gasto_empleado' as const, es_sugerencia: true }
    const r = sincronizarReglasApp({ ...db, reglas: [...db.reglas, vieja] })
    expect(r.db.reglas.some((x) => x.id === 'vieja')).toBe(false)
    expect(r.db.reglas).toHaveLength(db.reglas.length)
    expect(r.actualizadas).toBe(1)
  })

  it('se anota la versión y una segunda pasada no cambia nada', () => {
    const r = actualizarLogica(db, '0.8.0')
    expect(r.db.ajustes.version_logica).toBe('0.8.0')
    const otra = actualizarLogica(r.db, '0.8.0')
    expect(otra).toMatchObject({ categorizados: 0, traspasos: 0, reglasNuevas: 0, reglasActualizadas: 0 })
  })
})
