/**
 * Operaciones de la fase 3 sobre movimientos: corrección de categoría (con regla para los futuros),
 * tipo, notas, gastos de empleado, conciliación de reembolsos e indicadores.
 */
import { claveComercio, normalizarConcepto } from '../lib/conceptos'
import { mesSiguiente } from '../lib/imputacion'
import type { BaseDatos, Conciliacion, Movimiento, Regla, TipoMovimiento } from '../lib/tipos'
import { ErrorDatos, exigirSinIdentificativos, nuevoId } from './operaciones'

const redondear = (n: number) => Math.round(n * 100) / 100

function exigirMovimientos(db: BaseDatos, ids: string[]): Set<string> {
  const set = new Set(ids)
  if (!set.size) throw new ErrorDatos('No hay movimientos seleccionados')
  const existen = db.movimientos.filter((m) => set.has(m.id)).length
  if (existen !== set.size) throw new ErrorDatos('Movimiento no encontrado')
  return set
}

/** Movimientos del mismo comercio que los indicados (en cualquier cuenta), sin contar los indicados */
export function mismoConcepto(db: BaseDatos, ids: string[]): Movimiento[] {
  const set = new Set(ids)
  const claves = new Set(db.movimientos.filter((m) => set.has(m.id)).map((m) => claveComercio(m.concepto_limpio)).filter(Boolean))
  return db.movimientos.filter((m) => !set.has(m.id) && claves.has(claveComercio(m.concepto_limpio)))
}

/**
 * Cambia la categoría. Con «mismoConcepto», también la de todos los movimientos con el mismo concepto.
 * Con «crearRegla», añade una regla manual por concepto exacto para las próximas importaciones.
 */
export function cambiarCategoria(
  db: BaseDatos,
  ids: string[],
  categoria_id: string | null,
  opciones: { mismoConcepto?: boolean; crearRegla?: boolean } = {},
): BaseDatos {
  const set = exigirMovimientos(db, ids)
  if (categoria_id && !db.categorias.some((c) => c.id === categoria_id)) throw new ErrorDatos('Categoría no encontrada')
  if (opciones.mismoConcepto) mismoConcepto(db, ids).forEach((m) => set.add(m.id))
  const movimientos = db.movimientos.map((m) =>
    set.has(m.id) ? { ...m, categoria_id, origen_categoria: categoria_id ? ('manual' as const) : null, regla_id: null } : m,
  )
  let reglas = db.reglas
  if (opciones.crearRegla && categoria_id) {
    const conceptos = [...new Set(db.movimientos.filter((m) => ids.includes(m.id)).map((m) => claveComercio(m.concepto_limpio) || m.concepto_normalizado))]
    for (const c of conceptos) {
      exigirSinIdentificativos('Regla', c)
      const existente = reglas.find((r) => r.origen === 'manual' && r.tipo_patron === 'exacto' && normalizarConcepto(r.patron) === c)
      if (existente) {
        reglas = reglas.map((r) => (r.id === existente.id ? { ...r, categoria_id, activa: true } : r))
      } else {
        const nueva: Regla = {
          id: nuevoId(),
          nombre: null,
          patron: c,
          tipo_patron: 'exacto',
          cuenta_id: null,
          importe_min: null,
          importe_max: null,
          categoria_id,
          tipo_movimiento: null,
          es_sugerencia: false,
          prioridad: 50,
          origen: 'manual',
          activa: true,
          confirmaciones: 0,
          descartes: 0,
          mes_siguiente: false,
          created_at: new Date().toISOString(),
        }
        reglas = [...reglas, nueva]
      }
    }
  }
  return { ...db, movimientos, reglas }
}

/** Cambia el tipo. Al dejar de ser reembolso o gasto de empleado, se quitan sus conciliaciones */
export function cambiarTipo(db: BaseDatos, ids: string[], tipo: TipoMovimiento): BaseDatos {
  const set = exigirMovimientos(db, ids)
  return {
    ...db,
    movimientos: db.movimientos.map((m) => (set.has(m.id) ? { ...m, tipo, reembolso_cerrado: tipo === 'gasto_empleado' ? m.reembolso_cerrado : false } : m)),
    conciliaciones: db.conciliaciones.filter(
      (c) => !((set.has(c.gasto_id) && tipo !== 'gasto_empleado') || (set.has(c.reembolso_id) && tipo !== 'reembolso_empresa')),
    ),
  }
}

/** Da por buena (o deja de dar por buena) una liquidación de la tarjeta que no cuadra con sus compras */
export function confirmarCuadreLiquidacion(db: BaseDatos, id: string, confirmada: boolean): BaseDatos {
  exigirMovimientos(db, [id])
  return { ...db, movimientos: db.movimientos.map((m) => (m.id === id ? { ...m, cuadre_confirmado: confirmada } : m)) }
}

