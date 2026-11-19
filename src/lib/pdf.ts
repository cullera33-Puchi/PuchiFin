/**
 * Resumen semanal o mensual en PDF (A4), generado en el dispositivo con jsPDF.
 * No sale nada a ningún servicio: el PDF se comparte con la hoja de compartir o se descarga.
 */
import { jsPDF } from 'jspdf'
import autoTable, { type CellDef, type RowInput } from 'jspdf-autotable'
import type { ResumenAnual } from './anual'
import { diaLargo, diaSemana, hoyIso, MESES, mesLargo } from './fechas'
import { sinDiscreto } from './discreto'
import { formatearFecha, formatearImporte, formatearRedondo } from './formato'
import { indicadores, lineasFueraDelExtracto, porcentaje as pct, textoEnCurso, type Resumen, type Tono } from './resumen'
import { NOMBRE_TIPO_MOVIMIENTO, type Categoria } from './tipos'
import type { Plan } from './plan'
import { resumenEjecutivo } from './ejecutivo'
import type { BaseDatos } from './tipos'
import { APP_VERSION } from './version'

export interface OpcionesPdf {
  /** Reducida: solo indicadores y gasto por categoría, para compartir */
  reducida?: boolean
  /** Conceptos de los movimientos. Sin ellos, solo fechas, categorías e importes */
  incluirConceptos: boolean
  /** Si hay datos de prueba, el PDF lo avisa */
  hayDatosPrueba: boolean
  categorias: Categoria[]
  /** Fecha de generación (por defecto, hoy) */
  generado?: string
  /** Plan de pagos de la deuda: el actual y, si lo hay, el escenario con las nóminas que no cuentan */
  plan?: { actual: Plan; conNominas: { nombres: string[]; plan: Plan } | null; supuestos?: string } | null
}

const MARCA: [number, number, number] = [15, 118, 110]
const TINTA: [number, number, number] = [24, 24, 27]
const GRIS: [number, number, number] = [113, 113, 122]
const VERDE: [number, number, number] = [21, 128, 61]
const ROJO: [number, number, number] = [185, 28, 28]
const MARGEN = 14
const ANCHO = 210

const eur = formatearImporte
const eurRedondo = formatearRedondo
const conSigno = (n: number) => (n > 0 ? `+${eur(n)}` : eur(n))
const COLOR_TONO: Record<Tono, [number, number, number]> = { bueno: VERDE, malo: ROJO, neutro: GRIS }

function hexARgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [158, 158, 158]
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** El PDF sale siempre con las cifras reales, aunque la app esté en modo discreto */
export function generarPdfResumen(r: Resumen, opciones: OpcionesPdf): jsPDF {
  return sinDiscreto(() => generar(r, opciones))
}

