/**
 * Detalle completo para Claude (apartado 11, v0.35.0): los movimientos de la vista en un CSV que se envía
 * con la hoja de compartir junto con el texto. Parte de los datos ya anonimizados y vuelve a enmascarar
 * cualquier número identificativo. Sin notas (texto libre del usuario) ni saldos. Con «sin conceptos»,
 * tampoco el comercio: solo fecha, cuenta, categoría, tipo e importe.
 */
import { sumarMeses } from './fechas'
import { enmascararIdentificativos } from './identificativos'
import { mesEfectivo } from './imputacion'
import { sinConceptos } from './plantillas'
import { NOMBRE_TIPO_MOVIMIENTO, type BaseDatos, type Movimiento } from './tipos'

export interface DetalleClaude {
  movimientos: Movimiento[]
  /** Nombre del archivo CSV */
  archivo: string
}

const celda = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** CSV con una fila por movimiento, del más antiguo al más reciente */
export function csvMovimientos(db: BaseDatos, movimientos: Movimiento[]): string {
  const sin = sinConceptos(db)
  const categorias = new Map(db.categorias.map((c) => [c.id, c]))
  const cuentas = new Map(db.cuentas.map((c) => [c.id, c.alias]))
  const cabecera = ['Fecha', 'Mes en que cuenta', 'Cuenta', ...(sin ? [] : ['Concepto']), 'Categoría', 'Subcategoría', 'Tipo', 'Importe']
  const filas = [...movimientos]
    .sort((a, b) => a.fecha_operacion.localeCompare(b.fecha_operacion))
    .map((m) => {
      const c = m.categoria_id ? categorias.get(m.categoria_id) : undefined
      const padre = c?.padre_id ? categorias.get(c.padre_id) : undefined
      return [
        m.fecha_operacion,
        mesEfectivo(m),
        cuentas.get(m.cuenta_id) ?? '',
        ...(sin ? [] : [enmascararIdentificativos(m.concepto_limpio)]),
        padre ? padre.nombre : (c?.nombre ?? 'Sin categoría'),
        padre ? c!.nombre : '',
        NOMBRE_TIPO_MOVIMIENTO[m.tipo],
        m.importe.toFixed(2),
      ]
    })
  return [cabecera, ...filas].map((f) => f.map(celda).join(',')).join('\n') + '\n'
}

/** Lo que se añade al texto cuando va con el CSV */
export function lineaDetalle(db: BaseDatos, n: number): string {
  const columnas = sinConceptos(db) ? 'fecha, mes en que cuenta, cuenta, categoría, tipo e importe' : 'fecha, mes en que cuenta, cuenta, concepto, categoría, tipo e importe'
  return `Te adjunto en CSV los ${n} movimientos de este periodo (${columnas}; importes en euros, negativo es gasto). En el gasto solo cuentan los de tipo Normal.`
}

/** Movimientos que cuentan en un mes (AAAA-MM) o un año (AAAA) */
export function movimientosDelPeriodo(db: BaseDatos, clave: string): Movimiento[] {
  return db.movimientos.filter((m) => mesEfectivo(m).startsWith(clave))
}

/** Los doce meses completos anteriores al mes de hoy (plan de pagos) */
export function movimientosUltimoAno(db: BaseDatos, hoy: string): Movimiento[] {
  const mes = hoy.slice(0, 7)
  const desde = sumarMeses(`${mes}-01`, -12).slice(0, 7)
  return db.movimientos.filter((m) => {
    const e = mesEfectivo(m)
    return e >= desde && e < mes
  })
}