/** El usuario confirma la categoría que ya tienen: pasan a ser decisión suya y no se vuelve a proponer cambiarla */
export function fijarCategoria(db: BaseDatos, ids: string[]): BaseDatos {
  const set = exigirMovimientos(db, ids)
  return { ...db, movimientos: db.movimientos.map((m) => (set.has(m.id) && m.categoria_id ? { ...m, origen_categoria: 'manual' as const } : m)) }
}

/** Revisado como personal en la detección de gastos de empleado: no se vuelve a proponer y enseña al comercio */
export function marcarPersonal(db: BaseDatos, ids: string[]): BaseDatos {
  const set = exigirMovimientos(db, ids)
  return { ...db, movimientos: db.movimientos.map((m) => (set.has(m.id) ? { ...m, tipo: m.tipo === 'gasto_empleado' ? 'normal' : m.tipo, revisado_empleado: true } : m)) }
}

/** Imputa el movimiento al mes siguiente al de su fecha (o lo devuelve a su mes) */
export function imputarMesSiguiente(db: BaseDatos, ids: string[], activo: boolean): BaseDatos {
  const set = exigirMovimientos(db, ids)
  return { ...db, movimientos: db.movimientos.map((m) => (set.has(m.id) ? { ...m, mes_imputacion: activo ? mesSiguiente(m.fecha_operacion) : null } : m)) }
}

/** Marca como gasto de empleado o lo devuelve a normal (deslizar sobre el movimiento) */
export function alternarEmpleado(db: BaseDatos, id: string): BaseDatos {
  const m = db.movimientos.find((x) => x.id === id)
  if (!m) throw new ErrorDatos('Movimiento no encontrado')
  return cambiarTipo(db, [id], m.tipo === 'gasto_empleado' ? 'normal' : 'gasto_empleado')
}

export function guardarNota(db: BaseDatos, id: string, nota: string): BaseDatos {
  exigirMovimientos(db, [id])
  const n = nota.trim() || null
  exigirSinIdentificativos('Nota', n)
  if (n && n.length > 500) throw new ErrorDatos('La nota admite un máximo de 500 caracteres')
  return { ...db, movimientos: db.movimientos.map((m) => (m.id === id ? { ...m, nota: n } : m)) }
}

/** Cierra un gasto de empleado con reembolso parcial o sin reembolso (o lo reabre) */
export function cerrarReembolso(db: BaseDatos, id: string, cerrado: boolean): BaseDatos {
  const m = db.movimientos.find((x) => x.id === id)
  if (!m) throw new ErrorDatos('Movimiento no encontrado')
  if (m.tipo !== 'gasto_empleado') throw new ErrorDatos('Solo se cierran gastos de empleado')
  return { ...db, movimientos: db.movimientos.map((x) => (x.id === id ? { ...x, reembolso_cerrado: cerrado } : x)) }
}

// ---------------------------------------------------------------------------
// Conciliación de reembolsos (apartado 6)
// ---------------------------------------------------------------------------

/** Lo aplicado a cada gasto y a cada reembolso */
export function aplicado(db: BaseDatos): { gastos: Map<string, number>; reembolsos: Map<string, number> } {
  const gastos = new Map<string, number>()
  const reembolsos = new Map<string, number>()
  for (const c of db.conciliaciones) {
    gastos.set(c.gasto_id, redondear((gastos.get(c.gasto_id) ?? 0) + c.importe_aplicado))
    reembolsos.set(c.reembolso_id, redondear((reembolsos.get(c.reembolso_id) ?? 0) + c.importe_aplicado))
  }
  return { gastos, reembolsos }
}

/** Gastos de empleado con algo pendiente, del más antiguo al más reciente */
export function gastosPendientes(db: BaseDatos): { gasto: Movimiento; pendiente: number }[] {
  const { gastos } = aplicado(db)
  return db.movimientos
    .filter((m) => m.tipo === 'gasto_empleado' && !m.reembolso_cerrado)
    .map((gasto) => ({ gasto, pendiente: redondear(-gasto.importe - (gastos.get(gasto.id) ?? 0)) }))
    .filter((x) => x.pendiente > 0)
    .sort((a, b) => a.gasto.fecha_operacion.localeCompare(b.gasto.fecha_operacion))
}

/**
 * Propone los gastos pendientes que suman el importe del reembolso, del más antiguo al más reciente.
 * Primero busca una combinación exacta (dando preferencia a los más antiguos); si no la hay,
 * acumula del más antiguo hasta cubrir el importe.
 */