function generar(r: Resumen, opciones: OpcionesPdf): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const esMes = r.periodo.tipo === 'mes'
  const reducida = !!opciones.reducida
  const nombreAnterior = r.anterior.nombreCorto
  const tituloAnterior = esMes ? nombreAnterior : r.enCurso ? 'Semana anterior (mismos días)' : 'Semana anterior'
  const porId = new Map(opciones.categorias.map((c) => [c.id, c]))
  const nombreCategoria = (id: string | null) => {
    if (!id) return 'Sin categoría'
    const c = porId.get(id)
    if (!c) return '?'
    const p = c.padre_id ? porId.get(c.padre_id) : undefined
    return p && p.nombre.toLowerCase() !== c.nombre.toLowerCase() ? `${p.nombre}, ${c.nombre}` : c.nombre
  }

  // Cabecera
  doc.setFillColor(...MARCA)
  doc.rect(0, 0, ANCHO, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.text('PuchiFin', MARGEN, 10)
  doc.text(`Generado el ${formatearFecha(opciones.generado ?? hoyIso())}`, ANCHO - MARGEN, 10, { align: 'right' })
  doc.setFont('helvetica', 'bold').setFontSize(17)
  doc.text(esMes ? 'Resumen mensual' : 'Resumen semanal', MARGEN, 19)
  doc.setFont('helvetica', 'normal').setFontSize(11)
  doc.text(r.periodo.etiqueta, MARGEN, 25.5)

  let y = 37
  if (opciones.hayDatosPrueba) {
    doc.setFillColor(254, 243, 199)
    doc.roundedRect(MARGEN, y - 4.5, ANCHO - 2 * MARGEN, 7, 1.5, 1.5, 'F')
    doc.setTextColor(146, 64, 14).setFontSize(8.5)
    doc.text('Incluye datos de prueba generados por la app. No son movimientos reales.', MARGEN + 3, y)
    y += 8
  }
  const enCurso = textoEnCurso(r)
  if (enCurso) {
    doc.setFillColor(240, 249, 255)
    doc.roundedRect(MARGEN, y - 4.5, ANCHO - 2 * MARGEN, 7, 1.5, 1.5, 'F')
    doc.setTextColor(7, 89, 133).setFontSize(8.5)
    doc.text(enCurso, MARGEN + 3, y)
    y += 8
  }

  // Indicadores
  const t = r.totales
  const a = r.totalesAnterior
  const hueco = 3
  const anchoCaja = (ANCHO - 2 * MARGEN - hueco * 3) / 4
  indicadores(r).forEach((ind, i) => {
    const x = MARGEN + i * (anchoCaja + hueco)
    doc.setDrawColor(228, 228, 231).setFillColor(250, 250, 250)
    doc.roundedRect(x, y, anchoCaja, 22, 2, 2, 'FD')
    doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(8)
    doc.text(ind.etiqueta, x + 3, y + 5.5)
    doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(12.5)
    doc.text(ind.valor, x + 3, y + 12.5)
    doc.setTextColor(...COLOR_TONO[ind.comparacion.tono]).setFont('helvetica', 'normal').setFontSize(7)
    doc.text(doc.splitTextToSize(ind.comparacion.texto, anchoCaja - 6), x + 3, y + 17.5)
  })
  y += 29

  const titulo = (texto: string, nota?: string) => {
    if (y > 265) {
      doc.addPage()
      y = 20
    }
    doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(11.5)
    doc.text(texto, MARGEN, y)
    if (nota) {
      doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(8)
      doc.text(nota, ANCHO - MARGEN, y, { align: 'right' })
    }
    y += 2.5
  }

  const estiloTabla = {
    theme: 'plain' as const,
    margin: { left: MARGEN, right: MARGEN, top: 18 },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: TINTA, lineColor: [228, 228, 231] as [number, number, number] },
    headStyles: { fontStyle: 'bold' as const, textColor: GRIS, fontSize: 7.5, lineWidth: { bottom: 0.3 } },
    bodyStyles: { lineWidth: { bottom: 0.1 } },
  }
  /** Cabecera con las columnas de importes alineadas a la derecha */
  const cabecera = (textos: string[], derecha: number[]): RowInput[] => [
    textos.map((t, i): CellDef => ({ content: t, styles: derecha.includes(i) ? { halign: 'right' } : {} })),
  ]
  const despues = () => {
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9
  }

  // Gasto por categoría, con la comparativa
  titulo('Gasto por categoría', `Comparado con ${nombreAnterior}`)
  const filasCategorias: RowInput[] = []
  const pesos: number[] = []
  const colores: [number, number, number][] = []
  for (const c of r.categorias) {
    filasCategorias.push([
      { content: c.nombre, styles: { fontStyle: 'bold' } },
      eur(c.importe),
      pct(c.peso),
      c.anterior === null ? 'Sin datos' : eur(c.anterior),
      c.diferencia === null ? '' : { content: conSigno(c.diferencia), styles: { textColor: c.diferencia > 0 ? ROJO : c.diferencia < 0 ? VERDE : GRIS } },
    ])
    pesos.push(c.peso)
    colores.push(hexARgb(c.color))
    if (esMes && !reducida) {
      for (const s of c.subcategorias) {
        const sub: CellDef = { content: `    ${s.nombre}`, styles: { textColor: GRIS, fontSize: 7.5 } }
        filasCategorias.push([sub, { content: eur(s.importe), styles: { textColor: GRIS, fontSize: 7.5 } }, '', '', ''])
        pesos.push(-1)
        colores.push(GRIS)
      }
    }
  }
  if (!r.categorias.length) filasCategorias.push([{ content: 'Sin gastos en el periodo', colSpan: 5, styles: { textColor: GRIS } }])
  autoTable(doc, {
    ...estiloTabla,
    startY: y,
    head: cabecera(['Categoría', 'Importe', 'Peso', tituloAnterior.charAt(0).toUpperCase() + tituloAnterior.slice(1), 'Diferencia'], [1, 3, 4]),
    body: filasCategorias,
    foot: r.categorias.length
      ? [[
          'Total',
          { content: eur(t.gastos), styles: { halign: 'right' } },
          '',
          { content: a.movimientos ? eur(a.gastos) : 'Sin datos', styles: { halign: 'right' } },
          { content: a.movimientos ? conSigno(Math.round((t.gastos - a.gastos) * 100) / 100) : '', styles: { halign: 'right' } },
        ]]
      : undefined,
    footStyles: { fontStyle: 'bold', lineWidth: { top: 0.3 }, textColor: TINTA },
    columnStyles: { 1: { halign: 'right', cellWidth: 28 }, 2: { cellWidth: 38 }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 26 } },
    didDrawCell: (d) => {
      // Barra del peso de cada categoría
      if (d.section !== 'body' || d.column.index !== 2) return
      const peso = pesos[d.row.index]
      if (peso === undefined || peso < 0) return
      const anchoMax = d.cell.width - 18
      const x = d.cell.x + 16
      const yb = d.cell.y + d.cell.height / 2 - 1.2
      doc.setFillColor(240, 240, 240)
      doc.rect(x, yb, anchoMax, 2.4, 'F')
      doc.setFillColor(...colores[d.row.index])
      doc.rect(x, yb, Math.max(0.4, anchoMax * Math.min(1, peso)), 2.4, 'F')
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 2 && pesos[d.row.index] >= 0) d.cell.styles.cellPadding = { top: 1.6, bottom: 1.6, left: 2, right: 2 }
    },
  })
  despues()

  // Ingresos
  if (!reducida && r.ingresosPorCategoria.length) {
    titulo('Ingresos')
    autoTable(doc, {
      ...estiloTabla,
      startY: y,
      head: cabecera(['Concepto', 'Importe'], [1]),
      body: r.ingresosPorCategoria.map((i) => [i.nombre, eur(i.importe)]),
      columnStyles: { 1: { halign: 'right', cellWidth: 28 } },
    })
    despues()
  }

  // Semana a semana (mensual)
  if (!reducida && esMes && r.semanas.length) {
    titulo('Semana a semana')
    autoTable(doc, {
      ...estiloTabla,
      startY: y,
      head: cabecera(['Semana', 'Ingresos', 'Gastos', 'Ahorro', 'Movimientos'], [1, 2, 3, 4]),
      body: r.semanas.map((s) => [
        s.periodo.etiqueta,
        eur(s.ingresos),
        eur(s.gastos),
        { content: eur(s.ahorro), styles: { textColor: s.ahorro >= 0 ? VERDE : ROJO } },
        String(s.movimientos),
      ]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', cellWidth: 24 } },
    })
    despues()
  }

  // Movimientos de la semana (semanal) o mayores gastos (mensual)
  if (reducida) {
    // Sin detalle de movimientos
  } else if (!esMes) {
    titulo('Movimientos de la semana', 'En gris, los que no computan en el extracto')
    const filas: RowInput[] = r.movimientos.map((m) => {
      const fuera = m.tipo !== 'normal'
      const estilo = fuera ? { textColor: GRIS, fontStyle: 'italic' as const } : {}
      const cat = fuera ? NOMBRE_TIPO_MOVIMIENTO[m.tipo] : nombreCategoria(m.categoria_id)
      const fila: CellDef[] = [{ content: diaSemana(m.fecha_operacion), styles: estilo }]
      if (opciones.incluirConceptos) fila.push({ content: m.concepto_limpio, styles: estilo })
      fila.push({ content: cat, styles: estilo })
      fila.push({ content: eur(m.importe), styles: { ...estilo, halign: 'right', textColor: fuera ? GRIS : m.importe >= 0 ? VERDE : TINTA } })
      return fila
    })
    if (!filas.length) filas.push([{ content: 'Sin movimientos en la semana', colSpan: opciones.incluirConceptos ? 4 : 3, styles: { textColor: GRIS } }])
    autoTable(doc, {
      ...estiloTabla,
      startY: y,
      head: opciones.incluirConceptos ? cabecera(['Día', 'Concepto', 'Categoría', 'Importe'], [3]) : cabecera(['Día', 'Categoría', 'Importe'], [2]),
      body: filas,
      columnStyles: { 0: { cellWidth: 24 } },
    })
    despues()
  } else if (r.mayoresGastos.length) {
    titulo('Mayores gastos del mes')
    autoTable(doc, {
      ...estiloTabla,
      startY: y,
      head: opciones.incluirConceptos ? cabecera(['Fecha', 'Concepto', 'Categoría', 'Importe'], [3]) : cabecera(['Fecha', 'Categoría', 'Importe'], [2]),
      body: r.mayoresGastos.map((m) => {
        const fila: RowInput = [formatearFecha(m.fecha_operacion)]
        if (opciones.incluirConceptos) fila.push(m.concepto_limpio)
        fila.push(nombreCategoria(m.categoria_id), { content: eur(m.importe), styles: { halign: 'right' } })
        return fila
      }),
      columnStyles: { 0: { cellWidth: 22 } },
    })
    despues()
  }

  if (opciones.plan) seccionPlan(doc, opciones.plan, () => y, (v) => (y = v), estiloTabla, cabecera)

  // Lo que no computa (solo en la versión completa)
  const lineas = reducida ? [] : lineasFueraDelExtracto(r)
  if (lineas.length) titulo('Fuera del extracto')
  doc.setTextColor(...TINTA).setFont('helvetica', 'normal').setFontSize(8.5)
  if (lineas.length) y += 3
  for (const l of lineas) {
    const partes = doc.splitTextToSize(l, ANCHO - 2 * MARGEN)
    if (y + partes.length * 4.2 > 282) {
      doc.addPage()
      y = 20
    }
    doc.text(partes, MARGEN, y)
    y += partes.length * 4.2 + 0.8
  }

  // Pie en todas las páginas
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(228, 228, 231).line(MARGEN, 286, ANCHO - MARGEN, 286)
    doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(7)
    doc.text(`PuchiFin v${APP_VERSION}. Totales con los movimientos de tipo Normal; sin lo marcado como gasto de empleado o reembolso ni los traspasos.`, MARGEN, 290)
    doc.text(`Página ${i} de ${paginas}`, ANCHO - MARGEN, 290, { align: 'right' })
  }
  return doc
}

