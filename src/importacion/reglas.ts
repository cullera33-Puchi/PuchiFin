/**
 * Reglas de categorización (apartado 5) y sugerencias (apartado 6).
 * Orden en cada importación:
 *   1. Reglas manuales (creadas por el usuario al corregir), por prioridad.
 *   2. Aprendidas: si el mismo concepto ya se categorizó a mano, se repite la categoría.
 *   3. Reglas de la app (origen «sistema»): comercios y recibos habituales.
 *   4. Sin coincidencia: sin categoría, a la bandeja.
 * Las reglas de sugerencia (gasto de empleado, reembolso, pago de deuda) nunca se aplican solas:
 * aparecen en la revisión para confirmarlas o descartarlas.
 */
import { normalizarConcepto } from '../lib/conceptos'
import type { BaseDatos, Categoria, Movimiento, Regla, TipoMovimiento } from '../lib/tipos'

interface ReglaBase {
  nombre: string
  patron: string // expresión regular sobre el concepto normalizado (minúsculas, sin acentos)
  ruta?: string // "Categoría > Subcategoría"
  tipo?: TipoMovimiento
  sugerencia?: boolean
  signo?: 'gasto' | 'ingreso'
  prioridad?: number
}

const REGLAS_BASE: ReglaBase[] = [
  { nombre: 'Liquidación de tarjeta', patron: '\\b(liquidacion|liq)\\b.*\\btarj|\\bpago\\b.*\\btarjeta (de )?credito\\b|\\bcargo\\b.*\\btarjeta\\b', tipo: 'traspaso_interno', signo: 'gasto', prioridad: 10 },
  { nombre: 'Nómina', patron: '\\bnomina\\b', ruta: 'Ingresos > Nómina', signo: 'ingreso', prioridad: 20 },
  { nombre: 'Reembolso de la empresa', patron: '^(?!.*\\bnomina\\b).*\\bempresa\\b', tipo: 'reembolso_empresa', sugerencia: true, signo: 'ingreso', prioridad: 30 },
  { nombre: 'Pago a la familia', patron: '\\b(transferencia|transf|trf|bizum)\\b.*\\bfamilia\\b', tipo: 'pago_deuda', sugerencia: true, signo: 'gasto', prioridad: 30 },
  { nombre: 'Viajes de trabajo: alojamiento', patron: '\\b(hotel|hoteles|nh|melia|ac hotel|booking|hostal|ibis)\\b', tipo: 'gasto_empleado', sugerencia: true, signo: 'gasto', prioridad: 40 },
  { nombre: 'Viajes de trabajo: transporte', patron: '\\b(renfe|ouigo|iryo|iberia|vueling|ryanair|air europa|taxi|cabify|uber|bolt|freenow)\\b', tipo: 'gasto_empleado', sugerencia: true, signo: 'gasto', prioridad: 40 },
  { nombre: 'Alojamiento', patron: '\\b(hotel|hoteles|nh|melia|ac hotel|booking|hostal|ibis|airbnb)\\b', ruta: 'Viajes > Alojamiento', signo: 'gasto' },
  { nombre: 'Transporte de viaje', patron: '\\b(renfe|ouigo|iryo|iberia|vueling|ryanair|air europa|taxi|cabify|uber|bolt|freenow)\\b', ruta: 'Viajes > Transporte', signo: 'gasto' },
  { nombre: 'Hipoteca', patron: '\\b(prestamo hipotecario|hipoteca)\\b', ruta: 'Vivienda > Hipoteca', signo: 'gasto' },
  { nombre: 'Comunidad', patron: '\\bcomunidad\\b', ruta: 'Vivienda > Comunidad', signo: 'gasto' },
  { nombre: 'IBI', patron: '\\b(ibi|impuesto bienes inmuebles|tasa basura)\\b', ruta: 'Vivienda > IBI y tasas', signo: 'gasto' },
  { nombre: 'Seguro de hogar', patron: '\\bseguro (de )?hogar\\b', ruta: 'Vivienda > Seguro de hogar', signo: 'gasto' },
  { nombre: 'Luz', patron: '\\b(energia electrica|iberdrola|endesa|naturgy|holaluz|electricidad)\\b', ruta: 'Suministros > Luz', signo: 'gasto' },
  { nombre: 'Agua', patron: '\\b(aguas?|emivasa|canal de isabel)\\b', ruta: 'Suministros > Agua', signo: 'gasto' },
  { nombre: 'Fibra y móvil', patron: '\\b(movistar|vodafone|orange|digi|o2|yoigo|fibra|telefonica)\\b', ruta: 'Suministros > Fibra y móvil', signo: 'gasto' },
  { nombre: 'Supermercado', patron: '\\b(mercadona|consum|lidl|carrefour|alcampo|eroski|aldi|dia|hipercor|supercor|caprabo|bonpreu)\\b', ruta: 'Alimentación > Supermercado', signo: 'gasto' },
  { nombre: 'Cafeterías', patron: '\\b(cafeteria|cafe|horno|starbucks|granja)\\b', ruta: 'Restaurantes y ocio > Cafeterías', signo: 'gasto', prioridad: 95 },
  { nombre: 'Mercado y tiendas', patron: '\\b(fruteria|carniceria|panaderia|mercado|pescaderia)\\b', ruta: 'Alimentación > Mercado y tiendas', signo: 'gasto' },
  { nombre: 'Restaurantes', patron: '\\b(rest|restaurante|bar|pizzeria|taberna|sushi|burger|mesón|meson|asador|casa lucio)\\b', ruta: 'Restaurantes y ocio > Restaurantes', signo: 'gasto' },
  { nombre: 'Ocio', patron: '\\b(cines?|teatro|entradas|ticketmaster|museo)\\b', ruta: 'Restaurantes y ocio > Ocio', signo: 'gasto' },
  { nombre: 'Combustible', patron: '\\b(estacion de servicio|repsol|cepsa|galp|bp|shell|gasolinera)\\b', ruta: 'Transporte > Combustible', signo: 'gasto' },
  { nombre: 'Aparcamiento', patron: '\\b(parking|aparcamiento|aparca|ora)\\b', ruta: 'Transporte > Aparcamiento', signo: 'gasto' },
  { nombre: 'Peajes', patron: '\\b(peaje|autopista|ap 7|via t)\\b', ruta: 'Transporte > Peajes', signo: 'gasto' },
  { nombre: 'Transporte público', patron: '\\b(metro|emt|metrovalencia|tmb|bus|cercanias)\\b', ruta: 'Transporte > Transporte público', signo: 'gasto' },
  { nombre: 'Colegio', patron: '\\b(colegio|escola|escuela infantil)\\b', ruta: 'Hijos > Colegio', signo: 'gasto' },
  { nombre: 'Extraescolares', patron: '\\b(escuela de musica|academia|extraescolar|conservatorio)\\b', ruta: 'Hijos > Extraescolares', signo: 'gasto' },
  { nombre: 'Farmacia', patron: '\\bfarmacia\\b', ruta: 'Salud > Farmacia', signo: 'gasto' },
  { nombre: 'Seguro médico', patron: '\\b(seguro medico|sanitas|adeslas|asisa|dkv|mapfre salud)\\b', ruta: 'Salud > Seguro médico', signo: 'gasto' },
  { nombre: 'Ropa', patron: '\\b(zara|primark|mango|h m|pull bear|massimo dutti|decathlon)\\b', ruta: 'Compras > Ropa', signo: 'gasto' },
  { nombre: 'Compras online', patron: '\\b(amazon|aliexpress|el corte ingles|ikea|leroy merlin)\\b', ruta: 'Compras > Hogar', signo: 'gasto' },
  { nombre: 'Plataformas', patron: '\\b(netflix|spotify|hbo|max|disney|prime video|apple com|youtube|dazn|movistar plus)\\b', ruta: 'Suscripciones > Plataformas', signo: 'gasto', prioridad: 90 },
  { nombre: 'Seguro del coche', patron: '\\bseguro (del )?coche\\b|\\b(linea directa|mutua madrilena)\\b', ruta: 'Seguros > Coche', signo: 'gasto' },
  { nombre: 'Seguro de vida', patron: '\\bseguro (de )?vida\\b', ruta: 'Seguros > Vida', signo: 'gasto' },
  { nombre: 'Comisiones', patron: '\\b(comision|comisiones|mantenimiento cuenta)\\b', ruta: 'Comisiones e intereses > Comisiones bancarias', signo: 'gasto' },
  { nombre: 'Intereses de tarjeta', patron: '\\bintereses\\b', ruta: 'Comisiones e intereses > Intereses de tarjeta', signo: 'gasto' },
  { nombre: 'Impuestos', patron: '\\b(aeat|hacienda|irpf|agencia tributaria)\\b', ruta: 'Impuestos > IRPF', signo: 'gasto' },
]

