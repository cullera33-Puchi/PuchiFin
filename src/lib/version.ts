/**
 * Versión de la app y novedades.
 *
 * Cada versión publicada sube "version" en package.json, añade su entrada técnica a CHANGELOG.md
 * y de 3 a 5 líneas para el usuario en public/novedades.json (la más reciente arriba).
 * novedades.json se lee siempre de la red (fuera de la caché del service worker).
 */

export const APP_VERSION: string = __APP_VERSION__

export interface Novedad {
  version: string
  fecha: string
  cambios: string[]
}

export function partesVersion(v: unknown): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(v ?? '').trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null
}

/** Positivo si a es más reciente que b, negativo si es anterior, 0 si son iguales y null si alguna no es válida */
export function compararVersiones(a: unknown, b: unknown): number | null {
  const pa = partesVersion(a)
  const pb = partesVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/** Se queda con las entradas bien formadas, de la más reciente a la más antigua */
export function limpiarNovedades(json: unknown): Novedad[] {
  if (!Array.isArray(json)) return []
  return json
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .filter((e) => partesVersion(e.version) && Array.isArray(e.cambios))
    .map((e) => ({
      version: String(e.version).trim().replace(/^v/, ''),
      fecha: typeof e.fecha === 'string' ? e.fecha : '',
      cambios: (e.cambios as unknown[])
        .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        .map((s) => s.trim()),
    }))
    .filter((e) => e.cambios.length > 0)
    .sort((a, b) => compararVersiones(b.version, a.version) ?? 0)
}

/** Versiones posteriores a la instalada: las que este dispositivo todavía no tiene */
export function novedadesPosteriores(lista: Novedad[], instalada = APP_VERSION): Novedad[] {
  return lista.filter((e) => (compararVersiones(e.version, instalada) ?? 0) > 0)
}

let enCurso: Promise<Novedad[] | null> | null = null

/** Lee novedades.json sin caché. Devuelve null si no se puede leer */
export function cargarNovedades(): Promise<Novedad[] | null> {
  enCurso ??= fetch(`${import.meta.env.BASE_URL}novedades.json`, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then(limpiarNovedades)
    .catch(() => null)
    .finally(() => {
      enCurso = null
    })
  return enCurso
}
