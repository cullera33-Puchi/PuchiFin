/**
 * «Analizar con Claude» (apartado 11): textos preparados para cada vista, que se ven antes de enviarlos.
 * Sin API ni coste. Solo totales, categorías e importes (y en los informes, los comercios que más pesan):
 * sin cuentas, saldos de cuentas concretas, fechas exactas ni nombres de personas.
 */
import { rankingComercios } from './comercios'
import { calcularExtracto } from './extracto'
import { mesLargo } from './fechas'
import { enmascararIdentificativos } from './identificativos'
import { calcularInforme, type PeriodoInforme } from './informes'
import type { Plan, Simulacion } from './plan'
import { consumoPresupuestos, presupuestoAnual } from './presupuesto'
import type { BaseDatos } from './tipos'
import { nombreCategoria } from './vista'

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`
const pct = (n: number) => `${Math.round(n * 100)} %`
const cierre = (lineas: string[]) => enmascararIdentificativos(lineas.join('\n'))
const INTRO = 'Datos de mi app de finanzas personales (anonimizados, sin cuentas ni datos personales). Importes en euros; los gastos de trabajo y los traspasos entre mis cuentas no cuentan.'

/** Extracto del mes: totales, comparativa con la media y gasto por categoría */
export function textoExtracto(db: BaseDatos, mes: string, hoy: string): string {
  const e = calcularExtracto(db, mes, hoy)
  const t = e.totales
  const lineas = [
    INTRO,
    `Analiza mi mes de ${mesLargo(`${mes}-01`).toLowerCase()}${e.enCurso ? `, en curso (datos hasta el día ${e.diaCorte})` : ''}:`,
    '1. Qué categorías se desvían de mi media y por qué puede ser.',
    '2. Si mi tasa de ahorro es razonable y qué la mejoraría.',
    '3. Tres medidas concretas para el mes que viene, con el ahorro estimado de cada una.',
    '',
    `Ingresos ${eur(t.ingresos)}, gastos ${eur(t.gastos)}, ahorro ${eur(t.ahorro)}${t.tasaAhorro !== null ? ` (tasa de ahorro ${pct(t.tasaAhorro)})` : ''}.`,
  ]
  if (e.media)
    lineas.push(
      `Media de ${e.mesesMedia} ${e.mesesMedia === 1 ? 'mes anterior' : 'meses anteriores'}${e.enCurso ? ' con los mismos días' : ''}: ingresos ${eur(e.media.ingresos)}, gastos ${eur(e.media.gastos)}, ahorro ${eur(e.media.ahorro)}.`,
    )
  if (e.haceUnAno) lineas.push(`El mismo mes del año anterior: ingresos ${eur(e.haceUnAno.ingresos)}, gastos ${eur(e.haceUnAno.gastos)}.`)
  lineas.push('', 'Gasto por categoría (importe, peso y media):')
  for (const c of e.categorias) lineas.push(`- ${c.nombre}: ${eur(c.importe)}, ${pct(c.peso)}${c.media !== null ? `, media ${eur(c.media)}` : ''}`)
  return cierre(lineas)
}

/** Informe de un mes o un año: gasto o ingreso por categoría frente al periodo anterior y los comercios que más pesan */
export function textoInforme(db: BaseDatos, periodo: PeriodoInforme, hoy: string): string {
  const inf = calcularInforme(db, periodo, 'gasto', null, hoy)
  const nombre = periodo.escala === 'mes' ? mesLargo(`${periodo.clave}-01`).toLowerCase() : `el año ${periodo.clave}`
  const anterior = periodo.escala === 'mes' ? mesLargo(`${inf.anterior.clave}-01`).toLowerCase() : `el año ${inf.anterior.clave}`
  const comercios = rankingComercios(inf.movimientos, -1, 'importe', 15)
  const lineas = [
    INTRO,
    `Analiza mis gastos de ${nombre}${inf.enCurso ? ' (en curso; la comparativa usa los mismos días)' : ''} frente a ${anterior}:`,
    '1. Dónde ha subido o bajado el gasto y qué lo explica.',
    '2. Comercios en los que gasto más de lo razonable.',
    '3. Qué recortar, con el ahorro anual estimado de cada medida.',
    '',
    `Ingresos ${eur(inf.totales.ingresos)} (antes ${eur(inf.totalesAnteriores.ingresos)}), gastos ${eur(inf.totales.gastos)} (antes ${eur(inf.totalesAnteriores.gastos)}).`,
    '',
    'Gasto por categoría (ahora y periodo anterior):',
    ...inf.porciones.map((p) => `- ${p.nombre}: ${eur(p.importe)}, ${pct(p.peso)} (antes ${eur(p.anterior)})`),
  ]
  if (comercios.length) {
    lineas.push('', 'Comercios con más gasto:')
    lineas.push(...comercios.map((c) => `- ${c.nombre}: ${eur(c.importe)} en ${c.veces} ${c.veces === 1 ? 'compra' : 'compras'}`))
  }
  return cierre(lineas)
}

/** Presupuesto: consumo del mes y acumulado del año */
export function textoPresupuesto(db: BaseDatos, mes: string, hoy: string): string {
  const lineas = consumoPresupuestos(db, mes, hoy)
  const anual = presupuestoAnual(db, mes.slice(0, 4), hoy)
  const res = [
    INTRO,
    `Revisa mi presupuesto mensual por categoría (${mesLargo(`${mes}-01`).toLowerCase()}):`,
    '1. Qué categorías tienen un presupuesto poco realista, por arriba o por abajo, frente a lo que gasto.',
    '2. Cómo repartirías el presupuesto para ahorrar más sin que sea imposible de cumplir.',
    '3. En qué categorías me desvío de forma repetida y qué hacer.',
    '',
    'Este mes (presupuesto, gastado y proyección a fin de mes):',
    ...lineas.map((l) => `- ${l.categoria.nombre}: presupuesto ${eur(l.presupuesto)}, gastado ${eur(l.gastado)}${l.proyeccion !== null ? `, al ritmo actual ${eur(l.proyeccion)}` : ''}`),
  ]
  if (anual.lineas.length) {
    res.push('', `En lo que va de año (${anual.meses} ${anual.meses === 1 ? 'mes' : 'meses'} con datos), presupuesto y gastado:`)
    res.push(...anual.lineas.map((l) => `- ${l.categoria.nombre}: ${eur(l.presupuesto)} y ${eur(l.gastado)}`))
  }
  return cierre(res)
}

/** Plan de pagos: deuda, regla de pago, ahorro previsto, calendario y simulación */
export function textoPlan(db: BaseDatos, plan: Plan, sim: Simulacion | null, simulado: Plan | null): string {
  const c = plan.compromiso
  const MES = (n: number) => mesLargo(`2000-${String(n).padStart(2, '0')}-01`).replace(/ de 2000$/, '').toLowerCase()
  const lineas = [
    INTRO,
    'Tengo una deuda familiar sin intereses que pago cada verano con lo que tengo ahorrado por encima de un colchón. Revisa mi plan:',
    '1. Si la proyección es realista con mi ahorro mensual.',
    '2. Cómo adelantar el año en que queda saldada sin quedarme sin colchón.',
    '3. Qué riesgos ves (gastos anuales, imprevistos) y cómo cubrirlos.',
    '',
    `Deuda pendiente: ${eur(plan.deudaPendiente)} (ya pagado ${eur(plan.pagado)}).`,
    `Regla: en ${MES(c.mes_referencia)} (ventana de ${MES(c.ventana_mes_inicio)} a ${MES(c.ventana_mes_fin)}) pago todo lo que supere un colchón de ${eur(c.colchon)} en mi cuenta de ahorro.`,
    `Saldo actual de la cuenta de ahorro: ${eur(plan.saldo)}. Ahorro mensual previsto: ${eur(plan.ahorroMensual)}, con ${plan.mesesBase} ${plan.mesesBase === 1 ? 'mes cerrado' : 'meses cerrados'} de datos.`,
    '',
    'Calendario previsto:',
    ...plan.pagos.map((p) => `- ${p.anio}: pago ${eur(p.pago)}, deuda tras el pago ${eur(p.deudaTras)}`),
    plan.saldadaEn ? `Queda saldada en ${plan.saldadaEn}.` : 'Con el ahorro previsto no se salda en 30 años.',
  ]
  const nominas = db.ajustes.nominas ?? []
  const cambios = nominas.filter((n) => sim?.nominas?.[n.id] !== undefined && sim.nominas[n.id] !== n.incluida)
  if (nominas.some((n) => n.incluida)) {
    lineas.push('', 'Nóminas netas previstas:')
    for (const n of nominas.filter((x) => x.incluida))
      lineas.push(`- ${eur(n.neto_mensual)} al mes${n.pagas.length ? `, pagas extra de ${n.pagas.map((p) => eur(p.importe)).join(' y ')}` : ''}${n.bonus ? `, bonus neto de ${eur(n.bonus.importe)} en ${mesLargo(`2000-${String(n.bonus.mes).padStart(2, '0')}-01`).replace(/ de 2000$/, '').toLowerCase()}` : ''}${n.desde ? `, desde ${n.desde}` : ''}${n.hasta ? `, hasta ${n.hasta}` : ''}`)
  }
  if (sim && simulado && (sim.ahorroExtra || sim.recorte || cambios.length || nominas.some((n) => n.bonus && sim.bonus?.[n.id] === false))) {
    const partes = [
      ...cambios.map((n) =>
        sim.nominas![n.id] ? `sumar una nómina de ${eur(n.neto_mensual)} al mes${n.pagas.length ? ` con ${n.pagas.length} pagas extra` : ''}${n.desde ? ` desde ${n.desde}` : ''}` : `sin una nómina de ${eur(n.neto_mensual)} al mes`,
      ),
      ...nominas.filter((n) => n.bonus && sim.bonus?.[n.id] === false).map(() => 'sin el bonus'),
      sim.ahorroExtra ? `ahorrar ${eur(sim.ahorroExtra)} más al mes` : '',
      sim.recorte ? `recortar ${nombreCategoria(db, sim.recorte.categoria_id)} un ${sim.recorte.porcentaje} %` : '',
    ].filter(Boolean)
    lineas.push('', `Simulación (${partes.join(' y ')}): primer pago ${eur(simulado.pagos[0]?.pago ?? 0)}, saldada en ${simulado.saldadaEn ?? 'más de 30 años'}, capital dentro de un año ${eur(simulado.serie[12]?.capital ?? 0)} frente a ${eur(plan.serie[12]?.capital ?? 0)}.`)
  }
  return cierre(lineas)
}
