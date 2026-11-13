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
