/**
 * Anonimización de conceptos (apartado 2 de CLAUDE.md), antes de guardar nada:
 * - IBAN, números de cuenta y de tarjeta, aunque sean parciales: asteriscos, salvo los 4 últimos dígitos.
 * - DNI y NIE: asteriscos.
 * - Nombres de terceros: el alias de la lista de ajustes si coincide con un patrón; si no, se quita.
 */
import terceros from './plantillas/terceros.json'
import { enmascararIdentificativos } from '../lib/identificativos'
import type { AliasTercero } from '../lib/tipos'

/** Series de 8 o más dígitos (o enmascarados con X o *), con o sin código de país, separadas por espacios o guiones */
const RE_NUMERO = /(?<![A-Z0-9])(?:[A-Z]{2}\d{2}[ -]?)?[\dX*](?:[ -]?[\dX*]){7,}(?![A-Z0-9])/gi
const RE_DNI = /(?<![A-Z0-9])(?:[XYZ][ -]?\d{7}|\d{8})[ -]?[A-Z](?![A-Z0-9])/gi

function enmascararNumero(s: string): string {
  const digitos = (s.match(/\d/g) ?? []).length
  if (digitos < 4) return s // solo X o asteriscos: ya está enmascarado
  let quedan = 4
  // Se recorre de derecha a izquierda dejando los 4 últimos dígitos
  return s
    .split('')
    .reverse()
    .map((c) => {
      if (/\d/.test(c)) {
        if (quedan > 0) {
          quedan--
          return c
        }
        return '*'
      }
      if (/[A-Za-z]/.test(c)) return '*'
      return c
    })
    .reverse()
    .join('')
}

/** Enmascara IBAN, cuentas, tarjetas, DNI y NIE dentro de un texto */
export function enmascararNumeros(texto: string): string {
  return texto.replace(RE_DNI, (m) => '*'.repeat(m.length)).replace(RE_NUMERO, (m) => {
    const digitos = (m.match(/\d/g) ?? []).length
    return digitos >= 6 ? enmascararNumero(m) : m
  })
}

/** Quita acentos letra a letra, conservando la longitud y las posiciones */
const plano = (s: string) =>
  s
    .split('')
    .map((c) => c.normalize('NFD')[0].toUpperCase())
    .join('')

/** Sustituye los nombres que coinciden con los patrones de cada alias por el alias */
export function aplicarAlias(texto: string, alias: AliasTercero[]): string {
  let res = texto
  for (const a of alias) {
    for (const p of a.patrones) {
      const patron = plano(p.trim()).replace(/\s+/g, ' ')
      if (patron.length < 3) continue
      let desde = 0
      for (;;) {
        const base = plano(res).replace(/\s/g, ' ')
        const i = base.indexOf(patron, desde)
        if (i < 0) break
        const antes = i === 0 || !/[A-Z0-9]/.test(base[i - 1])
        const despues = i + patron.length >= base.length || !/[A-Z0-9]/.test(base[i + patron.length])
        if (antes && despues) {
          res = res.slice(0, i) + a.alias + res.slice(i + patron.length)
          desde = i + a.alias.length
        } else desde = i + 1
      }
    }
  }
  return res
}

const PATRONES = terceros.patrones.map((p) => new RegExp(p, 'i'))
const CONSERVAR = terceros.conservar_desde.map((p) => plano(p))

/** El texto a partir de la primera palabra clave de concepto (NOMINA, GASTOS…), o null si no hay ninguna */
export function conservarDesde(texto: string): string | null {
  const palabras = texto.split(/\s+/)
  const k = palabras.findIndex((w) => CONSERVAR.includes(plano(w)))
  return k >= 0 ? palabras.slice(k).join(' ') : null
}

/**
 * En transferencias y Bizum, quita el nombre del ordenante o beneficiario si no se ha sustituido
 * por un alias. Lo que sigue al nombre se conserva desde una palabra clave (NOMINA, GASTOS…).
 */
export function quitarNombres(texto: string, alias: AliasTercero[]): string {
  const nombresAlias = alias.map((a) => a.alias)
  let res = texto
  for (const re of PATRONES) {
    const m = re.exec(res)
    const nombre = m?.groups?.nombre
    if (!m || !nombre) continue
    const inicio = m.index + m[0].length - nombre.length
    if (nombresAlias.some((a) => nombre.startsWith(a))) continue // ya es un alias
    const palabras = nombre.split(/\s+/)
    const k = palabras.findIndex((w) => CONSERVAR.includes(plano(w)))
    const resto = k >= 0 ? palabras.slice(k).join(' ') : ''
    res = (res.slice(0, inicio) + resto + res.slice(inicio + nombre.length)).replace(/\s{2,}/g, ' ').trim()
  }
  return res
}

/** Concepto anonimizado: números enmascarados y terceros con alias o sin nombre */
export function anonimizarConcepto(texto: string, alias: AliasTercero[]): string {
  const limpio = quitarNombres(aplicarAlias(enmascararNumeros(texto.replace(/\s+/g, ' ').trim()), alias), alias)
  // Último paso: lo que la verificación final reconocería (IBAN extranjeros compactos, cuentas con puntos)
  // se enmascara aquí, para que la importación no se bloquee por algo que se puede limpiar
  return enmascararIdentificativos(limpio)
}
