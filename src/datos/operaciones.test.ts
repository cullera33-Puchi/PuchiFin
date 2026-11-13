import { describe, expect, it } from 'vitest'
import { generarDatosPrueba } from '../lib/datosPrueba'
import type { BaseDatos, Movimiento } from '../lib/tipos'
import {
  ErrorDatos,
  actualizarCategoria,
  borrarDatosPrueba,
  comprobarBaseDatos,
  contarDatosPrueba,
  crearCategoria,
  datosIniciales,
  fusionarCategoria,
  guardarAjustes,
  guardarCuenta,
} from './operaciones'

const cat = (db: BaseDatos, nombre: string, padre?: string) => {
  const p = padre ? db.categorias.find((c) => c.nombre === padre && !c.padre_id) : undefined
  return db.categorias.find((c) => c.nombre === nombre && c.padre_id === (p?.id ?? null))!
}

const conPrueba = (db: BaseDatos, hasta = '2026-11-30') => {
  const d = generarDatosPrueba({ cuentas: db.cuentas, categorias: db.categorias, desde: '2026-10-01', hasta })
  return { ...db, importaciones: d.importaciones, movimientos: d.movimientos, conciliaciones: d.conciliaciones }
}

describe('datosIniciales', () => {
  const db = datosIniciales()

  it('carga cuentas, catálogo, ajustes y deuda', () => {
    expect(db.cuentas.map((c) => c.alias)).toEqual(['Cuenta principal', 'Cuenta 2', 'Tarjeta', 'Hipoteca'])
    expect(db.categorias.filter((c) => !c.padre_id)).toHaveLength(14)
    expect(db.categorias.filter((c) => c.padre_id)).toHaveLength(45)
    expect(db.categorias.filter((c) => c.naturaleza === 'ingreso')).toHaveLength(3)
    expect(db.ajustes.fecha_inicio).toBe('2026-10-01')
    expect(db.compromisos[0]).toMatchObject({ nombre: 'Deuda familiar', deuda_inicial: 0, colchon: 0, mes_referencia: 7 })
  })

  it('es correcta según la comprobación completa', () => {
    expect(comprobarBaseDatos(db)).toEqual([])
  })

  it('los iconos del catálogo son claves, no emojis', () => {
    expect(db.categorias.filter((c) => !c.padre_id).every((c) => /^[a-z]+$/.test(c.icono ?? ''))).toBe(true)
  })
})

describe('cuentas', () => {
  const db = datosIniciales()

  it('rechaza alias con IBAN, series largas de dígitos o repetidos', () => {
    expect(() => guardarCuenta(db, { alias: 'ES91 2100 0418 4502 0005 1332', entidad: null, tipo: 'cuenta', activa: true })).toThrow(/IBAN/)
    expect(() => guardarCuenta(db, { alias: 'Cuenta 0200051332', entidad: null, tipo: 'cuenta', activa: true })).toThrow(/dígitos/)
    expect(() => guardarCuenta(db, { alias: 'cuenta 2', entidad: null, tipo: 'cuenta', activa: true })).toThrow(/mismo alias|ese alias/)
  })

  it('crea y modifica', () => {
    const a = guardarCuenta(db, { alias: 'Ahorro', entidad: 'BBVA', tipo: 'cuenta', activa: true })
    const nueva = a.cuentas.find((c) => c.alias === 'Ahorro')!
    expect(nueva.orden).toBe(5)
    const b = guardarCuenta(a, { alias: 'Ahorro', entidad: null, tipo: 'cuenta', activa: false }, nueva.id)
    expect(b.cuentas.find((c) => c.id === nueva.id)).toMatchObject({ activa: false, entidad: null })
    expect(db.cuentas).toHaveLength(4) // sin efectos sobre el original
  })
})

