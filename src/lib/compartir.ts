import { registrar } from './registro'

export type ResultadoCompartir = 'compartido' | 'descargado' | 'cancelado'

/**
 * Comparte un archivo con la hoja de compartir del sistema (iPhone: WhatsApp, Mail, Archivos…)
 * y, si no se puede, lo descarga.
 */
export async function compartirArchivo(blob: Blob, nombre: string, titulo: string, forzarDescarga = false): Promise<ResultadoCompartir> {
  if (!forzarDescarga) {
    try {
      const archivo = new File([blob], nombre, { type: blob.type })
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: titulo })
        registrar('info', 'Archivo compartido', nombre)
        return 'compartido'
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelado'
      registrar('aviso', `Compartir no disponible: ${(e as Error)?.message ?? e}`)
    }
  }
  descargar(blob, nombre)
  registrar('info', 'Archivo descargado', nombre)
  return 'descargado'
}

export function descargar(blob: Blob, nombre: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1500)
}

/** Hay hoja de compartir con archivos (iPhone, Android y Safari en Mac) */
export function puedeCompartirArchivos(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })
  } catch {
    return false
  }
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    if (!ok) registrar('error', 'No se pudo copiar al portapapeles')
    return ok
  }
}