/** Reglas de la app, con las categorías del catálogo de este dispositivo (se omiten las que no existan) */
export function reglasPredeterminadas(categorias: Categoria[], creada = new Date().toISOString()): Regla[] {
  const porRuta = new Map<string, string>()
  for (const c of categorias) {
    const p = c.padre_id ? categorias.find((x) => x.id === c.padre_id) : undefined
    porRuta.set((p ? `${p.nombre} > ${c.nombre}` : c.nombre).toLowerCase(), c.id)
  }
  return REGLAS_BASE.flatMap((r): Regla[] => {
    const categoria_id = r.ruta ? porRuta.get(r.ruta.toLowerCase()) ?? null : null
    if (r.ruta && !categoria_id && !r.tipo) return []
    return [
      {
        id: crypto.randomUUID(),
        nombre: r.nombre,
        patron: r.patron,
        tipo_patron: 'regex',
        cuenta_id: null,
        importe_min: r.signo === 'ingreso' ? 0.01 : null,
        importe_max: r.signo === 'gasto' ? -0.01 : null,
        categoria_id,
        tipo_movimiento: r.tipo ?? null,
        es_sugerencia: !!r.sugerencia,
        prioridad: r.prioridad ?? 100,
        origen: 'sistema',
        activa: true,
        confirmaciones: 0,
        descartes: 0,
        created_at: creada,
      },
    ]
  })
}

