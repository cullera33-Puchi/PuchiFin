/**
 * Archivo de exportación: un JSON con todos los datos. Exportado en el iPhone e importado en el
 * ordenador (o al revés), deja todo exactamente igual: mismos identificadores, categorías,
 * movimientos, conciliaciones y ajustes. Es también el formato de las copias de seguridad.
 */
import { APP_VERSION } from '../lib/version'
import { VERSION_ESQUEMA, type BaseDatos } from '../lib/tipos'
import { reglasPredeterminadas } from '../importacion/reglas'
import { AJUSTES_POR_DEFECTO, ErrorDatos, actualizarCatalogo, comprobarBaseDatos } from './operaciones'

export const FORMATO_ARCHIVO = 1

export interface ArchivoPuchiFin {
  app: 'puchifin'
  formato: number
  version_app: string
  exportado: string
  datos: BaseDatos
}

const LISTAS = ['cuentas', 'categorias', 'reglas', 'importaciones', 'movimientos', 'conciliaciones', 'presupuestos', 'compromisos', 'eventos_previstos'] as const

export function crearArchivo(datos: BaseDatos, exportado = new Date().toISOString()): ArchivoPuchiFin {
  return { app: 'puchifin', formato: FORMATO_ARCHIVO, version_app: APP_VERSION, exportado, datos }
}

export function serializar(datos: BaseDatos): string {
  return JSON.stringify(crearArchivo(datos), null, 1)
}

/**
 * Lee y comprueba un archivo. Lanza ErrorDatos con el motivo si no es válido.
 * Si el esquema es anterior, se adapta al actual (migraciones de los datos locales).
 */
export function leerArchivo(texto: string): ArchivoPuchiFin {
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    throw new ErrorDatos('El archivo no es un JSON válido')
  }
  return validarArchivo(json)
}

export function validarArchivo(json: unknown): ArchivoPuchiFin {
  const a = json as Partial<ArchivoPuchiFin> | null
  if (!a || typeof a !== 'object' || a.app !== 'puchifin' || !a.datos || typeof a.datos !== 'object') {
    throw new ErrorDatos('El archivo no es una copia de PuchiFin')
  }
  const d = a.datos as Partial<BaseDatos>
  if ((d.esquema ?? 0) > VERSION_ESQUEMA) throw new ErrorDatos('El archivo es de una versión más reciente de la app. Actualiza antes de importarlo')
  for (const l of LISTAS) {
    if (d[l] !== undefined && !Array.isArray(d[l])) throw new ErrorDatos(`Archivo dañado: ${l} no es una lista`)
  }
  const datos = migrar(d)
  const problemas = comprobarBaseDatos(datos)
  if (problemas.length) {
    throw new ErrorDatos(`El archivo no se puede importar: ${problemas.slice(0, 3).join('; ')}${problemas.length > 3 ? ` y ${problemas.length - 3} más` : ''}`)
  }
  return { app: 'puchifin', formato: a.formato ?? FORMATO_ARCHIVO, version_app: a.version_app ?? '?', exportado: a.exportado ?? '', datos }
}

/** Completa lo que falte y adapta esquemas anteriores al actual */
export function migrar(d: Partial<BaseDatos>): BaseDatos {
  const datos = {
    esquema: VERSION_ESQUEMA,
    ajustes: { ...structuredClone(AJUSTES_POR_DEFECTO), ...(d.ajustes ?? {}) },
    cuentas: d.cuentas ?? [],
    categorias: d.categorias ?? [],
    reglas: d.reglas ?? [],
    importaciones: d.importaciones ?? [],
    movimientos: d.movimientos ?? [],
    conciliaciones: d.conciliaciones ?? [],
    presupuestos: d.presupuestos ?? [],
    compromisos: d.compromisos ?? [],
    eventos_previstos: d.eventos_previstos ?? [],
  }
  const desde = d.esquema ?? 1
  // Esquema 2 (v0.5.0): importaciones con «modificados» y reglas de la app
  if (desde < 2) {
    datos.importaciones = datos.importaciones.map((i) => ({ ...i, modificados: i.modificados ?? [] }))
    if (!datos.reglas.some((r) => r.origen === 'sistema')) datos.reglas = [...datos.reglas, ...reglasPredeterminadas(datos.categorias)]
  }
  // Esquema 3 (v0.6.0): mes de imputación, población y revisión de empleado en los movimientos;
  // reglas con «mes siguiente» (nómina e hipoteca); días de fin de mes en los ajustes
  if (desde < 3) {
    datos.movimientos = datos.movimientos.map((m) => ({ ...m, mes_imputacion: m.mes_imputacion ?? null, poblacion: m.poblacion ?? null, revisado_empleado: m.revisado_empleado ?? false }))
    datos.reglas = datos.reglas.map((r) => ({ ...r, mes_siguiente: r.mes_siguiente ?? (r.origen === 'sistema' && (r.nombre === 'Nómina' || r.nombre === 'Hipoteca')) }))
    datos.ajustes = { ...datos.ajustes, dias_fin_de_mes: datos.ajustes.dias_fin_de_mes ?? 5 }
  }
  // Esquema 4 (v0.7.0): saldo confirmado con el banco en cada cuenta
  // Esquema 6 (v0.10.0): Restaurantes y Ocio por separado, suscripciones por plataforma (mismos identificadores)
  // Esquema 9 (v0.14.1): cuadre_confirmado opcional en el movimiento (sin dato, no confirmado); nada que adaptar
  // Esquema 8 (v0.14.0): sin fecha de inicio ni corte con Fintonic; entra todo lo que traen los Excel
  if (desde < 8) {
    const { fecha_inicio: _i, fecha_corte_fintonic: _f, ...resto } = datos.ajustes as typeof datos.ajustes & { fecha_inicio?: string; fecha_corte_fintonic?: string }
    datos.ajustes = resto
  }
  // Esquema 7 (v0.13.0): taxis, IBI y tasas en Impuestos, Cuidado personal, Mascotas, Formación y Efectivo
  if (desde < 7) datos.categorias = actualizarCatalogo(datos.categorias)
  // Esquema 5 (v0.8.0): versión de la lógica aplicada a lo pendiente (null: se aplica al arrancar)
  if (desde < 5) datos.ajustes = { ...datos.ajustes, version_logica: datos.ajustes.version_logica ?? null }
  // Esquema 11 (v0.24.0): nóminas previstas en los ajustes; sin ellas, lista vacía (la ponen los valores por defecto)
  // Esquema 10 (v0.23.0): el colchón de la deuda va sobre una cuenta, la de ahorro (Cuenta 2 o la segunda cuenta)
  if (desde < 10) {
    const bancarias = datos.cuentas.filter((c) => c.tipo === 'cuenta').sort((a, b) => a.orden - b.orden)
    const ahorro = bancarias.find((c) => c.alias.trim().toLowerCase() === 'cuenta 2') ?? bancarias[1] ?? bancarias[0]
    datos.compromisos = datos.compromisos.map((c) =>
      c.cuenta_colchon_id !== undefined ? c : { ...c, base_colchon: 'cuenta' as const, cuenta_colchon_id: ahorro?.id ?? null },
    )
  }
  if (desde < 4) datos.cuentas = datos.cuentas.map((c) => ({ ...c, saldo_confirmado: c.saldo_confirmado ?? null }))
  return datos
}

export function resumenArchivo(a: ArchivoPuchiFin): { movimientos: number; cuentas: number; categorias: number; reglas: number } {
  return { movimientos: a.datos.movimientos.length, cuentas: a.datos.cuentas.length, categorias: a.datos.categorias.length, reglas: a.datos.reglas.length }
}
