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
import { claveComercio, normalizarConcepto, primeraPalabra } from '../lib/conceptos'
import type { BaseDatos, Categoria, Movimiento, Regla, TipoMovimiento } from '../lib/tipos'

interface ReglaBase {
  nombre: string
  patron: string // expresión regular sobre el concepto normalizado (minúsculas, sin acentos)
  ruta?: string // "Categoría > Subcategoría"
  tipo?: TipoMovimiento
  sugerencia?: boolean
  signo?: 'gasto' | 'ingreso'
  prioridad?: number
  /** A fin de mes, cuenta en el mes siguiente */
  mesSiguiente?: boolean
}

const REGLAS_BASE: ReglaBase[] = [
  { nombre: 'Liquidación de tarjeta', patron: '\\b(liquidacion|liq)\\b.*\\btarj|\\bpago\\b.*\\btarjeta (de )?credito\\b|\\bcargo\\b.*\\btarjeta\\b', tipo: 'traspaso_interno', signo: 'gasto', prioridad: 10 },
  { nombre: 'Abono de la liquidación en la tarjeta', patron: '\\b(liquidacion|liq)\\b.*\\btarj|\\babono\\b.*\\bliquidacion\\b', tipo: 'traspaso_interno', signo: 'ingreso', prioridad: 10 },
  { nombre: 'Traspaso entre cuentas', patron: '^traspaso\\b|\\btraspaso (a|de|desde) (cuenta|cta)\\b', tipo: 'traspaso_interno', prioridad: 15 },
  { nombre: 'Nómina', patron: '\\b(nomina|pension)\\b', ruta: 'Ingresos > Nómina', signo: 'ingreso', prioridad: 20, mesSiguiente: true },
  { nombre: 'Reembolso de la empresa', patron: '^(?!.*\\bnomina\\b).*\\bempresa\\b', tipo: 'reembolso_empresa', sugerencia: true, signo: 'ingreso', prioridad: 30 },
  { nombre: 'Pago a la familia', patron: '\\b(transferencia|transf|trf|bizum)\\b.*\\bfamilia\\b', tipo: 'pago_deuda', sugerencia: true, signo: 'gasto', prioridad: 30 },
  { nombre: 'Viajes de trabajo: alojamiento', patron: '\\b(hotel|hoteles|nh|melia|ac hotel|booking|hostal|ibis)\\b', tipo: 'gasto_empleado', sugerencia: true, signo: 'gasto', prioridad: 40 },
  { nombre: 'Viajes de trabajo: transporte', patron: '\\b(renfe|ouigo|iryo|iberia|vueling|ryanair|air europa|taxi|cabify|uber|bolt|freenow)\\b', tipo: 'gasto_empleado', sugerencia: true, signo: 'gasto', prioridad: 40 },
  { nombre: 'Alojamiento', patron: '\\b(hotel|hoteles|nh|melia|ac hotel|booking|hostal|ibis|airbnb)\\b', ruta: 'Viajes > Alojamiento', signo: 'gasto' },
  { nombre: 'Transporte de viaje', patron: '\\b(renfe|ouigo|iryo|iberia|vueling|ryanair|air europa|taxi|cabify|uber|bolt|freenow)\\b', ruta: 'Viajes > Transporte', signo: 'gasto' },
  { nombre: 'Hipoteca', patron: '\\b(prestamo hipotecario|hipoteca|prestamo)\\b', ruta: 'Vivienda > Hipoteca', signo: 'gasto', mesSiguiente: true },
  { nombre: 'Comunidad', patron: '\\bcomunidad\\b', ruta: 'Vivienda > Comunidad', signo: 'gasto' },
  { nombre: 'IBI', patron: '\\b(ibi|impuesto bienes inmuebles|tasa basura)\\b', ruta: 'Vivienda > IBI y tasas', signo: 'gasto' },
  { nombre: 'Seguro de hogar', patron: '\\bseguro (de )?hogar\\b', ruta: 'Vivienda > Seguro de hogar', signo: 'gasto' },
  { nombre: 'Luz', patron: '\\b(energia electrica|iberdrola|endesa|naturgy|holaluz|electricidad)\\b', ruta: 'Suministros > Luz', signo: 'gasto' },
  { nombre: 'Agua', patron: '\\b(aguas?|emivasa|canal de isabel)\\b', ruta: 'Suministros > Agua', signo: 'gasto' },
  { nombre: 'Fibra y móvil', patron: '\\b(movistar|vodafone|orange|digi|o2|yoigo|fibra|telefonica)\\b', ruta: 'Suministros > Fibra y móvil', signo: 'gasto' },
  { nombre: 'Supermercado', patron: '\\b(mercadona|consum|lidl|carrefour|alcampo|eroski|aldi|dia|hipercor|supercor|caprabo|bonpreu|condis|bonarea|ametller|esclat|sorli|spar|coviran|keisy|charter|plusfresc|masymas)\\b', ruta: 'Alimentación > Supermercado', signo: 'gasto' },
  { nombre: 'Cafeterías', patron: '\\b(cafeteria|cafe|cafes|horno|forn|starbucks|granja|xurreria|pastisseria|pasteleria)\\b', ruta: 'Restaurantes y ocio > Cafeterías', signo: 'gasto', prioridad: 95 },
  { nombre: 'Mercado y tiendas', patron: '\\b(fruteria|fruiteria|carniceria|carnisseria|panaderia|mercado|mercat|pescaderia|peixateria|xarcuteria)\\b', ruta: 'Alimentación > Mercado y tiendas', signo: 'gasto' },
  { nombre: 'Restaurantes', patron: '\\b(rest|restaurante|restaurant|bar|pizzeria|taberna|sushi|burger|meson|asador|casa lucio|braseria|tapes|tapas|cerveseria|cerveceria)\\b', ruta: 'Restaurantes y ocio > Restaurantes', signo: 'gasto' },
  { nombre: 'Ocio', patron: '\\b(cines?|teatro|teatre|entradas|entrades|ticketmaster|museo|museu|concierto|concert)\\b', ruta: 'Restaurantes y ocio > Ocio', signo: 'gasto' },
  { nombre: 'Combustible', patron: '\\b(estacion de servicio|repsol|cepsa|galp|bp|shell|gasolinera)\\b', ruta: 'Transporte > Combustible', signo: 'gasto' },
  { nombre: 'Aparcamiento', patron: '\\b(parking|aparcamiento|aparca|ora)\\b', ruta: 'Transporte > Aparcamiento', signo: 'gasto' },
  { nombre: 'Peajes', patron: '\\b(peaje|autopista|ap 7|via t)\\b', ruta: 'Transporte > Peajes', signo: 'gasto' },
  { nombre: 'Transporte público', patron: '\\b(metro|emt|metrovalencia|tmb|bus|cercanias)\\b', ruta: 'Transporte > Transporte público', signo: 'gasto' },
  { nombre: 'Librerías', patron: '\\b(libreria|llibreria|casa del libro|abacus)\\b', ruta: 'Restaurantes y ocio > Cultura', signo: 'gasto' },
  { nombre: 'Colegio', patron: '\\b(colegio|escola|escuela infantil)\\b', ruta: 'Hijos > Colegio', signo: 'gasto' },
  { nombre: 'Extraescolares', patron: '\\b(escuela de musica|academia|extraescolar|conservatorio)\\b', ruta: 'Hijos > Extraescolares', signo: 'gasto' },
  { nombre: 'Farmacia', patron: '\\bfarmacia\\b', ruta: 'Salud > Farmacia', signo: 'gasto' },
  { nombre: 'Seguro médico', patron: '\\b(seguro medico|sanitas|adeslas|asisa|dkv|mapfre salud)\\b', ruta: 'Salud > Seguro médico', signo: 'gasto' },
  { nombre: 'Ropa', patron: '\\b(zara|primark|mango|h m|pull bear|massimo dutti|decathlon|zeeman|tezenis|calzedonia|intimissimi|lefties|stradivarius|bershka|oysho|kiabi|springfield|cortefiel)\\b', ruta: 'Compras > Ropa', signo: 'gasto' },
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
        mes_siguiente: !!r.mesSiguiente,
        created_at: creada,
      },
    ]
  })
}

