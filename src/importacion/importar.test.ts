import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { comprobarBaseDatos, datosIniciales } from '../datos/operaciones'
import { contieneIdentificativo } from '../lib/identificativos'
import { calcularResumen, periodoMes } from '../lib/resumen'
import type { BaseDatos } from '../lib/tipos'
import { escribirXlsx, generarExcelPrueba, NOMBRES_PRUEBA } from './excelPrueba'
import { confirmarImportacion, conceptoLimpio, deshacerImportacion, proponer, cuentaSugerida, type Propuesta } from './importar'
import { extraer, leerFecha, leerFichero, leerImporte } from './lector'

const EXCELS = generarExcelPrueba({ desde: '2026-10-01', hasta: '2026-11-30' })
const fichero = (parte: string) => escribirXlsx(EXCELS.find((e) => e.nombre.includes(parte))!.filas)

function importar(db: BaseDatos, parte: string, aceptarTodo = true): { db: BaseDatos; p: Propuesta } {
  const lectura = leerFichero(fichero(parte))
  const cuenta = parte === 'cuenta 2' ? db.cuentas[1] : cuentaSugerida(db, lectura)!
  const p = proponer(db, lectura, cuenta.id)
  const aceptadas = new Set(aceptarTodo ? p.nuevos.filter((m) => m.sugerencia).map((m) => m.id) : [])
  return { db: confirmarImportacion(db, p, { aceptadas }), p }
}

describe('lector', () => {
  it('lee fechas y importes en los formatos habituales', () => {
    expect(leerFecha('03/11/2026')).toBe('2026-11-03')
    expect(leerFecha('2026-11-03')).toBe('2026-11-03')
    expect(leerFecha(46329)).toBe('2026-11-03')
    expect(leerFecha('31/02/2026')).toBeNull()
    expect(leerImporte('-1.234,56 €')).toBe(-1234.56)
    expect(leerImporte('12,3')).toBe(12.3)
    expect(leerImporte(-45.2)).toBe(-45.2)
    expect(leerImporte('abc')).toBeNull()
  })

  it('reconoce el origen por las cabeceras y salta las filas de cabecera del banco', () => {
    const cuenta = leerFichero(fichero('cuenta principal'))
    expect(cuenta.plantilla.origen).toBe('bbva_cuenta')
    expect(cuenta.filas[0].numero).toBe(6) // la fila 5 es la cabecera, como en el Excel real
    expect(cuenta.filas.every((f) => f.saldo !== null)).toBe(true)
    expect(leerFichero(fichero('tarjeta')).plantilla.origen).toBe('bbva_tarjeta')
  })

  it('no lee las columnas que no están en la plantilla (el IBAN de la cabecera no aparece)', () => {
    const cuenta = leerFichero(fichero('cuenta principal'))
    expect(JSON.stringify(cuenta.filas)).not.toContain('ES91 2100')
  })

  it('rechaza un fichero que no es de BBVA', () => {
    expect(() => extraer([['Nombre', 'Apellidos'], ['a', 'b']])).toThrow(/No se reconoce/)
  })

  it('acepta CSV', () => {
    const csv = 'Fecha;Concepto;Importe\n03/11/2026;MERCADONA;-45,20\n'
    const libro = XLSX.read(csv, { type: 'string', FS: ';' })
    const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: false })
    expect(extraer(filas).filas[0]).toMatchObject({ fecha_operacion: '2026-11-03', importe: -45.2 })
  })
})

describe('conceptoLimpio', () => {
  it('quita los números enmascarados y pone mayúscula por palabra', () => {
    expect(conceptoLimpio('LIQUIDACION TARJETA CREDITO ************1234')).toBe('Liquidacion Tarjeta Credito')
    expect(conceptoLimpio('COMPRA TARJ. **** **** **** 7890 MERCADONA')).toBe('Mercadona')
    expect(conceptoLimpio('TRANSFERENCIA DE Empresa NOMINA', ['Empresa'])).toBe('Transferencia de Empresa Nomina')
    expect(conceptoLimpio('NETFLIX')).toBe('Netflix')
    expect(conceptoLimpio('TARJETA ************1234 BOX FITNESS')).toBe('Tarjeta Box Fitness')
    expect(conceptoLimpio('PAGO XXXX 1234 TAXI')).toBe('Pago Taxi')
    expect(conceptoLimpio('ADEUDO A SU CARGO N ************4204 SPOTIFY AB')).toBe('Adeudo a Su Cargo Spotify Ab')
  })
})

