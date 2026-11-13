/**
 * Formato real del Excel de BBVA (estructura confirmada con un Excel del usuario del 13/11/2026),
 * con filas inventadas que reproducen cada caso.
 */
import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { contieneIdentificativo } from '../lib/identificativos'
import { confirmarImportacion, proponer } from './importar'
import { extraer, partirAnchoFijo } from './lector'

const ancho = (comercio: string, poblacion: string) => `${comercio.padEnd(25)}${poblacion.padEnd(13)}es`
const CABECERA = ['', 'Fecha valor', 'Fecha', 'Concepto', 'Movimiento', 'Importe', 'Divisa', 'Disponible', 'Divisa', 'Observaciones']
const informe = (filas: (string | number)[][]) => [[], [], ['', '', 'Movimientos'], ['', '', 'Fecha de generación del informe: 30/11/2026'], CABECERA, ...filas]
const fila = (valor: string, fecha: string, concepto: string, movimiento: string, importe: number, obs = '') => ['', valor, fecha, concepto, movimiento, importe, 'EUR', 1000, 'EUR', obs]

const FILAS = [
  fila('30/11/2026', '30/11/2026', 'Nomina empresa', 'Ingreso por nómina o pensión', 3100),
  fila('30/11/2026', '30/11/2026', 'Recibo prestamo hipotecario', 'Recibo', -950),
  fila('28/11/2026', '30/11/2026', ancho('Cafe la plaza', 'madrid'), 'Pago con tarjeta', -3.2),
  fila('25/11/2026', '25/11/2026', 'Traspaso a cuenta', 'NOMBRE APELLIDO APELLIDO', -500),
  fila('24/11/2026', '24/11/2026', 'Transferencia recibida', 'ACME CONSULTING SL GASTOS', 230.5, 'ES12 0049 1500 0512 3456 7892'),
  fila('20/11/2026', '20/11/2026', 'Adeudo a su cargo', 'N 2026310000000000 PayPal Europe S.a.r.l. et Cie S.C.A', -11.99),
  fila('19/11/2026', '19/11/2026', 'Bizum', 'ENVIADO: Cena', -15),
  fila('18/11/2026', '18/11/2026', ancho('Mercadona 1234 la plaza', 'villarriba'), 'Pago con tarjeta', -82.4),
  fila('18/11/2026', '18/11/2026', ancho('Taxi barcelona', 'barcelona'), 'Pago con tarjeta', -18.6),
]

