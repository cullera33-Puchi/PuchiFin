import { useMemo, useState } from 'react'
import { useDatos } from '../datos/ProveedorDatos'
import { guardarInversion } from '../datos/operaciones'
import { hoyIso, mesLargo } from '../lib/fechas'
import { formatearRedondo, leerImporteUsuario } from '../lib/formato'
import { capacidadCompra, compararDestinos, type PrecioMaximo, type Simulacion } from '../lib/plan'
import { inversionDe, type ViviendaActual } from '../lib/vivienda'
import type { AjustesInversion } from '../lib/tipos'
import { useHacer } from './acciones'
import { Hoja, Interruptor, Segmentado } from './Interfaz'

const texto = (n: number) => String(n).replace('.', ',')
const mesTexto = (mes: string) => mesLargo(`${mes}-01`).toLowerCase()
const VERDE = 'text-[#248A3D] dark:text-[#30D158]'

function Precio({ m }: { m: PrecioMaximo }) {
  return (
    <span className="block">
      <span className="block text-[15px] tabular-nums">{m.precio > 0 ? formatearRedondo(m.precio) : 'Nada'}</span>
      <span className="block text-[11px] text-zinc-500">{m.limite === 'entrada' ? 'Limita la entrada' : 'Limita la cuota'}</span>
    </span>
  )
}

/**
 * ¿Cuánto puedo comprar? (v0.42.0): precio máximo cada año en el mes de la compra, pagando la deuda ese año
 * o pausando ese pago, con lo que se haga con la vivienda actual y, si se quiere, la nómina de la pareja.
 */
