/**
 * Optimizar con Claude: texto preparado con los gastos fijos y recurrentes y los gastos hormiga para
 * pegarlo en el chat (o abrirlo en claude.ai). Sin API ni coste. Solo comercios, categorías, importes y
 * periodicidad: sin cuentas, fechas exactas, saldos ni nombres de personas.
 */
import { gastosHormiga } from './comercios'
import { sumarMeses } from './fechas'
import { enmascararIdentificativos } from './identificativos'
import { NOMBRE_PERIODICIDAD, type Recurrente } from './recurrentes'
import type { BaseDatos } from './tipos'
import { nombreCategoria } from './vista'

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`

export function textoOptimizar(db: BaseDatos, recurrentes: Recurrente[], hoy: string): string {
  const activos = recurrentes.filter((r) => r.activo).sort((a, b) => b.alAno - a.alAno)
  const total = activos.reduce((s, r) => s + r.alAno, 0)
  const desde = sumarMeses(`${hoy.slice(0, 7)}-01`, -3)
  const ultimos = db.movimientos.filter((m) => m.fecha_operacion >= desde && m.fecha_operacion < `${hoy.slice(0, 7)}-01`)
  const hormiga = gastosHormiga(ultimos, 3)
  const lineas = [
    'Estos son mis gastos fijos y recurrentes (datos de mi app de finanzas, sin cuentas ni datos personales).',
    'Ayúdame a optimizarlos:',
    '1. Suscripciones duplicadas o que quizá no uso.',
    '2. Luz, agua, fibra y móvil, y seguros: compáralos con ofertas actuales en España y dime si me conviene cambiar.',
    '3. Qué recortar, con el ahorro anual estimado de cada medida, de más a menos ahorro.',
    '4. Subidas de precio recientes que conviene reclamar o renegociar.',
    '',
    `Gastos fijos activos (${activos.length}), unos ${eur(total / 12)} al mes y ${eur(total)} al año:`,
    ...activos.map((r) => {
      const subida = r.subida ? `, ha subido de ${eur(r.subida.antes)} a ${eur(r.subida.ahora)}` : ''
      return `- ${r.nombre} | ${nombreCategoria(db, r.categoria_id)} | ${NOMBRE_PERIODICIDAD[r.periodicidad]} | último cargo ${eur(r.importe)}${r.variable ? ' (importe variable)' : ''} | ${eur(r.alAno)} al año${subida}`
    }),
  ]
  if (hormiga) {
    lineas.push('', `Gastos hormiga de los últimos 3 meses (compras de hasta 10 € que se repiten): ${eur(hormiga.total)}, unos ${eur(hormiga.alAno)} al año:`)
    lineas.push(...hormiga.comercios.slice(0, 10).map((c) => `- ${c.nombre}: ${c.veces} veces, ${eur(c.importe)}`))
  }
  return enmascararIdentificativos(lineas.join('\n'))
}

/** Enlace a claude.ai con el texto ya escrito (si es demasiado largo, solo se abre el chat) */
export function enlaceClaude(texto: string): string {
  const url = `https://claude.ai/new?q=${encodeURIComponent(texto)}`
  return url.length <= 7000 ? url : 'https://claude.ai/new'
}
