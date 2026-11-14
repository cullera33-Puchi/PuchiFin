/**
 * Resumen semanal o mensual en PDF (A4), generado en el dispositivo con jsPDF.
 * No sale nada a ningún servicio: el PDF se comparte con la hoja de compartir o se descarga.
 */
import { jsPDF } from 'jspdf'
import autoTable, { type CellDef, type RowInput } from 'jspdf-autotable'
import { diaSemana, hoyIso, MESES, mesLargo } from './fechas'
import { sinDiscreto } from './discreto'
import { formatearFecha, formatearImporte } from './formato'
import { indicadores, lineasFueraDelExtracto, porcentaje as pct, textoEnCurso, type Resumen, type Tono } from './resumen'
import { NOMBRE_TIPO_MOVIMIENTO, type Categoria } from './tipos'
import type { Plan } from './plan'
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
  plan?: { actual: Plan; conNominas: { nombres: string[]; plan: Plan } | null } | null
}

const MARCA: [number, number, number] = [15, 118, 110]
const TINTA: [number, number, number] = [24, 24, 27]
const GRIS: [number, number, number] = [113, 113, 122]
const VERDE: [number, number, number] = [21, 128, 61]
const ROJO: [number, number, number] = [185, 28, 28]
const MARGEN = 14
const ANCHO = 210

const eur = formatearImporte
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
  return `${base}${reducida ? ' (reducido)' : ''}.pdf`
}
