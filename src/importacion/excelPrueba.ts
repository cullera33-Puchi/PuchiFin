/**
 * Excel de prueba con el formato real de BBVA («Informe BBVA», confirmado con un Excel del usuario del
 * 13/11/2026), con movimientos inventados. Incluye a propósito lo que la app debe limpiar o entender:
 * - concepto de ancho fijo (comercio, población, país) en los pagos con tarjeta;
 * - la columna Movimiento con el tipo de operación, con detalle (Bizum, adeudos) o con el nombre del
 *   titular en los traspasos y del ordenante en las transferencias;
 * - referencias de adeudo largas, un IBAN y un DNI en las observaciones;
 * - compras del fin de semana con Fecha valor el sábado y Fecha el lunes;
 * - movimientos anteriores a la fecha de inicio y dos cafés iguales el mismo día.
 * La tarjeta de crédito usa el mismo formato sin la columna Disponible (pendiente de confirmar).
 * Ningún dato es real.
 */
import * as XLSX from 'xlsx'
import { datosIniciales } from '../datos/operaciones'
import { generarDatosPrueba } from '../lib/datosPrueba'
import { sumarDias } from '../lib/fechas'
import type { Movimiento } from '../lib/tipos'

export const NOMBRES_PRUEBA = {
  empresa: 'ACME CONSULTING SL',
  familia: 'MARIA GARCIA LOPEZ',
  titular: 'TITULAR DE PRUEBA',
}

export interface ExcelPrueba {
  nombre: string
  filas: (string | number)[][]
}

const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const POBLACIONES = ['valencia', 'valencia', 'valencia', 'paterna', 'madrid']
const ancho = (comercio: string, poblacion: string) => `${comercio.slice(0, 25).padEnd(25)}${poblacion.slice(0, 13).padEnd(13)}es`

/** Concepto y columna Movimiento con el aspecto de BBVA, a partir de los datos de prueba */
function filaBbva(m: Movimiento, i: number, tarjeta = false): { concepto: string; movimiento: string; observaciones: string } {
  const c = m.concepto_original
  if (c.startsWith('TRANSFERENCIA DE Empresa NOMINA')) return { concepto: `Nomina ${NOMBRES_PRUEBA.empresa}`, movimiento: 'Ingreso por nómina o pensión', observaciones: '' }
  if (c.startsWith('TRANSFERENCIA DE Empresa GASTOS'))
    return { concepto: 'Transferencia recibida', movimiento: `${NOMBRES_PRUEBA.empresa} GASTOS ${c.split(' ').pop()}`, observaciones: 'ORDENANTE ES12 0049 1500 0512 3456 7892' }
  if (c === 'TRASPASO A Cuenta 2') return { concepto: 'Traspaso a cuenta', movimiento: NOMBRES_PRUEBA.titular, observaciones: '' }
  if (c === 'TRASPASO DE Cuenta principal') return { concepto: 'Traspaso de cuenta', movimiento: NOMBRES_PRUEBA.titular, observaciones: '' }
  if (c.startsWith('BIZUM A')) return { concepto: 'Bizum', movimiento: 'ENVIADO: Sin concepto', observaciones: '' }
  if (c === 'BIZUM-FAMILIA') return { concepto: 'Bizum', movimiento: `Recibido: cena ${NOMBRES_PRUEBA.familia}`, observaciones: '' }
  if (c === 'LIQUIDACION TARJETA CREDITO') return { concepto: 'Liquidacion tarjeta credito', movimiento: 'Cargo tarjeta 4940XXXXXXXX1234', observaciones: '' }
  if (!tarjeta && (c === 'NETFLIX' || c === 'SPOTIFY'))
    return { concepto: 'Adeudo a su cargo', movimiento: `N 2026${String(310000000000 + i).slice(0, 12)} ${c === 'NETFLIX' ? 'Netflix International B.V.' : 'Spotify AB'}`, observaciones: '' }
  if (c.startsWith('RECIBO')) return { concepto: c.replace('RECIBO ', 'Recibo ').toLowerCase().replace(/^recibo/, 'Recibo'), movimiento: 'Recibo', observaciones: c.includes('COLEGIO') ? 'TITULAR 12345678Z' : '' }
  return { concepto: ancho(c.charAt(0) + c.slice(1).toLowerCase(), m.concepto_original.startsWith('HOTEL') || m.concepto_original.startsWith('CABIFY') || m.concepto_original.includes('LUCIO') ? 'madrid' : POBLACIONES[i % POBLACIONES.length]), movimiento: 'Pago con tarjeta', observaciones: '' }
}

