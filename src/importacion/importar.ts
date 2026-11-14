/**
 * Importación de un Excel de BBVA (apartado 3): de las filas leídas a una propuesta revisable y,
 * al confirmar, a la base de datos. Todo ocurre en el dispositivo y el fichero original se descarta:
 * solo se guardan los movimientos ya anonimizados.
 */
import { ErrorDatos, claveMovimiento, exigirSinIdentificativos, nuevoId } from '../datos/operaciones'
import { claveComercio, normalizarConcepto } from '../lib/conceptos'
import { formatearFecha, formatearImporte } from '../lib/formato'
import { sumarDias } from '../lib/fechas'
import { finDeMes, mesSiguiente } from '../lib/imputacion'
import { detectarIdentificativos, NOMBRE_TIPO } from '../lib/identificativos'
import type { BaseDatos, Cuenta, Importacion, Movimiento, TipoMovimiento } from '../lib/tipos'
import { anonimizarConcepto, aplicarAlias, conservarDesde, enmascararNumeros } from './anonimizar'
import { cuadrarLiquidaciones } from '../lib/tarjeta'
import type { FilaBruta, Lectura } from './lector'
import { categoriasAprendidas, clasificar, type Sugerencia } from './reglas'
import { anadirA } from '../lib/agrupar'

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
  /** Filas que ya estaban guardadas (o repetidas en el fichero): no se importan */
  repetidos: { fila: number; fecha: string; concepto: string; importe: number }[]
  ilegibles: number[]
  fecha_desde: string | null
  fecha_hasta: string | null
  /** Traspasos emparejados con un movimiento ya guardado de otra cuenta propia */
  traspasos: { nuevo: string; existente: string }[]
  avisos: string[]
  /** Datos identificativos que siguen en lo que se va a guardar: bloquean la importación */
  problemas: { fila: number; texto: string }[]
  /** Movimientos de fin de mes que pasan al mes siguiente (nómina, hipoteca o lo aprendido) */
  alMesSiguiente: string[]
}

