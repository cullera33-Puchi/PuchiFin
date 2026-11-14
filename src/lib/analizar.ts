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
import { instrucciones, sinConceptos } from './plantillas'
import { fijoEn, objetivoEn } from './nomina'
import { haySimulacion, supuestosCrecimiento, tieneBonus, type Plan, type Simulacion } from './plan'
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
    instrucciones(db, 'mes'),
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
  // undefined: todas las categorías (null sería solo lo que no tiene categoría)
  const inf = calcularInforme(db, periodo, 'gasto', undefined, hoy)
  const nombre = periodo.escala === 'mes' ? mesLargo(`${periodo.clave}-01`).toLowerCase() : `el año ${periodo.clave}`
  const anterior = periodo.escala === 'mes' ? mesLargo(`${inf.anterior.clave}-01`).toLowerCase() : `el año ${inf.anterior.clave}`
  // Sin conceptos, no salen los comercios
  const comercios = sinConceptos(db) ? [] : rankingComercios(inf.movimientos, -1, 'importe', 15)
  const lineas = [
    INTRO,
    `Analiza mis gastos de ${nombre}${inf.enCurso ? ' (en curso; la comparativa usa los mismos días)' : ''} frente a ${anterior}:`,
    instrucciones(db, 'informe'),
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
    instrucciones(db, 'presupuesto'),
    '',
    'Este mes (presupuesto, gastado y cierre previsto, contando los recibos que faltan y mi ritmo habitual):',
    ...lineas.map((l) => `- ${l.categoria.nombre}: presupuesto ${eur(l.presupuesto)}, gastado ${eur(l.gastado)}${l.cierre !== null ? `, cierre previsto ${eur(l.cierre)}` : ''}`),
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
    instrucciones(db, 'plan'),
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
    lineas.push('', 'Nóminas previstas:')
    const hoy = plan.fechaSaldo.slice(0, 7)
    const num = (x: number) => String(x).replace('.', ',')
    for (const n of nominas.filter((x) => x.incluida))
      if (n.bruto) {
        const b = n.bruto
        lineas.push(
          `- ${eur(fijoEn(b, hoy))} brutos al año en ${b.pagas} pagas, unos ${eur(n.neto_mensual)} netos al mes${b.bonus_objetivo > 0 ? `; bonus con un objetivo de ${eur(objetivoEn(b, hoy))} brutos, del que cuento con cobrar el ${num(b.bonus_consecucion)} %, en ${MES(b.bonus_mes)}` : ''}${b.subida_anual ? `; subida del ${num(b.subida_anual)} % cada ${MES(b.subida_mes)}, en el fijo y en el bonus` : ''}${n.desde ? `; desde ${n.desde}` : ''}${n.hasta ? `; hasta ${n.hasta}` : ''}. El neto de cada año se calcula con la cotización y la retención del IRPF.`,
        )
      } else
        lineas.push(`- ${eur(n.neto_mensual)} netos al mes${n.pagas.length ? `, pagas extra de ${n.pagas.map((p) => eur(p.importe)).join(' y ')}` : ''}${n.bonus ? `, bonus neto de ${eur(n.bonus.importe)} en ${mesLargo(`2000-${String(n.bonus.mes).padStart(2, '0')}-01`).replace(/ de 2000$/, '').toLowerCase()}` : ''}${n.desde ? `, desde ${n.desde}` : ''}${n.hasta ? `, hasta ${n.hasta}` : ''}`)
  }
  lineas.push('', `Supuestos: ${supuestosCrecimiento(db)}`)
  if (sim && simulado && haySimulacion(db, sim)) {
    const num = (x: number) => String(x).replace('.', ',')
    const partes = [
      sim.sinCrecimiento ? 'sin subidas de sueldo ni inflación' : '',
      !sim.sinCrecimiento && sim.subida !== undefined ? `con una subida de sueldo del ${num(sim.subida)} % al año` : '',
      sim.consecucion !== undefined ? `cobrando el ${num(sim.consecucion)} % del bonus` : '',
      !sim.sinCrecimiento && sim.inflacion !== undefined ? `con una inflación del ${num(sim.inflacion)} %` : '',
      ...cambios.map((n) =>
        sim.nominas![n.id] ? `sumar una nómina de ${eur(n.neto_mensual)} al mes${n.pagas.length ? ` con ${n.pagas.length} pagas extra` : ''}${n.desde ? ` desde ${n.desde}` : ''}` : `sin una nómina de ${eur(n.neto_mensual)} al mes`,
      ),
      ...nominas.filter((n) => tieneBonus(n) && sim.bonus?.[n.id] === false).map(() => 'sin el bonus'),
      sim.deuda !== undefined ? `con una deuda pendiente de ${eur(sim.deuda)}` : '',
      sim.colchon !== undefined ? `con un colchón de ${eur(sim.colchon)}` : '',
      sim.ahorroExtra ? `ahorrar ${eur(sim.ahorroExtra)} más al mes` : '',
      sim.recorte ? `recortar ${nombreCategoria(db, sim.recorte.categoria_id)} un ${sim.recorte.porcentaje} %` : '',
    ].filter(Boolean)
    lineas.push('', `Simulación (${partes.join(' y ')}): primer pago ${eur(simulado.pagos[0]?.pago ?? 0)}, saldada en ${simulado.saldadaEn ?? 'más de 30 años'}, capital dentro de un año ${eur(simulado.serie[12]?.capital ?? 0)} frente a ${eur(plan.serie[12]?.capital ?? 0)}.`)
  }
  return cierre(lineas)
}
