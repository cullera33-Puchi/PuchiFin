import { describe, expect, it } from 'vitest'
import { baseMaxima, bonusEn, calcularAnio, cotizacionMes, cuotaRetencion, fijoEn, mesDeNomina, minimoFamiliar, resumenBruta, vigenteDesde } from './nomina'
import type { NominaBruta } from './tipos'

// Datos inventados: ninguna cifra es de una nómina real
const base: NominaBruta = {
  fijo_anual: 60000,
  pagas: 12,
  meses_extra: [6, 12],
  bonus_objetivo: 0,
  bonus_consecucion: 100,
  bonus_mes: 8,
  flexible_mes: 0,
  especie_mes: 0,
  subida_anual: 0,
  subida_mes: 9,
  vigente_desde: '2025-09',
  hijos: [],
  tipo_actual: null,
}
const suma = (lista: number[]) => Math.round(lista.reduce((s, x) => s + x, 0) * 100) / 100

describe('Seguridad Social del trabajador', () => {
  it('cotiza por la base hasta el tope y añade la cuota de solidaridad por el exceso', () => {
    expect(baseMaxima(2026)).toBe(5101.2)
    expect(cotizacionMes(3000, 2026)).toBe(195)
    // Tope: 5.101,20 al 6,5 %. Exceso de 2.898,80 en los tres tramos de solidaridad
    expect(cotizacionMes(8000, 2026)).toBe(337.67)
    expect(cotizacionMes(0, 2026)).toBe(0)
  })

  it('la base máxima futura sube con la inflación más 1,2 puntos y el mecanismo de equidad, hasta 2029', () => {
    expect(baseMaxima(2027, 3)).toBeCloseTo(5101.2 * 1.042, 2)
    expect(cotizacionMes(3000, 2029)).toBe(196.5)
    expect(cotizacionMes(3000, 2035)).toBe(196.5)
  })
})

describe('retención del IRPF', () => {
  it('mínimo familiar: los hijos por mitad, con el aumento de los menores de 3 años y hasta los 25', () => {
    expect(minimoFamiliar([], 2026)).toBe(5550)
    expect(minimoFamiliar([2019, 2025], 2026)).toBe(5550 + (2400 + 2700 + 2800) / 2)
    // En 2028 el pequeño ya ha cumplido 3
    expect(minimoFamiliar([2019, 2025], 2028)).toBe(5550 + (2400 + 2700) / 2)
    expect(minimoFamiliar([2000], 2026)).toBe(5550)
  })

  it('cuota anual con la escala de retenciones', () => {
    // 80.000 de retribución y 4.000 de Seguridad Social: base de 74.000
    expect(cuotaRetencion(80000, 4000, [2019, 2025], 2026)).toBe(22396.5)
    expect(cuotaRetencion(80000, 4000, [], 2026)).toBe(23147)
    expect(cuotaRetencion(0, 0, [], 2026)).toBe(0)
    // Un sueldo bajo no retiene
    expect(cuotaRetencion(14000, 900, [], 2026)).toBe(0)
  })
})

