/**
 * Excel de prueba con el formato de BBVA (plantillas de ./plantillas), con movimientos inventados.
 * Incluye a propósito lo que trae un Excel real y la app debe limpiar: IBAN y titular en la cabecera,
 * números de cuenta y de tarjeta en los conceptos, nombres de personas en transferencias y Bizum,
 * un DNI en las observaciones, movimientos anteriores a la fecha de inicio y dos cafés iguales el mismo día.
 * Ningún dato es real.
 */
import * as XLSX from 'xlsx'
import { datosIniciales } from '../datos/operaciones'
import { generarDatosPrueba } from '../lib/datosPrueba'
import { sumarDias } from '../lib/fechas'
import type { Movimiento } from '../lib/tipos'

/** Nombres inventados; Herramientas.tsx tiene una copia para no cargar SheetJS al abrir la pantalla */
export const NOMBRES_PRUEBA = {
  empresa: 'ACME CONSULTING SL',
  familia: 'MARIA GARCIA LOPEZ',
}

export interface ExcelPrueba {
  nombre: string
  filas: (string | number)[][]
}

const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Concepto con el aspecto de BBVA, a partir del concepto de los datos de prueba */
function conceptoBbva(m: Movimiento, mes: string): { concepto: string; tipo: string; observaciones: string } {
  const c = m.concepto_original
  if (c.startsWith('TRANSFERENCIA DE Empresa NOMINA')) {
    return { concepto: `TRANSFERENCIA RECIBIDA DE ${NOMBRES_PRUEBA.empresa} NOMINA ${mes}`, tipo: 'Transferencia recibida', observaciones: `ORDENANTE ${NOMBRES_PRUEBA.empresa} ES12 0049 1500 0512 3456 7892` }
  }
  if (c.startsWith('TRANSFERENCIA DE Empresa GASTOS')) {
    return { concepto: `TRANSFERENCIA RECIBIDA DE ${NOMBRES_PRUEBA.empresa} GASTOS ${c.split(' ').pop()}`, tipo: 'Transferencia recibida', observaciones: '' }
  }
  if (c === 'TRASPASO A Cuenta 2') return { concepto: 'TRASPASO A CUENTA 0182 5678 12 0201234567', tipo: 'Traspaso', observaciones: '' }
  if (c === 'TRASPASO DE Cuenta principal') return { concepto: 'TRASPASO DE CUENTA 0182 1234 56 0209876543', tipo: 'Traspaso', observaciones: '' }
  if (c.startsWith('BIZUM A')) return { concepto: 'BIZUM ENVIADO A LAURA MARTINEZ PEREZ', tipo: 'Bizum', observaciones: '' }
  if (c === 'LIQUIDACION TARJETA CREDITO') return { concepto: 'LIQUIDACION TARJETA CREDITO 4940XXXXXXXX1234', tipo: 'Cargo tarjeta', observaciones: '' }
  if (c.startsWith('RECIBO')) return { concepto: c, tipo: 'Recibo', observaciones: c.includes('COLEGIO') ? 'TITULAR 12345678Z' : '' }
  return { concepto: c, tipo: 'Pago con tarjeta', observaciones: '' }
}

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

