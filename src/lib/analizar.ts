/**
 * «Analizar con Claude» (apartado 11): textos preparados para cada vista, que se ven antes de enviarlos.
 * Sin API ni coste. Solo totales, categorías e importes (y en los informes, los comercios que más pesan):
 * sin cuentas, saldos de cuentas concretas, fechas exactas ni nombres de personas.
 */
import { rankingComercios } from './comercios'
import { calcularExtracto, fechaDeLosDatos, gastoPorCategoria } from './extracto'
import { mesLargo } from './fechas'
import { mesEfectivo } from './imputacion'
import { enmascararIdentificativos } from './identificativos'
import { calcularInforme, type PeriodoInforme } from './informes'
import { instrucciones, sinConceptos } from './plantillas'
import { fijoEn, objetivoEn } from './nomina'
import { calcularPatrimonio, interesesRestantes, NOMBRE_TIPO_BIEN } from './patrimonio'
import {
  calcularPlan,
  capacidadCompra,
  cifrasCompra,
  compararDestinos,
  comprobarPrevision,
  evolucionAnual,
  haySimulacion,
  supuestosCrecimiento,
  tieneBonus,
  type CompraVivienda,
  type Plan,
  type Simulacion,
} from './plan'
import { estadoEventos } from './previstos'
import { primerMes } from './prevision'
import { textoOptimizar } from './optimizar'
import { detectarRecurrentes } from './recurrentes'
import { inversionDe } from './vivienda'
import { consumoPresupuestos, presupuestoAnual } from './presupuesto'
import type { BaseDatos } from './tipos'
import { nombreCategoria } from './vista'

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`
const pct = (n: number) => `${Math.round(n * 100)} %`
const cierre = (lineas: string[]) => enmascararIdentificativos(lineas.join('\n'))
/** Líneas de cabecera de cada texto (presentación, petición, instrucciones y línea en blanco): sin ellas, solo los datos */
const CABECERA = 4
const INTRO = 'Datos de mi app de finanzas personales (anonimizados, sin cuentas ni datos personales). Importes en euros; los gastos de trabajo y los traspasos entre mis cuentas no cuentan.'

/** Extracto del mes: totales, comparativa con la media y gasto por categoría */
export function textoExtracto(db: BaseDatos, mes: string, hoy: string, soloDatos = false): string {
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
  return cierre(soloDatos ? lineas.slice(CABECERA) : lineas)
}

/** Informe de un mes o un año: gasto o ingreso por categoría frente al periodo anterior y los comercios que más pesan */
export function textoInforme(db: BaseDatos, periodo: PeriodoInforme, hoy: string, soloDatos = false): string {
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
  return cierre(soloDatos ? lineas.slice(CABECERA) : lineas)
}

/** Presupuesto: consumo del mes y acumulado del año */
export function textoPresupuesto(db: BaseDatos, mes: string, hoy: string, soloDatos = false): string {
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
  return cierre(soloDatos ? res.slice(CABECERA) : res)
}

/** Plan de pagos: deuda, regla de pago, ahorro previsto, calendario y simulación */
export function textoPlan(db: BaseDatos, plan: Plan, sim: Simulacion | null, simulado: Plan | null, soloDatos = false): string {
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
      sim.compra ? textoCompra(sim.compra) : '',
    ].filter(Boolean)
    lineas.push('', `Simulación (${partes.join(' y ')}): primer pago ${eur(simulado.pagos[0]?.pago ?? 0)}, saldada en ${simulado.saldadaEn ?? 'más de 30 años'}, capital dentro de un año ${eur(simulado.serie[12]?.capital ?? 0)} frente a ${eur(plan.serie[12]?.capital ?? 0)}.`)
  }
  return cierre(soloDatos ? lineas.slice(CABECERA) : lineas)
}

const mesTexto = (mes: string) => mesLargo(`${mes}-01`).toLowerCase()
const USO: Record<CompraVivienda['uso'], string> = { alquilar: 'para alquilar', segunda: 'como segunda residencia', vivir: 'para vivir en ella' }

/** La compra de la simulación en una frase */
function textoCompra(c: CompraVivienda): string {
  const x = cifrasCompra(c)
  const destino = c.uso === 'vivir' && c.actual && c.actual.destino !== 'mantener' ? (c.actual.destino === 'vender' ? ', vendiendo la actual' : ', alquilando la actual') : ''
  return `comprar una vivienda ${USO[c.uso]} de ${eur(c.precio)} en ${mesTexto(c.mes)}${destino} (entrada de ${eur(x.entrada)}, gastos de compra de ${eur(x.gastos)}, hipoteca de ${eur(x.prestamo)} a ${c.anios} años al ${String(c.interes).replace('.', ',')} % con una cuota de ${eur(x.cuota)} al mes)`
}

/**
 * Situación completa para Claude (v0.41.0): patrimonio, ingresos por años, gasto medio por categoría,
 * ahorro real, gastos previstos, plan de la deuda, supuestos y, si se simula, la compra de una vivienda.
 * Importes exactos (decisión del usuario); sin nombres de bienes, cuentas ni comercios.
 */
export function textoPatrimonio(db: BaseDatos, hoy: string, sim: Simulacion, soloDatos = false): string {
  const p = calcularPatrimonio(db, hoy)
  const lineas = [
    INTRO,
    'Quiero revisar mi situación financiera completa y saber qué margen tengo para invertir, por ejemplo en la compra de una vivienda.',
    instrucciones(db, 'patrimonio'),
    '',
    'Patrimonio hoy:',
  ]
  if (p.liquidez !== null) lineas.push(`- Liquidez (cuentas menos lo pendiente de la tarjeta): ${eur(p.liquidez)}`)
  p.inmuebles.forEach((l, i) => lineas.push(`- Inmueble ${i + 1}${l.bien.habitual ? ', vivienda habitual' : ''}: valor estimado ${eur(l.valor)}, valorado en ${mesTexto(l.fecha.slice(0, 7))}`))
  const porTipo = new Map<string, number>()
  for (const l of p.otros) {
    const n = (porTipo.get(l.bien.tipo) ?? 0) + 1
    porTipo.set(l.bien.tipo, n)
    lineas.push(`- ${NOMBRE_TIPO_BIEN[l.bien.tipo]} ${n}: ${eur(l.valor)}`)
  }
  for (const h of p.hipotecas)
    lineas.push(
      `- Hipoteca a tipo fijo del ${String(h.prestamo.interes).replace('.', ',')} %: quedan ${eur(h.pendiente)}, cuota de ${eur(h.cuota)} al mes, última cuota en ${mesTexto(h.fin)}, intereses que quedan ${eur(interesesRestantes(h.prestamo, hoy))}`,
    )
  if (p.hipotecasSinDatos.length) lineas.push('- Tengo una hipoteca cuyo capital pendiente no he indicado: su cuota está dentro del gasto de vivienda.')
  if (p.deudaFamiliar > 0) lineas.push(`- Deuda familiar sin intereses: ${eur(p.deudaFamiliar)} pendientes`)
  lineas.push(`Patrimonio neto: ${eur(p.neto)} (activos ${eur(p.activos)}, deudas ${eur(p.deudas)}).`)
  if (p.evolucion.length >= 2) lineas.push(`Patrimonio neto en ${mesTexto(p.evolucion[0].mes)}: ${eur(p.evolucion[0].neto)}.`)

  // Ingresos y ahorro por años, con el mismo modelo que el plan
  const anios = evolucionAnual(db, hoy, sim)
  if (anios && (db.ajustes.nominas ?? []).some((n) => n.incluida)) {
    lineas.push('', 'Ingresos y ahorro previstos por años naturales:')
    for (const a of anios)
      lineas.push(
        `- ${a.anio}: ${a.bruto !== null ? `${eur(a.bruto)} brutos${a.bonusBruto ? ` (bonus ${eur(a.bonusBruto)})` : ''}, IRPF ${String(a.retencion).replace('.', ',')} %, ` : ''}${eur(a.neto)} netos de nómina${a.gastos !== null ? `; otros ingresos ${eur(a.otros ?? 0)}, gastos ${eur(a.gastos)}, ahorro ${eur(a.ahorro ?? 0)}` : ''}`,
      )
  }
  const c = comprobarPrevision(db, hoy, sim)
  if (c) {
    lineas.push(
      '',
      `Lo real, media al mes de los últimos ${c.meses} ${c.meses === 1 ? 'mes cerrado' : 'meses cerrados'}: nóminas ${eur(c.real.nominas)}, otros ingresos ${eur(c.real.otros)}, gastos ${eur(c.real.gastos)}, ahorro ${eur(c.real.ahorro)}.`,
    )
    if (c.banco) lineas.push(`Según el banco, mi capital ha variado ${eur(c.banco.capital)} al mes de media en ${c.banco.meses} meses, sin contar los pagos de la deuda.`)
    lineas.push(`Previsto para los próximos 12 meses, media al mes: ingresos ${eur(c.previsto.nominas + c.previsto.otros)}, gastos ${eur(c.previsto.gastos)}, ahorro ${eur(c.previsto.ahorro)}.`)
  }

  // Gasto medio por categoría de los últimos meses cerrados (hasta 12, sin el primero importado)
  const mesDatos = fechaDeLosDatos(db, hoy).slice(0, 7)
  const primero = primerMes(db)
  const meses = [...new Set(db.movimientos.map(mesEfectivo))].filter((m) => m > primero && m < mesDatos).sort().slice(-12)
  if (meses.length) {
    const enMeses = new Set(meses)
    const gasto = gastoPorCategoria(
      db.movimientos.filter((m) => enMeses.has(mesEfectivo(m))),
      db.categorias,
    )
    const lista = [...gasto].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    if (lista.length) {
      lineas.push('', `Gasto medio al mes por categoría (${meses.length} ${meses.length === 1 ? 'mes' : 'meses'}):`)
      for (const [id, v] of lista) lineas.push(`- ${nombreCategoria(db, id)}: ${eur(v / meses.length)}`)
    }
  }

  const previstos = estadoEventos(db, hoy).filter((e) => e.estado === 'pendiente')
  if (previstos.length) {
    lineas.push('', 'Gastos e ingresos puntuales previstos:')
    // Sin conceptos, cada previsto sale por su categoría (el concepto es texto libre)
    const sin = sinConceptos(db)
    previstos.forEach((e, i) =>
      lineas.push(`- ${mesTexto(e.evento.fecha.slice(0, 7))}: ${sin ? (e.evento.categoria_id ? nombreCategoria(db, e.evento.categoria_id) : `Gasto previsto ${i + 1}`) : e.evento.concepto}, ${eur(e.evento.importe)}`),
    )
  }

  const plan = calcularPlan(db, hoy).plan
  if (plan && plan.deudaPendiente > 0) {
    const proximo = plan.pagos[0]
    lineas.push(
      '',
      `Plan de pagos de la deuda familiar: cada ${mesTexto(`2000-${String(plan.compromiso.mes_referencia).padStart(2, '0')}`).replace(/ de 2000$/, '')} pago todo lo que supere un colchón de ${eur(plan.compromiso.colchon)} en mi cuenta de ahorro${proximo ? `; próximo pago previsto de ${eur(proximo.pago)} en ${mesTexto(proximo.mes)}` : ''}; ${plan.saldadaEn ? `saldada en ${plan.saldadaEn}` : 'no se salda en 30 años'}.`,
    )
  }
  lineas.push('', `Supuestos de la previsión: ${supuestosCrecimiento(db)}`)

  if (sim.compra) {
    const conCompra = calcularPlan(db, hoy, sim).plan
    const r = conCompra?.compra
    lineas.push('', `Operación que quiero valorar: ${textoCompra(sim.compra)}.`)
    if (sim.compra.gastos_mes) lineas.push(`Gastos de la vivienda: ${eur(sim.compra.gastos_mes)} al mes (IBI, comunidad, seguros y mantenimiento).`)
    if (sim.compra.uso === 'alquilar' && sim.compra.alquiler_mes) lineas.push(`Alquiler previsto: ${eur(sim.compra.alquiler_mes)} al mes.`)
    if (sim.pareja) lineas.push('Cuento también con la nómina de mi pareja, cotitular de la hipoteca nueva.')
    if (sim.pausarPago) lineas.push('El año de la compra no pagaría la deuda familiar, para tener la entrada.')
    if (r?.venta)
      lineas.push(
        `Vendería mi vivienda actual por ${eur(r.venta.precio)}: menos ${eur(r.venta.hipoteca)} de hipoteca, ${eur(r.venta.gastos)} de gastos de venta y ${eur(r.venta.irpf)} de IRPF${r.venta.ganancia > 0 && r.venta.irpf === 0 ? ' (la ganancia queda exenta por reinversión en vivienda habitual)' : ''}, me quedarían ${eur(r.venta.neto)}.`,
      )
    if (r?.alquiler)
      lineas.push(
        `Alquilaría mi vivienda actual (copropiedad al ${inversionDe(db).propiedad_pct} % con mi pareja): ${eur(r.alquiler.ingresos)} al año de alquiler, ${eur(r.alquiler.gastos)} de gastos, ${eur(r.alquiler.intereses)} de intereses y ${eur(r.alquiler.amortizacion)} de amortización deducibles, reducción del ${inversionDe(db).reduccion_alquiler} %; IRPF de ${eur(r.alquiler.irpfTitular)} para mí y ${eur(r.alquiler.irpfPareja)} para mi pareja; neto ${eur(r.alquiler.neto)} al año. Seguiría pagando su hipoteca.`,
      )
    if (r) {
      lineas.push(
        `En ${mesTexto(r.mes)} tendría unos ${eur(r.saldoAntes)} en la cuenta de ahorro: ${r.falta > 0 ? `me faltarían ${eur(r.falta)} para la entrada y los gastos` : `después de pagar entrada y gastos me quedarían ${eur(r.sobreColchon)} por encima del colchón`}.`,
      )
      if (r.esfuerzo !== null)
        lineas.push(`Las cuotas de hipoteca que pagaría (${eur(r.cuotas)} al mes) serían el ${pct(r.esfuerzo)} de lo que cuenta el banco: mis nóminas netas y el ${inversionDe(db).alquiler_banco} % del alquiler, si lo hay.`)
    }
    if (plan && conCompra && plan.deudaPendiente > 0)
      lineas.push(`Con la compra, la deuda familiar quedaría saldada en ${conCompra.saldadaEn ?? 'más de 30 años'}, frente a ${plan.saldadaEn ?? 'más de 30 años'} sin ella.`)
    const comparacion = compararDestinos(db, hoy, sim)
    if (comparacion) {
      lineas.push('', 'Vender o alquilar mi vivienda actual con esta compra:')
      for (const x of comparacion)
        lineas.push(
          `- ${x.destino === 'vender' ? 'Vendiéndola' : 'Alquilándola'}: ahorros necesarios ${eur(x.ahorros)}, cuotas de hipoteca ${eur(x.cuotas)} al mes${x.alquilerNeto ? `, alquiler neto ${eur(x.alquilerNeto)} al mes` : ''}, ahorro ${eur(x.ahorroMensual)} al mes, esfuerzo ${x.esfuerzo === null ? 'sin dato' : pct(x.esfuerzo)}, deuda familiar saldada en ${x.saldadaEn ?? 'más de 30 años'}, patrimonio neto en 5 años ${x.patrimonio5 === null ? 'sin dato' : eur(x.patrimonio5)} y en 10 años ${x.patrimonio10 === null ? 'sin dato' : eur(x.patrimonio10)}.`,
        )
    }
  } else lineas.push('', 'No tengo todavía una operación concreta.')

  // Cuánto podría comprar cada año, con lo que haga con la vivienda actual y con la nómina de la pareja si la cuento
  const destino = sim.compra?.uso === 'vivir' ? (sim.compra.actual?.destino ?? 'mantener') : 'mantener'
  const capacidad = capacidadCompra(db, hoy, sim, { pareja: !!sim.pareja, destino })
  if (capacidad?.filas.length) {
    const inv = inversionDe(db)
    lineas.push(
      '',
      `Precio máximo de vivienda que la app calcula (esfuerzo máximo del ${inv.esfuerzo_max} % sobre mis ingresos netos, el banco cuenta el ${inv.alquiler_banco} % del alquiler, entrada del ${capacidad.entrada_pct} %, gastos del ${capacidad.gastos_pct} %, hipoteca a ${capacidad.anios} años al ${String(capacidad.interes).replace('.', ',')} %${destino === 'vender' ? ', vendiendo la actual' : destino === 'alquilar' ? ', alquilando la actual' : ', manteniendo la actual'}):`,
    )
    for (const f of capacidad.filas)
      lineas.push(`- ${mesTexto(f.mes)}: ${eur(f.pagando.precio)} pagando la deuda ese año, ${eur(f.pausando.precio)} pausando ese pago (cuota máxima ${eur(f.cuotaMax)})`)
  }
  return cierre(soloDatos ? lineas.slice(CABECERA) : lineas)
}

/**
 * Todo para Claude (v0.43.0): la app entera en un texto, por apartados (el mes, el año, el presupuesto, los
 * gastos fijos, el plan de pagos y la situación completa con la compra que se simule), para un análisis
 * global. Va con el CSV de todos los movimientos. Sin nombres de bienes ni cuentas; sin comercios si así
 * está en Ajustes.
 */
export function textoCompleto(db: BaseDatos, hoy: string, sim: Simulacion): string {
  const mesDatos = fechaDeLosDatos(db, hoy).slice(0, 7)
  const anterior = sumarMesesTexto(mesDatos, -1)
  const apartado = (titulo: string, cuerpo: string) => (cuerpo.trim() ? ['', `## ${titulo}`, cuerpo.trim()] : [])
  const lineas = [
    INTRO,
    'Te paso una visión completa de mis finanzas personales, por apartados. Revísala entera:',
    instrucciones(db, 'completo'),
  ]
  lineas.push(...apartado(`Último mes cerrado: ${mesLargo(`${anterior}-01`).toLowerCase()}`, textoExtracto(db, anterior, hoy, true)))
  lineas.push(...apartado(`Mes en curso: ${mesLargo(`${mesDatos}-01`).toLowerCase()}`, textoExtracto(db, mesDatos, hoy, true)))
  lineas.push(...apartado(`El año ${mesDatos.slice(0, 4)} frente al anterior`, textoInforme(db, { escala: 'anio', clave: mesDatos.slice(0, 4) }, hoy, true)))
  if (db.presupuestos.length) lineas.push(...apartado('Presupuesto', textoPresupuesto(db, mesDatos, hoy, true)))
  lineas.push(...apartado('Gastos fijos y recurrentes', textoOptimizar(db, detectarRecurrentes(db), hoy, true)))
  const plan = calcularPlan(db, hoy).plan
  if (plan && plan.deudaPendiente > 0) {
    const simulado = haySimulacion(db, sim) ? calcularPlan(db, hoy, sim).plan : null
    lineas.push(...apartado('Plan de pagos de la deuda familiar', textoPlan(db, plan, sim, simulado, true)))
  }
  lineas.push(...apartado('Patrimonio, ingresos futuros e inversiones', textoPatrimonio(db, hoy, sim, true)))
  return cierre(lineas)
}

const sumarMesesTexto = (mes: string, n: number) => {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
