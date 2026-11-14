import { describe, expect, it } from 'vitest'
import { generarDatosPrueba } from './datosPrueba'
import { generarPdfResumen, nombreArchivoResumen } from './pdf'
import { calcularResumen, periodoMes, periodoSemana } from './resumen'
import type { Categoria, Cuenta } from './tipos'

const cuentas: Cuenta[] = [
  { id: 'c1', alias: 'Cuenta principal', entidad: null, tipo: 'cuenta', activa: true, orden: 1, created_at: '', saldo_confirmado: null },
  { id: 't', alias: 'Tarjeta', entidad: null, tipo: 'tarjeta_credito', activa: true, orden: 2, created_at: '', saldo_confirmado: null },
]
const categorias: Categoria[] = [
  { id: 'a', padre_id: null, nombre: 'Alimentación', icono: null, color: '#43A047', naturaleza: 'gasto', activa: true, orden: 1 },
  { id: 'a1', padre_id: 'a', nombre: 'Supermercado', icono: null, color: '#43A047', naturaleza: 'gasto', activa: true, orden: 1 },
]
let n = 0
const datos = generarDatosPrueba({ cuentas, categorias, desde: '2026-10-01', hasta: '2026-11-30', nuevoId: () => `id${++n}` })

describe('generarPdfResumen', () => {
  it('genera el PDF mensual y el semanal', () => {
    for (const periodo of [periodoMes('2026-11-01'), periodoSemana('2026-11-11')]) {
      const r = calcularResumen(periodo, datos.movimientos, categorias)
      const doc = generarPdfResumen(r, { incluirConceptos: true, hayDatosPrueba: true, categorias, generado: '2026-11-13' })
      const bytes = new Uint8Array(doc.output('arraybuffer'))
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    }
  })

  it('funciona sin movimientos y sin conceptos', () => {
    const r = calcularResumen(periodoMes('2027-03-01'), [], categorias)
    const doc = generarPdfResumen(r, { incluirConceptos: false, hayDatosPrueba: false, categorias })
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('la versión reducida ocupa una página y no lleva conceptos', () => {
    const r = calcularResumen(periodoMes('2026-11-01'), datos.movimientos, categorias)
    const completa = generarPdfResumen(r, { incluirConceptos: true, hayDatosPrueba: false, categorias })
    const reducida = generarPdfResumen(r, { incluirConceptos: true, hayDatosPrueba: false, categorias, reducida: true })
    expect(reducida.getNumberOfPages()).toBe(1)
    const texto = (d: typeof reducida) => new TextDecoder('latin1').decode(new Uint8Array(d.output('arraybuffer')))
    expect(texto(completa)).toContain('Mercadona')
    expect(texto(reducida)).not.toContain('Mercadona')
    expect(texto(reducida)).not.toContain('Fuera del extracto')
  })

  it('incluye el plan de pagos: el actual y con la segunda nómina, con el capital previsto', async () => {
    const { datosIniciales, guardarCompromiso, guardarNomina } = await import('../datos/operaciones')
    const { calcularPlan, escenarioNominas } = await import('./plan')
    const base = datosIniciales()
    let db = { ...base, ...generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: '2026-08-01', hasta: '2026-11-13' }) }
    db = guardarCompromiso(db, db.compromisos[0].id, { deuda_inicial: 30000, fecha_referencia: '2026-10-01', colchon: 2000, cuenta_colchon_id: db.cuentas[1].id, ventana_mes_inicio: 6, ventana_mes_fin: 8, mes_referencia: 7 })
    db = guardarNomina(db, { nombre: 'Nómina 2', neto_mensual: 1500, pagas: [], desde: '2027-01', hasta: null, incluida: false, bonus: null })
    const esc = escenarioNominas(db)!
    const actual = calcularPlan(db, '2026-11-13').plan!
    const otro = calcularPlan(db, '2026-11-13', esc.sim).plan!
    const r = calcularResumen(periodoMes('2026-11-01'), db.movimientos, db.categorias)
    const doc = generarPdfResumen(r, { incluirConceptos: false, hayDatosPrueba: true, categorias: db.categorias, reducida: true, plan: { actual, conNominas: { nombres: esc.nombres, plan: otro } } })
    const texto = new TextDecoder('latin1').decode(new Uint8Array(doc.output('arraybuffer')))
    expect(texto).toContain('Plan de pagos de la deuda')
    expect(texto).toContain('Capital previsto')
    expect(texto).toContain('Saldada en')
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(2)
  })

  it('nombra el archivo según el periodo', () => {
    expect(nombreArchivoResumen(calcularResumen(periodoMes('2026-11-05'), [], categorias))).toBe('PuchiFin resumen 2026-11.pdf')
    expect(nombreArchivoResumen(calcularResumen(periodoSemana('2026-11-13'), [], categorias))).toBe('PuchiFin semana 2026-11-09.pdf')
    expect(nombreArchivoResumen(calcularResumen(periodoMes('2026-11-05'), [], categorias), true)).toBe('PuchiFin resumen 2026-11 (reducido).pdf')
  })
})