export function coincide(r: Regla, m: Pick<Movimiento, 'concepto_normalizado' | 'cuenta_id' | 'importe'>): boolean {
  if (!r.activa) return false
  if (r.cuenta_id && r.cuenta_id !== m.cuenta_id) return false
  if (r.importe_min !== null && m.importe < r.importe_min) return false
  if (r.importe_max !== null && m.importe > r.importe_max) return false
  const c = m.concepto_normalizado
  switch (r.tipo_patron) {
    case 'regex':
      try {
        return new RegExp(r.patron, 'i').test(c)
      } catch {
        return false
      }
    case 'exacto':
      return c === normalizarConcepto(r.patron)
    case 'empieza':
      return c.startsWith(normalizarConcepto(r.patron))
    default:
      return c.includes(normalizarConcepto(r.patron))
  }
}

/** Concepto normalizado → categoría elegida a mano más recientemente */
export function categoriasAprendidas(db: BaseDatos): Map<string, string> {
  const m = new Map<string, { categoria: string; fecha: string }>()
  for (const mov of db.movimientos) {
    if (!mov.categoria_id || (mov.origen_categoria !== 'manual' && mov.origen_categoria !== 'aprendida')) continue
    const prev = m.get(mov.concepto_normalizado)
    if (!prev || mov.fecha_operacion >= prev.fecha) m.set(mov.concepto_normalizado, { categoria: mov.categoria_id, fecha: mov.fecha_operacion })
  }
  return new Map([...m].map(([k, v]) => [k, v.categoria]))
}

export interface Sugerencia {
  tipo: TipoMovimiento
  motivo: string
  regla_id: string | null
}

export interface Clasificacion {
  categoria_id: string | null
  tipo: TipoMovimiento
  regla_id: string | null
  origen_categoria: Movimiento['origen_categoria']
  sugerencia: Sugerencia | null
}

/** Clasifica un movimiento nuevo con las reglas y lo aprendido */
export function clasificar(m: Pick<Movimiento, 'concepto_normalizado' | 'cuenta_id' | 'importe'>, reglas: Regla[], aprendidas: Map<string, string>): Clasificacion {
  const ordenadas = [...reglas].filter((r) => r.activa).sort((a, b) => a.prioridad - b.prioridad)
  const res: Clasificacion = { categoria_id: null, tipo: 'normal', regla_id: null, origen_categoria: null, sugerencia: null }

  const aplicar = (r: Regla) => {
    if (r.tipo_movimiento && res.tipo === 'normal' && !res.categoria_id) res.tipo = r.tipo_movimiento
    if (r.categoria_id && !res.categoria_id) res.categoria_id = r.categoria_id
    res.regla_id ??= r.id
    if (res.categoria_id) res.origen_categoria = 'regla'
  }

  // 1. Reglas manuales
  const manual = ordenadas.find((r) => !r.es_sugerencia && r.origen !== 'sistema' && coincide(r, m))
  if (manual) aplicar(manual)
  // 2. Aprendidas
  if (!res.categoria_id && res.tipo === 'normal') {
    const aprendida = aprendidas.get(m.concepto_normalizado)
    if (aprendida) {
      res.categoria_id = aprendida
      res.origen_categoria = 'aprendida'
    }
  }
  // 3. Reglas de la app
  if (!res.categoria_id && res.tipo === 'normal') {
    const sistema = ordenadas.find((r) => !r.es_sugerencia && r.origen === 'sistema' && coincide(r, m))
    if (sistema) aplicar(sistema)
  }
  // Sugerencias: solo si el movimiento sigue siendo normal
  if (res.tipo === 'normal') {
    const s = ordenadas.find((r) => r.es_sugerencia && coincide(r, m))
    if (s && s.tipo_movimiento) res.sugerencia = { tipo: s.tipo_movimiento, motivo: s.nombre ?? 'Regla', regla_id: s.id }
  }
  return res
}
