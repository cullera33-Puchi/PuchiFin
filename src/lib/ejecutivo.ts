/**
 * Resumen ejecutivo de una página para compartir (v0.45.0): el periodo en tres cifras, lo importante en
 * frases, las cinco categorías que más pesan y la deuda familiar. Pensado para quien no usa la app: frases en
 * primera persona del plural y pocas cifras. Sustituye a la versión reducida del PDF.
 *
 * Los textos se forman al llamar a la función: dentro de `sinDiscreto` salen con las cifras reales.
 */
import { calcularExtracto, categoriaQueMasSube } from './extracto'
import { diaLargo, MESES, nombreMes, sumarDias } from './fechas'
import { saldosA } from './posicion'
import { formatearRedondo } from './formato'
import type { Plan } from './plan'
import type { Resumen, Tono } from './resumen'
import type { BaseDatos } from './tipos'

const eur = formatearRedondo

export interface CifraEjecutiva {
  etiqueta: string
  valor: string
  nota: string | null
  tono: Tono
}

export interface CategoriaEjecutiva {
  nombre: string
  color: string
  importe: number
  peso: number
}

export interface CuentasEjecutivo {
  /** Fecha de los saldos: el último día del periodo o, si está en curso, el último dato importado */
  fecha: string
  lineas: { nombre: string; saldo: number }[]
  total: number
  /** Lo que ha variado el total en el periodo (frente al día anterior a su inicio), si hay datos */
  variacion: number | null
  /** «en el mes» o «en la semana» */
  cuando: string
}

export interface ResumenEjecutivo {
  titulo: string
  /** Si el periodo está en curso, hasta cuándo llegan los datos */
  aviso: string | null
  cifras: CifraEjecutiva[]
  frases: string[]
  /** Las cinco que más pesan y, si hay más, «Resto» */
  categorias: CategoriaEjecutiva[]
  totalGastos: number
  deuda: { titulo: string; frases: string[] } | null
  /** Dinero en las cuentas: la del día a día, la de ahorro y el total (v0.46.0) */
  cuentas: CuentasEjecutivo | null
}

interface Referencia {
  /** Para comparar: «que lo habitual», «que en septiembre» o «que la semana anterior» */
  que: string
  /** «en línea con lo habitual», «con septiembre» o «con la semana anterior» */
  con: string
  /** Para la nota bajo cada cifra: «Lo normal», «En octubre» o «La semana anterior» */
  etiqueta: string
  /** Es la media de los meses anteriores (la misma que el Extracto) */
  media: boolean
  gastos: number
  ingresos: number
  /** Por categoría: id y lo de la referencia */
  categorias: Map<string | null, number>
}

/** Lo que se toma como normal: en un mes, la media de los anteriores; en una semana, la anterior */
function referenciaDe(db: BaseDatos, r: Resumen, hoy: string): Referencia | null {
  if (r.periodo.tipo === 'mes') {
    const e = calcularExtracto(db, r.periodo.inicio.slice(0, 7), hoy)
    if (e.media && e.mesesMedia > 0) {
      return {
        que: r.enCurso ? 'que lo habitual a estas alturas del mes' : 'que lo habitual',
        con: r.enCurso ? 'con lo habitual a estas alturas del mes' : 'con lo habitual',
        etiqueta: 'Lo normal',
        media: true,
        gastos: e.media.gastos,
        ingresos: e.media.ingresos,
        categorias: new Map(e.categorias.filter((c) => c.media !== null).map((c) => [c.id, c.media!])),
      }
    }
  }
  if (!r.totalesAnterior.movimientos) return null
  return {
    que: r.periodo.tipo === 'mes' ? `que en ${r.anterior.nombreCorto}` : 'que la semana anterior',
    con: r.periodo.tipo === 'mes' ? `con ${r.anterior.nombreCorto}` : 'con la semana anterior',
    etiqueta: r.periodo.tipo === 'mes' ? `En ${r.anterior.nombreCorto}` : 'La semana anterior',
    media: false,
    gastos: r.totalesAnterior.gastos,
    ingresos: r.totalesAnterior.ingresos,
    categorias: new Map(r.categorias.filter((c) => c.anterior !== null).map((c) => [c.id, c.anterior!])),
  }
}

const porciento = (v: number) => `${Math.round(Math.abs(v) * 100)} %`

