/**
 * Operaciones sobre movimientos: corrección de categoría (con regla para los futuros), tipo, notas y
 * marcado rápido de lo que no cuenta en el extracto (gastos de empleado y reembolsos).
 */
import { claveComercio, claveConImporte, esPasarela, nombrePasarela, normalizarConcepto } from '../lib/conceptos'
import { mesSiguiente } from '../lib/imputacion'
import { NOMBRE_TIPO_MOVIMIENTO, type BaseDatos, type Movimiento, type Regla, type TipoMovimiento } from '../lib/tipos'
import { ErrorDatos, exigirSinIdentificativos, nuevoId } from './operaciones'


function exigirMovimientos(db: BaseDatos, ids: string[]): Set<string> {
  const set = new Set(ids)
  if (!set.size) throw new ErrorDatos('No hay movimientos seleccionados')
  const existen = db.movimientos.filter((m) => set.has(m.id)).length
  if (existen !== set.size) throw new ErrorDatos('Movimiento no encontrado')
  return set
}

const claveMov = (m: Movimiento) => claveConImporte(claveComercio(m.concepto_limpio), m.importe)

/** Movimientos del mismo comercio que los indicados (en PayPal, del mismo importe), sin contar los indicados */
export function mismoConcepto(db: BaseDatos, ids: string[]): Movimiento[] {
  const set = new Set(ids)
  const claves = new Set(db.movimientos.filter((m) => set.has(m.id) && claveComercio(m.concepto_limpio)).map(claveMov))
  return db.movimientos.filter((m) => !set.has(m.id) && claveComercio(m.concepto_limpio) && claves.has(claveMov(m)))
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
    // Una regla por comercio; en PayPal, por comercio e importe exacto (la misma suscripción)
    const elegidos = db.movimientos.filter((m) => ids.includes(m.id))
    const conceptos = new Map<string, { patron: string; importe: number | null }>()
    for (const m of elegidos) {
      const patron = claveComercio(m.concepto_limpio) || m.concepto_normalizado
      const importe = esPasarela(patron) ? m.importe : null
      conceptos.set(`${patron}|${importe}`, { patron, importe })
    }
    for (const { patron: c, importe } of conceptos.values()) {
      exigirSinIdentificativos('Regla', c)
      const existente = reglas.find(
        (r) => r.origen === 'manual' && r.tipo_patron === 'exacto' && normalizarConcepto(r.patron) === c && r.importe_min === importe && r.importe_max === importe,
      )
      if (existente) {
        reglas = reglas.map((r) => (r.id === existente.id ? { ...r, categoria_id, activa: true } : r))
      } else {
        const nueva: Regla = {
          id: nuevoId(),
          nombre: importe !== null ? `${nombrePasarela(c)} de ${Math.abs(importe).toFixed(2).replace('.', ',')} €` : null,
          patron: c,
          tipo_patron: 'exacto',
          cuenta_id: null,
          importe_min: importe,
          importe_max: importe,
          categoria_id,
          tipo_movimiento: null,
          es_sugerencia: false,
          // La de un importe concreto manda sobre una regla general del mismo comercio
          prioridad: importe !== null ? 45 : 50,
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

/** Imputa el movimiento al mes siguiente al de su fecha (o lo devuelve a su mes) */
export function imputarMesSiguiente(db: BaseDatos, ids: string[], activo: boolean): BaseDatos {
  const set = exigirMovimientos(db, ids)
  return { ...db, movimientos: db.movimientos.map((m) => (set.has(m.id) ? { ...m, mes_imputacion: activo ? mesSiguiente(m.fecha_operacion) : null } : m)) }
}

/** Tipo que deja un movimiento fuera del extracto: gasto de empleado si es un gasto, reembolso si es un ingreso */
export const tipoFuera = (m: Movimiento): TipoMovimiento => (m.importe < 0 ? 'gasto_empleado' : 'reembolso_empresa')

/** Fuera del extracto (gasto de empleado o reembolso) o de vuelta a Normal */
export const estaFuera = (m: Movimiento) => m.tipo === 'gasto_empleado' || m.tipo === 'reembolso_empresa'

/**
 * Saca del extracto los movimientos indicados (los gastos como gasto de empleado y los ingresos como
 * reembolso) o los devuelve a Normal. Los traspasos y pagos de deuda no se tocan.
 */
export function marcarFuera(db: BaseDatos, ids: string[], fuera: boolean): BaseDatos {
  const set = exigirMovimientos(db, ids)
  return {
    ...db,
    movimientos: db.movimientos.map((m) => {
      if (!set.has(m.id) || (m.tipo !== 'normal' && !estaFuera(m))) return m
      return { ...m, tipo: fuera ? tipoFuera(m) : 'normal' }
    }),
  }
}

/** Deslizar sobre el movimiento: sale del extracto o vuelve a contar */
export function alternarFuera(db: BaseDatos, id: string): BaseDatos {
  const m = db.movimientos.find((x) => x.id === id)
  if (!m) throw new ErrorDatos('Movimiento no encontrado')
  if (m.tipo !== 'normal' && !estaFuera(m)) throw new ErrorDatos(`Es un ${NOMBRE_TIPO_MOVIMIENTO[m.tipo].toLowerCase()}: cámbialo en el detalle`)
  return marcarFuera(db, [id], !estaFuera(m))
}

export function guardarNota(db: BaseDatos, id: string, nota: string): BaseDatos {
  exigirMovimientos(db, [id])
  const n = nota.trim() || null
  exigirSinIdentificativos('Nota', n)
  if (n && n.length > 500) throw new ErrorDatos('La nota admite un máximo de 500 caracteres')
  return { ...db, movimientos: db.movimientos.map((m) => (m.id === id ? { ...m, nota: n } : m)) }
}
