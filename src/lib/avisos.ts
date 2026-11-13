/**
 * Aviso de exportación pendiente. Los datos solo están en este dispositivo: si se borra la app o
 * el navegador, se pierden. La app recuerda exportar cuando hay datos reales sin exportar en 14 días.
 */
import { contarDatosPrueba } from '../datos/operaciones'
import { ultimaExportacion } from './copias'
import type { BaseDatos } from './tipos'

export const DIAS_AVISO_EXPORTACION = 14

export function avisoExportacion(db: BaseDatos, ultima = ultimaExportacion(), hoy = new Date()): string | null {
  const reales = db.movimientos.length - contarDatosPrueba(db)
  if (reales <= 0) return null
  if (!ultima) return 'Todavía no has exportado tus datos. Guarda una copia en Archivos o iCloud Drive.'
  const dias = Math.floor((hoy.getTime() - new Date(ultima).getTime()) / 86400000)
  return dias >= DIAS_AVISO_EXPORTACION ? `Tu última exportación es de hace ${dias} días.` : null
}
