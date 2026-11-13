/**
 * Concepto normalizado: la forma que se usa en la clave de deduplicación y en las reglas aprendidas.
 * Minúsculas, sin acentos, sin signos y con los espacios simplificados.
 */
export function normalizarConcepto(concepto: string): string {
  return concepto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9*]+/g, ' ')
    .trim()
}

/** Palabras que no identifican al comercio (formas jurídicas, tipo de operación) */
const RUIDO = new Set([
  'sl', 'sa', 'slu', 'sau', 'sarl', 'sca', 'cie', 'et', 'bv', 'ltd', 'gmbh', 'inc', 'spa',
  'pago', 'con', 'tarjeta', 'tarj', 'compra', 'en', 'de', 'del', 'la', 'el', 'adeudo', 'a', 'su', 'cargo', 'recibo', 'n',
])

/**
 * Clave del comercio para aprender categorías: el concepto sin números (tiendas, referencias),
 * sin palabras de relleno ni formas jurídicas. «Mercadona 1234 La Plaza» y «MERCADONA 2210» dan
 * «mercadona plaza» y «mercadona»: comparten la primera palabra.
 */
export function claveComercio(concepto: string): string {
  return normalizarConcepto(concepto)
    .replace(/\*+\d*/g, ' ')
    .split(' ')
    .filter((p) => p && !/\d/.test(p) && !RUIDO.has(p) && p.length > 1)
    .join(' ')
}

/** Primera palabra significativa de la clave (para proponer por parecido) */
export function primeraPalabra(clave: string): string | null {
  const p = clave.split(' ')[0]
  return p && p.length >= 4 ? p : null
}

/**
 * Pasarelas de pago que no dicen el comercio (PayPal: «Adeudo a su cargo PayPal Europe»). Sus cargos
 * son de cosas muy distintas, así que no se aprenden ni se agrupan por comercio sino por comercio e
 * importe: un importe que se repite suele ser la misma suscripción.
 */
const PASARELAS = /^paypal\b/

export const esPasarela = (clave: string) => PASARELAS.test(clave)

/** Nombre corto de la pasarela para la pantalla */
export const nombrePasarela = (clave: string) => (clave.startsWith('paypal') ? 'PayPal' : clave)

/** Clave para aprender y agrupar: la del comercio o, en una pasarela, la del comercio con el importe */
export function claveConImporte(clave: string, importe: number): string {
  return esPasarela(clave) ? `${clave} ${Math.abs(importe).toFixed(2)}` : clave
}
