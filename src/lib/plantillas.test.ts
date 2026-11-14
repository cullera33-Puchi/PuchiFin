import { describe, expect, it } from 'vitest'
import { comprobarBaseDatos, datosIniciales, fijarSinConceptos, guardarPlantillaClaude } from '../datos/operaciones'
import { textoExtracto, textoInforme } from './analizar'
import { csvMovimientos, lineaDetalle, movimientosDelPeriodo, movimientosUltimoAno } from './csvClaude'
import { generarDatosPrueba } from './datosPrueba'
import { contieneIdentificativo } from './identificativos'
import { textoOptimizar } from './optimizar'
import { instrucciones, plantillaCambiada, PLANTILLAS } from './plantillas'
import { detectarRecurrentes } from './recurrentes'
import type { BaseDatos } from './tipos'

const base = datosIniciales()
const HOY = '2026-11-20'
const db: BaseDatos = { ...base, ...generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: '2026-08-01', hasta: HOY }) }

describe('plantillas de Analizar con Claude', () => {
  it('sin cambiar, cada vista usa la de la app', () => {
    expect(instrucciones(db, 'mes')).toBe(PLANTILLAS.mes.porDefecto)
    expect(textoExtracto(db, '2026-10', HOY)).toContain(PLANTILLAS.mes.porDefecto)
  })

  it('la cambiada se usa en su vista; vacía o igual que la de la app, vuelve a la de la app', () => {
    const propia = '1. Dime solo en qué gasto más de la cuenta.'
    const cambiada = guardarPlantillaClaude(db, 'mes', `  ${propia}\r\n`)
    expect(plantillaCambiada(cambiada, 'mes')).toBe(true)
    const texto = textoExtracto(cambiada, '2026-10', HOY)
    expect(texto).toContain(propia)
    expect(texto).not.toContain(PLANTILLAS.mes.porDefecto)
    // El periodo y los datos los pone la app
    expect(texto).toContain('octubre')
    expect(texto).toContain('Gasto por categoría')
    expect(plantillaCambiada(guardarPlantillaClaude(cambiada, 'mes', ''), 'mes')).toBe(false)
    expect(plantillaCambiada(guardarPlantillaClaude(cambiada, 'mes', PLANTILLAS.mes.porDefecto), 'mes')).toBe(false)
    // Las demás no cambian
    expect(instrucciones(cambiada, 'plan')).toBe(PLANTILLAS.plan.porDefecto)
  })

  it('no admite datos identificativos ni textos demasiado largos', () => {
    expect(() => guardarPlantillaClaude(db, 'plan', 'Mi IBAN es ES91 2100 0418 4502 0005 1332')).toThrow(/IBAN/)
    expect(() => guardarPlantillaClaude(db, 'plan', 'x'.repeat(2001))).toThrow(/máximo/)
    const conPlantilla = guardarPlantillaClaude(db, 'plan', 'Revisa el plan')
    expect(comprobarBaseDatos(conPlantilla)).toEqual([])
  })
})

describe('enviar sin comercios', () => {
  const sin = fijarSinConceptos(db, true)

  it('el informe no lleva los comercios y los fijos salen por su categoría', () => {
    expect(textoInforme(db, { escala: 'mes', clave: '2026-10' }, HOY)).toContain('Comercios con más gasto')
    expect(textoInforme(sin, { escala: 'mes', clave: '2026-10' }, HOY)).not.toContain('Comercios con más gasto')
    const recurrentes = detectarRecurrentes(sin)
    const conNombres = textoOptimizar(db, recurrentes, HOY)
    const sinNombres = textoOptimizar(sin, recurrentes, HOY)
    const fijo = recurrentes.find((r) => r.activo)!
    expect(conNombres).toContain(fijo.nombre)
    expect(sinNombres).not.toContain(fijo.nombre)
    expect(sinNombres).toContain('Cargo 1')
  })

  it('se puede volver a enviar con comercios', () => {
    expect(fijarSinConceptos(sin, false).ajustes.claude.sin_conceptos).toBe(false)
  })
})

describe('detalle en CSV', () => {
  const octubre = movimientosDelPeriodo(db, '2026-10')

  it('una fila por movimiento del periodo, ordenadas por fecha, con concepto, categoría, tipo e importe', () => {
    const csv = csvMovimientos(db, octubre)
    const filas = csv.trim().split('\n')
    expect(filas[0]).toBe('Fecha,Mes en que cuenta,Cuenta,Concepto,Categoría,Subcategoría,Tipo,Importe')
    expect(filas).toHaveLength(octubre.length + 1)
    const fechas = filas.slice(1).map((f) => f.slice(0, 10))
    expect([...fechas].sort()).toEqual(fechas)
    expect(octubre.every((m) => m.fecha_operacion.slice(0, 7) === '2026-10' || m.mes_imputacion === '2026-10')).toBe(true)
    expect(csv).toMatch(/,-?\d+\.\d{2}\n/)
    expect(contieneIdentificativo(csv)).toBe(false)
  })

  it('sin comercios, el CSV no lleva la columna Concepto', () => {
    const sin = fijarSinConceptos(db, true)
    const csv = csvMovimientos(sin, octubre)
    expect(csv.split('\n')[0]).toBe('Fecha,Mes en que cuenta,Cuenta,Categoría,Subcategoría,Tipo,Importe')
    // Las subcategorías de plataformas (Netflix, Spotify) son categorías, no conceptos
    const categorias = new Set(db.categorias.map((c) => c.nombre.toLowerCase()))
    for (const m of octubre.filter((x) => !categorias.has(x.concepto_limpio.toLowerCase())).slice(0, 20)) expect(csv).not.toContain(m.concepto_limpio)
    expect(lineaDetalle(sin, 3)).not.toContain('concepto')
  })

  it('enmascara un número identificativo que se hubiera colado, entrecomilla las comas y no lleva notas', () => {
    const m = { ...octubre[0], concepto_limpio: 'Pago, tarjeta 4111 1111 1111 1111', nota: 'nota privada' }
    const csv = csvMovimientos(db, [m])
    expect(contieneIdentificativo(csv)).toBe(false)
    expect(csv).toContain('"Pago, tarjeta')
    expect(csv).not.toContain('nota privada')
  })

  it('el plan de pagos manda los doce meses completos anteriores', () => {
    const ano = movimientosUltimoAno(db, HOY)
    expect(ano.length).toBeGreaterThan(0)
    expect(ano.some((m) => m.fecha_operacion >= '2026-11-01' && !m.mes_imputacion)).toBe(false)
  })
})
