/**
 * Cierre de mes guiado: lo que hay que hacer para dar un mes por bueno. Cada paso dice si está hecho,
 * por qué y dónde se resuelve. Todo se calcula con los datos; no se guarda nada.
 */
import { porVersionYClave } from './cache'
import { esPendiente } from '../importacion/pendientes'
import { gruposPasarela, propuestasRecategorizacion, type GrupoPasarela } from '../datos/categorizar'
import { sumarDias, sumarMeses } from './fechas'
import { formatearFecha } from './formato'
import { mesEfectivo } from './imputacion'
import { cuadrarCuenta } from './saldos'
import { cuadrarLiquidaciones, type CuadreLiquidacion } from './tarjeta'
import type { BaseDatos, Movimiento } from './tipos'

export interface PasoCierre {
  clave: string
  titulo: string
  detalle: string
  hecho: boolean
  /** Dónde se resuelve */
  enlace?: string
}

export const finDelMes = (mes: string) => sumarDias(sumarMeses(`${mes}-01`, 1), -1)

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Cálculos que el Extracto ya tiene hechos, para no repetirlos al pasar de un mes a otro */
export interface PrevioCierre {
  liquidaciones?: CuadreLiquidacion[]
  mejoras?: Movimiento[]
  pasarela?: GrupoPasarela[]
}

function calcularPasos(db: BaseDatos, mes: string, ultimaExportacion: string | null, previo: PrevioCierre): PasoCierre[] {
  const fin = finDelMes(mes)
  const pasos: PasoCierre[] = []

  // 1. Datos del banco de cada cuenta y tarjeta hasta final de mes
  const cuentas = db.cuentas.filter((c) => c.activa && c.tipo !== 'hipoteca' && db.movimientos.some((m) => m.cuenta_id === c.id))
  for (const c of cuentas) {
    const movs = db.movimientos.filter((m) => m.cuenta_id === c.id)
    const ultimo = movs.reduce((max, m) => (m.fecha_operacion > max ? m.fecha_operacion : max), '')
    const importadoDespues = db.importaciones.some((i) => i.cuenta_id === c.id && i.origen !== 'datos_prueba' && i.created_at.slice(0, 10) > fin)
    const hecho = ultimo > fin || importadoDespues
    pasos.push({
      clave: `importar-${c.id}`,
      titulo: `Importar ${c.alias}`,
      detalle: hecho ? 'Con datos hasta final de mes' : `Último movimiento: ${ultimo ? formatearFecha(ultimo) : 'ninguno'}. Sube el Excel hasta el ${formatearFecha(fin)}`,
      hecho,
      enlace: hecho ? undefined : '/movimientos/importar',
    })
  }

  // 2. Cuadre de las cuentas con el banco
  const bancarias = cuentas.filter((c) => c.tipo === 'cuenta')
  if (bancarias.length) {
    const descuadradas = bancarias.filter((c) => !cuadrarCuenta(db.movimientos.filter((m) => m.cuenta_id === c.id)).cuadra)
    pasos.push({
      clave: 'cuadre',
      titulo: 'Cuadre con el banco',
      detalle: descuadradas.length ? `No cuadra: ${descuadradas.map((c) => c.alias).join(', ')}` : 'Los saldos coinciden con el banco',
      hecho: !descuadradas.length,
      enlace: descuadradas.length ? '/ajustes/cuentas' : undefined,
    })
  }

  // 3. Liquidación de la tarjeta cargada este mes
  const liquidaciones = (previo.liquidaciones ?? cuadrarLiquidaciones(db)).filter((l) => l.movimiento.fecha_operacion.startsWith(mes))
  if (liquidaciones.length) {
    // Un cargo que paga compras anteriores a lo importado de la tarjeta no se puede cuadrar: no cuenta como pendiente
    const malas = liquidaciones.filter((l) => l.estado !== 'cuadra' && l.estado !== 'confirmada' && l.estado !== 'anterior_al_inicio')
    pasos.push({
      clave: 'liquidacion',
      titulo: 'Liquidación de la tarjeta',
      detalle: malas.length ? `${plural(malas.length, 'cargo no cuadra', 'cargos no cuadran')} con las compras de la tarjeta` : 'El cargo cuadra con las compras de la tarjeta',
      hecho: !malas.length,
      enlace: malas.length ? '/ajustes/cuentas' : undefined,
    })
  }

  // 4. Nada sin categoría en el mes
  const sin = db.movimientos.filter((m) => esPendiente(m) && mesEfectivo(m) === mes).length
  pasos.push({
    clave: 'categorias',
    titulo: 'Todo categorizado',
    detalle: sin ? `${plural(sin, 'movimiento', 'movimientos')} sin categoría` : 'Ningún movimiento sin categoría',
    hecho: !sin,
    enlace: sin ? '/movimientos/categorizar' : undefined,
  })

  // 5. PayPal repartido (si hubo cargos de PayPal)
  const pasarela = previo.pasarela ?? gruposPasarela(db)
  const paypal = pasarela.flatMap((g) => g.movimientos).filter((m) => mesEfectivo(m) === mes)
  if (paypal.length) {
    const porRevisar = pasarela.flatMap((g) => g.porRevisar).filter((m) => mesEfectivo(m) === mes).length
    pasos.push({
      clave: 'paypal',
      titulo: 'PayPal repartido',
      detalle: porRevisar ? `${plural(porRevisar, 'cargo', 'cargos')} de PayPal por revisar` : 'Todos los cargos de PayPal tienen categoría',
      hecho: !porRevisar,
      enlace: porRevisar ? '/movimientos/paypal' : undefined,
    })
  }

  // 6. Mejoras de categoría propuestas (si las hay en el mes)
  const mejoras = (previo.mejoras ?? propuestasRecategorizacion(db).flatMap((p) => p.movimientos)).filter((m) => mesEfectivo(m) === mes).length
  if (mejoras)
    pasos.push({ clave: 'mejoras', titulo: 'Mejoras de categoría', detalle: `${plural(mejoras, 'propuesta', 'propuestas')} por revisar`, hecho: false, enlace: '/movimientos/categorizar' })

  // 7. Copia fuera del móvil después de cerrar el mes
  const exportado = !!ultimaExportacion && ultimaExportacion.slice(0, 10) > fin
  pasos.push({
    clave: 'copia',
    titulo: 'Copia en Archivos o iCloud',
    detalle: exportado ? `Exportada el ${formatearFecha(ultimaExportacion!)}` : 'Exporta una copia cuando hayas terminado',
    hecho: exportado,
    enlace: exportado ? undefined : '/ajustes/herramientas',
  })
  return pasos
}

/** Mes que conviene cerrar: el anterior durante los primeros 10 días del mes */
export function mesPorCerrar(hoy: string): string | null {
  return Number(hoy.slice(8, 10)) <= 10 ? sumarMeses(`${hoy.slice(0, 7)}-01`, -1).slice(0, 7) : null
}

// Una vez por versión de los datos, mes y fecha de la última exportación (v0.32.0)
const pasosGuardados = porVersionYClave((db, clave) => {
  const [mes, exportacion] = clave.split('|')
  return calcularPasos(db, mes, exportacion || null, {})
})

export function pasosCierre(db: BaseDatos, mes: string, ultimaExportacion: string | null = null, previo: PrevioCierre = {}): PasoCierre[] {
  return Object.keys(previo).length ? calcularPasos(db, mes, ultimaExportacion, previo) : pasosGuardados(db, `${mes}|${ultimaExportacion ?? ''}`)
}