/** «un 7 % menos que lo habitual» o «en línea con lo habitual» */
function frente(actual: number, ref: Referencia): string {
  if (ref.gastos <= 0) return ''
  const v = (actual - ref.gastos) / ref.gastos
  return Math.abs(v) < 0.05 ? `en línea ${ref.con}` : `un ${porciento(v)} ${v > 0 ? 'más' : 'menos'} ${ref.que}`
}

/** Diferencia de una categoría que merece contarse: al menos 30 € y un 15 % */
const relevante = (importe: number, ref: number) => Math.abs(importe - ref) >= Math.max(30, ref * 0.15)

export function resumenEjecutivo(db: BaseDatos, r: Resumen, hoy: string, plan: Plan | null): ResumenEjecutivo {
  const esMes = r.periodo.tipo === 'mes'
  const t = r.totales
  const ref = referenciaDe(db, r, hoy)
  const cuando = esMes ? `en ${nombreMes(r.periodo.inicio)}` : 'esta semana'
  const titulo = esMes ? `Resumen de ${nombreMes(r.periodo.inicio)} de ${r.periodo.inicio.slice(0, 4)}` : `Resumen de la ${r.periodo.etiqueta.charAt(0).toLowerCase()}${r.periodo.etiqueta.slice(1)}`
  const aviso = r.enCurso ? `${esMes ? 'El mes' : 'La semana'} sigue en curso: datos hasta el ${diaLargo(r.corte)}.` : null

  // Tres cifras
  const tonoGasto: Tono = ref && ref.gastos > 0 ? (t.gastos > ref.gastos * 1.05 ? 'malo' : t.gastos < ref.gastos * 0.95 ? 'bueno' : 'neutro') : 'neutro'
  const cifras: CifraEjecutiva[] = [
    { etiqueta: 'Hemos gastado', valor: eur(t.gastos), nota: ref && ref.gastos > 0 ? `${ref.etiqueta}: ${eur(ref.gastos)}` : null, tono: tonoGasto },
    { etiqueta: 'Ha entrado', valor: eur(t.ingresos), nota: ref && ref.ingresos > 0 ? `${ref.etiqueta}: ${eur(ref.ingresos)}` : null, tono: 'neutro' },
    {
      etiqueta: t.ahorro >= 0 ? 'Hemos ahorrado' : 'Hemos gastado de más',
      valor: eur(Math.abs(t.ahorro)),
      nota: t.tasaAhorro !== null && t.ahorro >= 0 ? `El ${porciento(t.tasaAhorro)} de lo que ha entrado` : t.ahorro < 0 ? 'Más de lo que ha entrado' : null,
      tono: t.ahorro > 0 ? 'bueno' : t.ahorro < 0 ? 'malo' : 'neutro',
    },
  ]

  // Lo importante, en frases
  const frases: string[] = []
  if (!t.movimientos) frases.push(`No hay movimientos ${cuando}.`)
  else {
    const verbo = r.enCurso ? `Llevamos ${eur(t.gastos)} gastados ${cuando}` : `${cuando.charAt(0).toUpperCase()}${cuando.slice(1)} hemos gastado ${eur(t.gastos)}`
    const comparacion = ref ? frente(t.gastos, ref) : ''
    frases.push(`${verbo}${comparacion ? `, ${comparacion}` : ''}.`)

    // La categoría que más sube y la que más baja frente a la referencia (lo pendiente de categorizar no cuenta)
    const lineas = r.categorias.filter((c) => c.id !== null && ref?.categorias.has(c.id))
    const conRef = lineas.map((c) => ({ nombre: c.nombre, importe: c.importe, ref: ref!.categorias.get(c.id)! }))
    // En un mes, la misma regla que el Extracto para la que más sube
    const subeExtracto = esMes && ref?.media ? categoriaQueMasSube(calcularExtracto(db, r.periodo.inicio.slice(0, 7), hoy)) : null
    const sube = subeExtracto
      ? { nombre: subeExtracto.nombre, importe: subeExtracto.importe, ref: subeExtracto.media! }
      : conRef.filter((c) => c.importe > c.ref && relevante(c.importe, c.ref)).sort((a, b) => b.importe - b.ref - (a.importe - a.ref))[0]
    if (sube) frases.push(`Donde más ha subido: ${sube.nombre}, ${eur(sube.importe - sube.ref)} más ${ref!.que}.`)
    const baja = conRef.filter((c) => c.importe < c.ref && relevante(c.importe, c.ref)).sort((a, b) => a.importe - a.ref - (b.importe - b.ref))[0]
    if (baja) frases.push(`Donde más hemos recortado: ${baja.nombre}, ${eur(baja.ref - baja.importe)} menos ${ref!.que}.`)

    if (t.ingresos > 0) {
      frases.push(
        t.ahorro >= 0
          ? `Ha entrado ${eur(t.ingresos)} y hemos ahorrado ${eur(t.ahorro)}, el ${porciento(t.tasaAhorro ?? 0)} de lo que ha entrado.`
          : `Hemos gastado ${eur(-t.ahorro)} más de lo que ha entrado.`,
      )
    } else if (r.enCurso) frases.push('La nómina aún no ha entrado en este periodo.')
  }

  // Las cinco que más pesan; el resto, juntas
  const cinco = r.categorias.slice(0, 5).map((c) => ({ nombre: c.nombre, color: c.color, importe: c.importe, peso: c.peso }))
  const resto = r.categorias.slice(5)
  if (resto.length) {
    const importe = Math.round(resto.reduce((s, c) => s + c.importe, 0) * 100) / 100
    cinco.push({ nombre: `Resto (${resto.length} categorías)`, color: '#A1A1AA', importe, peso: t.gastos > 0 ? importe / t.gastos : 0 })
  }

  return { titulo, aviso, cifras, frases, categorias: cinco, totalGastos: t.gastos, deuda: plan ? fraseDeuda(plan) : null, cuentas: cuentasDe(db, r, hoy) }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Saldo de las cuentas según el banco al final del periodo (o con el último dato, si está en curso). La de
 * ahorro es la del colchón del plan de pagos; con una sola cuenta más, esa es la del día a día. Sin plan, por su alias.
 */
function cuentasDe(db: BaseDatos, r: Resumen, hoy: string): CuentasEjecutivo | null {
  const dia = r.periodo.fin < hoy ? r.periodo.fin : hoy
  const saldos = saldosA(db, dia)
  if (!saldos.length) return null
  const ahorroId = db.compromisos.find((c) => c.activo)?.cuenta_colchon_id ?? null
  const otras = saldos.filter((s) => s.cuenta.id !== ahorroId)
  const nombre = (id: string, alias: string) => (id === ahorroId ? 'Cuenta de ahorro' : ahorroId && otras.length === 1 ? 'Cuenta del día a día' : alias)
  // Primero la del día a día y después la de ahorro
  const lineas = [...otras, ...saldos.filter((s) => s.cuenta.id === ahorroId)].map((s) => ({ nombre: nombre(s.cuenta.id, s.cuenta.alias), saldo: s.saldo }))
  const total = r2(saldos.reduce((s, x) => s + x.saldo, 0))
  const fecha = saldos.reduce((max, s) => (s.fecha > max ? s.fecha : max), '')
  // Variación en el periodo, solo si todas las cuentas ya tenían datos antes de empezar
  const antes = saldosA(db, sumarDias(r.periodo.inicio, -1))
  const variacion = antes.length === saldos.length ? r2(total - antes.reduce((s, x) => s + x.saldo, 0)) : null
  return { fecha, lineas, total, variacion, cuando: r.periodo.tipo === 'mes' ? 'en el mes' : 'en la semana' }
}

/** La deuda familiar: lo que queda, el próximo pago y cuándo queda saldada, con el plan guardado (sin simulaciones) */
function fraseDeuda(plan: Plan): { titulo: string; frases: string[] } {
  const mesPago = MESES[plan.compromiso.mes_referencia - 1]
  if (plan.deudaPendiente <= 0) return { titulo: 'Deuda familiar', frases: ['La deuda familiar está saldada.'] }
  const frases = [`Quedan ${eur(plan.deudaPendiente)} por devolver${plan.pagado > 0 ? `; ya hemos devuelto ${eur(plan.pagado)}` : ''}.`]
  const proximo = plan.pagos[0]
  if (proximo) {
    frases.push(
      proximo.pago > 0
        ? `En ${mesPago} de ${proximo.anio} está previsto devolver ${eur(proximo.pago)}${proximo.deudaTras > 0 ? `, y quedarán ${eur(proximo.deudaTras)}` : ', y quedará saldada'}.`
        : `En ${mesPago} de ${proximo.anio} no se prevé devolver nada: el ahorro no pasará del colchón.`,
    )
  }
  if (plan.saldadaEn && !(proximo && proximo.deudaTras <= 0)) frases.push(`Al ritmo de ahora, quedará saldada en ${plan.saldadaEn}.`)
  else if (!plan.saldadaEn) frases.push('Al ritmo de ahora, no se salda en los próximos 30 años.')
  return { titulo: 'Deuda familiar', frases }
}
