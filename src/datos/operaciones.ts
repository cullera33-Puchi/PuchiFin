/**
 * Operaciones sobre los datos: funciones puras que reciben la base de datos y devuelven una nueva.
 * Aquí viven las reglas que antes comprobaba Postgres: datos identificativos, alias únicos,
 * dos niveles de categoría, deduplicación y borrado en cascada.
 * Si una operación no es válida, lanza ErrorDatos con un mensaje para el usuario.
 */
import { reglasPredeterminadas } from '../importacion/reglas'
import { NOMBRE_TIPO, detectarIdentificativos, validarAlias } from '../lib/identificativos'
import {
  VERSION_ESQUEMA,
  type Ajustes,
  type BaseDatos,
  type Categoria,
  type Cuenta,
  type Naturaleza,
  type TipoCuenta,
} from '../lib/tipos'

export class ErrorDatos extends Error {}

export const nuevoId = (): string => crypto.randomUUID()
const ahora = () => new Date().toISOString()

/** Lanza un error si el texto contiene IBAN, cuenta, tarjeta, DNI o NIE */
export function exigirSinIdentificativos(campo: string, valor: string | null | undefined): void {
  const h = detectarIdentificativos(valor)
  if (h.length) throw new ErrorDatos(`${campo}: contiene un ${NOMBRE_TIPO[h[0].tipo]} (${h[0].muestra}). No se guarda`)
}

// ---------------------------------------------------------------------------
// Datos iniciales
// ---------------------------------------------------------------------------

/** Suscripciones con subcategoría propia (v0.10.0) */
export const PLATAFORMAS = ['Netflix', 'Disney+', 'HBO Max', 'Amazon Prime', 'Spotify', 'Claude', 'PlayStation', 'Nintendo']

const CATALOGO: [string, string, string, Naturaleza, string[]][] = [
  ['Vivienda', 'casa', '#FF9500', 'gasto', ['Hipoteca', 'Comunidad', 'IBI y tasas', 'Seguro de hogar', 'Mantenimiento y reformas']],
  ['Suministros', 'bombilla', '#F7B500', 'gasto', ['Luz', 'Agua', 'Fibra y móvil']],
  ['Alimentación', 'carrito', '#34C759', 'gasto', ['Supermercado', 'Mercado y tiendas']],
  ['Restaurantes', 'cubiertos', '#FF3B30', 'gasto', ['Restaurantes', 'Cafeterías', 'Comida rápida y a domicilio', 'Bares y copas']],
  ['Ocio', 'entrada', '#FF6482', 'gasto', ['Planes y salidas', 'Cine y espectáculos', 'Cultura', 'Deporte', 'Juegos']],
  ['Transporte', 'coche', '#007AFF', 'gasto', ['Combustible', 'Peajes', 'Aparcamiento', 'Transporte público', 'Mantenimiento del coche']],
  ['Hijos', 'bebe', '#FF2D55', 'gasto', ['Colegio', 'Extraescolares', 'Ropa', 'Cuidado']],
  ['Salud', 'salud', '#30B0C7', 'gasto', ['Farmacia', 'Seguro médico', 'Consultas']],
  ['Compras', 'bolsa', '#AF52DE', 'gasto', ['Ropa', 'Hogar', 'Tecnología', 'Regalos']],
  ['Suscripciones', 'repetir', '#5856D6', 'gasto', [...PLATAFORMAS, 'Otras plataformas', 'Software', 'Cuotas']],
  ['Viajes', 'avion', '#32ADE6', 'gasto', ['Alojamiento', 'Transporte', 'Actividades']],
  ['Seguros', 'escudo', '#8E8E93', 'gasto', ['Coche', 'Vida', 'Otros']],
  ['Comisiones e intereses', 'banco', '#636366', 'gasto', ['Comisiones bancarias', 'Intereses de tarjeta']],
  ['Impuestos', 'recibo', '#A2845E', 'gasto', ['IRPF', 'Otros']],
  ['Ingresos', 'billete', '#00C7BE', 'ingreso', ['Nómina', 'Otros ingresos']],
]

