import { describe, expect, it } from 'vitest'
import { datosIniciales, guardarCompromiso, guardarPresupuesto } from '../datos/operaciones'
import { textoExtracto, textoInforme, textoPlan, textoPresupuesto } from './analizar'
import { generarDatosPrueba } from './datosPrueba'
import { contieneIdentificativo } from './identificativos'
import { calcularPlan } from './plan'
import type { BaseDatos } from './tipos'

const base = datosIniciales()
const HOY = '2026-11-20'
let db: BaseDatos = { ...base, ...generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: '2026-08-01', hasta: HOY }) }
db = guardarPresupuesto(db, db.categorias.find((c) => c.nombre === 'Alimentación')!.id, 400)
db = guardarCompromiso(db, db.compromisos[0].id, { deuda_inicial: 30000, fecha_referencia: '2026-10-01', colchon: 2000, cuenta_colchon_id: db.cuentas[1].id, ventana_mes_inicio: 6, ventana_mes_fin: 8, mes_referencia: 7 })

describe('Analizar con Claude', () => {
  it('cada vista lleva sus datos, sin cuentas ni datos identificativos', () => {
    const textos = [
      textoExtracto(db, '2026-10', HOY),
      textoInforme(db, { escala: 'mes', clave: '2026-10' }, HOY),
      textoPresupuesto(db, '2026-11', HOY),
      textoPlan(db, calcularPlan(db, HOY).plan!, null, null),
    ]
    for (const t of textos) {
      expect(contieneIdentificativo(t)).toBe(false)
      expect(t).not.toContain('Cuenta principal')
      expect(t).not.toContain('Cuenta 2')
    }
    expect(textos[0]).toContain('octubre')
    expect(textos[0]).toContain('Gasto por categoría')
    expect(textos[1]).toContain('Comercios con más gasto')
    expect(textos[2]).toContain('Alimentación: presupuesto 400,00 €')
    expect(textos[3]).toContain('Deuda pendiente: 30.000,00 €')
    expect(textos[3]).toContain('Calendario previsto')
  })

  it('el plan incluye la simulación cuando la hay', () => {
    const sim = { ahorroExtra: 200, recorte: null }
    const t = textoPlan(db, calcularPlan(db, HOY).plan!, sim, calcularPlan(db, HOY, sim).plan)
    expect(t).toContain('Simulación (ahorrar 200,00 € más al mes)')
  })
})