/** Lo que se compara con las reglas: el texto completo normalizado y la clave del comercio */
export interface TextoRegla {
  texto: string
  clave: string
  cuenta_id: string
  importe: number
}

export function coincide(r: Regla, m: TextoRegla): boolean {
  if (!r.activa) return false
  if (r.cuenta_id && r.cuenta_id !== m.cuenta_id) return false
  if (r.importe_min !== null && m.importe < r.importe_min) return false
  if (r.importe_max !== null && m.importe > r.importe_max) return false
  switch (r.tipo_patron) {
    case 'regex':
      try {
        return new RegExp(r.patron, 'i').test(m.texto)
      } catch {
        return false
      }
    case 'exacto': {
      const p = normalizarConcepto(r.patron)
      return m.clave === p || m.texto === p
    }
    case 'empieza':
      return m.clave.startsWith(normalizarConcepto(r.patron)) || m.texto.startsWith(normalizarConcepto(r.patron))
    default:
      return m.texto.includes(normalizarConcepto(r.patron))
  }
}

export interface Aprendidas {
  /** Clave del comercio → categoría elegida a mano más recientemente */
  porClave: Map<string, string>
  /** Primera palabra del comercio → categoría, solo si todas sus claves coinciden */
  porPalabra: Map<string, string>
  /** Comercios que se han pasado a mano al mes siguiente */
  mesSiguiente: Set<string>
}