export function proponerConciliacion(db: BaseDatos, reembolsoId: string): { gastos: string[]; exacta: boolean } {
  const r = db.movimientos.find((m) => m.id === reembolsoId)
  if (!r || r.tipo !== 'reembolso_empresa') throw new ErrorDatos('El movimiento no es un reembolso de empresa')
  const restante = redondear(r.importe - (aplicado(db).reembolsos.get(r.id) ?? 0))
  const pendientes = gastosPendientes(db).filter((p) => p.gasto.fecha_operacion <= r.fecha_operacion)
  const objetivo = Math.round(restante * 100)
  const centimos = pendientes.map((p) => Math.round(p.pendiente * 100))

  // Búsqueda exacta acotada (los 24 más antiguos), en orden de antigüedad
  const n = Math.min(centimos.length, 24)
  let encontrada: number[] | null = null
  let pasos = 0
  const buscar = (i: number, suma: number, elegidos: number[]) => {
    if (encontrada || pasos++ > 200000) return
    if (suma === objetivo) {
      encontrada = [...elegidos]
      return
    }
    if (i >= n || suma > objetivo) return
    buscar(i + 1, suma + centimos[i], [...elegidos, i])
    buscar(i + 1, suma, elegidos)
  }
  if (objetivo > 0) buscar(0, 0, [])
  if (encontrada) return { gastos: (encontrada as number[]).map((i) => pendientes[i].gasto.id), exacta: true }

  const elegidos: string[] = []
  let suma = 0
  for (let i = 0; i < pendientes.length && suma < objetivo; i++) {
    elegidos.push(pendientes[i].gasto.id)
    suma += centimos[i]
  }
  return { gastos: elegidos, exacta: false }
}

/**
 * Vincula un reembolso con gastos de empleado. Se aplica a cada gasto lo que le falta, del más antiguo
 * al más reciente, hasta agotar el reembolso. La diferencia queda visible en los indicadores.
 */
export function conciliar(db: BaseDatos, reembolsoId: string, gastoIds: string[]): BaseDatos {
  const r = db.movimientos.find((m) => m.id === reembolsoId)
  if (!r || r.tipo !== 'reembolso_empresa') throw new ErrorDatos('El movimiento no es un reembolso de empresa')
  if (!gastoIds.length) throw new ErrorDatos('Elige al menos un gasto')
  const pendientes = new Map(gastosPendientes(db).map((p) => [p.gasto.id, p]))
  const elegidos = gastoIds.map((id) => {
    const p = pendientes.get(id)
    if (!p) throw new ErrorDatos('Uno de los gastos ya no está pendiente')
    return p
  })
  elegidos.sort((a, b) => a.gasto.fecha_operacion.localeCompare(b.gasto.fecha_operacion))
  let restante = redondear(r.importe - (aplicado(db).reembolsos.get(r.id) ?? 0))
  if (restante <= 0) throw new ErrorDatos('Este reembolso ya está aplicado por completo')
  const nuevas: Conciliacion[] = []
  const creada = new Date().toISOString()
  for (const p of elegidos) {
    if (restante <= 0) break
    const importe = Math.min(p.pendiente, restante)
    nuevas.push({ id: nuevoId(), reembolso_id: r.id, gasto_id: p.gasto.id, importe_aplicado: redondear(importe), created_at: creada })
    restante = redondear(restante - importe)
  }
  return { ...db, conciliaciones: [...db.conciliaciones, ...nuevas] }
}

export function desconciliar(db: BaseDatos, reembolsoId: string): BaseDatos {
  return { ...db, conciliaciones: db.conciliaciones.filter((c) => c.reembolso_id !== reembolsoId) }
}

export interface IndicadoresEmpleado {
  pendiente: number
  pendienteNumero: number
  /** Días desde el gasto pendiente más antiguo */
  antiguedad: number | null
  reembolsadoAnio: number
  /** Gastos cerrados con reembolso parcial o sin reembolso */
  diferencias: { gasto: Movimiento; noReembolsado: number }[]
  /** Reembolsos con importe sin aplicar a gastos */
  reembolsosDeMas: { reembolso: Movimiento; sinAplicar: number }[]
  atrasados: number
}

const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000)

export function indicadoresEmpleado(db: BaseDatos, hoy: string): IndicadoresEmpleado {
  const pendientes = gastosPendientes(db)
  const { gastos, reembolsos } = aplicado(db)
  const anio = hoy.slice(0, 4)
  return {
    pendiente: redondear(pendientes.reduce((s, p) => s + p.pendiente, 0)),
    pendienteNumero: pendientes.length,
    antiguedad: pendientes.length ? dias(pendientes[0].gasto.fecha_operacion, hoy) : null,
    reembolsadoAnio: redondear(db.movimientos.filter((m) => m.tipo === 'reembolso_empresa' && m.fecha_operacion.startsWith(anio)).reduce((s, m) => s + m.importe, 0)),
    diferencias: db.movimientos
      .filter((m) => m.tipo === 'gasto_empleado' && m.reembolso_cerrado)
      .map((gasto) => ({ gasto, noReembolsado: redondear(-gasto.importe - (gastos.get(gasto.id) ?? 0)) }))
      .filter((x) => x.noReembolsado > 0),
    reembolsosDeMas: db.movimientos
      .filter((m) => m.tipo === 'reembolso_empresa' && reembolsos.has(m.id))
      .map((reembolso) => ({ reembolso, sinAplicar: redondear(reembolso.importe - (reembolsos.get(reembolso.id) ?? 0)) }))
      .filter((x) => x.sinAplicar > 0),
    atrasados: pendientes.filter((p) => dias(p.gasto.fecha_operacion, hoy) > db.ajustes.dias_aviso_reembolso).length,
  }
}
