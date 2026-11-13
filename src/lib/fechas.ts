/** Fechas como texto ISO (AAAA-MM-DD), sin zonas horarias: la aritmética se hace en UTC. */

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const aFecha = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)
const aIso = (d: Date) => d.toISOString().slice(0, 10)

export function sumarDias(iso: string, dias: number): string {
  const d = aFecha(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return aIso(d)
}

/** Lunes de la semana de la fecha (semana de lunes a domingo) */
export function lunesDe(iso: string): string {
  const dia = aFecha(iso).getUTCDay() // 0 domingo
  return sumarDias(iso, dia === 0 ? -6 : 1 - dia)
}

export function primeroDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function ultimoDeMes(iso: string): string {
  const d = aFecha(primeroDeMes(iso))
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return aIso(d)
}

export function sumarMeses(iso: string, meses: number): string {
  const d = aFecha(primeroDeMes(iso))
  d.setUTCMonth(d.getUTCMonth() + meses)
  return aIso(d)
}

/** Hoy en la zona horaria del dispositivo */
export function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-11-09" → "9 de noviembre" (con el año si se pide) */
export function diaLargo(iso: string, conAnyo = false): string {
  const d = aFecha(iso)
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${conAnyo ? ` de ${d.getUTCFullYear()}` : ''}`
}

/** "2026-11" → "Noviembre de 2026" */
export function mesLargo(iso: string): string {
  const d = aFecha(primeroDeMes(iso))
  const m = MESES[d.getUTCMonth()]
  return `${m[0].toUpperCase()}${m.slice(1)} de ${d.getUTCFullYear()}`
}

export function nombreMes(iso: string): string {
  return MESES[aFecha(primeroDeMes(iso)).getUTCMonth()]
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "2026-11-09" → "lunes 9" */
export function diaSemana(iso: string): string {
  const d = aFecha(iso)
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()}`
}
