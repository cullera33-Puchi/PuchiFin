/**
 * Al publicar una versión nueva, sus mejoras de categorización llegan a los datos que ya hay en el
 * iPhone sin romper nada:
 *   - Las reglas de la app se ponen al día (patrones nuevos o corregidos). Se respeta si el usuario
 *     las desactivó y lo que han aprendido (confirmaciones y descartes).
 *   - Esas reglas, y lo aprendido de las correcciones, se aplican SOLO a lo pendiente: movimientos de
 *     tipo Normal sin categoría que nadie ha tocado. Lo ya categorizado (a mano, por regla o aprendido),
 *     los gastos de empleado, los reembolsos y los traspasos no se tocan.
 *   - Las sugerencias (pago de deuda) no se aplican: siguen pidiendo confirmación.
 *   - Las reglas de la app retiradas en una versión se quitan del dispositivo.
 */
import { ErrorDatos } from '../datos/operaciones'
import { claveComercio, normalizarConcepto } from '../lib/conceptos'
import { finDeMes, mesSiguiente } from '../lib/imputacion'
import type { BaseDatos, Movimiento, Regla } from '../lib/tipos'
import { categoriasAprendidas, clasificar, REGLAS_RETIRADAS, reglasPredeterminadas } from './reglas'

/** Pendiente de categorizar: Normal, sin categoría y sin decisión del usuario */
export const esPendiente = (m: Movimiento) => m.tipo === 'normal' && !m.categoria_id && m.origen_categoria === null

/** Pendiente y con el tipo sin tocar por el usuario: las reglas pueden cambiar también el tipo */
const tipoLibre = (m: Movimiento) => !m.tipo_manual

/** Pone al día las reglas de la app (origen «sistema») con las de esta versión y quita las retiradas */
export function sincronizarReglasApp(db: BaseDatos): { db: BaseDatos; nuevas: number; actualizadas: number } {
  const base = reglasPredeterminadas(db.categorias)
  const retiradas = new Set(REGLAS_RETIRADAS)
  if (db.reglas.some((r) => r.origen === 'sistema' && retiradas.has(r.nombre ?? ''))) {
    const r = sincronizarReglasApp({ ...db, reglas: db.reglas.filter((x) => !(x.origen === 'sistema' && retiradas.has(x.nombre ?? ''))) })
    return { ...r, actualizadas: r.actualizadas + 1 }
  }
  const porNombre = new Map(db.reglas.filter((r) => r.origen === 'sistema').map((r) => [r.nombre, r]))
  let nuevas = 0
  let actualizadas = 0
  const cambiadas = new Map<string, Regla>()
  const anadidas: Regla[] = []
  for (const b of base) {
    const actual = b.nombre ? porNombre.get(b.nombre) : undefined
    if (!actual) {
      anadidas.push(b)
      nuevas++
      continue
    }
    const puesta: Regla = {
      ...actual,
      patron: b.patron,
      tipo_patron: b.tipo_patron,
      importe_min: b.importe_min,
      importe_max: b.importe_max,
      tipo_movimiento: b.tipo_movimiento,
      es_sugerencia: b.es_sugerencia,
      prioridad: b.prioridad,
      mes_siguiente: b.mes_siguiente,
      // Si su categoría ya no existe con ese nombre, se queda la que tenía
      categoria_id: b.categoria_id ?? actual.categoria_id,
    }
    if (JSON.stringify(puesta) !== JSON.stringify(actual)) {
      cambiadas.set(actual.id, puesta)
      actualizadas++
    }
  }
  if (!nuevas && !actualizadas) return { db, nuevas, actualizadas }
  return { db: { ...db, reglas: [...db.reglas.map((r) => cambiadas.get(r.id) ?? r), ...anadidas] }, nuevas, actualizadas }
}

/** Aplica las reglas y lo aprendido a lo pendiente de categorizar. Lo demás queda igual */
export function aplicarReglasAPendientes(db: BaseDatos): { db: BaseDatos; categorizados: number; traspasos: number } {
  const aprendidas = categoriasAprendidas(db)
  let categorizados = 0
  let traspasos = 0
  const movimientos = db.movimientos.map((m) => {
    if (!esPendiente(m)) return m
    const c = clasificar({ texto: normalizarConcepto(m.concepto_original), clave: claveComercio(m.concepto_limpio), cuenta_id: m.cuenta_id, importe: m.importe }, db.reglas, aprendidas)
    // Cambian el tipo sin pedir confirmación: traspasos y liquidación de la tarjeta (reglas de la app) y
    // cualquier regla de tipo que haya creado o importado el usuario
    const manual = c.regla_id ? db.reglas.find((r) => r.id === c.regla_id)?.origen === 'manual' : false
    // Si el usuario ya decidió el tipo (por ejemplo, devolvió un traspaso a Normal), solo se categoriza
    if (tipoLibre(m) && (c.tipo === 'traspaso_interno' || (c.tipo !== 'normal' && manual))) {
      traspasos++
      return { ...m, tipo: c.tipo, regla_id: c.regla_id, categoria_id: c.categoria_id ?? m.categoria_id }
    }
    if (c.tipo !== 'normal' || !c.categoria_id) return m
    categorizados++
    const mes = !m.mes_imputacion && c.mes_siguiente && finDeMes(m.fecha_operacion, db.ajustes.dias_fin_de_mes) ? mesSiguiente(m.fecha_operacion) : m.mes_imputacion
    return { ...m, categoria_id: c.categoria_id, origen_categoria: c.origen_categoria, regla_id: c.regla_id, mes_imputacion: mes }
  })
  if (!categorizados && !traspasos) return { db, categorizados, traspasos }
  return { db: { ...db, movimientos }, categorizados, traspasos }
}

export interface ResultadoVersion {
  db: BaseDatos
  reglasNuevas: number
  reglasActualizadas: number
  categorizados: number
  traspasos: number
}

/** Lo que se hace una vez por versión: reglas al día y mejoras sobre lo pendiente */
export function actualizarLogica(db: BaseDatos, version: string): ResultadoVersion {
  if (!version) throw new ErrorDatos('Versión de la app desconocida')
  const r = sincronizarReglasApp(db)
  const p = aplicarReglasAPendientes(r.db)
  return {
    db: { ...p.db, ajustes: { ...p.db.ajustes, version_logica: version } },
    reglasNuevas: r.nuevas,
    reglasActualizadas: r.actualizadas,
    categorizados: p.categorizados,
    traspasos: p.traspasos,
  }
}
