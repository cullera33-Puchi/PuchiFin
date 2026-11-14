/** Formato español para importes y fechas (regla 6 de CLAUDE.md) */
import { CIFRA_OCULTA, esDiscreto } from './discreto'

const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

/** 1234.56 → "1.234,56 €"; -1234.56 → "-1.234,56 €" */
export function formatearImporte(importe: number): string {
  if (esDiscreto()) return CIFRA_OCULTA
  // Evita "-0,00 €"
  const valor = Object.is(Math.round(importe * 100), -0) ? 0 : importe
  return euros.format(valor).replace(/ /g, ' ')
}

const eurosRedondos = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' })

/** Importe redondeado al euro, para frases: 1234.56 → "1.235 €" */
export function formatearRedondo(importe: number): string {
  if (esDiscreto()) return CIFRA_OCULTA
  const valor = Math.round(importe) === 0 ? 0 : Math.round(importe)
  return eurosRedondos.format(valor).replace(/ /g, ' ')
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
export function leerImporteUsuario(texto: string, conSigno = false): number | null {
  const bruto = texto.trim().replace(/\s|€/g, '')
  // El signo solo se conserva donde un importe puede ser negativo (el saldo de una cuenta en descubierto)
  const negativo = /^[-−]/.test(bruto)
  const t = bruto.replace(/^[-−+]/, '')
  if (!t) return null
  // Con coma, la coma es el decimal y los puntos separan miles. Sin coma, «15.000» o «1.500.000» son miles
  // (en España nadie escribe 15.000 queriendo decir quince); «12.5» sigue siendo decimal
  const sinComa = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : sinComa)
  if (!Number.isFinite(n)) return null
  const valor = Math.round(Math.abs(n) * 100) / 100
  return conSigno && negativo ? -valor : valor
}

/** «1 movimiento», «3 movimientos» */
export function plural(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString('es-ES')} ${n === 1 ? uno : varios}`
}
