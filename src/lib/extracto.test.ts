import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { generarDatosPrueba } from './datosPrueba'
import { calcularExtracto, fraseDelMes, type Extracto } from './extracto'

const totales = (gastos: number, ingresos = 0) => ({ ingresos, gastos, ahorro: ingresos - gastos, tasaAhorro: ingresos ? (ingresos - gastos) / ingresos : null, movimientos: 10 })
const linea = (nombre: string, importe: number, media: number | null) => ({ id: nombre, nombre, icono: null, color: '#000', importe, peso: 0, media, movimientos: 1 })
const extracto = (cambios: Partial<Extracto>): Extracto => ({
  mes: '2026-11', totales: totales(1100, 3000), media: totales(1000, 3000), mesesMedia: 3, categorias: [], sinCategoria: 0,
  hayAnterior: true, haySiguiente: false, enCurso: false, diaCorte: null, haceUnAno: null, ...cambios,
})

const frase = (e: Extracto, mes: string) => fraseDelMes(e, mes)?.replace(/\s/g, ' ') ?? null

describe('el mes en una frase', () => {
  it('lo gastado frente a la media, lo que más sube y el ahorro', () => {
    const e = extracto({ categorias: [linea('Restaurantes', 300, 180), linea('Vivienda', 900, 890), linea('Ocio', 60, 20)] })
    expect(frase(e, 'noviembre')).toBe('En noviembre gastaste 1.100 €, un 10 % más que tu media. Lo que más sube: Restaurantes, 120 € por encima de lo habitual. Ahorras 1.900 €.')
  })

  it('en curso habla de hasta hoy; sin desviaciones claras no nombra categorías', () => {
    const e = extracto({ enCurso: true, totales: totales(980, 0), categorias: [linea('Vivienda', 900, 890)] })
    expect(frase(e, 'noviembre')).toBe('Llevas 980 € gastados en noviembre, en línea con tu media a estas alturas del mes.')
  })

  it('sin movimientos no hay frase; sin media, solo lo gastado', () => {
    expect(frase(extracto({ totales: { ...totales(0), movimientos: 0 } }), 'noviembre')).toBeNull()
    expect(frase(extracto({ media: null, totales: totales(500, 0) }), 'octubre')).toBe('En octubre gastaste 500 €.')
  })
})

describe('el mismo mes del año anterior', () => {
  const db0 = datosIniciales()
  const db = { ...db0, ...generarDatosPrueba({ cuentas: db0.cuentas, categorias: db0.categorias, desde: '2025-10-01', hasta: '2026-11-13' }) }

  it('con datos de hace un año, sus totales con los mismos días si el mes está en curso', () => {
    const e = calcularExtracto(db, '2026-11', '2026-11-13')
    const antes = calcularExtracto(db, '2025-11')
    expect(e.haceUnAno).not.toBeNull()
    expect(e.haceUnAno!.gastos).toBeLessThan(antes.totales.gastos)
    expect(calcularExtracto(db, '2026-10').haceUnAno!.gastos).toBeCloseTo(calcularExtracto(db, '2025-10').totales.gastos, 2)
  })

  it('sin datos de hace un año, nada', () => {
    expect(calcularExtracto(db, '2025-12').haceUnAno).toBeNull()
  })
})
