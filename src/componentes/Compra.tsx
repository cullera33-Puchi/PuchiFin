import { useMemo, useState } from 'react'
import { useDatos } from '../datos/ProveedorDatos'
import { fechaDeLosDatos } from '../lib/extracto'
import { hoyIso, mesLargo, sumarMeses } from '../lib/fechas'
import { formatearRedondo, leerImporteUsuario } from '../lib/formato'
import { cifrasCompra, type CompraVivienda, type Plan, type ResultadoCompra } from '../lib/plan'
import { Hoja, Segmentado } from './Interfaz'
import { useSimulacion } from './simulacion'

const texto = (n: number) => String(n).replace('.', ',')
const nombreMes = (mes: string) => {
  const t = mesLargo(`${mes}-01`).toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const VERDE = 'text-[#248A3D] dark:text-[#30D158]'
const NARANJA = 'text-[#C93400] dark:text-[#FF9F0A]'
const ROJO = 'text-[#D70015] dark:text-[#FF6961]'

/** Porcentaje escrito por el usuario («20», «2,5»); null si no es un número */
function leerPorcentaje(t: string): number | null {
  const limpio = t.trim().replace('%', '').replace(',', '.')
  if (!limpio) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** Valores de partida: en Cataluña, ITP del 10 % más notaría, registro y gestoría, en torno al 12 % */
const POR_DEFECTO = { entrada: '20', gastos: '12', interes: '3', anios: '25' }

/**
 * Comprar una vivienda (v0.41.0): precio, mes, uso, entrada, gastos de compra, hipoteca nueva, gastos de
 * la vivienda y alquiler. Va a la simulación compartida: el plan de pagos, los ingresos previstos y el
 * patrimonio enseñan su efecto. No se guarda.
 */
export function HojaCompra({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const db = useDatos()
  const [sim, setSim] = useSimulacion()
  const mesDatos = fechaDeLosDatos(db, hoyIso()).slice(0, 7)
  const meses = useMemo(() => Array.from({ length: 48 }, (_, i) => sumarMeses(`${mesDatos}-01`, i + 1).slice(0, 7)), [mesDatos])
  const [abiertaAntes, setAbiertaAntes] = useState(false)
  const [f, setF] = useState({ precio: '', mes: '', uso: 'alquilar' as CompraVivienda['uso'], ...POR_DEFECTO, gastosMes: '', alquiler: '' })
  const [error, setError] = useState<string | null>(null)
  // Al abrir, la compra de la simulación o los valores de partida (ajuste durante el render, sin efecto)
  if (abierta !== abiertaAntes) {
    setAbiertaAntes(abierta)
    if (abierta) {
      const c = sim.compra
      setF(
        c
          ? {
              precio: texto(c.precio),
              mes: c.mes,
              uso: c.uso,
              entrada: texto(c.entrada_pct),
              gastos: texto(c.gastos_pct),
              interes: texto(c.interes),
              anios: texto(c.anios),
              gastosMes: c.gastos_mes ? texto(c.gastos_mes) : '',
              alquiler: c.alquiler_mes ? texto(c.alquiler_mes) : '',
            }
          : { precio: '', mes: meses[11], uso: 'alquilar', ...POR_DEFECTO, gastosMes: '', alquiler: '' },
      )
      setError(null)
    }
  }
  const cambiar = (c: Partial<typeof f>) => setF((x) => ({ ...x, ...c }))

  const leer = (): CompraVivienda | string => {
    const precio = leerImporteUsuario(f.precio)
    if (precio === null || precio <= 0) return 'Escribe el precio de la vivienda'
    const entrada = leerPorcentaje(f.entrada)
    if (entrada === null || entrada < 0 || entrada > 100) return 'La entrada va de 0 a 100 %'
    const gastos = leerPorcentaje(f.gastos)
    if (gastos === null || gastos < 0 || gastos > 30) return 'Los gastos de compra van de 0 a 30 %'
    const interes = leerPorcentaje(f.interes)
    if (interes === null || interes < 0 || interes > 20) return 'El tipo de interés va de 0 a 20 %'
    const anios = leerPorcentaje(f.anios)
    if (entrada < 100 && (anios === null || anios < 1 || anios > 40)) return 'La hipoteca va de 1 a 40 años'
    const gastosMes = f.gastosMes.trim() ? leerImporteUsuario(f.gastosMes) : 0
    const alquiler = f.alquiler.trim() ? leerImporteUsuario(f.alquiler) : 0
    if (gastosMes === null || alquiler === null) return 'Revisa los gastos y el alquiler'
    if (!meses.includes(f.mes)) return 'Elige el mes de la compra'
    return { precio, mes: f.mes, entrada_pct: entrada, gastos_pct: gastos, interes, anios: anios ?? 1, gastos_mes: gastosMes, alquiler_mes: f.uso === 'alquilar' ? alquiler : 0, uso: f.uso }
  }
  const compra = leer()
  const cifras = typeof compra === 'string' ? null : cifrasCompra(compra)

  const simular = () => {
    if (typeof compra === 'string') return setError(compra)
    setSim({ ...sim, compra })
    onCerrar()
  }
  const quitar = () => {
    setSim({ ...sim, compra: null })
    onCerrar()
  }
  const campo = 'min-w-0 flex-1 bg-transparent text-right text-[15px] tabular-nums outline-none'
  const fila = (etiqueta: string, valor: string, onCambio: (v: string) => void, placeholder: string) => (
    <label className="fila min-h-12">
      <span className="w-44 shrink-0 text-[15px]">{etiqueta}</span>
      <input className={campo} inputMode="decimal" placeholder={placeholder} aria-label={etiqueta} value={valor} onChange={(e) => onCambio(e.target.value)} />
    </label>
  )

  return (
    <Hoja abierta={abierta} titulo="Comprar una vivienda" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {fila('Precio', f.precio, (v) => cambiar({ precio: v }), '0 €')}
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">Mes de la compra</span>
            <select className="bg-transparent text-right text-[15px] outline-none" aria-label="Mes de la compra" value={f.mes} onChange={(e) => cambiar({ mes: e.target.value })}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <p className="mb-1.5 px-4 text-[13px] text-zinc-500">Para qué es</p>
          <Segmentado
            etiqueta="Para qué es"
            opciones={[
              ['alquilar', 'Alquilar'],
              ['segunda', 'Segunda'],
              ['vivir', 'Vivir'],
            ]}
            valor={f.uso}
            onCambio={(v) => cambiar({ uso: v })}
          />
        </div>
        <section>
          <h3 className="cabecera-grupo">Compra e hipoteca</h3>
          <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {fila('Entrada (%)', f.entrada, (v) => cambiar({ entrada: v }), '20')}
            {fila('Gastos de compra (%)', f.gastos, (v) => cambiar({ gastos: v }), '12')}
            {fila('Tipo fijo (%)', f.interes, (v) => cambiar({ interes: v }), '3')}
            {fila('Años de hipoteca', f.anios, (v) => cambiar({ anios: v }), '25')}
          </div>
          <p className="mt-1 px-4 text-[12px] text-zinc-500">
            Gastos de compra de segunda mano en Cataluña: el impuesto de transmisiones (10 %) más notaría, registro y gestoría, en torno al 12 %. Obra nueva: IVA del 10 % más
            actos jurídicos documentados.
          </p>
        </section>
        <section>
          <h3 className="cabecera-grupo">Cada mes</h3>
          <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {fila('Gastos de la vivienda', f.gastosMes, (v) => cambiar({ gastosMes: v }), '0 €')}
            {f.uso === 'alquilar' && fila('Alquiler que cobras', f.alquiler, (v) => cambiar({ alquiler: v }), '0 €')}
          </div>
          <p className="mt-1 px-4 text-[12px] text-zinc-500">IBI, comunidad, seguros y mantenimiento. El alquiler, sin descontar impuestos.</p>
        </section>
        {cifras && (
          <div className="space-y-1 rounded-xl bg-zinc-100/70 px-4 py-3 text-[15px] tabular-nums dark:bg-zinc-800/50" aria-label="Cifras de la compra">
            <p>
              Necesitas {formatearRedondo(cifras.desembolso)}: {formatearRedondo(cifras.entrada)} de entrada y {formatearRedondo(cifras.gastos)} de gastos.
            </p>
            {cifras.prestamo > 0 && (
              <p>
                Hipoteca de {formatearRedondo(cifras.prestamo)}, con una cuota de {formatearRedondo(cifras.cuota)} al mes.
              </p>
            )}
          </div>
        )}
        {error && <p className={`px-1 text-[13px] ${ROJO}`}>{error}</p>}
        <button className="boton-primario w-full" onClick={simular}>
          Simular
        </button>
        {sim.compra && (
          <button className="boton-texto w-full text-red-600 dark:text-red-500" onClick={quitar}>
            Quitar la compra
          </button>
        )}
        <p className="px-4 text-[12px] text-zinc-500">No se guarda: es parte de la simulación, como el resto de cambios del plan de pagos.</p>
      </div>
    </Hoja>
  )
}

/** Resultado de la compra simulada: si llega el dinero, la cuota, el esfuerzo y el efecto en la deuda */
export function ResumenCompra({ r, base, con }: { r: ResultadoCompra; base: Plan | null; con: Plan | null }) {
  const esfuerzo = r.esfuerzo === null ? null : Math.round(r.esfuerzo * 100)
  return (
    <div className="space-y-1 text-[15px] tabular-nums">
      <p>
        En {nombreMes(r.mes).toLowerCase()} necesitas {formatearRedondo(r.desembolso)}: {formatearRedondo(r.entrada)} de entrada y {formatearRedondo(r.gastos)} de gastos.
      </p>
      {r.falta > 0 ? (
        <p className={ROJO}>
          En la cuenta de ahorro habrá unos {formatearRedondo(r.saldoAntes)}: faltan {formatearRedondo(r.falta)}.
        </p>
      ) : r.sobreColchon < 0 ? (
        <p className={NARANJA}>Llega, pero usa {formatearRedondo(-r.sobreColchon)} del colchón.</p>
      ) : (
        <p className={VERDE}>Llega: quedan {formatearRedondo(r.sobreColchon)} por encima del colchón.</p>
      )}
      {r.prestamo > 0 && (
        <p>
          Cuota de la nueva hipoteca: {formatearRedondo(r.cuota)} al mes.
        </p>
      )}
      {esfuerzo !== null && (
        <p>
          Cuotas de hipoteca sobre tus nóminas: <span className={esfuerzo <= 30 ? VERDE : esfuerzo <= 35 ? NARANJA : ROJO}>{esfuerzo} %</span>
          <span className="block text-[12px] text-zinc-500">Los bancos suelen pedir que no pase del 30 al 35 %.</span>
        </p>
      )}
      {base && con && base.deudaPendiente > 0 && (
        <p>
          Deuda familiar saldada en {con.saldadaEn ?? 'más de 30 años'}
          {base.saldadaEn !== con.saldadaEn ? `; sin la compra, en ${base.saldadaEn ?? 'más de 30 años'}` : ', igual que sin la compra'}.
        </p>
      )}
    </div>
  )
}
