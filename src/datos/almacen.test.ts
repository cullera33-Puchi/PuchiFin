// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { copiaDiaria, hacerCopia, leerCopia, listarCopias, restaurar } from '../lib/copias'
import { cambiar, esperarGuardado, iniciarAlmacen, obtenerDatos, reiniciarParaPruebas } from './almacen'
import { ErrorDatos, confirmarSaldo, empezarDeCero, guardarAjustes, guardarCuenta } from './operaciones'
import { cambiarCategoria } from './movimientos'
import { generarDatosPrueba } from '../lib/datosPrueba'
import { importarReglas, leerReglas } from '../importacion/claude'

beforeEach(async () => {
  reiniciarParaPruebas()
  await new Promise<void>((resolver) => {
    const r = indexedDB.deleteDatabase('puchifin')
    r.onsuccess = r.onerror = r.onblocked = () => resolver()
  })
  await new Promise<void>((resolver) => {
    const r = indexedDB.deleteDatabase('puchifin-copias')
    r.onsuccess = r.onerror = r.onblocked = () => resolver()
  })
  localStorage.clear()
})

describe('almacén en el dispositivo', () => {
  it('el primer arranque crea los datos iniciales y los guarda', async () => {
    const db = await iniciarAlmacen()
    expect(db.cuentas).toHaveLength(4)
    reiniciarParaPruebas()
    const otra = await iniciarAlmacen()
    expect(otra).toEqual(db) // al volver a abrir, lo mismo
  })

  it('guarda cada cambio', async () => {
    await iniciarAlmacen()
    await cambiar((db) => guardarCuenta(db, { alias: 'Ahorro', entidad: null, tipo: 'cuenta', activa: true }))
    reiniciarParaPruebas()
    const db = await iniciarAlmacen()
    expect(db.cuentas.map((c) => c.alias)).toContain('Ahorro')
  })

  it('una operación no válida no cambia nada', async () => {
    await iniciarAlmacen()
    const antes = obtenerDatos()
    await expect(cambiar((db) => guardarCuenta(db, { alias: 'Cuenta 2', entidad: null, tipo: 'cuenta', activa: true }))).rejects.toThrow(ErrorDatos)
    expect(obtenerDatos()).toBe(antes)
  })
})

describe('copias', () => {
  it('copia diaria una vez al día y restauración con copia previa', async () => {
    await iniciarAlmacen()
    expect(await copiaDiaria()).not.toBeNull()
    expect(await copiaDiaria()).toBeNull()
    const [diaria] = await listarCopias()

    await cambiar((db) => guardarCuenta(db, { alias: 'Ahorro', entidad: null, tipo: 'cuenta', activa: true }))
    const archivo = (await leerCopia(diaria.clave))!
    await restaurar(archivo, 'antes de restaurar')
    await esperarGuardado()
    expect(obtenerDatos().cuentas.map((c) => c.alias)).not.toContain('Ahorro')

    const lista = await listarCopias()
    expect(lista.map((m) => m.tipo).sort()).toEqual(['antes de restaurar', 'diaria'])
    const previa = lista.find((m) => m.tipo === 'antes de restaurar')!
    expect(previa.cuentas).toBe(5) // la copia previa conserva la cuenta creada después
  })

  it('una copia manual se puede leer completa', async () => {
    await iniciarAlmacen()
    const m = await hacerCopia('manual')
    const a = await leerCopia(m.clave)
    expect(a?.datos).toEqual(obtenerDatos())
  })

  it('una copia guarda absolutamente todo y restaurarla lo deja idéntico', async () => {
    await iniciarAlmacen()
    // Movimientos, importaciones, reglas tuyas e importadas, saldo confirmado y ajustes
    await cambiar((d) => {
      const p = generarDatosPrueba({ cuentas: d.cuentas, categorias: d.categorias, desde: '2026-10-01', hasta: '2026-11-30' })
      const conMovs = { ...d, ...p, movimientos: p.movimientos.map((m, i) => (i === 2 ? { ...m, nota: 'nota', mes_imputacion: '2026-12' } : m)) }
      const conReglas = importarReglas(conMovs, leerReglas(conMovs, 'comercio zeta\tCompras > Regalos')).db
      const conManual = cambiarCategoria(conReglas, [conReglas.movimientos[5].id], conReglas.categorias[3].id, { crearRegla: true })
      const conSaldo = confirmarSaldo(conManual, conManual.cuentas[0].id, 1234.56, 1234.56, '2026-11-13')
      return guardarAjustes(conSaldo, { dias_fin_de_mes: 3, zona_casa: ['Valencia'] })
    })
    await esperarGuardado()
    const completo = structuredClone(obtenerDatos())
    expect(completo.reglas.filter((r) => r.origen === 'manual')).toHaveLength(2)

    const meta = await hacerCopia('manual')
    expect(meta).toMatchObject({ movimientos: completo.movimientos.length, reglas: completo.reglas.length })
    await cambiar((d) => empezarDeCero(d, { conservarReglas: false, configuracionInicial: true }))
    expect(obtenerDatos().movimientos).toHaveLength(0)

    await restaurar((await leerCopia(meta.clave))!, 'antes de restaurar')
    expect(obtenerDatos()).toEqual(completo)
  })
})

