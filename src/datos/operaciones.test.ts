import { describe, expect, it } from 'vitest'
import { generarDatosPrueba } from '../lib/datosPrueba'
import type { BaseDatos, Movimiento } from '../lib/tipos'
import {
  ErrorDatos,
  actualizarCatalogo,
  empezarDeCero,
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
  return { ...db, importaciones: d.importaciones, movimientos: d.movimientos }
}

describe('datosIniciales', () => {
  const db = datosIniciales()

  it('carga cuentas, catálogo, ajustes y deuda', () => {
    expect(db.cuentas.map((c) => c.alias)).toEqual(['Cuenta principal', 'Cuenta 2', 'Tarjeta', 'Hipoteca'])
    expect(db.categorias.filter((c) => !c.padre_id)).toHaveLength(19)
    expect(db.categorias.filter((c) => c.padre_id)).toHaveLength(67)
    expect(db.categorias.filter((c) => c.naturaleza === 'ingreso')).toHaveLength(3)
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
    let a = crearCategoria(db, { nombre: 'Animales', padre_id: null })
    const masc = cat(a, 'Animales')
    a = crearCategoria(a, { nombre: 'Clínica animal', padre_id: masc.id })
    a = crearCategoria(a, { nombre: 'Farmacia', padre_id: masc.id }) // homónima de Salud > Farmacia
    a = conPrueba(a)
    const unMov = a.movimientos[0].id
    a = { ...a, movimientos: a.movimientos.map((m): Movimiento => (m.id === unMov ? { ...m, categoria_id: cat(a, 'Farmacia', 'Animales').id } : m)) }
    const salud = cat(a, 'Salud')
    const r = fusionarCategoria(a, masc.id, salud.id)
    expect(r.categorias.some((c) => c.nombre === 'Animales')).toBe(false)
    expect(cat(r, 'Clínica animal', 'Salud')).toBeDefined()
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
    expect(() => guardarAjustes(db, { alias_terceros: [{ alias: 'Familia', patrones: ['X1234567L'] }] })).toThrow(/NIE/)
    expect(guardarAjustes(db, { dias_aviso_reembolso: 45 }).ajustes.dias_aviso_reembolso).toBe(45)
  })
})

