/**
 * Datos de prueba: movimientos inventados desde el 1 de octubre de 2026 hasta hoy, para ver el
 * extracto, los resúmenes en PDF y el resto de pantallas sin datos reales.
 *
 * Cuelgan de importaciones con origen "datos_prueba" (una por cuenta): borrarlas los elimina por
 * completo. Ningún concepto lleva datos identificativos. La generación es determinista (semilla fija),
 * así que los mismos días dan los mismos movimientos.
 */
import { normalizarConcepto } from './conceptos'
import { sumarDias, ultimoDeMes } from './fechas'
import { mesSiguiente } from './imputacion'
import type { Categoria, Cuenta, Importacion, Movimiento, TipoMovimiento } from './tipos'
import { anadirA } from './agrupar'

export interface DatosPrueba {
  importaciones: Importacion[]
  movimientos: Movimiento[]
}

/** Generador pseudoaleatorio con semilla (mulberry32) */
function aleatorio(semilla: number) {
  let a = semilla >>> 0
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    rnd,
    entre: (min: number, max: number) => Math.round((min + rnd() * (max - min)) * 100) / 100,
    elegir: <T,>(lista: T[]): T => lista[Math.floor(rnd() * lista.length)],
    probable: (p: number) => rnd() < p,
  }
}

/** "HOTEL NH MADRID" → "Hotel Nh Madrid"; los alias de terceros se respetan */
function conceptoLegible(concepto: string): string {
  return concepto
    .split(' ')
    .map((p) => (/[a-z]/.test(p) ? p : p.charAt(0) + p.slice(1).toLowerCase()))
    .join(' ')
    .replace(/ (De|A|Y|Del|La|El) /g, (m) => m.toLowerCase())
}

/** Último día laborable (lunes a viernes) del mes de la fecha */
function ultimoLaborable(fecha: string): string {
  let d = ultimoDeMes(fecha)
  while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = sumarDias(d, -1)
  return d
}

const SUPERMERCADOS = ['MERCADONA', 'CONSUM', 'LIDL', 'CARREFOUR MARKET']
const RESTAURANTES = ['REST LA LONJA', 'BAR CENTRAL', 'PIZZERIA NAPOLI', 'TABERNA EL PUERTO', 'SUSHI KOI']
const CAFETERIAS = ['CAFETERIA LUNA', 'HORNO SAN JOSE', 'CAFE DEL MERCADO']