export function generarExcelPrueba(opciones: { desde: string; hasta: string; descargado?: string }): ExcelPrueba[] {
  const base = datosIniciales()
  const [principal, segunda, tarjeta] = base.cuentas
  // Una semana antes de la fecha de inicio: esos movimientos deben descartarse al importar
  const datos = generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde: sumarDias(opciones.desde, -7), hasta: opciones.hasta, semilla: 20261113 })
  const descargado = ddmmaaaa(opciones.descargado ?? opciones.hasta)
  const de = (cuenta: string) => datos.movimientos.filter((m) => m.cuenta_id === cuenta)

  const cuentaBbva = (movs: Movimiento[], iban: string, saldoInicial: number, extra: Movimiento[] = []): (string | number)[][] => {
    const ordenados = [...movs, ...extra].sort((a, b) => a.fecha_operacion.localeCompare(b.fecha_operacion))
    let saldo = saldoInicial
    const filas = ordenados.map((m) => {
      saldo = Math.round((saldo + m.importe) * 100) / 100
      const { concepto, tipo, observaciones } = conceptoBbva(m, MESES[Number(m.fecha_operacion.slice(5, 7)) - 1])
      return [ddmmaaaa(m.fecha_valor ?? m.fecha_operacion), ddmmaaaa(m.fecha_operacion), concepto, tipo, m.importe, 'EUR', saldo, 'EUR', observaciones]
    })
    return [
      ['Últimos movimientos'],
      ['Cuenta', iban],
      ['Titular', 'TITULAR EJEMPLO DEMO'],
      ['Fecha de descarga', descargado],
      [],
      ['F.Valor', 'Fecha', 'Concepto', 'Movimiento', 'Importe', 'Divisa', 'Disponible', 'Divisa', 'Observaciones'],
      ...filas.reverse(), // BBVA lista primero lo más reciente
    ]
  }

  // Un Bizum de la familia, para probar los alias de terceros
  const bizumFamilia: Movimiento = { ...de(principal.id)[0], id: 'bizum', fecha_operacion: sumarDias(opciones.desde, 9), fecha_valor: sumarDias(opciones.desde, 9), concepto_original: 'BIZUM-FAMILIA', importe: 35 }
  const conceptoFamilia = (filas: (string | number)[][]) =>
    filas.map((f) => (f[2] === 'BIZUM-FAMILIA' ? [f[0], f[1], `BIZUM RECIBIDO DE ${NOMBRES_PRUEBA.familia} CENA`, 'Bizum', f[4], f[5], f[6], f[7], ''] : f))

  const tarjetaFilas = [...de(tarjeta.id)]
  // Dos cafés iguales el mismo día: los dos deben importarse
  const cafe = tarjetaFilas.find((m) => m.concepto_original.startsWith('CAFETERIA') && m.fecha_operacion >= opciones.desde)
  if (cafe) tarjetaFilas.push({ ...cafe, id: 'cafe-2' })
  tarjetaFilas.sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion))
  // La liquidación del mes siguiente incluye ese segundo café, para que cuadre
  const mesLiquidacion = cafe ? sumarDias(`${cafe.fecha_operacion.slice(0, 7)}-01`, 32).slice(0, 7) : ''
  const movsPrincipal = de(principal.id).map((m) =>
    cafe && m.concepto_original === 'LIQUIDACION TARJETA CREDITO' && m.fecha_operacion.startsWith(mesLiquidacion)
      ? { ...m, importe: Math.round((m.importe + cafe.importe) * 100) / 100 }
      : m,
  )

  return [
    { nombre: 'BBVA cuenta principal (prueba).xlsx', filas: conceptoFamilia(cuentaBbva(movsPrincipal, 'ES91 2100 0418 4502 0005 1332', 6240.55, [bizumFamilia])) },
    { nombre: 'BBVA cuenta 2 (prueba).xlsx', filas: cuentaBbva(de(segunda.id), 'ES79 2100 0813 6101 2345 6789', 18450.3) },
    {
      nombre: 'BBVA tarjeta (prueba).xlsx',
      filas: [
        ['Movimientos de tarjeta'],
        ['Tarjeta', '4940 1912 3456 1234'],
        ['Fecha de descarga', descargado],
        [],
        ['Fecha', 'Concepto', 'Importe', 'Divisa', 'Fecha de cargo'],
        ...tarjetaFilas.map((m) => [ddmmaaaa(m.fecha_operacion), m.concepto_original, m.importe, 'EUR', ddmmaaaa(sumarDias(`${m.fecha_operacion.slice(0, 7)}-01`, 33).slice(0, 7) + '-03')]),
      ],
    },
  ]
}

/** Libro xlsx en memoria */
export function escribirXlsx(filas: (string | number)[][], hoja = 'Movimientos'): Uint8Array {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), hoja)
  return new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
