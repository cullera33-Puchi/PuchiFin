/**
 * Importación de un Excel de BBVA (apartado 3): de las filas leídas a una propuesta revisable y,
 * al confirmar, a la base de datos. Todo ocurre en el dispositivo y el fichero original se descarta:
 * solo se guardan los movimientos ya anonimizados.
 */
import { ErrorDatos, claveMovimiento, exigirSinIdentificativos, nuevoId } from '../datos/operaciones'
import { normalizarConcepto } from '../lib/conceptos'
import { formatearFecha, formatearImporte } from '../lib/formato'
import { sumarDias } from '../lib/fechas'
import { detectarIdentificativos, NOMBRE_TIPO } from '../lib/identificativos'
import type { BaseDatos, Cuenta, Importacion, Movimiento, TipoMovimiento } from '../lib/tipos'
import { anonimizarConcepto } from './anonimizar'
import type { Lectura } from './lector'
import { categoriasAprendidas, clasificar, type Sugerencia } from './reglas'

export interface MovimientoPropuesto extends Movimiento {
  fila: number
  sugerencia: Sugerencia | null
}

export interface Propuesta {
  origen: Lectura['plantilla']['origen']
  nombrePlantilla: string
  cuenta_id: string
  nuevos: MovimientoPropuesto[]
  duplicados: number
  anteriores: number
  ilegibles: number[]
  fecha_desde: string | null
  fecha_hasta: string | null
  /** Traspasos emparejados con un movimiento ya guardado de otra cuenta propia */
  traspasos: { nuevo: string; existente: string }[]
  avisos: string[]
  /** Datos identificativos que siguen en lo que se va a guardar: bloquean la importación */
  problemas: { fila: number; texto: string }[]
}

/** Concepto legible: sin números enmascarados ni separadores sueltos, con mayúscula inicial por palabra */
export function conceptoLimpio(anonimizado: string, alias: string[] = []): string {
  const limpio = anonimizado
    .replace(/(?<![A-Za-z0-9])[*X]{3,}(?:[\s-]*[*X]+)*[\s-]*\d{0,4}(?![A-Za-z0-9])/g, ' ') // números enmascarados (****1234, XXXX)
    .replace(/\b(COMPRA|PAGO)\s+(CON\s+)?(TARJ(ETA)?\.?|TJ\.?)\s+(EN\s+)?/gi, '')
    .replace(/\s+-\s*$|^\s*-\s+/g, '')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const minus = new Set(['de', 'del', 'la', 'el', 'y', 'a', 'en', 'con', 'por'])
  return limpio
    .split(' ')
    .map((p, i) => {
      if (alias.includes(p) || !/[A-ZÁÉÍÓÚÑÜ]/.test(p) || /[a-z]/.test(p)) return p
      const l = p.toLowerCase()
      return i > 0 && minus.has(l) ? l : l.charAt(0).toUpperCase() + l.slice(1)
    })
    .join(' ')
}

const ES_TRASPASO = /\b(traspaso|transferencia|transf|trf|bizum)\b/

/** Cuenta sugerida para el fichero: la tarjeta para un Excel de tarjeta; la primera cuenta activa para el resto */
export function cuentaSugerida(db: BaseDatos, lectura: Lectura, ultima?: string): Cuenta | undefined {
  const activas = db.cuentas.filter((c) => c.activa && c.tipo === lectura.plantilla.tipo_cuenta).sort((a, b) => a.orden - b.orden)
  return activas.find((c) => c.id === ultima) ?? activas[0]
}