describe('datos de prueba', () => {
  it('se cuentan y se borran, sin tocar lo demás', () => {
    const base = datosIniciales()
    const a = conPrueba(base)
    expect(contarDatosPrueba(a)).toBe(a.movimientos.length)
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

describe('actualizarCatalogo (v0.10.0)', () => {
  // Catálogo como era antes: «Restaurantes y ocio» y «Plataformas»
  const viejo = (() => {
    const db = datosIniciales()
    const rest = db.categorias.find((c) => c.nombre === 'Restaurantes')!
    const ocio = db.categorias.find((c) => !c.padre_id && c.nombre === 'Ocio')!
    const susc = db.categorias.find((c) => c.nombre === 'Suscripciones')!
    return db.categorias
      .filter((c) => c.id !== ocio.id && !(c.padre_id === rest.id && /rápida|Bares/.test(c.nombre)) && !(c.padre_id === ocio.id && /Cine|Deporte|Juegos/.test(c.nombre)) && !(c.padre_id === susc.id && c.nombre !== 'Otras plataformas' && c.nombre !== 'Software' && c.nombre !== 'Cuotas'))
      .map((c) => {
        if (c.id === rest.id) return { ...c, nombre: 'Restaurantes y ocio' }
        if (c.padre_id === ocio.id) return { ...c, padre_id: rest.id, nombre: c.nombre === 'Planes y salidas' ? 'Ocio' : c.nombre }
        if (c.padre_id === susc.id && c.nombre === 'Otras plataformas') return { ...c, nombre: 'Plataformas' }
        return c
      })
  })()

  it('separa Restaurantes y Ocio y añade las plataformas sin cambiar ningún identificador', () => {
    const nuevo = actualizarCatalogo(viejo)
    for (const c of viejo) expect(nuevo.some((n) => n.id === c.id)).toBe(true)
    const porId = new Map(nuevo.map((c) => [c.id, c]))
    const raiz = (nombre: string) => nuevo.find((c) => !c.padre_id && c.nombre === nombre)!
    const subs = (nombre: string) => nuevo.filter((c) => c.padre_id === raiz(nombre).id).map((c) => c.nombre)
    expect(subs('Restaurantes')).toEqual(expect.arrayContaining(['Restaurantes', 'Cafeterías', 'Comida rápida y a domicilio', 'Bares y copas']))
    expect(subs('Ocio')).toEqual(expect.arrayContaining(['Planes y salidas', 'Cultura', 'Cine y espectáculos', 'Deporte', 'Juegos']))
    expect(subs('Suscripciones')).toEqual(expect.arrayContaining(['Netflix', 'Disney+', 'HBO Max', 'Amazon Prime', 'Spotify', 'Claude', 'PlayStation', 'Nintendo', 'Otras plataformas']))
    // La antigua subcategoría «Ocio» es la misma, ahora «Planes y salidas» dentro de Ocio
    const antiguoOcio = viejo.find((c) => c.nombre === 'Ocio')!
    expect(porId.get(antiguoOcio.id)).toMatchObject({ nombre: 'Planes y salidas', padre_id: raiz('Ocio').id })
    expect(nuevo.filter((c) => !c.padre_id)).toHaveLength(19)
  })

  it('no hace nada si ya está al día', () => {
    const actual = datosIniciales().categorias
    expect(actualizarCatalogo(actual)).toEqual(actual)
  })
})


describe('empezarDeCero', () => {
  const base = datosIniciales()
  const prueba = generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: '2026-10-01', hasta: '2026-11-13' })
  const manual = { ...base.reglas[0], id: 'manual-1', origen: 'manual' as const, nombre: null, patron: 'comercio zeta', tipo_patron: 'exacto' as const }
  const db: BaseDatos = {
    ...base,
    ...prueba,
    reglas: [...base.reglas, manual],
    cuentas: base.cuentas.map((c) => ({ ...c, saldo_confirmado: { importe: 10, fecha: '2026-11-13', cuadra: true } })),
    ajustes: { ...base.ajustes, dias_fin_de_mes: 3 },
  }

  it('borra lo cargado y conserva cuentas, categorías, ajustes y reglas', () => {
    const r = empezarDeCero(db, { conservarReglas: true, configuracionInicial: false })
    expect(r.movimientos).toEqual([])
    expect(r.importaciones).toEqual([])
    expect(r.conciliaciones).toEqual([])
    expect(r.cuentas.map((c) => c.id)).toEqual(db.cuentas.map((c) => c.id))
    expect(r.cuentas.every((c) => c.saldo_confirmado === null)).toBe(true)
    expect(r.categorias).toEqual(db.categorias)
    expect(r.ajustes.dias_fin_de_mes).toBe(3)
    expect(r.reglas.some((x) => x.id === 'manual-1')).toBe(true)
    expect(comprobarBaseDatos(r)).toEqual([])
  })

  it('sin tus reglas, quedan solo las de la app; con configuración inicial, como el primer día', () => {
    const r = empezarDeCero(db, { conservarReglas: false, configuracionInicial: false })
    expect(r.reglas.every((x) => x.origen === 'sistema')).toBe(true)
    const inicial = empezarDeCero(db, { conservarReglas: true, configuracionInicial: true })
    expect(inicial.ajustes.dias_fin_de_mes).toBe(5)
    expect(inicial.movimientos).toEqual([])
  })
})

describe('actualizarCatalogo (v0.13.0)', () => {
  it('taxis aparte, IBI y tasas en Impuestos con el mismo identificador y las categorías nuevas', () => {
    const actual = datosIniciales().categorias
    const impuestos = actual.find((c) => !c.padre_id && c.nombre === 'Impuestos')!
    const vivienda = actual.find((c) => !c.padre_id && c.nombre === 'Vivienda')!
    const ibi = actual.find((c) => c.nombre === 'IBI y tasas')!
    // Como era antes: IBI en Vivienda, sin taxis ni las categorías nuevas
    const nuevas = new Set(['Cuidado personal', 'Mascotas', 'Formación', 'Efectivo'])
    const raicesNuevas = new Set(actual.filter((c) => !c.padre_id && nuevas.has(c.nombre)).map((c) => c.id))
    const viejo = actual
      .filter((c) => !raicesNuevas.has(c.id) && !raicesNuevas.has(c.padre_id ?? '') && c.nombre !== 'Taxi y VTC')
      .map((c) => (c.id === ibi.id ? { ...c, padre_id: vivienda.id } : c))
    const nuevo = actualizarCatalogo(viejo)
    expect(nuevo.find((c) => c.id === ibi.id)!.padre_id).toBe(impuestos.id)
    for (const n of nuevas) expect(nuevo.some((c) => !c.padre_id && c.nombre === n)).toBe(true)
    expect(nuevo.some((c) => c.nombre === 'Taxi y VTC')).toBe(true)
    expect(actualizarCatalogo(nuevo)).toEqual(nuevo)
  })
})