export function CuantoPuedoComprar({ sim }: { sim: Simulacion }) {
  const db = useDatos()
  const hoy = hoyIso()
  const [destino, setDestino] = useState<ViviendaActual['destino']>(sim.compra?.uso === 'vivir' ? (sim.compra.actual?.destino ?? 'mantener') : 'mantener')
  const [pareja, setPareja] = useState(!!sim.pareja)
  const c = useMemo(() => capacidadCompra(db, hoy, sim, { pareja, destino }), [db, hoy, sim, pareja, destino])
  if (!c) return <p className="text-[13px] text-zinc-500">Configura el plan de pagos (deuda, colchón y cuenta de ahorro) para ver cuánto puedes comprar.</p>
  const alquilerSinDato = destino === 'alquilar' && !sim.compra?.actual?.alquiler_mes
  return (
    <div className="space-y-3">
      <Segmentado
        etiqueta="Con tu vivienda actual"
        opciones={[
          ['mantener', 'Mantenerla'],
          ['vender', 'Venderla'],
          ['alquilar', 'Alquilarla'],
        ]}
        valor={destino}
        onCambio={setDestino}
      />
      <div className="flex min-h-11 items-center gap-3">
        <span className="flex-1 text-[15px]">Con la nómina de tu pareja</span>
        <Interruptor etiqueta="Contar la nómina de tu pareja" activo={pareja} onCambio={setPareja} />
      </div>
      <table className="w-full" aria-label="Precio máximo por año">
        <thead>
          <tr className="text-[12px] text-zinc-500">
            <th className="py-1 text-left font-normal">Compra en</th>
            <th className="py-1 text-right font-normal">Pagando la deuda</th>
            <th className="py-1 text-right font-normal">Pausando ese pago</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {c.filas.map((f) => (
            <tr key={f.mes}>
              <th scope="row" className="py-2 text-left align-top font-normal">
                <span className="block text-[15px]">{mesTexto(f.mes)}</span>
                <span className="block text-[11px] text-zinc-500 tabular-nums">Cuota hasta {formatearRedondo(f.cuotaMax)}</span>
              </th>
              <td className="py-2 text-right align-top">
                <Precio m={f.pagando} />
              </td>
              <td className="py-2 text-right align-top">
                <Precio m={f.pausando} />
                {f.precio35 > f.pausando.precio && <span className="block text-[11px] text-zinc-500 tabular-nums">Al 35 %: {formatearRedondo(f.precio35)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.sinVivienda && <p className="text-[13px] text-[#C93400] dark:text-[#FF9F0A]">Para contar la venta, añade tu vivienda habitual con su valor en Patrimonio.</p>}
      {alquilerSinDato && <p className="text-[13px] text-[#C93400] dark:text-[#FF9F0A]">Escribe el alquiler de tu vivienda actual en «Simular una compra» para que cuente.</p>}
      <p className="text-[12px] text-zinc-500">
        Precio de la vivienda, sin los gastos de compra. Lo limita lo primero que se alcanza: el dinero para la entrada ({texto(c.entrada_pct)} %) y los gastos ({texto(c.gastos_pct)} %),
        que es lo que tengas por encima del colchón{destino === 'vender' ? ' más lo que deja la venta' : ''}, o la cuota que admite el banco: el {texto(c.esfuerzo)} % de tus ingresos
        {destino === 'mantener' ? ', menos la hipoteca actual' : ''}, con una hipoteca a {texto(c.anios)} años al {texto(c.interes)} %. Los datos de la hipoteca nueva son los de la compra
        simulada.
      </p>
    </div>
  )
}

/** Comprar para vivir: vender o alquilar la actual, lado a lado */
export function VenderOAlquilar({ sim }: { sim: Simulacion }) {
  const db = useDatos()
  const hoy = hoyIso()
  const r = useMemo(() => compararDestinos(db, hoy, sim), [db, hoy, sim])
  if (!r) return null
  const [vender, alquilar] = r
  const filas: [string, (x: typeof vender) => string, ((x: typeof vender) => number) | null][] = [
    ['Ahorros que necesitas', (x) => (x.ahorros < 0 ? `Te sobran ${formatearRedondo(-x.ahorros)}` : formatearRedondo(x.ahorros)), (x) => -x.ahorros],
    ['Te faltan', (x) => (x.falta > 0 ? formatearRedondo(x.falta) : 'Nada'), (x) => -x.falta],
    ['Cuotas al mes', (x) => formatearRedondo(x.cuotas), (x) => -x.cuotas],
    ['Alquiler neto al mes', (x) => (x.alquilerNeto ? formatearRedondo(x.alquilerNeto) : 'No hay'), null],
    ['Ahorro al mes, el año siguiente', (x) => formatearRedondo(x.ahorroMensual), (x) => x.ahorroMensual],
    ['Esfuerzo', (x) => (x.esfuerzo === null ? 'Sin dato' : `${Math.round(x.esfuerzo * 100)} %`), (x) => -(x.esfuerzo ?? 9)],
    ['Deuda familiar saldada en', (x) => String(x.saldadaEn ?? 'más de 30 años'), (x) => -(x.saldadaEn ?? 9999)],
    ['Patrimonio neto en 5 años', (x) => (x.patrimonio5 === null ? 'Sin dato' : formatearRedondo(x.patrimonio5)), (x) => x.patrimonio5 ?? 0],
    ['Patrimonio neto en 10 años', (x) => (x.patrimonio10 === null ? 'Sin dato' : formatearRedondo(x.patrimonio10)), (x) => x.patrimonio10 ?? 0],
  ]
  const mejor = (f: ((x: typeof vender) => number) | null, x: typeof vender) => f && f(x) > f(x === vender ? alquilar : vender)
  return (
    <div>
      <table className="w-full" aria-label="Vender o alquilar tu vivienda actual">
        <thead>
          <tr className="text-[12px] text-zinc-500">
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-normal">Venderla</th>
            <th className="py-1 text-right font-normal">Alquilarla</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200/70 text-[14px] tabular-nums dark:divide-zinc-800">
          {filas.map(([nombre, valor, comparar]) => (
            <tr key={nombre}>
              <th scope="row" className="w-[40%] py-1.5 pr-2 text-left font-normal text-zinc-600 dark:text-zinc-400">
                {nombre}
              </th>
              <td className={`py-1.5 pl-3 text-right ${mejor(comparar, vender) ? `font-semibold ${VERDE}` : ''}`}>{valor(vender)}</td>
              <td className={`py-1.5 pl-3 text-right ${mejor(comparar, alquilar) ? `font-semibold ${VERDE}` : ''}`}>{valor(alquilar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] text-zinc-500">
        En verde, la mejor de las dos. El patrimonio cuenta las viviendas con una revalorización del {texto(inversionDe(db).revalorizacion)} % al año, que puedes cambiar en los supuestos.
        Si la alquilas, la exención por reinversión solo se mantiene si la vendes en los dos años siguientes a dejar de vivir en ella.
      </p>
    </div>
  )
}

const CAMPOS: { clave: keyof AjustesInversion; etiqueta: string; detalle: string; euros?: boolean }[] = [
  { clave: 'esfuerzo_max', etiqueta: 'Esfuerzo máximo (%)', detalle: 'Cuotas de hipoteca sobre tus ingresos netos' },
  { clave: 'alquiler_banco', etiqueta: 'Alquiler que cuenta el banco (%)', detalle: 'Parte del alquiler que suma a tus ingresos' },
  { clave: 'bruto_pareja', etiqueta: 'Bruto anual de tu pareja', detalle: 'Para su IRPF y, sin nómina suya, sus ingresos', euros: true },
  { clave: 'revalorizacion', etiqueta: 'Revalorización anual (%)', detalle: 'De las viviendas, para las proyecciones' },
  { clave: 'gastos_venta', etiqueta: 'Gastos de venta (%)', detalle: 'Inmobiliaria, plusvalía municipal y cancelación' },
  { clave: 'propiedad_pct', etiqueta: 'Tu parte de la vivienda (%)', detalle: 'El resto es de tu pareja' },
  { clave: 'reduccion_alquiler', etiqueta: 'Reducción por alquiler (%)', detalle: 'En el IRPF: 50 % general' },
  { clave: 'coste_vivienda', etiqueta: 'Lo que costó tu vivienda', detalle: 'Con impuestos y gastos: para la ganancia y la amortización', euros: true },
  { clave: 'construccion_pct', etiqueta: 'Parte de construcción (%)', detalle: 'Sin el suelo; está en el recibo del IBI' },
]

/** Supuestos de compra, venta y alquiler: se guardan en el iPhone */
export function HojaSupuestos({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const db = useDatos()
  const hacer = useHacer()
  const [abiertaAntes, setAbiertaAntes] = useState(false)
  const [f, setF] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  if (abierta !== abiertaAntes) {
    setAbiertaAntes(abierta)
    if (abierta) {
      const inv = inversionDe(db)
      setF(Object.fromEntries(CAMPOS.map((c) => [c.clave, inv[c.clave] === null ? '' : texto(inv[c.clave] as number)])))
      setError(null)
    }
  }
  const guardar = async () => {
    const datos: Record<string, number | null> = {}
    for (const c of CAMPOS) {
      const t = (f[c.clave] ?? '').trim()
      if (!t) {
        if (c.clave === 'coste_vivienda') {
          datos[c.clave] = null
          continue
        }
        return setError(`Escribe ${c.etiqueta.replace(/ \(%\)$/, '').toLowerCase()}`)
      }
      const n = c.euros ? leerImporteUsuario(t) : Number(t.replace('%', '').replace(',', '.'))
      if (n === null || !Number.isFinite(n)) return setError(`Revisa ${c.etiqueta.replace(/ \(%\)$/, '').toLowerCase()}`)
      datos[c.clave] = n
    }
    setError(null)
    if (await hacer((d) => guardarInversion(d, datos as unknown as AjustesInversion), 'Supuestos guardados')) onCerrar()
  }
  return (
    <Hoja abierta={abierta} titulo="Supuestos" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {CAMPOS.map((c) => (
            <label key={c.clave} className="fila min-h-14">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">{c.etiqueta}</span>
                <span className="block text-[12px] text-zinc-500">{c.detalle}</span>
              </span>
              <input
                className="w-24 bg-transparent text-right text-[15px] tabular-nums outline-none"
                inputMode="decimal"
                placeholder={c.clave === 'coste_vivienda' ? 'No lo sé' : '0'}
                aria-label={c.etiqueta}
                value={f[c.clave] ?? ''}
                onChange={(e) => setF({ ...f, [c.clave]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <p className="px-4 text-[12px] text-zinc-500">
          Es una estimación para planificar. En zona tensionada la reducción por alquiler puede ser del 70 o el 90 % en casos concretos: confírmalo con un asesor fiscal.
        </p>
        {error && <p className="px-1 text-[13px] text-[#D70015] dark:text-[#FF6961]">{error}</p>}
        <button className="boton-primario w-full" onClick={guardar}>
          Guardar
        </button>
      </div>
    </Hoja>
  )
}