export const AJUSTES_POR_DEFECTO: Ajustes = {
  fecha_inicio: '2026-10-01',
  fecha_corte_fintonic: '2026-09-30',
  alias_terceros: [
    { alias: 'Empresa', patrones: [] },
    { alias: 'Familia', patrones: [] },
    { alias: 'Otros', patrones: [] },
  ],
  dias_aviso_reembolso: 60,
  umbral_aviso_presupuesto: 80,
  zona_casa: [],
  dias_fin_de_mes: 5,
  version_logica: null,
}

/** Primer arranque: ajustes, las cuatro cuentas por alias, el catálogo y la deuda familiar */
export function datosIniciales(): BaseDatos {
  const creada = ahora()
  const cuenta = (alias: string, entidad: string | null, tipo: TipoCuenta, orden: number): Cuenta => ({
    id: nuevoId(), alias, entidad, tipo, activa: true, orden, created_at: creada, saldo_confirmado: null,
  })
  const categorias: Categoria[] = []
  CATALOGO.forEach(([nombre, icono, color, naturaleza, subs], i) => {
    const id = nuevoId()
    categorias.push({ id, padre_id: null, nombre, icono, color, naturaleza, activa: true, orden: i + 1 })
    subs.forEach((sub, j) =>
      categorias.push({ id: nuevoId(), padre_id: id, nombre: sub, icono: null, color, naturaleza, activa: true, orden: j + 1 }),
    )
  })
  return {
    esquema: VERSION_ESQUEMA,
    ajustes: structuredClone(AJUSTES_POR_DEFECTO),
    cuentas: [
      cuenta('Cuenta principal', 'BBVA', 'cuenta', 1),
      cuenta('Cuenta 2', 'BBVA', 'cuenta', 2),
      cuenta('Tarjeta', 'BBVA', 'tarjeta_credito', 3),
      cuenta('Hipoteca', null, 'hipoteca', 4),
    ],
    categorias,
    reglas: reglasPredeterminadas(categorias, creada),
    importaciones: [],
    movimientos: [],
    conciliaciones: [],
    presupuestos: [],
    compromisos: [
      {
        id: nuevoId(),
        nombre: 'Deuda familiar',
        deuda_inicial: 0, // los importes se introducen en la app, nunca en el código
        fecha_referencia: '2026-10-01',
        interes_anual: 0,
        colchon: 0,
        base_colchon: 'saldo_conjunto',
        ventana_mes_inicio: 6,
        ventana_mes_fin: 8,
        mes_referencia: 7,
        activo: true,
        created_at: creada,
      },
    ],
    eventos_previstos: [],
  }
}

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

export interface DatosCuenta {
  alias: string
  entidad: string | null
  tipo: TipoCuenta
  activa: boolean
}