describe('formato real «Informe BBVA»', () => {
  const lectura = extraer(informe(FILAS))

  it('separa comercio, población y país en los conceptos de ancho fijo', () => {
    expect(partirAnchoFijo(ancho('Mercadona 1234 la plaza', 'villarriba'), [25, 13, 2])).toEqual({ comercio: 'Mercadona 1234 la plaza', poblacion: 'villarriba' })
    expect(partirAnchoFijo(ancho('Forn sol', 'villabajo,'), [25, 13, 2])).toEqual({ comercio: 'Forn sol', poblacion: 'villabajo' })
    expect(partirAnchoFijo('El rincon', [25, 13, 2])).toEqual({ comercio: 'El rincon', poblacion: null })
  })

  it('interpreta la columna Movimiento: tipo, detalle o nombre de una persona', () => {
    const [nomina, , cafe, traspaso, transf, adeudo, bizum] = lectura.filas
    expect(nomina.operacion).toBe('Ingreso por nómina o pensión')
    expect(cafe).toMatchObject({ concepto: 'Cafe la plaza', poblacion: 'madrid', operacion: 'Pago con tarjeta', detalle: null })
    expect(traspaso).toMatchObject({ tercero: 'NOMBRE APELLIDO APELLIDO', detalle: null })
    expect(transf.tercero).toBe('ACME CONSULTING SL GASTOS')
    expect(adeudo).toMatchObject({ generico: true, detalle: 'N 2026310000000000 PayPal Europe S.a.r.l. et Cie S.C.A' })
    expect(bizum.detalle).toBe('ENVIADO: Cena')
  })

  it('toma la fecha de la compra cuando el cargo es posterior (fin de semana)', () => {
    expect(lectura.filas[2]).toMatchObject({ fecha_operacion: '2026-11-28', fecha_valor: '2026-11-28' })
  })

  const db0 = datosIniciales()
  const db = { ...db0, ajustes: { ...db0.ajustes, alias_terceros: [{ alias: 'Empresa', patrones: ['ACME CONSULTING'] }, { alias: 'Familia', patrones: [] }, { alias: 'Otros', patrones: [] }] } }
  const p = proponer(db, lectura, db.cuentas[0].id)
  const por = (texto: string) => p.nuevos.find((m) => m.concepto_limpio.toLowerCase().includes(texto.toLowerCase()))!

  it('quita el nombre del titular del traspaso y lo marca como traspaso interno', () => {
    const t = por('traspaso')
    expect(t.concepto_original).not.toMatch(/NOMBRE|APELLIDO/)
    expect(t.concepto_limpio).toBe('Traspaso a cuenta')
    expect(t.tipo).toBe('traspaso_interno')
  })

  it('usa el alias de la empresa en la transferencia y propone el reembolso', () => {
    const r = por('transferencia')
    expect(r.concepto_limpio).toBe('Transferencia recibida Empresa Gastos')
    expect(r.concepto_original).not.toContain('ACME')
    expect(r.sugerencia?.tipo).toBe('reembolso_empresa')
    expect(contieneIdentificativo(r.concepto_original)).toBe(false)
  })

  it('en los adeudos el concepto es el comercio, sin la referencia', () => {
    expect(por('paypal').concepto_limpio).toBe('PayPal Europe S.a.r.l. et Cie S.c.a')
  })

  it('la nómina y la hipoteca de fin de mes cuentan en el mes siguiente', () => {
    expect(por('nomina').mes_imputacion).toBe('2026-12')
    expect(por('hipotecario').mes_imputacion).toBe('2026-12')
    expect(por('mercadona').mes_imputacion).toBeNull()
    expect(p.alMesSiguiente).toHaveLength(2)
  })

  it('en la revisión se puede quitar el paso al mes siguiente', () => {
    const nomina = por('nomina')
    const r = confirmarImportacion(db, p, { aceptadas: new Set(), mesSiguiente: new Map([[nomina.id, false]]) })
    expect(r.movimientos.find((m) => m.id === nomina.id)!.mes_imputacion).toBeNull()
  })

  it('propone como gasto de empleado el taxi en día laborable', () => {
    expect(por('taxi').sugerencia).toMatchObject({ tipo: 'gasto_empleado' })
    expect(por('mercadona').sugerencia).toBeNull()
  })
})

describe('importar pegando', () => {
  const tsv = [CABECERA.slice(1), ...FILAS.map((f) => f.slice(1))].map((f) => f.join('\t')).join('\n')

  it('lee texto tabulado con la cabecera de BBVA', async () => {
    const { leerTexto } = await import('./lector')
    const l = leerTexto(`Movimientos\n\n${tsv}`)
    expect(l.plantilla.origen).toBe('bbva_cuenta')
    expect(l.filas).toHaveLength(FILAS.length)
    expect(l.filas[2]).toMatchObject({ concepto: 'Cafe la plaza', poblacion: 'madrid', importe: -3.2 })
  })

  it('lee una tabla HTML copiada de la web', async () => {
    const { leerPortapapeles } = await import('./lector')
    const html = `<table>${[CABECERA.slice(1), ...FILAS.map((f) => f.slice(1))].map((f) => `<tr>${f.map((c) => `<td>${typeof c === 'number' ? String(c).replace('.', ',') : c}</td>`).join('')}</tr>`).join('')}</table>`
    const l = await leerPortapapeles({ html })
    expect(l.filas).toHaveLength(FILAS.length)
    expect(l.filas[5].importe).toBe(-11.99)
  })

  it('avisa si lo pegado no es una tabla de movimientos', async () => {
    const { leerTexto } = await import('./lector')
    expect(() => leerTexto('hola')).toThrow(/No se reconoce/)
    expect(() => leerTexto('   ')).toThrow(/No hay nada/)
  })
})