/** Concepto legible: sin números enmascarados ni separadores sueltos, con mayúscula inicial por palabra */
export function conceptoLimpio(anonimizado: string, alias: string[] = []): string {
  const limpio = anonimizado
    .replace(/(?<![A-Za-z0-9])[*X]{3,}(?:[\s-]*[*X]+)*[\s-]*\d{0,4}(?![A-Za-z0-9])/g, ' ') // números enmascarados (****1234, XXXX)
    .replace(/\b(COMPRA|PAGO)\s+(CON\s+)?(TARJ(ETA)?\.?|TJ\.?)\s+(EN\s+)?/gi, '')
    .replace(/(^|\s)N\s+(?=[A-Za-zÁÉÍÓÚÑ])/g, '$1') // «N» de la referencia de adeudo («N 2026…»), ya enmascarada
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

/**
 * Concepto completo y limpio de una fila, ya anonimizados. El nombre de una persona (titular u
 * ordenante) solo se conserva como alias, con lo que sigue desde una palabra clave
 * («ACME CONSULTING SL GASTOS» queda «Empresa GASTOS»); si no tiene alias, se quita.
 */
export function conceptosDeFila(f: FilaBruta, alias: BaseDatos['ajustes']['alias_terceros']): { original: string; limpio: string; normalizado: string } {
  const nombresAlias = alias.map((a) => a.alias)
  const terceroComoAlias = (t: string | null) => {
    if (!t) return null
    const con = aplicarAlias(t, alias)
    const a = nombresAlias.find((x) => con.includes(x))
    const resto = conservarDesde(con.slice(a ? con.indexOf(a) + a.length : 0))
    return [a, resto].filter(Boolean).join(' ') || null
  }
  const tercero = terceroComoAlias(f.tercero)
  const completo = [f.poblacion ? `${f.concepto} ${f.poblacion}` : f.concepto, f.detalle, tercero, f.operacion, f.extra].filter(Boolean).join(' - ')
  const original = anonimizarConcepto(completo, alias)
  const base = f.generico && f.detalle ? f.detalle : [f.concepto, f.detalle].filter(Boolean).join(' ')
  const limpio = conceptoLimpio(anonimizarConcepto([base, tercero].filter(Boolean).join(' '), alias), nombresAlias) || original
  return { original, limpio, normalizado: normalizarConcepto(limpio) }
}

const ES_TRASPASO = /\b(traspaso|transferencia|transf|trf|bizum)\b/

/**
 * Cuenta a la que pertenece el fichero según los saldos del banco: la que ya tiene movimientos con la
 * misma fecha, importe y saldo, o aquella cuya cadena de saldos enlaza con la del fichero (el saldo
 * anterior a la primera fila es el último guardado, o al revés). Sin saldos no se puede saber.
 */
export function cuentaPorSaldo(db: BaseDatos, lectura: Lectura): { cuenta_id: string; coincidencias: number } | null {
  const filas = lectura.filas.filter((f) => f.saldo !== null)
  if (!filas.length) return null
  const cent = (n: number) => Math.round(n * 100)
  const huellas = new Set(filas.map((f) => `${f.fecha_operacion}|${cent(f.importe)}|${cent(f.saldo!)}`))
  const antesFichero = new Set(filas.map((f) => cent(f.saldo!) - cent(f.importe)))
  const despuesFichero = new Set(filas.map((f) => cent(f.saldo!)))
  let mejor: { cuenta_id: string; coincidencias: number } | null = null
  for (const c of db.cuentas.filter((x) => x.activa && x.tipo === lectura.plantilla.tipo_cuenta)) {
    const movs = db.movimientos.filter((m) => m.cuenta_id === c.id && m.saldo !== null)
    let n = movs.filter((m) => huellas.has(`${m.fecha_operacion}|${cent(m.importe)}|${cent(m.saldo!)}`)).length
    // Enlace de cadenas: el fichero empieza donde acaba lo guardado, o acaba donde empieza
    if (!n && movs.some((m) => antesFichero.has(cent(m.saldo!)) || despuesFichero.has(cent(m.saldo!) - cent(m.importe)))) n = 0.5
    if (n > (mejor?.coincidencias ?? 0)) mejor = { cuenta_id: c.id, coincidencias: n }
  }
  return mejor
}

/**
 * Cuenta sugerida para el fichero: la que reconocen los saldos; si no, la última elegida para ese
 * tipo de fichero; si no, la primera cuenta activa del tipo (la tarjeta para un Excel de tarjeta).
 */
export function cuentaSugerida(db: BaseDatos, lectura: Lectura, ultima?: string): Cuenta | undefined {
  const activas = db.cuentas.filter((c) => c.activa && c.tipo === lectura.plantilla.tipo_cuenta).sort((a, b) => a.orden - b.orden)
  const porSaldo = cuentaPorSaldo(db, lectura)
  const reconocida = activas.find((c) => c.id === porSaldo?.cuenta_id)
  if (reconocida) return reconocida
  // Una cuenta que ya tiene saldos en las fechas del fichero y no encaja con ellos no es la del fichero
  const posibles = activas.filter((c) => !descartadaPorSaldo(db, lectura, c.id))
  const lista = posibles.length ? posibles : activas
  return lista.find((c) => c.id === ultima) ?? lista[0]
}

/** La cuenta tiene movimientos con saldo en las fechas del fichero, pero ninguno coincide: el fichero es de otra */
export function descartadaPorSaldo(db: BaseDatos, lectura: Lectura, cuenta_id: string): boolean {
  const filas = lectura.filas.filter((f) => f.saldo !== null)
  if (!filas.length) return false
  const fechas = filas.map((f) => f.fecha_operacion).sort()
  const desde = fechas[0]
  const hasta = fechas[fechas.length - 1]
  const guardados = db.movimientos.filter((m) => m.cuenta_id === cuenta_id && m.saldo !== null && m.fecha_operacion >= desde && m.fecha_operacion <= hasta)
  if (!guardados.length) return false
  const cent = (n: number) => Math.round(n * 100)
  const huellas = new Set(filas.map((f) => `${f.fecha_operacion}|${cent(f.importe)}|${cent(f.saldo!)}`))
  return !guardados.some((m) => huellas.has(`${m.fecha_operacion}|${cent(m.importe)}|${cent(m.saldo!)}`))
}

export function proponer(db: BaseDatos, lectura: Lectura, cuenta_id: string): Propuesta {
  const cuenta = db.cuentas.find((c) => c.id === cuenta_id)
  if (!cuenta) throw new ErrorDatos('Elige la cuenta a la que pertenece el fichero')
  const alias = db.ajustes.alias_terceros
  const aprendidas = categoriasAprendidas(db)
  const creado = new Date().toISOString()

  let duplicados = 0
  const repetidos: Propuesta['repetidos'] = []
  const nuevos: MovimientoPropuesto[] = []
  const filasOrdenadas = [...lectura.filas].sort((a, b) => a.fecha_operacion.localeCompare(b.fecha_operacion) || b.numero - a.numero)
  // Entra todo lo que trae el fichero, sin fecha de inicio
  const filas = filasOrdenadas.map((f) => ({ f, ...conceptosDeFila(f, alias) }))

  // Deduplicación contra lo ya guardado en esta cuenta, emparejando uno a uno (dos cafés iguales el
  // mismo día son dos movimientos). Primero por el saldo del banco tras el movimiento, que no depende
  // de cómo se limpie el concepto; después, por concepto, para lo que no trae saldo (tarjeta).
  const guardados = new Map<string, Movimiento[]>()
  const ocurrencias = new Map<string, number>()
  // Los datos de prueba no cuentan como ya importados: si no, una fila real igual se descartaría
  const prueba = new Set(db.importaciones.filter((i) => i.origen === 'datos_prueba').map((i) => i.id))
  for (const m of db.movimientos) {
    if (m.cuenta_id !== cuenta_id || (m.importacion_id && prueba.has(m.importacion_id))) continue
    const k = `${m.fecha_operacion}|${m.importe}`
    anadirA(guardados, k, m)
    const kc = `${k}|${m.concepto_normalizado}`
    ocurrencias.set(kc, Math.max(ocurrencias.get(kc) ?? 0, m.ocurrencia))
  }
  const usadosDedup = new Set<string>()
  const yaGuardada = new Set<(typeof filas)[number]>()
  const emparejar = (x: (typeof filas)[number], vale: (m: Movimiento) => boolean) => {
    const m = (guardados.get(`${x.f.fecha_operacion}|${x.f.importe}`) ?? []).find((m) => !usadosDedup.has(m.id) && vale(m))
    if (!m) return
    usadosDedup.add(m.id)
    yaGuardada.add(x)
  }
  for (const x of filas) if (x.f.saldo !== null) emparejar(x, (m) => m.saldo === x.f.saldo)
  for (const x of filas) if (!yaGuardada.has(x)) emparejar(x, (m) => m.concepto_normalizado === x.normalizado)
  // Filas repetidas dentro del propio fichero (por ejemplo, al pegar dos veces lo mismo): con el mismo saldo son la misma
  const vistasFichero = new Set<string>()
  for (const x of filas) {
    if (x.f.saldo === null || yaGuardada.has(x)) continue
    const k = `${x.f.fecha_operacion}|${x.f.importe}|${x.f.saldo}|${x.normalizado}`
    if (vistasFichero.has(k)) yaGuardada.add(x)
    vistasFichero.add(k)
  }

  for (const x of filas) {
    const { f, original, limpio, normalizado } = x
    if (yaGuardada.has(x)) {
      duplicados++
      repetidos.push({ fila: f.numero, fecha: f.fecha_operacion, concepto: limpio, importe: f.importe })
      continue
    }
    const kc = `${f.fecha_operacion}|${f.importe}|${normalizado}`
    const ocurrencia = (ocurrencias.get(kc) ?? 0) + 1
    ocurrencias.set(kc, ocurrencia)
    const c = clasificar({ texto: normalizarConcepto(original), clave: claveComercio(limpio), cuenta_id, importe: f.importe }, db.reglas, aprendidas)
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
      mes_imputacion: c.mes_siguiente && finDeMes(f.fecha_operacion, db.ajustes.dias_fin_de_mes) ? mesSiguiente(f.fecha_operacion) : null,
      poblacion: f.poblacion ? enmascararNumeros(f.poblacion) : null,
      revisado_empleado: false,
      created_at: creado,
      sugerencia: c.sugerencia,
    })
  }

  // Traspasos entre cuentas propias: importe opuesto en otra cuenta bancaria, hasta 3 días de diferencia
  const traspasos: Propuesta['traspasos'] = []
  const usados = new Set<string>()
  const bancarias = new Set(db.cuentas.filter((c) => c.tipo === 'cuenta').map((c) => c.id))
  if (bancarias.has(cuenta_id)) {
    for (const m of nuevos) {
      if ((m.tipo !== 'normal' && m.tipo !== 'traspaso_interno') || !ES_TRASPASO.test(m.concepto_normalizado)) continue
      const par = db.movimientos.find(
        (x) =>
          !usados.has(x.id) &&
          x.cuenta_id !== cuenta_id &&
          bancarias.has(x.cuenta_id) &&
          x.importe === -m.importe &&
          // Lo que categorizaste a mano no se toca: no se empareja
          !x.tipo_manual &&
          ((x.tipo === 'normal' && x.origen_categoria !== 'manual') || x.tipo === 'traspaso_interno') &&
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

  // Liquidación de la tarjeta: cada cargo en la cuenta debe cuadrar con las compras de su periodo de
  // liquidación. Se comprueban los cargos que trae este fichero y, al importar la tarjeta, los de su periodo
  const avisos: string[] = []
  const esTarjeta = cuenta.tipo === 'tarjeta_credito'
  const nuevosIds = new Set(nuevos.map((m) => m.id))
  const desdeTarjeta = esTarjeta && nuevos.length ? nuevos.reduce((min, m) => (m.fecha_operacion < min ? m.fecha_operacion : min), nuevos[0].fecha_operacion) : null
  for (const c of cuadrarLiquidaciones(db, nuevos)) {
    const propia = nuevosIds.has(c.movimiento.id)
    const afectada = desdeTarjeta !== null && c.movimiento.fecha_operacion > desdeTarjeta
    if (!propia && !afectada) continue
    const cargo = `La liquidación de la tarjeta del ${formatearFecha(c.movimiento.fecha_operacion)} (${formatearImporte(c.movimiento.importe)})`
    if (c.estado === 'cuadra') avisos.push(`${cargo} cuadra con las compras de la tarjeta del ${formatearFecha(c.desde!)} al ${formatearFecha(c.hasta!)}.`)
    else if (c.estado === 'no_cuadra')
      avisos.push(`${cargo} no cuadra con las compras de la tarjeta: con las del mes anterior hay una diferencia de ${formatearImporte(c.diferencia)}. Revisa si falta importar algún tramo de la tarjeta.`)
    else if (c.estado === 'sin_tarjeta' && propia) avisos.push(`${cargo}: importa la tarjeta para comprobar que cuadra con sus compras.`)
  }
  const otra = cuentaPorSaldo(db, lectura)
  if (otra && otra.cuenta_id !== cuenta_id) {
    const nombre = db.cuentas.find((c) => c.id === otra.cuenta_id)?.alias
    avisos.push(`Por los saldos, este fichero parece de ${nombre}, no de ${cuenta.alias}. Revisa la cuenta antes de importar.`)
  } else if (descartadaPorSaldo(db, lectura, cuenta_id)) {
    avisos.push(`Los saldos de este fichero no encajan con lo ya guardado en ${cuenta.alias} en esas fechas. ¿Es de otra cuenta?`)
  }
  if (lectura.ilegibles.length) avisos.push(`${lectura.ilegibles.length} filas no se han podido leer (fecha o importe no válidos): ${lectura.ilegibles.slice(0, 5).join(', ')}.`)

  // Verificación final (regla 3)
  const problemas: Propuesta['problemas'] = []
  for (const m of nuevos) {
    for (const t of [m.concepto_original, m.concepto_limpio, m.poblacion]) {
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
    repetidos,
    ilegibles: lectura.ilegibles,
    fecha_desde: fechas[0] ?? null,
    fecha_hasta: fechas[fechas.length - 1] ?? null,
    traspasos,
    avisos,
    problemas,
    alMesSiguiente: nuevos.filter((m) => m.mes_imputacion).map((m) => m.id),
  }
}

export interface Decisiones {
  /** Sugerencias aceptadas (id del movimiento propuesto); el resto se descartan */
  aceptadas: Set<string>
  /** Categorías cambiadas en la revisión */
  categorias?: Map<string, string | null>
  /** Paso al mes siguiente cambiado en la revisión (true: cuenta en el mes siguiente) */
  mesSiguiente?: Map<string, boolean>
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
    movimientos_descartados: 0,
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
    const imputar = decisiones.mesSiguiente?.get(m.id)
    if (imputar !== undefined) mov.mes_imputacion = imputar ? mesSiguiente(m.fecha_operacion) : null
    if (sugerencia) {
      const aceptada = decisiones.aceptadas.has(m.id)
      // Solo es un descarte lo que venía aceptado (confianza alta) y se desactivó
      const descartada = !aceptada && sugerencia.confianza >= 0.75
      if (aceptada) mov.tipo = sugerencia.tipo
      if (sugerencia.regla_id && (aceptada || descartada)) {
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
    importacion.modificados.push({ id: m.id, tipo: m.tipo, categoria_id: m.categoria_id, origen_categoria: m.origen_categoria })
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

/** Deshace una importación completa: quita sus movimientos y devuelve su tipo a lo que cambió */
export function deshacerImportacion(db: BaseDatos, id: string): BaseDatos {
  const imp = db.importaciones.find((i) => i.id === id)
  if (!imp) throw new ErrorDatos('Importación no encontrada')
  if (imp.estado === 'deshecha') throw new ErrorDatos('La importación ya está deshecha')
  // Una importación posterior de la misma cuenta que se solapa en fechas se deduplicó contra esta:
  // deshacer esta dejaría un hueco. Primero hay que deshacer la posterior
  const posicion = db.importaciones.indexOf(imp)
  const posterior = db.importaciones.find(
    (i, n) =>
      n > posicion &&
      i.estado === 'confirmada' &&
      i.origen !== 'datos_prueba' &&
      i.cuenta_id === imp.cuenta_id &&
      (i.fecha_desde ?? '') <= (imp.fecha_hasta ?? '9999') &&
      (i.fecha_hasta ?? '9999') >= (imp.fecha_desde ?? ''),
  )
  if (posterior) throw new ErrorDatos('Hay una importación posterior de esta cuenta con las mismas fechas. Deshaz antes esa')
  const quitar = new Set(db.movimientos.filter((m) => m.importacion_id === id).map((m) => m.id))
  const previos = new Map(imp.modificados.map((x) => [x.id, x]))
  return {
    ...db,
    importaciones: db.importaciones.map((i) => (i.id === id ? { ...i, estado: 'deshecha' as const } : i)),
    movimientos: db.movimientos
      .filter((m) => !quitar.has(m.id))
      .map((m) => {
        const p = previos.get(m.id)
        if (!p) return m
        // Vuelve a como estaba: tipo y, si se guardó, la categoría que tenía
        return p.categoria_id === undefined ? { ...m, tipo: p.tipo } : { ...m, tipo: p.tipo, categoria_id: p.categoria_id, origen_categoria: p.origen_categoria ?? null }
      }),
    conciliaciones: db.conciliaciones.filter((c) => !quitar.has(c.gasto_id) && !quitar.has(c.reembolso_id)),
  }
}