describe('importación completa con los Excel de prueba', () => {
  let db = datosIniciales()
  db = { ...db, ajustes: { ...db.ajustes, alias_terceros: [{ alias: 'Empresa', patrones: [NOMBRES_PRUEBA.empresa] }, { alias: 'Familia', patrones: [NOMBRES_PRUEBA.familia] }, { alias: 'Otros', patrones: [] }] } }

  const tarjeta = importar(db, 'tarjeta')
  db = tarjeta.db
  const principal = importar(db, 'cuenta principal')
  db = principal.db
  const segunda = importar(db, 'cuenta 2')
  db = segunda.db

  it('descarta lo anterior a la fecha de inicio', () => {
    expect(tarjeta.p.anteriores).toBeGreaterThan(0)
    expect(db.movimientos.every((m) => m.fecha_operacion >= '2026-10-01')).toBe(true)
  })

  it('no guarda ningún dato identificativo ni nombres sin alias', () => {
    expect(comprobarBaseDatos(db)).toEqual([])
    const textos = db.movimientos.flatMap((m) => [m.concepto_original, m.concepto_limpio])
    expect(textos.some(contieneIdentificativo)).toBe(false)
    const todo = textos.join(' | ')
    for (const prohibido of ['ACME', 'MARIA GARCIA', 'LAURA MARTINEZ', '12345678Z', 'ES12 0049', '4940 1912']) expect(todo).not.toContain(prohibido)
    expect(todo).toContain('Empresa')
    expect(todo).toContain('Familia')
  })

  it('conserva los dos cafés iguales del mismo día', () => {
    const claves = db.movimientos.filter((m) => m.ocurrencia === 2)
    expect(claves.length).toBeGreaterThanOrEqual(1)
  })

  it('reimportar el mismo fichero no añade nada', () => {
    const otra = proponer(db, leerFichero(fichero('tarjeta')), db.cuentas[2].id)
    expect(otra.nuevos).toHaveLength(0)
    expect(otra.duplicados).toBe(tarjeta.p.nuevos.length)
  })

  it('un fichero que se solapa solo añade lo que falta', () => {
    const filas = EXCELS.find((e) => e.nombre.includes('tarjeta'))!.filas
    const parcial = escribirXlsx(filas.slice(0, filas.length - 10)) // sin los 10 más antiguos
    const base = { ...datosIniciales(), ajustes: db.ajustes }
    const primero = confirmarImportacion(base, proponer(base, leerFichero(parcial), base.cuentas[2].id), { aceptadas: new Set() })
    const completo = proponer(primero, leerFichero(fichero('tarjeta')), primero.cuentas[2].id)
    expect(completo.nuevos.length).toBe(10 - completo.anteriores)
  })

  it('marca la liquidación de la tarjeta como traspaso y cuadra con el mes anterior', () => {
    const liq = db.movimientos.filter((m) => m.concepto_normalizado.startsWith('liquidacion tarjeta'))
    expect(liq.length).toBeGreaterThan(0)
    expect(liq.every((m) => m.tipo === 'traspaso_interno')).toBe(true)
    expect(principal.p.avisos.filter((a) => a.includes('no cuadra'))).toEqual([])
  })

  it('empareja los traspasos entre cuentas propias en los dos lados', () => {
    expect(segunda.p.traspasos.length).toBeGreaterThan(0)
    const traspasos = db.movimientos.filter((m) => m.concepto_normalizado.startsWith('traspaso'))
    expect(traspasos.every((m) => m.tipo === 'traspaso_interno')).toBe(true)
  })

  it('categoriza con las reglas de la app y sugiere los gastos de empleado y el reembolso', () => {
    const nomina = db.movimientos.find((m) => m.concepto_normalizado.includes('nomina'))!
    expect(db.categorias.find((c) => c.id === nomina.categoria_id)?.nombre).toBe('Nómina')
    expect(nomina.tipo).toBe('normal')
    const sugeridos = tarjeta.p.nuevos.filter((m) => m.sugerencia?.tipo === 'gasto_empleado')
    expect(sugeridos.length).toBeGreaterThan(4)
    expect(db.movimientos.filter((m) => m.tipo === 'gasto_empleado').length).toBe(sugeridos.length)
    const reembolso = principal.p.nuevos.find((m) => m.sugerencia?.tipo === 'reembolso_empresa')
    expect(reembolso).toBeDefined()
    const sinCategoria = db.movimientos.filter((m) => m.tipo === 'normal' && !m.categoria_id)
    expect(sinCategoria.length).toBeLessThan(db.movimientos.length * 0.15)
  })

  it('las sugerencias descartadas no cambian el tipo y debilitan la regla', () => {
    const base = { ...datosIniciales(), ajustes: db.ajustes }
    const { db: sinAceptar } = importar(base, 'tarjeta', false)
    expect(sinAceptar.movimientos.some((m) => m.tipo === 'gasto_empleado')).toBe(false)
    expect(sinAceptar.reglas.some((r) => r.descartes > 0)).toBe(true)
  })

  it('el resumen de noviembre sale coherente con lo importado (con la nómina del 30 de octubre)', () => {
    const r = calcularResumen(periodoMes('2026-11-01'), db.movimientos, db.categorias, db.conciliaciones)
    expect(r.totales.ingresos).toBeGreaterThan(4000)
    expect(r.empleado.gastos).toBeGreaterThan(0)
  })

  it('deshacer una importación la quita entera y devuelve los traspasos emparejados', () => {
    const imp = db.importaciones.find((i) => i.cuenta_id === db.cuentas[1].id)!
    const sin = deshacerImportacion(db, imp.id)
    expect(sin.movimientos.some((m) => m.importacion_id === imp.id)).toBe(false)
    expect(sin.importaciones.find((i) => i.id === imp.id)!.estado).toBe('deshecha')
    for (const { id, tipo } of imp.modificados) expect(sin.movimientos.find((m) => m.id === id)!.tipo).toBe(tipo)
    expect(() => deshacerImportacion(sin, imp.id)).toThrow(/ya está deshecha/)
  })

  it('bloquea la importación si queda un dato identificativo', () => {
    const p = proponer(db, leerFichero(fichero('tarjeta')), db.cuentas[0].id) // otra cuenta: todo nuevo
    p.nuevos[0].concepto_original = 'PAGO ES91 2100 0418 4502 0005 1332'
    p.problemas.push({ fila: p.nuevos[0].fila, texto: `Fila ${p.nuevos[0].fila}: contiene un IBAN` })
    expect(() => confirmarImportacion(db, p, { aceptadas: new Set() })).toThrow(/bloqueada/)
  })
})