export function guardarCuenta(db: BaseDatos, datos: DatosCuenta, id?: string): BaseDatos {
  const motivo = validarAlias(datos.alias)
  if (motivo) throw new ErrorDatos(motivo)
  const alias = datos.alias.trim()
  const entidad = datos.entidad?.trim() || null
  exigirSinIdentificativos('Entidad', entidad)
  if (entidad && entidad.length > 40) throw new ErrorDatos('La entidad admite un máximo de 40 caracteres')
  if (db.cuentas.some((c) => c.id !== id && c.alias.toLowerCase() === alias.toLowerCase())) throw new ErrorDatos('Ya existe una cuenta con ese alias')
  if (id) {
    if (!db.cuentas.some((c) => c.id === id)) throw new ErrorDatos('Cuenta no encontrada')
    return { ...db, cuentas: db.cuentas.map((c) => (c.id === id ? { ...c, alias, entidad, tipo: datos.tipo, activa: datos.activa } : c)) }
  }
  const orden = Math.max(0, ...db.cuentas.map((c) => c.orden)) + 1
  return { ...db, cuentas: [...db.cuentas, { id: nuevoId(), alias, entidad, tipo: datos.tipo, activa: datos.activa, orden, created_at: ahora(), saldo_confirmado: null }] }
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

function validarNombreCategoria(db: BaseDatos, nombre: string, padre_id: string | null, id?: string): string {
  const n = nombre.trim()
  if (!n) throw new ErrorDatos('El nombre no puede estar vacío')
  if (n.length > 60) throw new ErrorDatos('El nombre admite un máximo de 60 caracteres')
  exigirSinIdentificativos('Nombre', n)
  if (db.categorias.some((c) => c.id !== id && c.padre_id === padre_id && c.nombre.toLowerCase() === n.toLowerCase()))
    throw new ErrorDatos('Ya existe una categoría con ese nombre en el mismo nivel')
  return n
}

export function crearCategoria(
  db: BaseDatos,
  datos: { nombre: string; padre_id: string | null; naturaleza?: Naturaleza; color?: string | null; icono?: string | null },
): BaseDatos {
  const padre = datos.padre_id ? db.categorias.find((c) => c.id === datos.padre_id) : undefined
  if (datos.padre_id && !padre) throw new ErrorDatos('Categoría padre no encontrada')
  if (padre?.padre_id) throw new ErrorDatos('Solo se admiten dos niveles: categoría y subcategoría')
  const nombre = validarNombreCategoria(db, datos.nombre, datos.padre_id)
  const hermanas = db.categorias.filter((c) => c.padre_id === datos.padre_id)
  const nueva: Categoria = {
    id: nuevoId(),
    padre_id: datos.padre_id,
    nombre,
    icono: padre ? null : datos.icono ?? 'etiqueta',
    color: datos.color ?? padre?.color ?? '#8E8E93',
    naturaleza: padre?.naturaleza ?? datos.naturaleza ?? 'gasto', // la subcategoría hereda la naturaleza
    activa: true,
    orden: Math.max(0, ...hermanas.map((c) => c.orden)) + 1,
  }
  return { ...db, categorias: [...db.categorias, nueva] }
}

export function actualizarCategoria(
  db: BaseDatos,
  id: string,
  cambios: Partial<Pick<Categoria, 'nombre' | 'icono' | 'color' | 'activa'>>,
): BaseDatos {
  const actual = db.categorias.find((c) => c.id === id)
  if (!actual) throw new ErrorDatos('Categoría no encontrada')
  const nombre = cambios.nombre === undefined ? actual.nombre : validarNombreCategoria(db, cambios.nombre, actual.padre_id, id)
  if (cambios.color && !/^#[0-9A-Fa-f]{6}$/.test(cambios.color)) throw new ErrorDatos('Color no válido')
  return { ...db, categorias: db.categorias.map((c) => (c.id === id ? { ...c, ...cambios, nombre } : c)) }
}

/**
 * Fusiona una categoría en otra: mueve movimientos, reglas, presupuestos (sumando importes),
 * eventos previstos y subcategorías, y borra la de origen.
 */
export function fusionarCategoria(db: BaseDatos, origen: string, destino: string): BaseDatos {
  if (origen === destino) throw new ErrorDatos('Origen y destino son la misma categoría')
  const o = db.categorias.find((c) => c.id === origen)
  const d = db.categorias.find((c) => c.id === destino)
  if (!o || !d) throw new ErrorDatos('Categoría no encontrada')
  if (d.padre_id === origen) throw new ErrorDatos('No se puede fusionar una categoría en una de sus subcategorías')

  // Subcategorías del origen: pasan al destino si es raíz y no hay una homónima; si no, se funden en la homónima o en el destino
  const subsOrigen = db.categorias.filter((c) => c.padre_id === origen)
  const reasignar = new Map<string, string>([[origen, destino]])
  const mover = new Set<string>()
  for (const s of subsOrigen) {
    const homonima = db.categorias.find((x) => x.padre_id === destino && x.nombre.toLowerCase() === s.nombre.toLowerCase())
    if (d.padre_id === null && !homonima) mover.add(s.id)
    else reasignar.set(s.id, homonima?.id ?? destino)
  }
  const nueva = (id: string | null) => (id && reasignar.has(id) ? reasignar.get(id)! : id)

  const presupuestos = new Map(db.presupuestos.map((p) => [p.id, { ...p }]))
  for (const p of presupuestos.values()) {
    const objetivo = nueva(p.categoria_id)!
    if (objetivo === p.categoria_id) continue
    const existente = [...presupuestos.values()].find((x) => x.categoria_id === objetivo)
    if (existente) {
      existente.importe_mensual = Math.round((existente.importe_mensual + p.importe_mensual) * 100) / 100
      presupuestos.delete(p.id)
    } else p.categoria_id = objetivo
  }

  return {
    ...db,
    categorias: db.categorias
      .filter((c) => !reasignar.has(c.id))
      .map((c) => (mover.has(c.id) ? { ...c, padre_id: destino, naturaleza: d.naturaleza } : c)),
    movimientos: db.movimientos.map((m) => (reasignar.has(m.categoria_id ?? '') ? { ...m, categoria_id: nueva(m.categoria_id) } : m)),
    reglas: db.reglas.map((r) => (reasignar.has(r.categoria_id ?? '') ? { ...r, categoria_id: nueva(r.categoria_id) } : r)),
    eventos_previstos: db.eventos_previstos.map((e) => (reasignar.has(e.categoria_id ?? '') ? { ...e, categoria_id: nueva(e.categoria_id) } : e)),
    presupuestos: [...presupuestos.values()],
  }
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

export function guardarAjustes(db: BaseDatos, cambios: Partial<Ajustes>): BaseDatos {
  const a = { ...db.ajustes, ...cambios }
  if (!(a.fecha_corte_fintonic < a.fecha_inicio)) throw new ErrorDatos('La fecha de corte con Fintonic debe ser anterior a la fecha de inicio')
  if (!(a.dias_aviso_reembolso > 0)) throw new ErrorDatos('Los días de aviso deben ser mayores que cero')
  if (!(a.umbral_aviso_presupuesto >= 1 && a.umbral_aviso_presupuesto <= 100)) throw new ErrorDatos('El umbral de presupuesto va de 1 a 100')
  if (!(a.dias_fin_de_mes >= 0 && a.dias_fin_de_mes <= 10)) throw new ErrorDatos('Los días de fin de mes van de 0 a 10')
  for (const t of a.alias_terceros) {
    exigirSinIdentificativos('Alias de terceros', t.alias)
    t.patrones.forEach((p) => exigirSinIdentificativos('Patrón de alias', p))
  }
  a.zona_casa.forEach((z) => exigirSinIdentificativos('Zona de casa', z))
  return { ...db, ajustes: a }
}

// ---------------------------------------------------------------------------
// Importaciones y datos de prueba
// ---------------------------------------------------------------------------

/** Anota el saldo que el usuario ve en el banco y si coincide con el de la app */
export function confirmarSaldo(db: BaseDatos, cuenta_id: string, importe: number, saldoApp: number, fecha: string): BaseDatos {
  if (!Number.isFinite(importe)) throw new ErrorDatos('Escribe el saldo que ves en el banco')
  if (!db.cuentas.some((c) => c.id === cuenta_id)) throw new ErrorDatos('Cuenta no encontrada')
  const cuadra = Math.round(importe * 100) === Math.round(saldoApp * 100)
  return { ...db, cuentas: db.cuentas.map((c) => (c.id === cuenta_id ? { ...c, saldo_confirmado: { importe, fecha, cuadra } } : c)) }
}

/** Borra movimientos sueltos (por ejemplo, duplicados) con sus conciliaciones y los descuenta de su importación */
export function borrarMovimientos(db: BaseDatos, ids: Set<string>): BaseDatos {
  const borrados = db.movimientos.filter((m) => ids.has(m.id))
  if (borrados.length !== ids.size) throw new ErrorDatos('Movimiento no encontrado')
  const porImportacion = new Map<string, number>()
  for (const m of borrados) if (m.importacion_id) porImportacion.set(m.importacion_id, (porImportacion.get(m.importacion_id) ?? 0) + 1)
  return {
    ...db,
    importaciones: db.importaciones.map((i) =>
      porImportacion.has(i.id) ? { ...i, movimientos_nuevos: Math.max(0, i.movimientos_nuevos - porImportacion.get(i.id)!) } : i,
    ),
    movimientos: db.movimientos.filter((m) => !ids.has(m.id)),
    conciliaciones: db.conciliaciones.filter((c) => !ids.has(c.gasto_id) && !ids.has(c.reembolso_id)),
  }
}

/**
 * Catálogo de la v0.10.0 sobre unos datos anteriores, sin cambiar ningún identificador (los
 * movimientos, reglas y presupuestos conservan su categoría):
 *   - «Restaurantes y ocio» pasa a «Restaurantes», con Comida rápida y a domicilio y Bares y copas.
 *   - Nueva categoría «Ocio»: se le mueven las subcategorías Ocio (que pasa a «Planes y salidas») y
 *     Cultura, y se añaden Cine y espectáculos, Deporte y Juegos.
 *   - Suscripciones: una subcategoría por plataforma; «Plataformas» pasa a «Otras plataformas».
 * Si el usuario ya cambió esos nombres, no se toca lo que no se reconoce.
 */
export function actualizarCatalogo(categorias: Categoria[]): Categoria[] {
  let cats = categorias.map((c) => ({ ...c }))
  const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const raiz = (nombre: string) => cats.find((c) => !c.padre_id && igual(c.nombre, nombre))
  const hijas = (id: string) => cats.filter((c) => c.padre_id === id)
  const anadir = (padre: Categoria, nombres: string[], alPrincipio = false) => {
    const existentes = hijas(padre.id)
    const nuevas = nombres.filter((n) => !existentes.some((c) => igual(c.nombre, n)))
    if (!nuevas.length) return
    if (alPrincipio) cats = cats.map((c) => (c.padre_id === padre.id ? { ...c, orden: c.orden + nuevas.length } : c))
    const base = alPrincipio ? 0 : Math.max(0, ...existentes.map((c) => c.orden))
    nuevas.forEach((nombre, i) =>
      cats.push({ id: nuevoId(), padre_id: padre.id, nombre, icono: null, color: padre.color, naturaleza: padre.naturaleza, activa: true, orden: base + i + 1 }),
    )
  }

  const restOcio = raiz('Restaurantes y ocio')
  if (restOcio && !raiz('Restaurantes')) {
    restOcio.nombre = 'Restaurantes'
    let ocio = raiz('Ocio')
    if (!ocio) {
      cats = cats.map((c) => (!c.padre_id && c.orden > restOcio.orden ? { ...c, orden: c.orden + 1 } : c))
      ocio = { id: nuevoId(), padre_id: null, nombre: 'Ocio', icono: 'entrada', color: '#FF6482', naturaleza: 'gasto', activa: true, orden: restOcio.orden + 1 }
      cats.push(ocio)
    }
    const destino = ocio
    cats = cats.map((c) => {
      if (c.padre_id !== restOcio.id) return c
      if (igual(c.nombre, 'Ocio')) return { ...c, padre_id: destino.id, nombre: 'Planes y salidas', color: destino.color, orden: 1 }
      if (igual(c.nombre, 'Cultura')) return { ...c, padre_id: destino.id, color: destino.color, orden: 3 }
      return c
    })
    anadir(restOcio, ['Comida rápida y a domicilio', 'Bares y copas'])
    anadir(destino, ['Cine y espectáculos', 'Deporte', 'Juegos'])
  }

  const susc = raiz('Suscripciones')
  if (susc) {
    cats = cats.map((c) => (c.padre_id === susc.id && igual(c.nombre, 'Plataformas') ? { ...c, nombre: 'Otras plataformas' } : c))
    anadir(susc, PLATAFORMAS, true)
  }
  return cats
}

/**
 * Empezar de cero para una carga limpia: se borran los movimientos, las importaciones, las
 * conciliaciones, los presupuestos y eventos previstos, y los saldos confirmados. Por defecto se
 * conservan las cuentas, las categorías, los ajustes y las reglas (las de la app siempre; las tuyas,
 * si se pide). Con «configuración inicial», todo vuelve a como el primer día.
 */
export function empezarDeCero(db: BaseDatos, opciones: { conservarReglas: boolean; configuracionInicial: boolean }): BaseDatos {
  if (opciones.configuracionInicial) return datosIniciales()
  return {
    ...db,
    importaciones: [],
    movimientos: [],
    conciliaciones: [],
    presupuestos: [],
    eventos_previstos: [],
    cuentas: db.cuentas.map((c) => ({ ...c, saldo_confirmado: null })),
    reglas: db.reglas
      .filter((r) => r.origen === 'sistema' || opciones.conservarReglas)
      .map((r) => (r.origen === 'sistema' ? { ...r, confirmaciones: 0, descartes: 0 } : r)),
  }
}

/** Borra importaciones con sus movimientos y las conciliaciones de esos movimientos */
export function borrarImportaciones(db: BaseDatos, ids: Set<string>): BaseDatos {
  const movs = new Set(db.movimientos.filter((m) => m.importacion_id && ids.has(m.importacion_id)).map((m) => m.id))
  return {
    ...db,
    importaciones: db.importaciones.filter((i) => !ids.has(i.id)),
    movimientos: db.movimientos.filter((m) => !movs.has(m.id)),
    conciliaciones: db.conciliaciones.filter((c) => !movs.has(c.gasto_id) && !movs.has(c.reembolso_id)),
  }
}

export function contarDatosPrueba(db: BaseDatos): number {
  const ids = new Set(db.importaciones.filter((i) => i.origen === 'datos_prueba').map((i) => i.id))
  return db.movimientos.filter((m) => m.importacion_id && ids.has(m.importacion_id)).length
}

export function borrarDatosPrueba(db: BaseDatos): BaseDatos {
  return borrarImportaciones(db, new Set(db.importaciones.filter((i) => i.origen === 'datos_prueba').map((i) => i.id)))
}

/** Clave de deduplicación: cuenta, fecha, importe, concepto normalizado y repetición */
export const claveMovimiento = (m: { cuenta_id: string; fecha_operacion: string; importe: number; concepto_normalizado: string; ocurrencia: number }) =>
  `${m.cuenta_id}|${m.fecha_operacion}|${m.importe}|${m.concepto_normalizado}|${m.ocurrencia}`

// ---------------------------------------------------------------------------
// Comprobación completa (al importar un archivo o restaurar una copia)
// ---------------------------------------------------------------------------

/** Devuelve la lista de problemas; vacía si la base de datos es correcta */
export function comprobarBaseDatos(db: BaseDatos): string[] {
  const problemas: string[] = []
  const texto = (lugar: string, valor: string | null | undefined) => {
    const h = detectarIdentificativos(valor)
    if (h.length) problemas.push(`${lugar}: contiene un ${NOMBRE_TIPO[h[0].tipo]} (${h[0].muestra})`)
  }

  db.cuentas.forEach((c) => {
    texto(`Cuenta «${c.alias}»`, c.alias)
    texto(`Cuenta «${c.alias}», entidad`, c.entidad)
    if (/[0-9]{6,}/.test(c.alias)) problemas.push(`Cuenta «${c.alias}»: el alias tiene una serie larga de dígitos`)
  })
  const alias = db.cuentas.map((c) => c.alias.toLowerCase())
  if (new Set(alias).size !== alias.length) problemas.push('Hay dos cuentas con el mismo alias')

  const porId = new Map(db.categorias.map((c) => [c.id, c]))
  db.categorias.forEach((c) => {
    texto(`Categoría «${c.nombre}»`, c.nombre)
    if (c.padre_id) {
      const p = porId.get(c.padre_id)
      if (!p) problemas.push(`Categoría «${c.nombre}»: su categoría padre no existe`)
      else if (p.padre_id) problemas.push(`Categoría «${c.nombre}»: más de dos niveles`)
    }
  })

  db.reglas.forEach((r) => {
    texto('Regla', r.patron)
    texto('Regla', r.nombre)
  })
  db.compromisos.forEach((c) => texto('Compromiso', c.nombre))
  db.eventos_previstos.forEach((e) => texto(`Evento previsto del ${e.fecha}`, e.concepto))
  db.ajustes.alias_terceros.forEach((a) => {
    texto('Alias de terceros', a.alias)
    a.patrones.forEach((p) => texto('Alias de terceros', p))
  })
  db.ajustes.zona_casa.forEach((z) => texto('Zona de casa', z))

  const cuentas = new Set(db.cuentas.map((c) => c.id))
  const claves = new Set<string>()
  db.movimientos.forEach((m) => {
    const lugar = `Movimiento del ${m.fecha_operacion}`
    texto(lugar, m.concepto_original)
    texto(lugar, m.concepto_limpio)
    texto(lugar, m.concepto_normalizado)
    texto(`${lugar}, nota`, m.nota)
    if (!cuentas.has(m.cuenta_id)) problemas.push(`${lugar}: su cuenta no existe`)
    if (m.categoria_id && !porId.has(m.categoria_id)) problemas.push(`${lugar}: su categoría no existe`)
    const k = claveMovimiento(m)
    if (claves.has(k)) problemas.push(`${lugar}: movimiento duplicado`)
    claves.add(k)
  })
  return problemas
}
