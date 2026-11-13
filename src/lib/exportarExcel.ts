/**
 * Exportación a Excel de cualquier vista (apartado 8): una hoja con los movimientos que la componen
 * y, si se indica, una hoja de resumen. Los datos ya están anonimizados.
 */
import * as XLSX from 'xlsx'
import { compartirArchivo, type ResultadoCompartir } from './compartir'
import { registrar } from './registro'
import { NOMBRE_TIPO_MOVIMIENTO, type BaseDatos, type Movimiento } from './tipos'

export function filasMovimientos(db: BaseDatos, movs: Movimiento[]): (string | number)[][] {
  const cuentas = new Map(db.cuentas.map((c) => [c.id, c.alias]))
  const cats = new Map(db.categorias.map((c) => [c.id, c]))
  const cabecera = ['Fecha', 'Cuenta', 'Concepto', 'Categoría', 'Subcategoría', 'Tipo', 'Importe', 'Nota']
  const filas = [...movs]
    .sort((a, b) => a.fecha_operacion.localeCompare(b.fecha_operacion))
    .map((m) => {
      const c = m.categoria_id ? cats.get(m.categoria_id) : undefined
      const padre = c?.padre_id ? cats.get(c.padre_id) : undefined
      return [
        m.fecha_operacion,
        cuentas.get(m.cuenta_id) ?? '',
        m.concepto_limpio,
        padre?.nombre ?? c?.nombre ?? '',
        padre ? c?.nombre ?? '' : '',
        NOMBRE_TIPO_MOVIMIENTO[m.tipo],
        m.importe,
        m.nota ?? '',
      ]
    })
  return [cabecera, ...filas]
}

export function libroExcel(hojas: { nombre: string; filas: (string | number | null)[][] }[]): Uint8Array {
  const libro = XLSX.utils.book_new()
  for (const h of hojas) {
    const hoja = XLSX.utils.aoa_to_sheet(h.filas)
    // Ancho de columnas según el contenido
    const anchos = (h.filas[0] ?? []).map((_, i) => ({ wch: Math.min(48, Math.max(8, ...h.filas.map((f) => String(f[i] ?? '').length + 2))) }))
    hoja['!cols'] = anchos
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre.slice(0, 31))
  }
  return new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

/** Exporta una vista: resumen opcional y movimientos */
export async function exportarVista(
  db: BaseDatos,
  nombre: string,
  movs: Movimiento[],
  resumen?: (string | number | null)[][],
): Promise<ResultadoCompartir> {
  const hojas = [...(resumen ? [{ nombre: 'Resumen', filas: resumen }] : []), { nombre: 'Movimientos', filas: filasMovimientos(db, movs) }]
  const datos = libroExcel(hojas)
  const blob = new Blob([datos as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  registrar('info', 'Exportación a Excel', { vista: nombre, movimientos: movs.length })
  return compartirArchivo(blob, `PuchiFin ${nombre}.xlsx`, `PuchiFin ${nombre}`)
}
