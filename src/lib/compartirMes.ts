/**
 * PDF del mes para compartir (v0.33.0): desde la v0.45.0, el resumen ejecutivo de una página, con la
 * deuda familiar si está configurada. Se usa al terminar el cierre de mes.
 */
import { contarDatosPrueba } from '../datos/operaciones'
import { compartirArchivo, type ResultadoCompartir } from './compartir'
import { hoyIso } from './fechas'
import { calcularPlan } from './plan'
import { registrar } from './registro'
import { calcularResumen, periodoMes } from './resumen'
import type { BaseDatos } from './tipos'

export async function compartirResumenMes(db: BaseDatos, mes: string): Promise<ResultadoCompartir> {
  const { generarPdfEjecutivo, nombreArchivoResumen } = await import('./pdf')
  const hoy = hoyIso()
  const resumen = calcularResumen(periodoMes(`${mes}-01`), db.movimientos, db.categorias, 10, hoy)
  const plan = calcularPlan(db, hoy).plan
  const doc = generarPdfEjecutivo(db, resumen, { hayDatosPrueba: contarDatosPrueba(db) > 0, plan, hoy })
  registrar('info', 'Cierre de mes: PDF para compartir', { periodo: mes, paginas: doc.getNumberOfPages(), plan: !!plan })
  return compartirArchivo(doc.output('blob'), nombreArchivoResumen(resumen, true), resumen.periodo.etiqueta)
}
