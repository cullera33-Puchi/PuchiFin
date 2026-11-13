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

/** Días sin subir datos del banco a partir de los que la app lo recuerda */
export const DIAS_AVISO_IMPORTACION = 5

export interface AvisoImportacion {
  /** Días desde la última importación de la cuenta más atrasada */
  dias: number
  /** Cuentas con la última importación de hace DIAS_AVISO_IMPORTACION días o más */
  cuentas: string[]
}

/**
 * Recordatorio de subir los movimientos del banco: cuentas y tarjetas activas que ya se han importado
 * alguna vez y cuya última importación es de hace 5 días o más. Los datos de prueba no cuentan.
 */
export function avisoImportacion(db: BaseDatos, hoy = new Date()): AvisoImportacion | null {
  const ultima = new Map<string, string>()
  for (const i of db.importaciones) {
    if (i.origen === 'datos_prueba') continue
    const prev = ultima.get(i.cuenta_id)
    if (!prev || i.created_at > prev) ultima.set(i.cuenta_id, i.created_at)
  }
  const atrasadas = db.cuentas
    .filter((c) => c.activa && c.tipo !== 'hipoteca' && ultima.has(c.id))
    .map((c) => ({ alias: c.alias, dias: Math.floor((hoy.getTime() - new Date(ultima.get(c.id)!).getTime()) / 86400000) }))
    .filter((c) => c.dias >= DIAS_AVISO_IMPORTACION)
    .sort((a, b) => b.dias - a.dias)
  return atrasadas.length ? { dias: atrasadas[0].dias, cuentas: atrasadas.map((c) => c.alias) } : null
}