/** Lo aprendido de las correcciones a mano, en cualquier cuenta */
export function categoriasAprendidas(db: BaseDatos): Aprendidas {
  const m = new Map<string, { categoria: string; fecha: string }>()
  const mesSiguiente = new Set<string>()
  for (const mov of db.movimientos) {
    const clave = claveComercio(mov.concepto_limpio)
    if (!clave) continue
    if (mov.mes_imputacion && mov.mes_imputacion > mov.fecha_operacion.slice(0, 7)) mesSiguiente.add(clave)
    if (!mov.categoria_id || (mov.origen_categoria !== 'manual' && mov.origen_categoria !== 'aprendida')) continue
    const prev = m.get(clave)
    if (!prev || mov.fecha_operacion >= prev.fecha) m.set(clave, { categoria: mov.categoria_id, fecha: mov.fecha_operacion })
  }
  const porClave = new Map([...m].map(([k, v]) => [k, v.categoria]))
  const palabras = new Map<string, Set<string>>()
  for (const [k, c] of porClave) {
    const p = primeraPalabra(k)
    if (p) palabras.set(p, (palabras.get(p) ?? new Set()).add(c))
  }
  const porPalabra = new Map([...palabras].filter(([, cs]) => cs.size === 1).map(([p, cs]) => [p, [...cs][0]]))
  return { porClave, porPalabra, mesSiguiente }
}

export interface Sugerencia {
  tipo: TipoMovimiento
  motivo: string
  regla_id: string | null
  /** De 0 a 1. En la revisión, las de 0,75 o más vienen aceptadas y el resto sin aceptar */
  confianza: number
}

export interface Clasificacion {
  categoria_id: string | null
  tipo: TipoMovimiento
  regla_id: string | null
  origen_categoria: Movimiento['origen_categoria']
  sugerencia: Sugerencia | null
  /** La regla o lo aprendido dicen que, a fin de mes, cuenta en el mes siguiente */
  mes_siguiente: boolean
}

const VACIAS: Aprendidas = { porClave: new Map(), porPalabra: new Map(), mesSiguiente: new Set() }

/** Clasifica un movimiento nuevo con las reglas y lo aprendido */
export function clasificar(m: TextoRegla, reglas: Regla[], aprendidas: Aprendidas = VACIAS): Clasificacion {
  const ordenadas = [...reglas].filter((r) => r.activa).sort((a, b) => a.prioridad - b.prioridad)
  const res: Clasificacion = { categoria_id: null, tipo: 'normal', regla_id: null, origen_categoria: null, sugerencia: null, mes_siguiente: aprendidas.mesSiguiente.has(m.clave) }

  const aplicar = (r: Regla) => {
    if (r.tipo_movimiento && res.tipo === 'normal' && !res.categoria_id) res.tipo = r.tipo_movimiento
    if (r.categoria_id && !res.categoria_id) res.categoria_id = r.categoria_id
    res.regla_id ??= r.id
    if (res.categoria_id) res.origen_categoria = 'regla'
    if (r.mes_siguiente) res.mes_siguiente = true
  }

  // 1. Reglas manuales
  const manual = ordenadas.find((r) => !r.es_sugerencia && r.origen !== 'sistema' && coincide(r, m))
  if (manual) aplicar(manual)
  // 2. Reglas de la app que cambian el tipo (traspasos, liquidación de la tarjeta): mandan sobre lo aprendido
  if (!manual) {
    const tipo = ordenadas.find((r) => !r.es_sugerencia && r.origen === 'sistema' && r.tipo_movimiento && !r.categoria_id && coincide(r, m))
    if (tipo) aplicar(tipo)
  }
  // 3. Aprendidas: el mismo comercio o, si no, uno que empieza igual
  if (!res.categoria_id && res.tipo === 'normal') {
    const p = primeraPalabra(m.clave)
    const aprendida = aprendidas.porClave.get(m.clave) ?? (p ? aprendidas.porPalabra.get(p) : undefined)
    if (aprendida) {
      res.categoria_id = aprendida
      res.origen_categoria = 'aprendida'
    }
  }
  // 4. Reglas de la app
  if (!res.categoria_id && res.tipo === 'normal') {
    const sistema = ordenadas.find((r) => !r.es_sugerencia && r.origen === 'sistema' && coincide(r, m))
    if (sistema) aplicar(sistema)
  } else if (res.categoria_id && !res.mes_siguiente) {
    // Aunque la categoría venga de lo aprendido, la regla de la app puede decir que es de fin de mes (nómina)
    const sistema = ordenadas.find((r) => !r.es_sugerencia && r.origen === 'sistema' && r.mes_siguiente && coincide(r, m))
    if (sistema) res.mes_siguiente = true
  }
  // Sugerencias: solo si el movimiento sigue siendo normal
  if (res.tipo === 'normal') {
    const s = ordenadas.find((r) => r.es_sugerencia && coincide(r, m))
    if (s && s.tipo_movimiento) res.sugerencia = { tipo: s.tipo_movimiento, motivo: s.nombre ?? 'Regla', regla_id: s.id, confianza: 0.9 }
  }
  return res
}
