import { describe, expect, it } from 'vitest'
import { generarDatosPrueba } from './datosPrueba'
import { generarPdfResumen, nombreArchivoResumen } from './pdf'
import { calcularResumen, periodoMes, periodoSemana } from './resumen'
import type { Categoria, Cuenta } from './tipos'

const cuentas: Cuenta[] = [
  { id: 'c1', alias: 'Cuenta principal', entidad: null, tipo: 'cuenta', activa: true, orden: 1, created_at: '' },
  { id: 't', alias: 'Tarjeta', entidad: null, tipo: 'tarjeta_credito', activa: true, orden: 2, created_at: '' },
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
      const r = calcularResumen(periodo, datos.movimientos, categorias, datos.conciliaciones)
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
    const r = calcularResumen(periodoMes('2026-11-01'), datos.movimientos, categorias, datos.conciliaciones)
    const completa = generarPdfResumen(r, { incluirConceptos: true, hayDatosPrueba: false, categorias })
    const reducida = generarPdfResumen(r, { incluirConceptos: true, hayDatosPrueba: false, categorias, reducida: true })
    expect(reducida.getNumberOfPages()).toBe(1)
    const texto = (d: typeof reducida) => new TextDecoder('latin1').decode(new Uint8Array(d.output('arraybuffer')))
    expect(texto(completa)).toContain('Mercadona')
    expect(texto(reducida)).not.toContain('Mercadona')
    expect(texto(reducida)).not.toContain('Fuera del extracto')
  })

  it('nombra el archivo según el periodo', () => {
    expect(nombreArchivoResumen(calcularResumen(periodoMes('2026-11-05'), [], categorias))).toBe('PuchiFin resumen 2026-11.pdf')
    expect(nombreArchivoResumen(calcularResumen(periodoSemana('2026-11-13'), [], categorias))).toBe('PuchiFin semana 2026-11-09.pdf')
    expect(nombreArchivoResumen(calcularResumen(periodoMes('2026-11-05'), [], categorias), true)).toBe('PuchiFin resumen 2026-11 (reducido).pdf')
  })
})
