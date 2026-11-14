import { describe, expect, it } from 'vitest'
import { cambiarCategoria } from '../datos/movimientos'
import { datosIniciales } from '../datos/operaciones'
import { mesEfectivo } from './imputacion'
import { generarDatosPrueba } from './datosPrueba'
import { mesPorCerrar, pasosCierre } from './cierre'

const base = datosIniciales()
const db = { ...base, ...generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: '2026-09-01', hasta: '2026-11-20' }) }
const estado = (pasos: ReturnType<typeof pasosCierre>) => Object.fromEntries(pasos.map((p) => [p.clave.replace(/^importar-.*/, 'importar'), p.hecho]))

describe('cierre de mes guiado', () => {
  it('octubre: importado y cuadrado; falta categorizar, repartir PayPal y la copia', () => {
    const pasos = pasosCierre(db, '2026-10')
    expect(pasos.filter((p) => p.clave.startsWith('importar')).every((p) => p.hecho)).toBe(true)
    expect(estado(pasos)).toMatchObject({ cuadre: true, liquidacion: true, categorias: false, paypal: false, copia: false })
    expect(pasos.find((p) => p.clave === 'categorias')!.enlace).toBe('/movimientos/categorizar')
  })

  it('con todo categorizado y la copia exportada después de fin de mes, todo hecho', () => {
    const pendientes = db.movimientos.filter((m) => m.tipo === 'normal' && !m.categoria_id && mesEfectivo(m) === '2026-10').map((m) => m.id)
    const listo = cambiarCategoria(db, pendientes, db.categorias.find((c) => c.nombre === 'Juegos')!.id)
    expect(pasosCierre(listo, '2026-10', '2026-11-05T10:00:00Z').every((p) => p.hecho)).toBe(true)
  })

  it('el mes en curso aún no tiene los datos hasta final de mes', () => {
    const importar = pasosCierre(db, '2026-11').filter((p) => p.clave.startsWith('importar'))
    expect(importar.some((p) => !p.hecho)).toBe(true)
  })

  it('el mes por cerrar es el anterior durante los primeros 10 días', () => {
    expect(mesPorCerrar('2026-11-04')).toBe('2026-10')
    expect(mesPorCerrar('2026-01-10')).toBe('2025-12')
    expect(mesPorCerrar('2026-11-11')).toBeNull()
  })
})

describe('cierre: el primer mes con tarjeta', () => {
  it('un cargo que paga compras anteriores a lo importado no deja el paso pendiente para siempre', () => {
    // Septiembre: el cargo del día 3 paga compras de agosto, que no están importadas
    expect(pasosCierre(db, '2026-09').find((p) => p.clave === 'liquidacion')?.hecho).toBe(true)
  })
})
