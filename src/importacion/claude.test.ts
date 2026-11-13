import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { contieneIdentificativo } from '../lib/identificativos'
import { aplicarReglasAPendientes } from './pendientes'
import { importarReglas, leerReglas, resumirComercios, textoResumen } from './claude'
import { escribirXlsx, generarExcelPrueba, NOMBRES_PRUEBA } from './excelPrueba'
import { leerFichero } from './lector'
import { confirmarImportacion, proponer } from './importar'

const EXCELS = generarExcelPrueba({ desde: '2026-09-01', hasta: '2026-11-30' })
const lecturas = EXCELS.map((e) => leerFichero(escribirXlsx(e.filas)))
const base = datosIniciales()
const db = { ...base, ajustes: { ...base.ajustes, alias_terceros: [{ alias: 'Empresa', patrones: [NOMBRES_PRUEBA.empresa] }, { alias: 'Familia', patrones: [NOMBRES_PRUEBA.familia] }, { alias: 'Otros', patrones: [] }] } }

describe('resumen de comercios para Claude', () => {
  const r = resumirComercios(db, lecturas)
  const texto = textoResumen(db, r)

  it('incluye también lo anterior a la fecha de inicio y agrupa por comercio', () => {
    const total = lecturas.reduce((s, l) => s + l.filas.length, 0)
    expect(r.movimientos + r.descartadas).toBe(total)
    expect(r.lineas.length).toBeLessThan(r.movimientos)
  })

  it('no lleva fechas, saldos, cuentas, nombres ni datos identificativos', () => {
    expect(contieneIdentificativo(texto)).toBe(false)
    for (const prohibido of ['ACME', 'MARIA GARCIA', 'TITULAR', '/2026', '2026-']) expect(texto.toUpperCase()).not.toContain(prohibido.toUpperCase())
    expect(texto).toContain('Restaurantes > Cafeterías') // lista de categorías
  })
})

describe('reglas pegadas desde Claude', () => {
  const texto = ['clave\tcategoria', 'comercio raro\tRestaurantes > Cafeterias', 'tienda zeta ; Compras > Regalos', 'otro\tCategoria > Inventada', 'sin categoria', '# comentario'].join('\n')
  const lineas = leerReglas(db, texto)

  it('lee las líneas válidas y explica las erróneas', () => {
    expect(lineas.filter((l) => !l.error).map((l) => l.clave)).toEqual(['comercio raro', 'tienda zeta'])
    expect(lineas.filter((l) => l.error).map((l) => l.error)).toEqual(['No existe la categoría «Categoria > Inventada»', 'Falta la categoría'])
  })

  it('crea reglas manuales que categorizan lo pendiente y no tocan lo categorizado', () => {
    const r = importarReglas(db, lineas)
    expect(r).toMatchObject({ nuevas: 2, actualizadas: 0 })
    expect(importarReglas(r.db, lineas)).toMatchObject({ nuevas: 0, actualizadas: 0 })
    // Con una importación real: lo pendiente que coincide se categoriza con la regla
    const lectura = leerFichero(escribirXlsx(EXCELS.find((e) => e.nombre.includes('cuenta principal'))!.filas))
    const imp = confirmarImportacion(db, proponer(db, lectura, db.cuentas[0].id), { aceptadas: new Set() })
    const pendiente = imp.movimientos.find((m) => !m.categoria_id && m.tipo === 'normal')!
    const conRegla = importarReglas(imp, leerReglas(imp, `${pendiente.concepto_limpio}\tCompras > Regalos`))
    const aplicado = aplicarReglasAPendientes(conRegla.db).db
    expect(aplicado.movimientos.find((m) => m.id === pendiente.id)!.categoria_id).toBe(db.categorias.find((c) => c.nombre === 'Regalos')!.id)
    const categorizados = imp.movimientos.filter((m) => m.categoria_id)
    for (const m of categorizados) expect(aplicado.movimientos.find((x) => x.id === m.id)!.categoria_id).toBe(m.categoria_id)
  })

  it('admite palabras clave (~) y reglas de tipo', () => {
    const l = leerReglas(db, ['~cumple\tCompras > Regalos', 'pago a prestamista\tTipo: Pago de deuda', 'otro\tTipo: Inventado'].join('\n'))
    expect(l[0]).toMatchObject({ modo: 'contiene', clave: 'cumple', error: null })
    expect(l[1]).toMatchObject({ modo: 'exacto', tipo: 'pago_deuda', categoria_id: null, error: null })
    expect(l[2].error).toContain('No existe el tipo')
    const r = importarReglas(db, l).db
    const regla = r.reglas.find((x) => x.patron === 'cumple')!
    expect(regla).toMatchObject({ tipo_patron: 'contiene', prioridad: 60, origen: 'manual' })
    expect(r.reglas.find((x) => x.tipo_movimiento === 'pago_deuda' && x.origen === 'manual')).toBeTruthy()
  })
})

