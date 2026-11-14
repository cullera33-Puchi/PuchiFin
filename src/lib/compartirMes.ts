/**
 * PDF del mes para compartir (v0.33.0): la versión reducida, con el plan de pagos (el actual y con las
 * nóminas que no cuentan) si hay deuda configurada. Se usa al terminar el cierre de mes.
 */
import { contarDatosPrueba } from '../datos/operaciones'
import { compartirArchivo, type ResultadoCompartir } from './compartir'
import { hoyIso } from './fechas'
import { calcularPlan, escenarioNominas } from './plan'
import { registrar } from './registro'
import { calcularResumen, periodoMes } from './resumen'
import type { BaseDatos } from './tipos'

export async function compartirResumenMes(db: BaseDatos, mes: string): Promise<ResultadoCompartir> {
  const { generarPdfResumen, nombreArchivoResumen } = await import('./pdf')
  const hoy = hoyIso()
  const resumen = calcularResumen(periodoMes(`${mes}-01`), db.movimientos, db.categorias, 10, hoy)
  const actual = calcularPlan(db, hoy).plan
  const escenario = escenarioNominas(db)
  const otro = actual && escenario ? calcularPlan(db, hoy, escenario.sim).plan : null
  const plan = actual ? { actual, conNominas: otro && escenario ? { nombres: escenario.nombres, plan: otro } : null } : null
  const doc = generarPdfResumen(resumen, { incluirConceptos: false, hayDatosPrueba: contarDatosPrueba(db) > 0, categorias: db.categorias, reducida: true, plan })
  registrar('info', 'Cierre de mes: PDF para compartir', { periodo: mes, paginas: doc.getNumberOfPages(), plan: !!plan })
  return compartirArchivo(doc.output('blob'), nombreArchivoResumen(resumen, true), resumen.periodo.etiqueta)
}
