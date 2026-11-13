import { describe, expect, it } from 'vitest'
import {
  calcularResumen,
  calcularTotales,
  desplazarPeriodo,
  indicadores,
  lineasFueraDelExtracto,
  periodoComparable,
  textoEnCurso,
  textoComparacion,
  pendienteEmpleado,
  periodoMes,
  periodoSemana,
  semanasDelMes,
  variacion,
  type MovimientoResumen,
} from './resumen'
import type { Categoria } from './tipos'

const cat = (id: string, nombre: string, padre: string | null = null, naturaleza: 'gasto' | 'ingreso' = 'gasto'): Categoria => ({
  id, padre_id: padre, nombre, icono: null, color: '#000000', naturaleza, activa: true, orden: 0,
})

const CATEGORIAS: Categoria[] = [
  cat('ali', 'Alimentación'),
  cat('ali-super', 'Supermercado', 'ali'),
  cat('via', 'Viajes'),
  cat('via-hotel', 'Alojamiento', 'via'),
  cat('ing', 'Ingresos', null, 'ingreso'),
  cat('ing-nom', 'Nómina', 'ing', 'ingreso'),
  cat('ing-otr', 'Otros ingresos', 'ing', 'ingreso'),
]

let n = 0
const mov = (fecha: string, importe: number, categoria_id: string | null, tipo: MovimientoResumen['tipo'] = 'normal'): MovimientoResumen => ({
  id: `m${++n}`, cuenta_id: 'c1', fecha_operacion: fecha, concepto_limpio: `Concepto ${n}`, importe, tipo, categoria_id,
})

describe('periodos', () => {
  it('la semana va de lunes a domingo', () => {
    const s = periodoSemana('2026-11-13') // viernes
    expect([s.inicio, s.fin]).toEqual(['2026-11-09', '2026-11-15'])
    expect(s.etiqueta).toBe('Semana del 9 al 15 de noviembre de 2026')
    expect(periodoSemana('2026-11-15').inicio).toBe('2026-11-09') // domingo
  })

  it('una semana entre dos meses lo dice en la etiqueta', () => {
    expect(periodoSemana('2026-10-01').etiqueta).toBe('Semana del 28 de septiembre al 4 de octubre de 2026')
  })

  it('el mes cubre del día 1 al último', () => {
    const m = periodoMes('2026-02-10')
    expect([m.inicio, m.fin, m.etiqueta]).toEqual(['2026-02-01', '2026-02-28', 'Febrero de 2026'])
  })

  it('el periodo anterior de enero es diciembre del año anterior', () => {
    expect(desplazarPeriodo(periodoMes('2027-01-15'), -1).inicio).toBe('2026-12-01')
    expect(desplazarPeriodo(periodoSemana('2026-11-13'), -1).inicio).toBe('2026-11-02')
  })

  it('las semanas del mes se recortan a sus días', () => {
    const semanas = semanasDelMes(periodoMes('2026-11-01'))
    expect(semanas.map((s) => [s.inicio, s.fin])).toEqual([
      ['2026-11-01', '2026-11-01'], // domingo 1
      ['2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'],
      ['2026-11-23', '2026-11-29'],
      ['2026-11-30', '2026-11-30'],
    ])
  })
})

describe('calcularTotales', () => {
  it('solo computan los movimientos de tipo Normal', () => {
    const t = calcularTotales(
      [
        mov('2026-11-02', 3000, 'ing-nom'),
        mov('2026-11-03', -100, 'ali-super'),
        mov('2026-11-04', -250, 'via-hotel', 'gasto_empleado'),
        mov('2026-11-05', 250, null, 'reembolso_empresa'),
        mov('2026-11-06', -900, null, 'traspaso_interno'),
        mov('2026-11-07', -5000, null, 'pago_deuda'),
      ],
      CATEGORIAS,
    )
    expect(t).toEqual({ ingresos: 3000, gastos: 100, ahorro: 2900, tasaAhorro: 2900 / 3000, movimientos: 2 })
  })

  it('una devolución en una categoría de gasto resta gasto, no suma ingreso', () => {
    const t = calcularTotales([mov('2026-11-03', -80, 'ali-super'), mov('2026-11-04', 20, 'ali-super')], CATEGORIAS)
    expect(t.gastos).toBe(60)
    expect(t.ingresos).toBe(0)
    expect(t.tasaAhorro).toBeNull()
  })

  it('sin categoría se clasifica por el signo', () => {
    const t = calcularTotales([mov('2026-11-03', -10.1, null), mov('2026-11-04', 50, null)], CATEGORIAS)
    expect([t.ingresos, t.gastos]).toEqual([50, 10.1])
  })

  it('redondea a céntimos', () => {
    const t = calcularTotales([mov('2026-11-03', -0.1, 'ali'), mov('2026-11-03', -0.2, 'ali')], CATEGORIAS)
    expect(t.gastos).toBe(0.3)
  })
})

