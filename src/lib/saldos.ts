/**
 * Cuadre de saldo con el banco. El Excel de cuenta de BBVA trae el saldo tras cada movimiento
 * (columna Disponible), así que cada movimiento forma un eslabón: saldo anterior más importe igual a
 * saldo posterior. Si los eslabones de la cuenta forman una cadena continua, lo guardado en la app
 * coincide con el banco. Si no:
 *   - dos movimientos con la misma fecha, importe, saldo y concepto son el mismo: duplicado;
 *   - un salto entre eslabones es un hueco (faltan movimientos sin importar entre dos fechas).
 * No depende del orden de las filas ni de las fechas de cargo: las fechas solo deshacen empates.
 * La tarjeta no trae saldo: se comprueba con su liquidación en la cuenta.
 */
import type { Movimiento } from './tipos'

const cent = (n: number) => Math.round(n * 100)

export interface Hueco {
  /** Último movimiento antes del hueco y primero después */
  desde: string
  hasta: string
  /** Lo que falta por importar entre las dos fechas (positivo: entradas que faltan) */
  diferencia: number
}

export interface CuadreCuenta {
  /** La cuenta tiene movimientos con saldo del banco */
  conSaldo: boolean
  /** Saldo del banco tras el último movimiento importado */
  saldoBanco: number | null
  /** Saldo que resulta de los movimientos guardados en la app */
  saldoApp: number | null
  /** Fecha del último movimiento con saldo */
  fecha: string | null
  /** Grupos de movimientos repetidos: el primero se queda, los demás sobran */
  duplicados: Movimiento[][]
  huecos: Hueco[]
  cuadra: boolean
}

/** Clave de un movimiento repetido: misma fecha, importe, saldo del banco y concepto */
const claveRepetido = (m: Movimiento) => `${m.fecha_operacion}|${cent(m.importe)}|${cent(m.saldo!)}|${m.concepto_normalizado}`

export function cuadrarCuenta(movimientos: Movimiento[]): CuadreCuenta {
  const conSaldo = movimientos.filter((m) => m.saldo !== null)
  if (!conSaldo.length) return { conSaldo: false, saldoBanco: null, saldoApp: null, fecha: null, duplicados: [], huecos: [], cuadra: true }

  // Repetidos: el mismo movimiento guardado dos veces (las repeticiones legítimas tienen saldos distintos)
  const grupos = new Map<string, Movimiento[]>()
  for (const m of conSaldo) grupos.set(claveRepetido(m), [...(grupos.get(claveRepetido(m)) ?? []), m])
  const duplicados = [...grupos.values()].filter((g) => g.length > 1)
  const unicos = [...grupos.values()].map((g) => g[0])

  // Cadena: de cada eslabón al que empieza donde acaba él, el de fecha más cercana
  const eslabones = unicos.map((m) => ({ m, antes: cent(m.saldo!) - cent(m.importe), despues: cent(m.saldo!) }))
  const porAntes = new Map<number, typeof eslabones>()
  for (const e of eslabones) porAntes.set(e.antes, [...(porAntes.get(e.antes) ?? []), e])
  const finales = new Set(eslabones.map((e) => e.despues))
  const orden = (a: (typeof eslabones)[number], b: (typeof eslabones)[number]) => a.m.fecha_operacion.localeCompare(b.m.fecha_operacion)
  const visitados = new Set<(typeof eslabones)[number]>()
  const tramos: (typeof eslabones)[] = []
  const inicios = [...eslabones.filter((e) => !finales.has(e.antes)).sort(orden), ...[...eslabones].sort(orden)]
  for (const inicio of inicios) {
    if (visitados.has(inicio)) continue
    const tramo = [inicio]
    visitados.add(inicio)
    let actual = inicio
    for (;;) {
      const siguientes = (porAntes.get(actual.despues) ?? []).filter((e) => !visitados.has(e))
      if (!siguientes.length) break
      const dist = (e: (typeof eslabones)[number]) => {
        const d = Date.parse(e.m.fecha_operacion) - Date.parse(actual.m.fecha_operacion)
        return d < 0 ? -d * 2 : d // mejor hacia delante
      }
      actual = siguientes.sort((a, b) => dist(a) - dist(b))[0]
      visitados.add(actual)
      tramo.push(actual)
    }
    tramos.push(tramo)
  }
  tramos.sort((a, b) => orden(a[0], b[0]) || orden(a[a.length - 1], b[b.length - 1]))

  const huecos: Hueco[] = []
  for (let i = 1; i < tramos.length; i++) {
    const fin = tramos[i - 1][tramos[i - 1].length - 1]
    const ini = tramos[i][0]
    huecos.push({ desde: fin.m.fecha_operacion, hasta: ini.m.fecha_operacion, diferencia: (ini.antes - fin.despues) / 100 })
  }

  const primero = tramos[0][0]
  const ultimo = tramos[tramos.length - 1][tramos[tramos.length - 1].length - 1]
  const suma = movimientos.reduce((s, m) => s + cent(m.importe), 0)
  const saldoApp = (primero.antes + suma) / 100
  const saldoBanco = ultimo.despues / 100
  return {
    conSaldo: true,
    saldoBanco,
    saldoApp,
    fecha: ultimo.m.fecha_operacion,
    duplicados,
    huecos,
    cuadra: !duplicados.length && !huecos.length && cent(saldoApp) === cent(saldoBanco),
  }
}

/** Movimientos que sobran: de cada grupo de repetidos, todos menos el primero */
export function idsDuplicados(c: CuadreCuenta): string[] {
  return c.duplicados.flatMap((g) => g.slice(1).map((m) => m.id))
}