export function generarDatosPrueba(opciones: {
  cuentas: Cuenta[]
  categorias: Categoria[]
  desde: string
  hasta: string
  nuevoId?: () => string
  semilla?: number
}): DatosPrueba {
  const { cuentas, categorias, desde, hasta } = opciones
  const nuevoId = opciones.nuevoId ?? (() => crypto.randomUUID())
  const creado = new Date().toISOString()
  const r = aleatorio(opciones.semilla ?? 20261001)

  const activas = cuentas.filter((c) => c.activa).sort((a, b) => a.orden - b.orden)
  const bancarias = activas.filter((c) => c.tipo === 'cuenta')
  const principal = bancarias[0]
  if (!principal) throw new Error('Hace falta al menos una cuenta bancaria activa')
  const segunda = bancarias[1] ?? principal
  const tarjeta = activas.find((c) => c.tipo === 'tarjeta_credito') ?? principal

  // Categorías por nombre ("Vivienda > Hipoteca"); si se han renombrado, quedan sin categoría
  const porNombre = new Map<string, string>()
  for (const c of categorias) {
    const padre = c.padre_id ? categorias.find((p) => p.id === c.padre_id) : undefined
    porNombre.set((padre ? `${padre.nombre} > ${c.nombre}` : c.nombre).toLowerCase(), c.id)
  }
  const cat = (ruta: string) => porNombre.get(ruta.toLowerCase()) ?? null

  const importaciones = new Map<string, Importacion>()
  const importacionDe = (cuentaId: string) => {
    let i = importaciones.get(cuentaId)
    if (!i) {
      i = {
        id: nuevoId(), cuenta_id: cuentaId, origen: 'datos_prueba', fecha_desde: desde, fecha_hasta: hasta,
        movimientos_nuevos: 0, movimientos_duplicados: 0, movimientos_descartados: 0, estado: 'confirmada', modificados: [], created_at: creado,
      }
      importaciones.set(cuentaId, i)
    }
    return i
  }

  const movimientos: Movimiento[] = []
  const repeticiones = new Map<string, number>()

  const anadir = (cuenta: Cuenta, fecha: string, concepto: string, importe: number, ruta: string | null, tipo: TipoMovimiento = 'normal', alMesSiguiente = false) => {
    if (fecha < desde || fecha > hasta) return null
    const imp = importacionDe(cuenta.id)
    const normalizado = normalizarConcepto(concepto)
    const clave = `${cuenta.id}|${fecha}|${importe}|${normalizado}`
    const ocurrencia = (repeticiones.get(clave) ?? 0) + 1
    repeticiones.set(clave, ocurrencia)
    const categoria_id = ruta ? cat(ruta) : null
    const m: Movimiento = {
      id: nuevoId(),
      cuenta_id: cuenta.id,
      importacion_id: imp.id,
      fecha_operacion: fecha,
      fecha_valor: fecha,
      concepto_original: concepto,
      concepto_limpio: conceptoLegible(concepto),
      concepto_normalizado: normalizado,
      ocurrencia,
      importe: Math.round(importe * 100) / 100,
      categoria_id,
      tipo,
      saldo: null,
      regla_id: null,
      origen_categoria: categoria_id ? 'regla' : null,
      nota: null,
      reembolso_cerrado: false,
      mes_imputacion: alMesSiguiente ? mesSiguiente(fecha) : null,
      poblacion: null,
      revisado_empleado: false,
      created_at: creado,
    }
    movimientos.push(m)
    imp.movimientos_nuevos++
    return m
  }

  // Gastos de empleado de cada mes, para reembolsarlos el mes siguiente
  const empleadoPorMes = new Map<string, Movimiento[]>()
  const cargoTarjetaPorMes = new Map<string, number>()

  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
    const d = Number(dia.slice(8))
    const mes = dia.slice(0, 7)
    const diaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay() // 0 domingo
    const laborable = diaSemana >= 1 && diaSemana <= 5

    const tarj = (concepto: string, importe: number, ruta: string | null, tipo: TipoMovimiento = 'normal') => {
      const m = anadir(tarjeta, dia, concepto, importe, ruta, tipo)
      if (m) cargoTarjetaPorMes.set(mes, (cargoTarjetaPorMes.get(mes) ?? 0) + m.importe)
      if (m && tipo === 'gasto_empleado') anadirA(empleadoPorMes, mes, m)
      return m
    }

    // Cuenta principal: ingresos y recibos fijos
    // La cuota de la hipoteca se carga el último día del mes y es del mes siguiente
    if (dia === ultimoDeMes(dia)) anadir(principal, dia, 'RECIBO PRESTAMO HIPOTECARIO', -1148.32, 'Vivienda > Hipoteca', 'normal', true)
    if (d === 2) anadir(principal, dia, 'RECIBO COMUNIDAD DE PROPIETARIOS', -85, 'Vivienda > Comunidad')
    if (d === 3) {
      // Liquidación de la tarjeta del mes anterior: traspaso interno, no computa
      const anterior = cargoTarjetaPorMes.get(sumarDias(`${mes}-01`, -1).slice(0, 7))
      const importe = anterior !== undefined ? anterior : -r.entre(650, 900)
      anadir(principal, dia, 'LIQUIDACION TARJETA CREDITO', Math.round(importe * 100) / 100, null, 'traspaso_interno')
    }
    if (d === 5) {
      anadir(principal, dia, 'RECIBO COLEGIO SANTA ANA', -350, 'Hijos > Colegio')
      anadir(principal, dia, 'RECIBO ESCUELA DE MUSICA', -90, 'Hijos > Extraescolares')
    }
    if (d === 8) anadir(principal, dia, 'RECIBO SEGURO MEDICO', -126.4, 'Salud > Seguro médico')
    if (d === 10) anadir(principal, dia, 'RECIBO ENERGIA ELECTRICA', -r.entre(58, 96), 'Suministros > Luz')
    if (d === 12 && Number(mes.slice(5)) % 2 === 0) anadir(principal, dia, 'RECIBO AGUAS MUNICIPALES', -r.entre(32, 48), 'Suministros > Agua')
    if (d === 15) anadir(principal, dia, 'RECIBO FIBRA Y MOVIL', -64.9, 'Suministros > Fibra y móvil')
    // PayPal no dice el comercio: una suscripción de importe fijo y compras sueltas, sin categoría
    if (d === 7) anadir(principal, dia, 'PAYPAL EUROPE S.A.R.L. ET CIE S.C.A', -7.99, null)
    if ((d === 13 || d === 24) && r.probable(0.6)) anadir(principal, dia, 'PAYPAL EUROPE S.A.R.L. ET CIE S.C.A', -r.entre(4, 60), null)
    if (d === 16) {
      // Ahorro a la cuenta 2: traspaso interno en los dos lados
      anadir(principal, dia, 'TRASPASO A Cuenta 2', -500, null, 'traspaso_interno')
      anadir(segunda, dia, 'TRASPASO DE Cuenta principal', 500, null, 'traspaso_interno')
    }
    if (d === 10) {
      // Reembolso de la empresa por los gastos de empleado del mes anterior
      const mesAnterior = sumarDias(`${mes}-01`, -1).slice(0, 7)
      const gastos = empleadoPorMes.get(mesAnterior) ?? []
      const total = Math.round(-gastos.reduce((s, g) => s + g.importe, 0) * 100) / 100
      if (total > 0) anadir(principal, dia, `TRANSFERENCIA DE Empresa GASTOS ${mesAnterior.slice(5)}/${mesAnterior.slice(0, 4)}`, total, null, 'reembolso_empresa')
    }
    if (dia === ultimoLaborable(dia)) {
      // La nómina llega el último día laborable y es la del mes siguiente
      const mesNomina = new Date(`${mesSiguiente(dia)}-01T00:00:00Z`).toLocaleString('es-ES', { month: 'long', timeZone: 'UTC' }).toUpperCase()
      anadir(principal, dia, `TRANSFERENCIA DE Empresa NOMINA ${mesNomina}`, 4862.37, 'Ingresos > Nómina', 'normal', true)
    }

    // Cuenta 2: gastos anuales
    if (dia.slice(5) === '10-21') anadir(segunda, dia, 'RECIBO IBI URBANA', -418.6, 'Vivienda > IBI y tasas')
    if (dia.slice(5) === '11-06') anadir(segunda, dia, 'RECIBO SEGURO COCHE', -386.25, 'Seguros > Coche')
    if (dia.slice(5) === '12-14') anadir(segunda, dia, 'RECIBO SEGURO HOGAR', -212.4, 'Vivienda > Seguro de hogar')

    // Tarjeta: gasto del día a día
    if (diaSemana === 1 || diaSemana === 4 || (diaSemana === 6 && r.probable(0.6)))
      tarj(r.elegir(SUPERMERCADOS), -r.entre(28, 135), 'Alimentación > Supermercado')
    if (diaSemana === 6 && r.probable(0.5)) tarj('FRUTERIA EL HUERTO', -r.entre(12, 30), 'Alimentación > Mercado y tiendas')
    if (laborable && r.probable(0.35)) tarj(r.elegir(CAFETERIAS), -r.entre(2.1, 6.5), 'Restaurantes > Cafeterías')
    if ((diaSemana === 5 || diaSemana === 6) && r.probable(0.55)) tarj(r.elegir(RESTAURANTES), -r.entre(32, 95), 'Restaurantes > Restaurantes')
    if (diaSemana === 0 && r.probable(0.3)) tarj('CINES ABC', -r.entre(18, 32), 'Ocio > Cine y espectáculos')
    if ((d === 9 || d === 23) && r.probable(0.9)) tarj('ESTACION DE SERVICIO', -r.entre(55, 78), 'Transporte > Combustible')
    if (r.probable(0.04)) tarj('FARMACIA', -r.entre(6, 32), 'Salud > Farmacia')
    if (r.probable(0.05)) tarj('AMAZON MARKETPLACE', -r.entre(15, 85), 'Compras > Hogar')
    if (r.probable(0.02)) tarj('ZARA', -r.entre(25, 90), 'Compras > Ropa')
    if (d === 4) tarj('NETFLIX', -13.99, 'Suscripciones > Netflix')
    if (d === 11) tarj('SPOTIFY', -10.99, 'Suscripciones > Spotify')
    if (d === 18) tarj('PARKING CENTRO', -r.entre(4, 14), 'Transporte > Aparcamiento')
    if (dia.slice(5) === '11-19') tarj('DEVOLUCION AMAZON MARKETPLACE', 24.99, 'Compras > Hogar')
    if (d === 14 && r.probable(0.6)) tarj('BIZUM A Otros', -r.entre(10, 40), null) // queda sin categoría

    // Gastos de empleado: viaje de trabajo dos veces al mes (martes y miércoles)
    if ((d >= 6 && d <= 12 && diaSemana === 2) || (d >= 20 && d <= 26 && diaSemana === 2)) {
      tarj('RENFE VIAJEROS', -r.entre(58, 96), 'Viajes > Transporte', 'gasto_empleado')
      tarj('HOTEL NH MADRID', -r.entre(118, 196), 'Viajes > Alojamiento', 'gasto_empleado')
      tarj('CABIFY', -r.entre(12, 28), 'Viajes > Transporte', 'gasto_empleado')
      tarj('REST CASA LUCIO', -r.entre(28, 46), 'Restaurantes > Restaurantes', 'gasto_empleado')
    }
  }

  // Saldo tras cada movimiento en las cuentas bancarias, como la columna Disponible de BBVA (saldos de partida inventados)
  activas
    .filter((c) => c.tipo === 'cuenta')
    .forEach((c, i) => {
      let saldo = i === 0 ? 3000 : 8000
      for (const m of movimientos.filter((x) => x.cuenta_id === c.id).sort((a, b) => a.fecha_operacion.localeCompare(b.fecha_operacion))) {
        saldo = Math.round((saldo + m.importe) * 100) / 100
        m.saldo = saldo
      }
    })

  return { importaciones: [...importaciones.values()], movimientos }
}