const corto = (mes: string) => mesLargo(`${mes}-01`).replace(/ de /, ' ').toLowerCase()

/**
 * Plan de pagos de la deuda en el PDF: deuda pendiente y colchón, pago de cada verano y deuda tras el pago
 * en el plan actual y con la segunda nómina, año en que queda saldada y capital previsto con su gráfico.
 */
function seccionPlan(
  doc: jsPDF,
  datos: NonNullable<OpcionesPdf['plan']>,
  leerY: () => number,
  fijarY: (y: number) => void,
  estilo: Record<string, unknown>,
  cabecera: (textos: string[], derecha: number[]) => RowInput[],
) {
  const { actual, conNominas } = datos
  const otro = conNominas?.plan ?? null
  const c = actual.compromiso
  // Unos 110 mm: si no caben, a una página nueva
  let y = leerY()
  if (y > 175) {
    doc.addPage()
    y = 20
  }
  doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(11.5)
  doc.text('Plan de pagos de la deuda', MARGEN, y)
  y += 5.5
  doc.setTextColor(...TINTA).setFont('helvetica', 'normal').setFontSize(8.5)
  const intro = `Deuda pendiente: ${eur(actual.deudaPendiente)}${actual.pagado ? ` (ya pagado ${eur(actual.pagado)})` : ''}. Cada ${MESES[c.mes_referencia - 1]} se paga lo que supera el colchón de ${eur(c.colchon)} en ${actual.cuenta.alias}. Ahorro previsto: ${eur(actual.ahorroMensual)} al mes.`
  const partes = doc.splitTextToSize(intro, ANCHO - 2 * MARGEN)
  doc.text(partes, MARGEN, y)
  y += partes.length * 4 + 1
  if (datos.supuestos) {
    const supuestos = doc.splitTextToSize(datos.supuestos, ANCHO - 2 * MARGEN)
    doc.setTextColor(...GRIS)
    doc.text(supuestos, MARGEN, y)
    doc.setTextColor(...TINTA)
    y += supuestos.length * 4 + 1
  }
  if (otro && conNominas) {
    const texto = doc.splitTextToSize(`Con ${conNominas.nombres.join(' y ')}: ahorro previsto de ${eur(otro.ahorroMensual)} al mes.`, ANCHO - 2 * MARGEN)
    doc.setTextColor(...VERDE)
    doc.text(texto, MARGEN, y)
    y += texto.length * 4 + 1
  }

  // Calendario: un año por fila, el actual y con la segunda nómina
  const anios = [...new Set([...actual.pagos, ...(otro?.pagos ?? [])].map((p) => p.anio))].sort((a, b) => a - b)
  const de = (plan: Plan | null, anio: number) => plan?.pagos.find((p) => p.anio === anio)
  const nombreOtro = conNominas ? `Con ${conNominas.nombres.join(' y ')}` : ''
  autoTable(doc, {
    ...estilo,
    startY: y,
    head: otro ? cabecera(['Pago de', 'Pago previsto', 'Deuda tras el pago', `${nombreOtro}: pago`, 'Deuda tras el pago'], [1, 2, 3, 4]) : cabecera(['Pago de', 'Pago previsto', 'Deuda tras el pago'], [1, 2]),
    body: anios.map((anio) => {
      const a = de(actual, anio)
      const o = de(otro, anio)
      const fila: RowInput = [`${MESES[c.mes_referencia - 1]} de ${anio}`, a ? eur(a.pago) : '', a ? eur(a.deudaTras) : '']
      if (otro) fila.push({ content: o ? eur(o.pago) : '', styles: { textColor: VERDE } }, { content: o ? eur(o.deudaTras) : '', styles: { textColor: VERDE } })
      return fila
    }),
    foot: [
      otro
        ? ['Saldada en', String(actual.saldadaEn ?? 'más de 30 años'), '', { content: String(otro.saldadaEn ?? 'más de 30 años'), styles: { textColor: VERDE } }, '']
        : ['Saldada en', String(actual.saldadaEn ?? 'más de 30 años'), ''],
    ],
    footStyles: { fontStyle: 'bold', lineWidth: { top: 0.3 }, textColor: TINTA },
    columnStyles: otro ? { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } : { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  // Capital previsto: gráfico de dos años y cifras a 12 y 24 meses
  const base = actual.serie
  if (base.length > 1) {
    if (y > 235) {
      doc.addPage()
      y = 20
    }
    doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(9.5)
    doc.text('Capital previsto', MARGEN, y)
    doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(7.5)
    doc.text('Cuentas menos lo pendiente de la tarjeta, más el ahorro previsto y menos los pagos de la deuda', ANCHO - MARGEN, y, { align: 'right' })
    y += 3
    const alto = 32
    const ancho = ANCHO - 2 * MARGEN
    const valores = [...base, ...(otro?.serie ?? [])].map((p) => p.capital)
    const min = Math.min(...valores, 0)
    const max = Math.max(...valores)
    const rango = max - min || 1
    const px = (i: number) => MARGEN + (i * ancho) / (base.length - 1)
    const py = (v: number) => y + 2 + (alto - 4) * (1 - (v - min) / rango)
    doc.setDrawColor(228, 228, 231).setLineWidth(0.2)
    doc.line(MARGEN, py(0), MARGEN + ancho, py(0))
    const linea = (serie: Plan['serie'], color: [number, number, number], discontinua: boolean) => {
      doc.setDrawColor(...color).setLineWidth(0.6)
      doc.setLineDashPattern(discontinua ? [1.5, 1] : [], 0)
      for (let i = 1; i < serie.length; i++) doc.line(px(i - 1), py(serie[i - 1].capital), px(i), py(serie[i].capital))
      doc.setLineDashPattern([], 0)
    }
    linea(base, MARCA, false)
    if (otro) linea(otro.serie, VERDE, true)
    y += alto + 4
    doc.setTextColor(...GRIS).setFontSize(7.5)
    doc.text(corto(base[0].mes), MARGEN, y)
    doc.text(corto(base[base.length - 1].mes), ANCHO - MARGEN, y, { align: 'right' })
    // Leyenda
    const leyenda = (x: number, texto: string, color: [number, number, number], discontinua: boolean) => {
      doc.setDrawColor(...color).setLineWidth(0.6).setLineDashPattern(discontinua ? [1.5, 1] : [], 0)
      doc.line(x, y - 1, x + 6, y - 1)
      doc.setLineDashPattern([], 0)
      doc.setTextColor(...GRIS)
      doc.text(texto, x + 8, y)
      return x + 8 + doc.getTextWidth(texto) + 6
    }
    const x2 = leyenda(ANCHO / 2 - 40, 'Plan actual', MARCA, false)
    if (otro && conNominas) leyenda(x2, nombreOtro, VERDE, true)
    y += 5
    const filas: RowInput[] = [12, 24]
      .filter((i) => base[i])
      .map((i) => {
        const fila: RowInput = [`En ${corto(base[i].mes)}`, { content: eur(base[i].capital), styles: { halign: 'right' } }]
        if (otro) fila.push({ content: otro.serie[i] ? eur(otro.serie[i].capital) : '', styles: { halign: 'right', textColor: VERDE } })
        return fila
      })
    autoTable(doc, {
      ...estilo,
      startY: y,
      head: otro ? cabecera(['Capital', 'Plan actual', nombreOtro], [1, 2]) : cabecera(['Capital', 'Plan actual'], [1]),
      body: filas,
    })
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9
  }
  fijarY(y)
}

export function nombreArchivoResumen(r: Resumen, reducida = false): string {
  const base = r.periodo.tipo === 'mes' ? `PuchiFin resumen ${r.periodo.inicio.slice(0, 7)}` : `PuchiFin semana ${r.periodo.inicio}`
  return `${base}${reducida ? ' (para compartir)' : ''}.pdf`
}

/**
 * Resumen ejecutivo en una página (v0.45.0), la versión «Para compartir»: tres cifras, lo importante en
 * frases, las cinco categorías que más pesan y la deuda familiar. Sin conceptos ni movimientos.
 */
export function generarPdfEjecutivo(
  db: BaseDatos,
  r: Resumen,
  opciones: { hayDatosPrueba: boolean; plan: Plan | null; hoy?: string; generado?: string },
): jsPDF {
  return sinDiscreto(() => {
    const e = resumenEjecutivo(db, r, opciones.hoy ?? hoyIso(), opciones.plan)
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const anchoUtil = ANCHO - 2 * MARGEN

    // Cabecera
    doc.setFillColor(...MARCA)
    doc.rect(0, 0, ANCHO, 30, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'normal').setFontSize(9)
    doc.text('PuchiFin', MARGEN, 10)
    doc.text(`Generado el ${formatearFecha(opciones.generado ?? hoyIso())}`, ANCHO - MARGEN, 10, { align: 'right' })
    doc.setFont('helvetica', 'bold').setFontSize(19)
    doc.text(e.titulo, MARGEN, 22)

    let y = 38
    const franja = (texto: string, fondo: [number, number, number], tinta: [number, number, number]) => {
      doc.setFillColor(...fondo)
      doc.roundedRect(MARGEN, y - 4.5, anchoUtil, 7, 1.5, 1.5, 'F')
      doc.setTextColor(...tinta).setFont('helvetica', 'normal').setFontSize(8.5)
      doc.text(texto, MARGEN + 3, y)
      y += 8
    }
    if (opciones.hayDatosPrueba) franja('Incluye datos de prueba generados por la app. No son movimientos reales.', [254, 243, 199], [146, 64, 14])
    if (e.aviso) franja(e.aviso, [240, 249, 255], [7, 89, 133])

    // Tres cifras
    const hueco = 4
    const anchoCaja = (anchoUtil - hueco * 2) / 3
    e.cifras.forEach((c, i) => {
      const x = MARGEN + i * (anchoCaja + hueco)
      doc.setDrawColor(228, 228, 231).setFillColor(250, 250, 250)
      doc.roundedRect(x, y, anchoCaja, 27, 2.5, 2.5, 'FD')
      doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(9)
      doc.text(c.etiqueta, x + 4, y + 7)
      doc.setTextColor(...(c.tono === 'neutro' ? TINTA : COLOR_TONO[c.tono])).setFont('helvetica', 'bold').setFontSize(19)
      doc.text(c.valor, x + 4, y + 16.5)
      if (c.nota) {
        doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(8)
        doc.text(doc.splitTextToSize(c.nota, anchoCaja - 8)[0], x + 4, y + 23)
      }
    })
    y += 38

    const titulo = (texto: string) => {
      doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(13)
      doc.text(texto, MARGEN, y)
      y += 7
    }

    // Dinero en las cuentas: la del día a día, la de ahorro y el total (v0.46.0)
    if (e.cuentas) {
      const c = e.cuentas
      titulo('En las cuentas')
      doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(8.5)
      doc.text(`Saldo a ${diaLargo(c.fecha, true)}`, ANCHO - MARGEN, y - 7, { align: 'right' })
      const columnas = [...c.lineas.map((l) => ({ nombre: l.nombre, valor: eurRedondo(l.saldo), total: false })), { nombre: 'Total', valor: eurRedondo(c.total), total: true }]
      const ancho = anchoUtil / columnas.length
      doc.setDrawColor(228, 228, 231).setFillColor(250, 250, 250)
      doc.roundedRect(MARGEN, y - 2, anchoUtil, 20, 2.5, 2.5, 'FD')
      columnas.forEach((col, i) => {
        const x = MARGEN + i * ancho + 4
        doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(9)
        doc.text(doc.splitTextToSize(col.nombre, ancho - 6)[0], x, y + 4)
        doc.setTextColor(...(col.total ? MARCA : TINTA)).setFont('helvetica', 'bold').setFontSize(15)
        doc.text(col.valor, x, y + 11.5)
        if (col.total && c.variacion !== null) {
          doc.setTextColor(...(c.variacion >= 0 ? VERDE : ROJO)).setFont('helvetica', 'normal').setFontSize(8)
          doc.text(`${c.variacion >= 0 ? '+' : ''}${eurRedondo(c.variacion)} ${c.cuando}`, x, y + 16)
        }
      })
      y += 30
    }

    // Lo importante
    titulo('Lo importante')
    doc.setFont('helvetica', 'normal').setFontSize(11)
    for (const f of e.frases) {
      const lineas = doc.splitTextToSize(f, anchoUtil - 7)
      doc.setFillColor(...MARCA)
      doc.circle(MARGEN + 1.5, y - 1.3, 0.9, 'F')
      doc.setTextColor(...TINTA)
      doc.text(lineas, MARGEN + 6, y)
      y += lineas.length * 5.2 + 2.2
    }
    y += 6

    // En qué se va el dinero
    titulo('En qué se va el dinero')
    if (!e.categorias.length) {
      doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(10)
      doc.text('Sin gastos en el periodo.', MARGEN, y)
      y += 8
    } else {
      const maxPeso = Math.max(...e.categorias.map((c) => c.peso), 0.0001)
      const xBarra = MARGEN + 58
      const anchoBarra = anchoUtil - 58 - 42
      for (const c of e.categorias) {
        doc.setTextColor(...TINTA).setFont('helvetica', 'normal').setFontSize(10.5)
        doc.text(doc.splitTextToSize(c.nombre, 55)[0], MARGEN, y)
        doc.setFillColor(240, 240, 240)
        doc.roundedRect(xBarra, y - 3, anchoBarra, 3.6, 1, 1, 'F')
        doc.setFillColor(...hexARgb(c.color))
        doc.roundedRect(xBarra, y - 3, Math.max(1, (anchoBarra * c.peso) / maxPeso), 3.6, 1, 1, 'F')
        doc.setFont('helvetica', 'bold')
        doc.text(eurRedondo(c.importe), ANCHO - MARGEN - 14, y, { align: 'right' })
        doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(8.5)
        doc.text(pct(c.peso), ANCHO - MARGEN, y, { align: 'right' })
        y += 8.5
      }
      doc.setDrawColor(228, 228, 231).setLineWidth(0.2).line(MARGEN, y - 4, ANCHO - MARGEN, y - 4)
      doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(10.5)
      doc.text('Total', MARGEN, y + 1)
      doc.text(eurRedondo(e.totalGastos), ANCHO - MARGEN - 14, y + 1, { align: 'right' })
      y += 12
    }

    // Deuda familiar
    if (e.deuda) {
      doc.setFont('helvetica', 'normal').setFontSize(11)
      const lineas = e.deuda.frases.map((f) => doc.splitTextToSize(f, anchoUtil - 10) as string[])
      const alto = 13 + lineas.reduce((s, l) => s + l.length * 5.2 + 1.5, 0)
      doc.setFillColor(240, 253, 250).setDrawColor(204, 235, 230)
      doc.roundedRect(MARGEN, y - 2, anchoUtil, alto, 2.5, 2.5, 'FD')
      doc.setTextColor(...MARCA).setFont('helvetica', 'bold').setFontSize(12)
      doc.text(e.deuda.titulo, MARGEN + 5, y + 5)
      let yd = y + 12
      doc.setTextColor(...TINTA).setFont('helvetica', 'normal').setFontSize(11)
      for (const l of lineas) {
        doc.text(l, MARGEN + 5, yd)
        yd += l.length * 5.2 + 1.5
      }
    }

    // Pie
    doc.setDrawColor(228, 228, 231).line(MARGEN, 286, ANCHO - MARGEN, 286)
    doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(7)
    doc.text('Cuentan los gastos e ingresos del día a día: sin traspasos entre cuentas, gastos de trabajo ni lo devuelto de la deuda.', MARGEN, 290)
    return doc
  })
}

/**
 * Resumen del año en PDF (R5, v0.34.0): una página con los totales frente al año anterior, los mejores y
 * peores meses, las categorías y comercios que más pesan, el gasto fijo, la deuda y el capital.
 */
export function generarPdfAnual(r: ResumenAnual, opciones: { hayDatosPrueba: boolean; generado?: string }): jsPDF {
  return sinDiscreto(() => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    doc.setFillColor(...MARCA)
    doc.rect(0, 0, ANCHO, 30, 'F')
    doc.setTextColor(255, 255, 255).setFont('helvetica', 'normal').setFontSize(9)
    doc.text('PuchiFin', MARGEN, 10)
    doc.text(`Generado el ${formatearFecha(opciones.generado ?? hoyIso())}`, ANCHO - MARGEN, 10, { align: 'right' })
    doc.setFont('helvetica', 'bold').setFontSize(17)
    doc.text(`Resumen del año ${r.anio}`, MARGEN, 19)
    doc.setFont('helvetica', 'normal').setFontSize(11)
    doc.text(r.enCurso ? `En curso: ${r.meses} meses con datos` : `${r.meses} meses con datos`, MARGEN, 25.5)
    let y = 37
    if (opciones.hayDatosPrueba) {
      doc.setFillColor(254, 243, 199).roundedRect(MARGEN, y - 4.5, ANCHO - 2 * MARGEN, 7, 1.5, 1.5, 'F')
      doc.setTextColor(146, 64, 14).setFontSize(8.5).text('Incluye datos de prueba generados por la app. No son movimientos reales.', MARGEN + 3, y)
      y += 8
    }
    const t = r.totales
    const a = r.anterior
    const cajas: [string, string, string][] = [
      ['Ingresos', eur(t.ingresos), a ? `Año anterior: ${eur(a.ingresos)}` : ''],
      ['Gastos', eur(t.gastos), a ? `Año anterior: ${eur(a.gastos)}` : ''],
      ['Ahorro', eur(t.ahorro), a ? `Año anterior: ${eur(a.ahorro)}` : ''],
      ['Tasa de ahorro', t.tasaAhorro === null ? 'Sin ingresos' : pct(t.tasaAhorro), a?.tasaAhorro != null ? `Año anterior: ${pct(a.tasaAhorro)}` : ''],
    ]
    const hueco = 3
    const anchoCaja = (ANCHO - 2 * MARGEN - hueco * 3) / 4
    cajas.forEach(([etiqueta, valor, nota], i) => {
      const x = MARGEN + i * (anchoCaja + hueco)
      doc.setDrawColor(228, 228, 231).setFillColor(250, 250, 250).roundedRect(x, y, anchoCaja, 20, 2, 2, 'FD')
      doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(8).text(etiqueta, x + 3, y + 5.5)
      doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(12).text(valor, x + 3, y + 12)
      if (nota) doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(7).text(nota, x + 3, y + 17)
    })
    y += 27
    const estilo = {
      theme: 'plain' as const,
      margin: { left: MARGEN, right: MARGEN },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: TINTA, lineColor: [228, 228, 231] as [number, number, number] },
      headStyles: { fontStyle: 'bold' as const, textColor: GRIS, fontSize: 7.5, lineWidth: { bottom: 0.3 } },
      bodyStyles: { lineWidth: { bottom: 0.1 } },
    }
    const titulo = (texto: string) => {
      doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(11).text(texto, MARGEN, y)
      y += 2.5
    }
    const despues = () => {
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    }
    const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
    titulo('El año en cifras')
    const filas: RowInput[] = [
      ['Gasto medio al mes', { content: eur(r.gastoMedioMes), styles: { halign: 'right' } }],
      ['Gasto fijo (recibos y suscripciones)', { content: eur(r.fijo), styles: { halign: 'right' } }],
    ]
    if (r.mejorMes) filas.push([`Mes de más ahorro: ${nombreMes(r.mejorMes.mes)}`, { content: eur(r.mejorMes.ahorro), styles: { halign: 'right', textColor: VERDE } }])
    if (r.peorMes) filas.push([`Mes de menos ahorro: ${nombreMes(r.peorMes.mes)}`, { content: eur(r.peorMes.ahorro), styles: { halign: 'right', textColor: r.peorMes.ahorro < 0 ? ROJO : TINTA } }])
    if (r.capital) {
      if (r.capital.inicio !== null) filas.push([`Capital a final de ${Number(r.anio) - 1}`, { content: eur(r.capital.inicio), styles: { halign: 'right' } }])
      filas.push([r.enCurso ? 'Capital hoy' : `Capital a final de ${r.anio}`, { content: eur(r.capital.fin), styles: { halign: 'right' } }])
    }
    if (r.deuda) {
      filas.push([`Pagado de la deuda en ${r.anio}`, { content: eur(r.deuda.pagado), styles: { halign: 'right' } }])
      filas.push(['Deuda pendiente hoy', { content: eur(r.deuda.pendiente), styles: { halign: 'right' } }])
    }
    autoTable(doc, { ...estilo, startY: y, body: filas, columnStyles: { 1: { cellWidth: 40 } } })
    despues()
    if (r.categorias.length) {
      titulo('Categorías que más pesan')
      autoTable(doc, {
        ...estilo,
        startY: y,
        head: [['Categoría', { content: 'Gasto', styles: { halign: 'right' } }, { content: 'Peso', styles: { halign: 'right' } }, { content: 'Año anterior', styles: { halign: 'right' } }]],
        body: r.categorias.map((c) => [c.nombre, { content: eur(c.importe), styles: { halign: 'right' } }, { content: pct(c.peso), styles: { halign: 'right' } }, { content: r.anterior ? eur(c.anterior) : '', styles: { halign: 'right' } }]),
      })
      despues()
    }
    if (r.comercios.length) {
      titulo('Comercios con más gasto')
      autoTable(doc, {
        ...estilo,
        startY: y,
        head: [['Comercio', { content: 'Compras', styles: { halign: 'right' } }, { content: 'Gasto', styles: { halign: 'right' } }]],
        body: r.comercios.map((c) => [c.nombre, { content: String(c.veces), styles: { halign: 'right' } }, { content: eur(c.importe), styles: { halign: 'right' } }]),
      })
      despues()
    }
    doc.setDrawColor(228, 228, 231).line(MARGEN, 286, ANCHO - MARGEN, 286)
    doc.setTextColor(...GRIS).setFont('helvetica', 'normal').setFontSize(7)
    doc.text(`PuchiFin v${APP_VERSION}. Totales con los movimientos de tipo Normal${r.enCurso ? '; el año anterior, con los mismos días' : ''}.`, MARGEN, 290)
    return doc
  })
}