describe('categorías', () => {
  const db = datosIniciales()

  it('solo dos niveles y nombres únicos por nivel', () => {
    expect(() => crearCategoria(db, { nombre: 'Nieta', padre_id: cat(db, 'Luz', 'Suministros').id })).toThrow(ErrorDatos)
    expect(() => crearCategoria(db, { nombre: 'vivienda', padre_id: null })).toThrow(/mismo nivel/)
    expect(() => actualizarCategoria(db, cat(db, 'Salud').id, { nombre: 'Viajes' })).toThrow(/mismo nivel/)
  })

  it('la subcategoría hereda la naturaleza y el color', () => {
    const ing = cat(db, 'Ingresos')
    const a = crearCategoria(db, { nombre: 'Alquileres', padre_id: ing.id, naturaleza: 'gasto' })
    expect(a.categorias.find((c) => c.nombre === 'Alquileres')).toMatchObject({ naturaleza: 'ingreso', color: ing.color, icono: null })
  })

  it('fusiona moviendo movimientos y subcategorías', () => {
    let a = crearCategoria(db, { nombre: 'Mascotas', padre_id: null })
    const masc = cat(a, 'Mascotas')
    a = crearCategoria(a, { nombre: 'Veterinario', padre_id: masc.id })
    a = crearCategoria(a, { nombre: 'Farmacia', padre_id: masc.id }) // homónima de Salud > Farmacia
    a = conPrueba(a)
    const unMov = a.movimientos[0].id
    a = { ...a, movimientos: a.movimientos.map((m): Movimiento => (m.id === unMov ? { ...m, categoria_id: cat(a, 'Farmacia', 'Mascotas').id } : m)) }
    const salud = cat(a, 'Salud')
    const r = fusionarCategoria(a, masc.id, salud.id)
    expect(r.categorias.some((c) => c.nombre === 'Mascotas')).toBe(false)
    expect(cat(r, 'Veterinario', 'Salud')).toBeDefined()
    expect(r.categorias.filter((c) => c.nombre === 'Farmacia' && c.padre_id === salud.id)).toHaveLength(1)
    expect(r.movimientos.find((m) => m.id === unMov)!.categoria_id).toBe(cat(r, 'Farmacia', 'Salud').id)
    expect(comprobarBaseDatos(r)).toEqual([])
  })

  it('no fusiona una categoría en una de sus subcategorías', () => {
    expect(() => fusionarCategoria(db, cat(db, 'Salud').id, cat(db, 'Farmacia', 'Salud').id)).toThrow(/subcategorías/)
  })
})

describe('ajustes', () => {
  const db = datosIniciales()

  it('valida fechas y datos identificativos', () => {
    expect(() => guardarAjustes(db, { fecha_corte_fintonic: '2026-10-01' })).toThrow(/anterior/)
    expect(() => guardarAjustes(db, { alias_terceros: [{ alias: 'Familia', patrones: ['X1234567L'] }] })).toThrow(/NIE/)
    expect(guardarAjustes(db, { dias_aviso_reembolso: 45 }).ajustes.dias_aviso_reembolso).toBe(45)
  })
})

describe('datos de prueba', () => {
  it('se cuentan y se borran con sus conciliaciones, sin tocar lo demás', () => {
    const base = datosIniciales()
    const a = conPrueba(base)
    expect(contarDatosPrueba(a)).toBe(a.movimientos.length)
    expect(a.conciliaciones.length).toBeGreaterThan(0)
    expect(comprobarBaseDatos(a)).toEqual([])
    const b = borrarDatosPrueba(a)
    expect([b.movimientos.length, b.importaciones.length, b.conciliaciones.length, contarDatosPrueba(b)]).toEqual([0, 0, 0, 0])
    expect(b.categorias).toBe(a.categorias)
  })
})

describe('comprobarBaseDatos', () => {
  it('detecta datos identificativos, duplicados y referencias rotas', () => {
    const a = conPrueba(datosIniciales())
    const m = a.movimientos[0]
    const roto: BaseDatos = {
      ...a,
      movimientos: [...a.movimientos, { ...m, id: 'x' }, { ...m, id: 'y', ocurrencia: 9, cuenta_id: 'no-existe', concepto_original: 'TRANSF ES9121000418450200051332' }],
    }
    const p = comprobarBaseDatos(roto)
    expect(p.some((x) => x.includes('duplicado'))).toBe(true)
    expect(p.some((x) => x.includes('IBAN'))).toBe(true)
    expect(p.some((x) => x.includes('cuenta no existe'))).toBe(true)
    expect(p.join(' ')).not.toContain('2100 0418')
  })

  it('no confunde los identificadores internos con tarjetas', () => {
    const a = datosIniciales()
    a.cuentas[0].id = '4111-1111-1111-1111' // con forma de tarjeta válida
    expect(comprobarBaseDatos({ ...a, movimientos: [] })).toEqual([])
  })
})
