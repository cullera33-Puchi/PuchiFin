/**
 * Detección de datos identificativos: IBAN, número de cuenta (CCC), tarjeta, DNI y NIE.
 *
 * Es la verificación final antes de guardar nada en Supabase (regla 3 de CLAUDE.md).
 * La base de datos aplica la misma lógica en public.contiene_dato_identificativo como
 * última barrera; si se cambia aquí, hay que cambiarla también en la migración.
 */

export type TipoIdentificativo = 'iban' | 'cuenta' | 'tarjeta' | 'dni' | 'nie'

export interface Hallazgo {
  tipo: TipoIdentificativo
  /** Texto encontrado, ya enmascarado para poder mostrarlo sin exponerlo */
  muestra: string
  posicion: number
  longitud: number
}

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

const RE_IBAN =
  /(?<![A-Z0-9])[A-Z]{2}[0-9]{2}[ -]?[A-Z0-9]{4}(?:[ -]?[0-9][A-Z0-9]{3}){1,6}(?:[ -]?[0-9][A-Z0-9]{0,3})?(?![A-Z0-9])/g
const RE_DIGITOS = /(?<![0-9])[0-9](?:[ -]?[0-9]){12,23}(?![0-9])/g
const RE_DNI = /(?<![A-Z0-9])([0-9]{8})[ -]?([A-Z])(?![A-Z0-9])/g
const RE_NIE = /(?<![A-Z0-9])([XYZ])[ -]?([0-9]{7})[ -]?([A-Z])(?![A-Z0-9])/g

export function luhnValido(digitos: string): boolean {
  let suma = 0
  let doble = false
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = Number(digitos[i])
    if (doble) {
      d *= 2
      if (d > 9) d -= 9
    }
    suma += d
    doble = !doble
  }
  return suma % 10 === 0
}

function letraControl(numero: number): string {
  return LETRAS_DNI[numero % 23]
}

/** Deja visibles solo los cuatro últimos caracteres */
export function enmascarar(texto: string): string {
  const limpio = texto.replace(/[ -]/g, '')
  if (limpio.length <= 4) return '*'.repeat(limpio.length)
  return '*'.repeat(limpio.length - 4) + limpio.slice(-4)
}

export function detectarIdentificativos(texto: string | null | undefined): Hallazgo[] {
  if (!texto) return []
  // Mayúsculas solo en ASCII: conserva la longitud y las posiciones del texto original
  const t = texto.replace(/[a-z]/g, (c) => c.toUpperCase())
  const original = (m: RegExpMatchArray) => texto.slice(m.index, m.index! + m[0].length)
  const hallazgos: Hallazgo[] = []

  for (const m of t.matchAll(RE_IBAN)) {
    const compacto = m[0].replace(/[ -]/g, '')
    const digitosCuerpo = compacto.slice(4).replace(/[^0-9]/g, '')
    if (compacto.length >= 15 && digitosCuerpo.length >= 10) {
      hallazgos.push({ tipo: 'iban', muestra: enmascarar(original(m)), posicion: m.index, longitud: m[0].length })
    }
  }

  for (const m of t.matchAll(RE_DIGITOS)) {
    const compacto = m[0].replace(/[ -]/g, '')
    if (compacto.length === 20) {
      hallazgos.push({ tipo: 'cuenta', muestra: enmascarar(compacto), posicion: m.index, longitud: m[0].length })
    } else if (compacto.length >= 13 && compacto.length <= 19 && luhnValido(compacto)) {
      hallazgos.push({ tipo: 'tarjeta', muestra: enmascarar(compacto), posicion: m.index, longitud: m[0].length })
    }
  }

  for (const m of t.matchAll(RE_DNI)) {
    if (letraControl(Number(m[1])) === m[2]) {
      hallazgos.push({ tipo: 'dni', muestra: enmascarar(original(m)), posicion: m.index, longitud: m[0].length })
    }
  }

  for (const m of t.matchAll(RE_NIE)) {
    const prefijo = { X: '0', Y: '1', Z: '2' }[m[1] as 'X' | 'Y' | 'Z']
    if (letraControl(Number(prefijo + m[2])) === m[3]) {
      hallazgos.push({ tipo: 'nie', muestra: enmascarar(original(m)), posicion: m.index, longitud: m[0].length })
    }
  }

  return hallazgos.sort((a, b) => a.posicion - b.posicion)
}

/**
 * Sustituye cada dato identificativo del texto por asteriscos (deja los cuatro últimos caracteres).
 * Se usa en el registro, que se comparte por chat.
 */
export function enmascararIdentificativos(texto: string): string {
  let resultado = texto
  const hallazgos = detectarIdentificativos(texto).sort((a, b) => b.posicion - a.posicion)
  for (const h of hallazgos) {
    resultado = resultado.slice(0, h.posicion) + h.muestra + resultado.slice(h.posicion + h.longitud)
  }
  return resultado
}

export function contieneIdentificativo(texto: string | null | undefined): boolean {
  return detectarIdentificativos(texto).length > 0
}

export const NOMBRE_TIPO: Record<TipoIdentificativo, string> = {
  iban: 'IBAN',
  cuenta: 'número de cuenta',
  tarjeta: 'número de tarjeta',
  dni: 'DNI',
  nie: 'NIE',
}

/**
 * Valida el alias de una cuenta. Devuelve el motivo del rechazo o null si es válido.
 * Un alias no puede llevar datos identificativos ni series de 6 o más dígitos.
 */
export function validarAlias(alias: string): string | null {
  const a = alias.trim()
  if (!a) return 'El alias no puede estar vacío'
  if (a.length > 40) return 'El alias admite un máximo de 40 caracteres'
  const hallazgos = detectarIdentificativos(a)
  if (hallazgos.length > 0) {
    return `El alias contiene un ${NOMBRE_TIPO[hallazgos[0].tipo]}. Usa un nombre, sin números de cuenta ni de tarjeta`
  }
  if (/[0-9]{6,}/.test(a)) {
    return 'El alias no puede contener series largas de dígitos. Usa un nombre, como "Cuenta principal"'
  }
  return null
}