export function proponer(db: BaseDatos, lectura: Lectura, cuenta_id: string): Propuesta {
  const cuenta = db.cuentas.find((c) => c.id === cuenta_id)
  if (!cuenta) throw new ErrorDatos('Elige la cuenta a la que pertenece el fichero')
  const alias = db.ajustes.alias_terceros
  const nombresAlias = alias.map((a) => a.alias)
  const aprendidas = categoriasAprendidas(db)
  const creado = new Date().toISOString()

  // Cuántas veces está ya cada clave en esta cuenta (deduplicación con repeticiones)
  const existentes = new Map<string, number>()
  for (const m of db.movimientos) {
    if (m.cuenta_id !== cuenta_id) continue
    const k = `${m.fecha_operacion}|${m.importe}|${m.concepto_normalizado}`
    existentes.set(k, Math.max(existentes.get(k) ?? 0, m.ocurrencia))
  }
  const enFichero = new Map<string, number>()

  let anteriores = 0
  let duplicados = 0
  const nuevos: MovimientoPropuesto[] = []
  const filasOrdenadas = [...lectura.filas].sort((a, b) => a.fecha_operacion.localeCompare(b.fecha_operacion) || b.numero - a.numero)
  for (const f of filasOrdenadas) {
    if (f.fecha_operacion < db.ajustes.fecha_inicio) {
      anteriores++
      continue
    }
    const original = anonimizarConcepto(f.concepto, alias)
    const limpio = conceptoLimpio(original, nombresAlias) || original
    const normalizado = normalizarConcepto(limpio)
    const k = `${f.fecha_operacion}|${f.importe}|${normalizado}`
    const ocurrencia = (enFichero.get(k) ?? 0) + 1
    enFichero.set(k, ocurrencia)
    if (ocurrencia <= (existentes.get(k) ?? 0)) {
      duplicados++
      continue
    }
    const c = clasificar({ concepto_normalizado: normalizado, cuenta_id, importe: f.importe }, db.reglas, aprendidas)
    nuevos.push({
      id: nuevoId(),
      fila: f.numero,
      cuenta_id,
      importacion_id: null,
      fecha_operacion: f.fecha_operacion,
      fecha_valor: f.fecha_valor,
      concepto_original: original,
      concepto_limpio: limpio,
      concepto_normalizado: normalizado,
      ocurrencia,
      importe: f.importe,
      saldo: f.saldo,
      categoria_id: c.categoria_id,
      tipo: c.tipo,
      regla_id: c.regla_id,
      origen_categoria: c.origen_categoria,
      nota: null,
      reembolso_cerrado: false,
      created_at: creado,
      sugerencia: c.sugerencia,
    })
  }

  // Restaurante en día laborable el mismo día que un viaje de trabajo: también se sugiere como gasto de empleado
  const diasViaje = new Set(nuevos.filter((m) => m.sugerencia?.tipo === 'gasto_empleado').map((m) => m.fecha_operacion))
  const restaurantes = new Set(db.categorias.filter((c) => c.nombre === 'Restaurantes' || c.nombre === 'Cafeterías').map((c) => c.id))
  for (const m of nuevos) {
    const dia = new Date(`${m.fecha_operacion}T00:00:00Z`).getUTCDay()
    if (!m.sugerencia && m.tipo === 'normal' && m.importe < 0 && dia >= 1 && dia <= 5 && m.categoria_id && restaurantes.has(m.categoria_id) && diasViaje.has(m.fecha_operacion)) {
      m.sugerencia = { tipo: 'gasto_empleado', motivo: 'Restaurante en un día de viaje de trabajo', regla_id: null }
    }
  }

  // Traspasos entre cuentas propias: importe opuesto en otra cuenta bancaria, hasta 3 días de diferencia
  const traspasos: Propuesta['traspasos'] = []
  const usados = new Set<string>()
  const bancarias = new Set(db.cuentas.filter((c) => c.tipo === 'cuenta').map((c) => c.id))
  if (bancarias.has(cuenta_id)) {
    for (const m of nuevos) {
      if (m.tipo !== 'normal' || !ES_TRASPASO.test(m.concepto_normalizado)) continue
      const par = db.movimientos.find(
        (x) =>
          !usados.has(x.id) &&
          x.cuenta_id !== cuenta_id &&
          bancarias.has(x.cuenta_id) &&
          x.importe === -m.importe &&
          (x.tipo === 'normal' || x.tipo === 'traspaso_interno') &&
          ES_TRASPASO.test(x.concepto_normalizado) &&
          x.fecha_operacion >= sumarDias(m.fecha_operacion, -3) &&
          x.fecha_operacion <= sumarDias(m.fecha_operacion, 3),
      )
      if (par) {
        usados.add(par.id)
        m.tipo = 'traspaso_interno'
        m.categoria_id = null
        m.origen_categoria = null
        m.sugerencia = null
        traspasos.push({ nuevo: m.id, existente: par.id })
      }
    }
  }

  // Liquidación de la tarjeta: debe cuadrar con los movimientos de la tarjeta del mes anterior
  const avisos: string[] = []
  const tarjetas = new Set(db.cuentas.filter((c) => c.tipo === 'tarjeta_credito').map((c) => c.id))
  const reglaLiquidacion = db.reglas.find((r) => r.origen === 'sistema' && r.nombre === 'Liquidación de tarjeta')
  for (const m of nuevos) {
    if (!reglaLiquidacion || m.regla_id !== reglaLiquidacion.id) continue
    const mesAnterior = sumarDias(`${m.fecha_operacion.slice(0, 7)}-01`, -1).slice(0, 7)
    const deTarjeta = db.movimientos.filter((x) => tarjetas.has(x.cuenta_id) && x.fecha_operacion.startsWith(mesAnterior))
    if (!deTarjeta.length) continue
    const total = Math.round(deTarjeta.reduce((s, x) => s + x.importe, 0) * 100) / 100
    const dif = Math.round((m.importe - total) * 100) / 100
    if (Math.abs(dif) >= 0.01) {
      avisos.push(
        `La liquidación de la tarjeta del ${formatearFecha(m.fecha_operacion)} (${formatearImporte(m.importe)}) no cuadra con los movimientos de la tarjeta del mes anterior (${formatearImporte(total)}): diferencia de ${formatearImporte(dif)}.`,
      )
    }
  }
  if (lectura.ilegibles.length) avisos.push(`${lectura.ilegibles.length} filas no se han podido leer (fecha o importe no válidos): ${lectura.ilegibles.slice(0, 5).join(', ')}.`)

  // Verificación final (regla 3)
  const problemas: Propuesta['problemas'] = []
  for (const m of nuevos) {
    for (const t of [m.concepto_original, m.concepto_limpio]) {
      const h = detectarIdentificativos(t)
      if (h.length) {
        problemas.push({ fila: m.fila, texto: `Fila ${m.fila}: contiene un ${NOMBRE_TIPO[h[0].tipo]} (${h[0].muestra})` })
        break
      }
    }
  }

  const fechas = nuevos.map((m) => m.fecha_operacion).sort()
  return {
    origen: lectura.plantilla.origen,
    nombrePlantilla: lectura.plantilla.nombre,
    cuenta_id,
    nuevos,
    duplicados,
    anteriores,
    ilegibles: lectura.ilegibles,
    fecha_desde: fechas[0] ?? null,
    fecha_hasta: fechas[fechas.length - 1] ?? null,
    traspasos,
    avisos,
    problemas,
  }
}