describe('calcularResumen', () => {
  const movs = [
    // octubre
    mov('2026-10-28', 3000, 'ing-nom'),
    mov('2026-10-10', -200, 'ali-super'),
    mov('2026-10-12', -50, 'via-hotel'),
    // noviembre
    mov('2026-11-02', 3100, 'ing-nom'),
    mov('2026-11-03', -120, 'ali-super'),
    mov('2026-11-10', -130, 'ali'),
    mov('2026-11-11', -40, null),
    mov('2026-11-12', -300, 'via-hotel', 'gasto_empleado'),
    mov('2026-11-20', 300, null, 'reembolso_empresa'),
    mov('2026-11-25', -1200, null, 'traspaso_interno'),
  ]
  const r = calcularResumen(periodoMes('2026-11-01'), movs, CATEGORIAS)

  it('compara con el mes anterior por categoría', () => {
    const ali = r.categorias.find((c) => c.id === 'ali')!
    expect([ali.importe, ali.anterior, ali.diferencia]).toEqual([250, 200, 50])
    const via = r.categorias.find((c) => c.id === 'via')!
    expect([via.importe, via.anterior, via.diferencia]).toEqual([0, 50, -50])
  })

  it('ordena las categorías por gasto e incluye la de sin categoría', () => {
    expect(r.categorias.map((c) => c.nombre)).toEqual(['Alimentación', 'Sin categoría', 'Viajes'])
    expect(r.categorias[0].peso).toBeCloseTo(250 / 290)
    expect(r.sinCategoria).toBe(1)
  })

  it('desglosa las subcategorías con gasto', () => {
    expect(r.categorias[0].subcategorias).toEqual([{ id: 'ali-super', nombre: 'Supermercado', importe: 120 }])
  })

  it('reparte el mes por semanas', () => {
    expect(r.semanas).toHaveLength(6)
    const semana2 = r.semanas[1]
    expect([semana2.periodo.inicio, semana2.ingresos, semana2.gastos]).toEqual(['2026-11-02', 3100, 120])
    const sumaGastos = r.semanas.reduce((s, x) => s + x.gastos, 0)
    expect(sumaGastos).toBeCloseTo(r.totales.gastos)
  })

  it('separa lo que no computa y el gasto de empleado', () => {
    expect(r.fueraDelExtracto).toEqual(
      expect.arrayContaining([
        { tipo: 'gasto_empleado', importe: -300, movimientos: 1 },
        { tipo: 'reembolso_empresa', importe: 300, movimientos: 1 },
        { tipo: 'traspaso_interno', importe: -1200, movimientos: 1 },
      ]),
    )
    expect(r.empleado).toMatchObject({ gastos: 300, gastosNumero: 1, reembolsos: 300 })
  })

  it('lista los mayores gastos del periodo, solo Normal', () => {
    expect(r.mayoresGastos.map((m) => m.importe)).toEqual([-130, -120, -40])
  })

  it('los ingresos se ven por subcategoría', () => {
    expect(r.ingresosPorCategoria).toEqual([{ id: 'ing-nom', nombre: 'Nómina', importe: 3100 }])
  })
})

describe('pendienteEmpleado', () => {
  const g1 = { ...mov('2026-10-05', -200, 'via-hotel', 'gasto_empleado') }
  const g2 = { ...mov('2026-10-20', -80, 'via-hotel', 'gasto_empleado') }
  const g3 = { ...mov('2026-11-02', -40, 'via-hotel', 'gasto_empleado'), reembolso_cerrado: true }

  it('resta lo conciliado y omite los cerrados a mano', () => {
    const p = pendienteEmpleado([g1, g2, g3], [{ gasto_id: g1.id, importe_aplicado: 150 }], '2026-11-30')
    expect(p).toEqual({ importe: 130, numero: 2 })
  })

  it('solo cuenta los gastos hasta la fecha indicada', () => {
    expect(pendienteEmpleado([g1, g2], [], '2026-10-10')).toEqual({ importe: 200, numero: 1 })
  })
})

