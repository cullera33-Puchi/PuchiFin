/** Formato español para importes y fechas (regla 6 de CLAUDE.md) */

const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

/** 1234.56 → "1.234,56 €"; -1234.56 → "-1.234,56 €" */
export function formatearImporte(importe: number): string {
  // Evita "-0,00 €"
  const valor = Object.is(Math.round(importe * 100), -0) ? 0 : importe
  return euros.format(valor).replace(/ /g, ' ')
}

const fechaCorta = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "2026-10-01" → "01/10/2026" */
export function formatearFecha(iso: string): string {
  return fechaCorta.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

const mesLargo = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "2026-10" → "octubre de 2026" */
export function formatearMes(anyoMes: string): string {
  return mesLargo.format(new Date(`${anyoMes}-01T00:00:00Z`))
}

/** Importe escrito por el usuario ("1.234,56", "12,5", "30"); null si está vacío o no es válido */
export function leerImporteUsuario(texto: string): number | null {
  const t = texto.trim().replace(/\s|€/g, '')
  if (!t) return null
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : null
}