describe('la nómina mes a mes', () => {
  it('60.000 en 12 pagas, sin hijos: Seguridad Social, tipo y neto', () => {
    const anio = calcularAnio(base, 2026)
    expect(anio[0]).toMatchObject({ bruto: 5000, seguridadSocial: 325, tipo: 24.44, irpf: 1222, neto: 3453, bonusNeto: 0 })
    expect(new Set(anio.map((m) => m.neto)).size).toBe(1)
  })

  it('en 14 pagas, los meses de extra cobran doble y no cotizan más', () => {
    const anio = calcularAnio({ ...base, pagas: 14 }, 2026)
    expect(anio[0].bruto).toBeCloseTo(60000 / 14, 2)
    expect(anio[5].bruto).toBeCloseTo((60000 / 14) * 2, 2)
    expect(anio[5].seguridadSocial).toBe(anio[0].seguridadSocial)
    expect(suma(anio.map((m) => m.bruto))).toBeCloseTo(60000, 1)
  })

  it('la retribución flexible baja el neto y no tributa; la especie tributa y no se cobra', () => {
    const sin = calcularAnio(base, 2026)[0]
    const flex = calcularAnio({ ...base, flexible_mes: 100 }, 2026)[0]
    const especie = calcularAnio({ ...base, especie_mes: 100 }, 2026)[0]
    expect(flex.irpf).toBeLessThan(sin.irpf)
    expect(sin.neto - flex.neto).toBeGreaterThan(60)
    expect(sin.neto - flex.neto).toBeLessThan(100)
    expect(especie.irpf).toBeGreaterThan(sin.irpf)
    expect(especie.bruto).toBe(sin.bruto)
  })

  it('el bonus se cobra en su mes: objetivo por el porcentaje que se espera cobrar', () => {
    const b = { ...base, bonus_objetivo: 10000, bonus_consecucion: 80 }
    const anio = calcularAnio(b, 2026)
    expect(anio[7].bonusBruto).toBe(8000)
    expect(anio[7].bonusNeto).toBeCloseTo(8000 * (1 - anio[7].tipo / 100), 2)
    expect(anio[6].bonusBruto).toBe(0)
    // Con bonus, el tipo de todo el año sube
    expect(anio[0].tipo).toBeGreaterThan(calcularAnio(base, 2026)[0].tipo)
    expect(calcularAnio(b, 2026, { consecucion: 100 })[7].bonusBruto).toBe(10000)
  })

  it('la subida anual se aplica en su mes al fijo y, un año después, al bonus', () => {
    const b = { ...base, subida_anual: 10, bonus_objetivo: 10000, vigente_desde: '2026-09' }
    expect(fijoEn(b, '2027-08')).toBeCloseTo(60000, 6)
    expect(fijoEn(b, '2027-09')).toBeCloseTo(66000, 6)
    expect(fijoEn(b, '2028-09')).toBeCloseTo(72600, 6)
    // El sueldo de antes de la última subida
    expect(fijoEn(b, '2026-08')).toBeCloseTo(60000 / 1.1, 6)
    expect(bonusEn(b, '2027-08')).toBeCloseTo(10000, 6)
    expect(bonusEn(b, '2028-08')).toBeCloseTo(11000, 6)
    expect(bonusEn(b, '2028-07')).toBe(0)
    // En la simulación, otra subida
    expect(fijoEn(b, '2027-09', { subida: 0 })).toBe(60000)
  })

  it('en el mes de la subida el tipo se regulariza y el año retiene lo que toca', () => {
    const b = { ...base, subida_anual: 10, vigente_desde: '2025-09' }
    const anio = calcularAnio(b, 2027)
    // Enero a agosto con un tipo; desde septiembre, otro mayor
    expect(new Set(anio.slice(0, 8).map((m) => m.tipo)).size).toBe(1)
    expect(anio[8].tipo).toBeGreaterThan(anio[7].tipo)
    expect(anio[8].bruto).toBeCloseTo(anio[7].bruto * 1.1, 2)
    expect(anio[8].neto).toBeGreaterThan(anio[7].neto)
    // Lo retenido en el año coincide con la cuota de lo cobrado de verdad
    const bruto = suma(anio.map((m) => m.bruto))
    const cuota = cuotaRetencion(bruto, suma(anio.map((m) => m.seguridadSocial)), [], 2027)
    expect(Math.abs(suma(anio.map((m) => m.irpf)) - cuota)).toBeLessThan(5)
  })

  it('una subida del 10 % en bruto deja menos de un 10 % en neto', () => {
    const b = { ...base, fijo_anual: 80000, subida_anual: 10, vigente_desde: '2026-09' }
    const antes = suma(calcularAnio({ ...b, subida_anual: 0 }, 2028).map((m) => m.neto))
    const despues = suma(calcularAnio({ ...b, fijo_anual: 88000, subida_anual: 0 }, 2028).map((m) => m.neto))
    expect(despues / antes).toBeGreaterThan(1.05)
    expect(despues / antes).toBeLessThan(1.09)
  })

  it('el tipo de la nómina real manda en su año y deja de mandar al siguiente', () => {
    const b = { ...base, tipo_actual: { porcentaje: 30, anio: 2026 } }
    expect(calcularAnio(b, 2026).every((m) => m.tipo === 30)).toBe(true)
    // En 2027 la cotización sube unas décimas y el tipo calculado queda en el 24,43 %
    expect(calcularAnio(b, 2027)[0].tipo).toBe(24.43)
  })

  it('una nómina que empieza a mitad de año solo cobra desde entonces, con un tipo menor', () => {
    const marzo = mesDeNomina(base, '2027-03', {}, '2027-06', null)
    const junio = mesDeNomina(base, '2027-06', {}, '2027-06', null)
    expect(marzo.neto).toBe(0)
    expect(junio.bruto).toBe(5000)
    expect(junio.tipo).toBeLessThan(mesDeNomina(base, '2027-06').tipo)
  })

  it('el sueldo escrito rige desde el último mes de subida y el resumen da el neto de un mes normal', () => {
    expect(vigenteDesde('2026-11-14', 9)).toBe('2026-09')
    expect(vigenteDesde('2027-03-01', 9)).toBe('2026-09')
    expect(vigenteDesde('2027-09-30', 9)).toBe('2027-09')
    const r = resumenBruta({ ...base, pagas: 14, bonus_objetivo: 10000 }, '2026-11-14')
    expect(r.netoMes).toBeGreaterThan(2500)
    expect(r.netoExtra).toBeGreaterThan(r.netoMes)
    expect(r.bonusBruto).toBe(10000)
    expect(r.netoAnual).toBeGreaterThan(r.netoMes * 12)
  })
})