export interface Decisiones {
  /** Sugerencias aceptadas (id del movimiento propuesto); el resto se descartan */
  aceptadas: Set<string>
  /** Categorías cambiadas en la revisión */
  categorias?: Map<string, string | null>
}

/** Confirma la importación: guarda los movimientos y la registra. Lanza ErrorDatos si algo no es válido */
export function confirmarImportacion(db: BaseDatos, p: Propuesta, decisiones: Decisiones): BaseDatos {
  if (p.problemas.length) throw new ErrorDatos(`Importación bloqueada por datos identificativos. ${p.problemas[0].texto}`)
  if (!p.nuevos.length) throw new ErrorDatos('No hay movimientos nuevos que importar')
  const importacion: Importacion = {
    id: nuevoId(),
    cuenta_id: p.cuenta_id,
    origen: p.origen,
    fecha_desde: p.fecha_desde,
    fecha_hasta: p.fecha_hasta,
    movimientos_nuevos: p.nuevos.length,
    movimientos_duplicados: p.duplicados,
    movimientos_descartados: p.anteriores,
    estado: 'confirmada',
    modificados: [],
    created_at: new Date().toISOString(),
  }

  const confirmaciones = new Map<string, number>()
  const descartes = new Map<string, number>()
  const claves = new Set(db.movimientos.map(claveMovimiento))
  const nuevos: Movimiento[] = p.nuevos.map(({ fila, sugerencia, ...m }) => {
    exigirSinIdentificativos(`Fila ${fila}`, m.concepto_original)
    exigirSinIdentificativos(`Fila ${fila}`, m.concepto_limpio)
    const mov: Movimiento = { ...m, importacion_id: importacion.id }
    if (sugerencia) {
      const aceptada = decisiones.aceptadas.has(m.id)
      if (aceptada) mov.tipo = sugerencia.tipo
      if (sugerencia.regla_id) {
        const mapa = aceptada ? confirmaciones : descartes
        mapa.set(sugerencia.regla_id, (mapa.get(sugerencia.regla_id) ?? 0) + 1)
      }
    }
    const cambio = decisiones.categorias?.get(m.id)
    if (cambio !== undefined) {
      mov.categoria_id = cambio
      mov.origen_categoria = cambio ? 'manual' : null
    }
    const k = claveMovimiento(mov)
    if (claves.has(k)) throw new ErrorDatos(`Fila ${fila}: movimiento duplicado`)
    claves.add(k)
    return mov
  })

  const pares = new Map(p.traspasos.map((t) => [t.existente, t.nuevo]))
  const movimientos = db.movimientos.map((m) => {
    if (!pares.has(m.id) || m.tipo === 'traspaso_interno') return m
    importacion.modificados.push({ id: m.id, tipo: m.tipo })
    return { ...m, tipo: 'traspaso_interno' as TipoMovimiento, categoria_id: null, origen_categoria: null }
  })

  // Cada confirmación o descarte refuerza o debilita la regla; con 3 descartes y ninguna confirmación, se desactiva
  const reglas = db.reglas.map((r) => {
    const c = confirmaciones.get(r.id) ?? 0
    const d = descartes.get(r.id) ?? 0
    if (!c && !d) return r
    const actualizada = { ...r, confirmaciones: r.confirmaciones + c, descartes: r.descartes + d }
    if (actualizada.descartes >= 3 && actualizada.confirmaciones === 0) actualizada.activa = false
    return actualizada
  })

  return { ...db, importaciones: [...db.importaciones, importacion], movimientos: [...movimientos, ...nuevos], reglas }
}

/** Deshace una importación completa: quita sus movimientos y conciliaciones y devuelve su tipo a lo que cambió */
export function deshacerImportacion(db: BaseDatos, id: string): BaseDatos {
  const imp = db.importaciones.find((i) => i.id === id)
  if (!imp) throw new ErrorDatos('Importación no encontrada')
  if (imp.estado === 'deshecha') throw new ErrorDatos('La importación ya está deshecha')
  const quitar = new Set(db.movimientos.filter((m) => m.importacion_id === id).map((m) => m.id))
  const previos = new Map(imp.modificados.map((x) => [x.id, x.tipo]))
  return {
    ...db,
    importaciones: db.importaciones.map((i) => (i.id === id ? { ...i, estado: 'deshecha' as const } : i)),
    movimientos: db.movimientos.filter((m) => !quitar.has(m.id)).map((m) => (previos.has(m.id) ? { ...m, tipo: previos.get(m.id)! } : m)),
    conciliaciones: db.conciliaciones.filter((c) => !quitar.has(c.gasto_id) && !quitar.has(c.reembolso_id)),
  }
}
