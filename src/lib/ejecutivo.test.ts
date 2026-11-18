import { describe, expect, it } from 'vitest'
import { datosIniciales, guardarCompromiso } from '../datos/operaciones'
import { resumenEjecutivo } from './ejecutivo'
import { generarPdfEjecutivo } from './pdf'
import { calcularPlan } from './plan'
import { calcularResumen, periodoMes, periodoSemana } from './resumen'
import type { BaseDatos, Movimiento } from './tipos'

const db0 = datosIniciales()
const [principal, segunda] = db0.cuentas
const cat = (ruta: string) => {
  const [p, h] = ruta.split(' > ')
  const padre = db0.categorias.find((c) => !c.padre_id && c.nombre === p)!
  return h ? db0.categorias.find((c) => c.padre_id === padre.id && c.nombre === h)!.id : padre.id
}
let n = 0
const mov = (fecha: string, importe: number, ruta: string | null, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`, cuenta_id: principal.id, importacion_id: null, fecha_operacion: fecha, fecha_valor: null,
  concepto_original: `COMERCIO SECRETO ${n}`, concepto_limpio: `COMERCIO SECRETO ${n}`, concepto_normalizado: `x${n}`, ocurrencia: 1, importe, saldo: null,
  categoria_id: ruta ? cat(ruta) : null, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null,
  reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '', ...extra,
})

const HOY = '2026-11-15'
/**
 * Julio (primer mes, no cuenta en la media) a noviembre: 3.000 de nómina, 1.000 de super, 800 de hipoteca y
 * 200 de restaurantes al mes. En octubre, 400 de restaurantes y 700 de super.
 */
function crear(deuda = 0): BaseDatos {
  const movimientos: Movimiento[] = []
  for (const mes of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) {
    movimientos.push(mov(`${mes}-01`, 3000, 'Ingresos > Nómina'))
    movimientos.push(mov(`${mes}-05`, mes === '2026-10' ? -700 : -1000, 'Alimentación > Supermercado'))
    movimientos.push(mov(`${mes}-06`, -800, 'Vivienda > Hipoteca'))
    movimientos.push(mov(`${mes}-08`, mes === '2026-10' ? -400 : -200, 'Restaurantes > Restaurantes'))
  }
  for (const [i, ruta] of ['Ocio > Cine y espectáculos', 'Salud > Farmacia', 'Transporte > Combustible', 'Compras > Ropa'].entries()) movimientos.push(mov('2026-10-20', -(50 + i * 10), ruta))
  movimientos.push(mov('2026-11-15', 500, null, { cuenta_id: segunda.id, tipo: 'traspaso_interno', saldo: 5000 }))
  const db = { ...db0, ajustes: { ...db0.ajustes, prevision: { inflacion: 0, sin_inflacion: [] } }, movimientos }
  if (!deuda) return db
  const c = db.compromisos[0]
  return guardarCompromiso(db, c.id, { deuda_inicial: deuda, fecha_referencia: '2026-10-01', colchon: 3000, cuenta_colchon_id: segunda.id, ventana_mes_inicio: 6, ventana_mes_fin: 8, mes_referencia: 8 })
}

describe('resumen ejecutivo para compartir (v0.45.0)', () => {
  it('un mes cerrado: tres cifras frente a la media y lo importante en frases', () => {
    const db = crear()
    const r = calcularResumen(periodoMes('2026-10-01'), db.movimientos, db.categorias, 10, HOY)
    const e = resumenEjecutivo(db, r, HOY, null)
    expect(e.titulo).toBe('Resumen de octubre de 2026')
    expect(e.aviso).toBeNull()
    // 700 + 800 + 400 + 50 + 60 + 70 + 80 = 2.160; la media de agosto y septiembre, 2.000
    expect(e.cifras.map((c) => c.etiqueta)).toEqual(['Hemos gastado', 'Ha entrado', 'Hemos ahorrado'])
    expect(e.cifras[0].valor).toMatch(/^2\.160\s€$/)
    expect(e.cifras[0].nota).toMatch(/^Lo normal: 2\.000\s€$/)
    expect(e.cifras[0].tono).toBe('malo')
    expect(e.cifras[2].nota).toBe('El 28 % de lo que ha entrado')
    expect(e.frases[0]).toMatch(/^En octubre hemos gastado 2\.160\s€, un 8 % más que lo habitual\.$/)
    expect(e.frases.some((f) => /^Donde más ha subido: Restaurantes, 200\s€ más que lo habitual\.$/.test(f))).toBe(true)
    expect(e.frases.some((f) => /^Donde más hemos recortado: Alimentación, 300\s€ menos que lo habitual\.$/.test(f))).toBe(true)
    expect(e.frases.at(-1)).toMatch(/^Ha entrado 3\.000\s€ y hemos ahorrado 840\s€, el 28 % de lo que ha entrado\.$/)
    expect(e.frases.length).toBeLessThanOrEqual(4)
    expect(e.deuda).toBeNull()
  })

  it('las cinco categorías que más pesan y el resto juntas', () => {
    const db = crear()
    const r = calcularResumen(periodoMes('2026-10-01'), db.movimientos, db.categorias, 10, HOY)
    const e = resumenEjecutivo(db, r, HOY, null)
    expect(e.categorias).toHaveLength(6)
    expect(e.categorias.slice(0, 3).map((c) => c.nombre)).toEqual(['Vivienda', 'Alimentación', 'Restaurantes'])
    expect(e.categorias[5].nombre).toBe('Resto (2 categorías)')
    expect(e.categorias.reduce((s, c) => s + c.importe, 0)).toBeCloseTo(e.totalGastos, 2)
  })

  it('el mes en curso lo dice y compara a estas alturas del mes', () => {
    const db = crear()
    const r = calcularResumen(periodoMes('2026-11-01'), db.movimientos, db.categorias, 10, HOY)
    const e = resumenEjecutivo(db, r, HOY, null)
    expect(e.aviso).toBe('El mes sigue en curso: datos hasta el 15 de noviembre.')
    expect(e.frases[0]).toMatch(/^Llevamos 2\.000\s€ gastados en noviembre/)
  })

  it('una semana se compara con la anterior', () => {
    const db = crear()
    const r = calcularResumen(periodoSemana('2026-10-05'), db.movimientos, db.categorias, 10, HOY)
    const e = resumenEjecutivo(db, r, HOY, null)
    expect(e.titulo).toMatch(/^Resumen de la semana del 5 al 11 de octubre/)
    expect(e.frases[0]).toMatch(/^Esta semana hemos gastado/)
    // Todo se compara con la semana anterior, también lo que sube o baja
    for (const f of e.frases.filter((f) => f.startsWith('Donde'))) expect(f).toMatch(/que la semana anterior\.$/)
  })

  it('la deuda familiar: lo que queda, el próximo pago y cuándo queda saldada', () => {
    const db = crear(20000)
    const plan = calcularPlan(db, HOY).plan!
    const r = calcularResumen(periodoMes('2026-10-01'), db.movimientos, db.categorias, 10, HOY)
    const e = resumenEjecutivo(db, r, HOY, plan)
    expect(e.deuda!.titulo).toBe('Deuda familiar')
    expect(e.deuda!.frases[0]).toMatch(/^Quedan 20\.000\s€ por devolver\.$/)
    const p = plan.pagos[0]
    expect(e.deuda!.frases[1]).toContain(`En agosto de ${p.anio} está previsto devolver`)
    if (plan.saldadaEn && p.deudaTras > 0) expect(e.deuda!.frases.at(-1)).toBe(`Al ritmo de ahora, quedará saldada en ${plan.saldadaEn}.`)
  })

  it('el PDF ocupa una página, sin conceptos y con la deuda', () => {
    const db = crear(20000)
    const plan = calcularPlan(db, HOY).plan
    const r = calcularResumen(periodoMes('2026-10-01'), db.movimientos, db.categorias, 10, HOY)
    const doc = generarPdfEjecutivo(db, r, { hayDatosPrueba: true, plan, hoy: HOY, generado: HOY })
    expect(doc.getNumberOfPages()).toBe(1)
    const texto = new TextDecoder('latin1').decode(new Uint8Array(doc.output('arraybuffer')))
    expect(texto).not.toContain('COMERCIO SECRETO')
    expect(texto).toContain('Deuda familiar')
    expect(texto).toContain('Lo importante')
    // Sin movimientos también sale, en una página
    const vacio = calcularResumen(periodoMes('2027-03-01'), [], db.categorias, 10, HOY)
    expect(generarPdfEjecutivo(db, vacio, { hayDatosPrueba: false, plan: null, hoy: HOY }).getNumberOfPages()).toBe(1)
  })
})
