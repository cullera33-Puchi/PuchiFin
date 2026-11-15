/**
 * Correcciones de la revisión de cálculos de la v0.43.0: cada prueba reproduce un fallo encontrado.
 */
import { describe, expect, it } from 'vitest'
import { datosIniciales, fusionarCategoria, guardarEvento, guardarPrevision } from '../datos/operaciones'
import { calcularExtracto } from './extracto'
import { formatearRedondo, leerImporteUsuario } from './formato'
import { sanearDescripcion } from './registro'
import type { BaseDatos, Movimiento } from './tipos'

const db0 = datosIniciales()
const cat = (ruta: string) => {
  const [p, h] = ruta.split(' > ')
  const padre = db0.categorias.find((c) => !c.padre_id && c.nombre === p)!
  return h ? db0.categorias.find((c) => c.padre_id === padre.id && c.nombre === h)!.id : padre.id
}
let n = 0
const mov = (fecha: string, importe: number, ruta: string | null, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `r${++n}`, cuenta_id: db0.cuentas[0].id, importacion_id: null, fecha_operacion: fecha, fecha_valor: null, concepto_original: `X${n}`, concepto_limpio: `X${n}`,
  concepto_normalizado: `x${n}`, ocurrencia: 1, importe, saldo: null, categoria_id: ruta ? cat(ruta) : null, tipo: 'normal', regla_id: null, origen_categoria: null,
  nota: null, reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '', ...extra,
})

describe('revisión de cálculos (v0.43.0)', () => {
  it('la media del Extracto no cuenta el primer mes importado, que está incompleto', () => {
    const db: BaseDatos = {
      ...db0,
      movimientos: [mov('2026-08-28', -100, 'Alimentación'), mov('2026-09-10', -1000, 'Alimentación'), mov('2026-10-10', -1000, 'Alimentación'), mov('2026-11-10', -1000, 'Alimentación')],
    }
    const e = calcularExtracto(db, '2026-11')
    expect(e.mesesMedia).toBe(2)
    expect(e.media!.gastos).toBe(1000)
  })

  it('con el mes en curso y los últimos datos del mes anterior, solo cuenta lo pasado al día 1', () => {
    const db: BaseDatos = {
      ...db0,
      movimientos: [
        mov('2026-09-15', -500, 'Alimentación'),
        mov('2026-10-15', -500, 'Alimentación'),
        // La hipoteca del 31 de octubre cuenta en noviembre
        mov('2026-10-31', -900, 'Vivienda > Hipoteca', { mes_imputacion: '2026-11' }),
      ],
    }
    const e = calcularExtracto(db, '2026-11', '2026-11-12')
    expect(e.diaCorte).toBe(1)
  })

  it('fusionar categorías reasigna lo que guarda una importación y las categorías que no suben con la inflación', () => {
    const luz = cat('Suministros > Luz')
    const agua = cat('Suministros > Agua')
    const hipoteca = cat('Vivienda > Hipoteca')
    const db: BaseDatos = {
      ...db0,
      importaciones: [{ ...({} as BaseDatos['importaciones'][number]), id: 'i1', modificados: [{ id: 'm1', tipo: 'normal', categoria_id: luz }] }],
    }
    const r = fusionarCategoria(db, luz, agua)
    expect(r.importaciones[0].modificados[0].categoria_id).toBe(agua)
    const sinHipoteca = fusionarCategoria(db0, hipoteca, cat('Vivienda > Comunidad'))
    expect(sinHipoteca.ajustes.prevision.sin_inflacion).toEqual([cat('Vivienda > Comunidad')])
    // El plan se puede seguir guardando aunque llegue una categoría que ya no existe
    expect(guardarPrevision(sinHipoteca, { inflacion: 3, sin_inflacion: [hipoteca] }).ajustes.prevision.sin_inflacion).toEqual([])
  })

  it('no admite fechas imposibles', () => {
    expect(() => guardarEvento(db0, { fecha: '2026-02-30', concepto: 'IBI', importe: -400, categoria_id: null })).toThrow(/Fecha/)
    expect(guardarEvento(db0, { fecha: '2028-02-29', concepto: 'IBI', importe: -400, categoria_id: null }).eventos_previstos).toHaveLength(1)
  })

  it('importes: lectura estricta y redondeo igual con signo', () => {
    expect(leerImporteUsuario('1e3')).toBeNull()
    expect(leerImporteUsuario('0.500')).toBe(0.5)
    expect(leerImporteUsuario('15.000')).toBe(15000)
    expect(leerImporteUsuario('1.234,56')).toBe(1234.56)
    expect(formatearRedondo(-2.5)).toMatch(/^-3\s€$/)
    expect(formatearRedondo(2.5)).toMatch(/^3\s€$/)
  })

  it('el registro no guarda importes sin separador de miles', () => {
    expect(sanearDescripcion('Gasto de 1234,56 € movido')).not.toMatch(/\d/)
  })
})