/** Fecha de cargo de una compra: si es sábado o domingo, el lunes siguiente */
const cargo = (fecha: string) => {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  return dia === 6 ? sumarDias(fecha, 2) : dia === 0 ? sumarDias(fecha, 1) : fecha
}

const cabeceraInforme = (titulo: string, generado: string) => [
  [],
  [],
  ['', '', titulo],
  ['', '', `Fecha de generación del informe: ${generado}`],
]

export function generarExcelPrueba(opciones: { desde: string; hasta: string; descargado?: string }): ExcelPrueba[] {
  const base = datosIniciales()
  const [principal, segunda, tarjeta] = base.cuentas
  // Una semana antes de la fecha de inicio: esos movimientos deben descartarse al importar
  const datos = generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: sumarDias(opciones.desde, -7), hasta: opciones.hasta, semilla: 20261113 })
  const generado = ddmmaaaa(opciones.descargado ?? opciones.hasta)
  const de = (cuenta: string) => datos.movimientos.filter((m) => m.cuenta_id === cuenta)

  // Un Bizum de la familia y dos cafés iguales el mismo día en la tarjeta
  const bizumFamilia: Movimiento = { ...de(principal.id)[0], id: 'bizum', fecha_operacion: sumarDias(opciones.desde, 9), concepto_original: 'BIZUM-FAMILIA', importe: 35 }
  const tarjetaMovs = [...de(tarjeta.id)]
  const cafe = tarjetaMovs.find((m) => m.concepto_original.startsWith('CAFETERIA') && m.fecha_operacion >= opciones.desde)
  if (cafe) tarjetaMovs.push({ ...cafe, id: 'cafe-2' })
  // La liquidación del mes siguiente incluye ese segundo café, para que cuadre
  const mesLiquidacion = cafe ? sumarDias(`${cafe.fecha_operacion.slice(0, 7)}-01`, 32).slice(0, 7) : ''
  const movsPrincipal = de(principal.id).map((m) =>
    cafe && m.concepto_original === 'LIQUIDACION TARJETA CREDITO' && m.fecha_operacion.startsWith(mesLiquidacion) ? { ...m, importe: Math.round((m.importe + cafe.importe) * 100) / 100 } : m,
  )

  const informeCuenta = (movs: Movimiento[], saldoInicial: number): (string | number)[][] => {
    const ordenados = [...movs].sort((a, b) => cargo(a.fecha_operacion).localeCompare(cargo(b.fecha_operacion)))
    let saldo = saldoInicial
    const filas = ordenados.map((m, i) => {
      saldo = Math.round((saldo + m.importe) * 100) / 100
      const f = filaBbva(m, i)
      return ['', ddmmaaaa(m.fecha_operacion), ddmmaaaa(cargo(m.fecha_operacion)), f.concepto, f.movimiento, m.importe, 'EUR', saldo, 'EUR', f.observaciones]
    })
    return [
      ...cabeceraInforme('Movimientos', generado),
      ['', 'Fecha valor', 'Fecha', 'Concepto', 'Movimiento', 'Importe', 'Divisa', 'Disponible', 'Divisa', 'Observaciones'],
      ...filas.reverse(), // BBVA lista primero lo más reciente
    ]
  }

  const tarjetaFilas = tarjetaMovs
    .sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion))
    .map((m, i) => {
      const f = filaBbva(m, i, true)
      return ['', ddmmaaaa(m.fecha_operacion), ddmmaaaa(cargo(m.fecha_operacion)), f.concepto, f.movimiento, m.importe, 'EUR', f.observaciones]
    })

  return [
    { nombre: 'BBVA cuenta principal (prueba).xlsx', filas: informeCuenta([...movsPrincipal, bizumFamilia], 6240.55) },
    { nombre: 'BBVA cuenta 2 (prueba).xlsx', filas: informeCuenta(de(segunda.id), 18450.3) },
    {
      nombre: 'BBVA tarjeta (prueba).xlsx',
      filas: [...cabeceraInforme('Movimientos de tarjeta', generado), ['', 'Fecha valor', 'Fecha', 'Concepto', 'Movimiento', 'Importe', 'Divisa', 'Observaciones'], ...tarjetaFilas],
    },
  ]
}

/** Libro xlsx en memoria, con la hoja «Informe BBVA» como el original */
export function escribirXlsx(filas: (string | number)[][], hoja = 'Informe BBVA'): Uint8Array {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), hoja)
  return new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