describe('variacion', () => {
  it('calcula la variación relativa', () => {
    expect(variacion(120, 100)).toBeCloseTo(0.2)
    expect(variacion(80, 100)).toBeCloseTo(-0.2)
    expect(variacion(10, 0)).toBeNull()
    expect(variacion(10, null)).toBeNull()
  })
})

describe('textos de comparación', () => {
  it('dice si sube o baja y si es bueno o malo', () => {
    expect(textoComparacion(110, 100, 'octubre', false)).toEqual({ texto: '10,0 % más que en octubre', tono: 'malo' })
    expect(textoComparacion(90, 100, 'la semana anterior', false)).toEqual({ texto: '10,0 % menos que la semana anterior', tono: 'bueno' })
    expect(textoComparacion(50, 0, 'octubre', true).texto).toBe('Sin datos de octubre')
  })

  it('sin periodo anterior, los indicadores lo dicen', () => {
    const r = calcularResumen(periodoMes('2026-10-01'), [mov('2026-10-28', 3000, 'ing-nom')], CATEGORIAS)
    expect(indicadores(r).map((i) => i.comparacion.texto)).toEqual(['Sin datos de septiembre', 'Sin datos de septiembre', 'Sin datos de septiembre', ''])
  })

  it('resume lo que queda fuera del extracto', () => {
    const r = calcularResumen(periodoMes('2026-11-01'), [mov('2026-11-12', -300, 'via-hotel', 'gasto_empleado'), mov('2026-11-25', -900, null, 'traspaso_interno')], CATEGORIAS)
    expect(lineasFueraDelExtracto(r)).toEqual([
      'Gastos de empleado: 300,00 € en 1 movimiento. Reembolsos de la empresa: 0,00 €.',
      'Pendiente de reembolso al cierre del periodo: 300,00 € (1 gasto).',
      'Traspasos internos y liquidaciones de tarjeta: 1 movimiento, sin efecto en el gasto.',
    ])
  })
})

describe('periodo en curso', () => {
  it('compara con los mismos días del mes anterior', () => {
    const c = periodoComparable(periodoMes('2026-11-01'), '2026-11-13')
    expect([c.enCurso, c.corte, c.anterior.inicio, c.anterior.fin, c.anterior.nombreCorto]).toEqual([true, '2026-11-13', '2026-10-01', '2026-10-13', 'octubre (del 1 al 13)'])
  })

  it('el 31 de marzo se compara con febrero entero', () => {
    expect(periodoComparable(periodoMes('2027-03-01'), '2027-03-30').anterior.fin).toBe('2027-02-28')
  })

  it('la semana en curso, hasta el mismo día de la semana anterior', () => {
    const c = periodoComparable(periodoSemana('2026-11-13'), '2026-11-13')
    expect([c.anterior.inicio, c.anterior.fin, c.anterior.nombreCorto]).toEqual(['2026-11-02', '2026-11-06', 'la semana anterior (hasta el viernes)'])
  })

  it('un periodo cerrado se compara entero', () => {
    const c = periodoComparable(periodoMes('2026-10-01'), '2026-11-13')
    expect([c.enCurso, c.anterior.fin]).toEqual([false, '2026-09-30'])
  })

  it('el resumen en curso no cuenta lo posterior del mes anterior ni las semanas futuras', () => {
    const movs = [mov('2026-10-05', -100, 'ali'), mov('2026-10-25', -900, 'ali'), mov('2026-11-03', -120, 'ali')]
    const r = calcularResumen(periodoMes('2026-11-01'), movs, CATEGORIAS, [], 10, '2026-11-13')
    expect(r.totalesAnterior.gastos).toBe(100)
    expect(r.semanas.map((x) => x.periodo.inicio)).toEqual(['2026-11-01', '2026-11-02', '2026-11-09'])
    expect(textoEnCurso(r)).toBe('Mes en curso: datos hasta el 13 de noviembre. La comparación es con los mismos días de octubre.')
    expect(indicadores(r)[1].comparacion.texto).toBe('20,0 % más que en octubre (del 1 al 13)')
  })
})
