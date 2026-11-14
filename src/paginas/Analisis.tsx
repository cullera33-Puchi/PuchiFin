import { useMemo, useState } from 'react'
import { esDiscreto } from '../lib/discreto'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Segmentado } from '../componentes/Interfaz'
import { useDatos } from '../datos/ProveedorDatos'
import { cierreAnual, evolucionMensual, serieCategoria } from '../lib/extracto'
import { MESES } from '../lib/fechas'
import { formatearImporte } from '../lib/formato'
import { porcentaje } from '../lib/resumen'

type Vista = 'evolucion' | 'categoria' | 'anual'
const mesCorto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(2, 4)}`
const euroCorto = (v: number) => (esDiscreto() ? '••' : Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`)
const ejes = { stroke: 'var(--graf-texto)', fontSize: 11, tickLine: false, axisLine: false }
const tooltip = {
  formatter: (v: unknown) => formatearImporte(Number(v)),
  contentStyle: { borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: 13 },
  cursor: { fill: 'var(--graf-rejilla)', opacity: 0.5 },
}

export function Analisis() {
  const db = useDatos()
  const [vista, setVista] = useState<Vista>('evolucion')
  const raices = db.categorias.filter((c) => !c.padre_id && c.naturaleza === 'gasto' && c.activa).sort((a, b) => a.orden - b.orden)
  const [categoria, setCategoria] = useState<string>(raices[0]?.id ?? '')
  const evolucion = useMemo(() => evolucionMensual(db).map((p) => ({ ...p, nombre: mesCorto(p.mes) })), [db])
  const serie = useMemo(() => serieCategoria(db, categoria || null).map((p) => ({ ...p, nombre: mesCorto(p.mes) })), [db, categoria])
  const anual = useMemo(() => cierreAnual(db), [db])

  return (
    <>
      <BarraNavegacion titulo="Análisis" atras="Extracto" />
      <div className="mb-4">
        <Segmentado
          etiqueta="Vista"
          opciones={[
            ['evolucion', 'Evolución'],
            ['categoria', 'Categoría'],
            ['anual', 'Anual'],
          ]}
          valor={vista}
          onCambio={setVista}
        />
      </div>

      {!evolucion.length ? (
        <p className="tarjeta text-sm text-zinc-500">Sin movimientos todavía.</p>
      ) : vista === 'evolucion' ? (
        <div className="space-y-4">
          <section className="tarjeta">
            <h2 className="mb-2 text-sm font-semibold">Ingresos y gastos por mes</h2>
            <div className="h-60" role="img" aria-label="Gráfico de barras de ingresos y gastos por mes; los datos están en la tabla">
              <ResponsiveContainer>
                <BarChart data={evolucion} barGap={2} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--graf-rejilla)" />
                  <XAxis dataKey="nombre" {...ejes} />
                  <YAxis tickFormatter={euroCorto} {...ejes} width={52} />
                  <Tooltip {...tooltip} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: 'var(--graf-texto)' }}>{v}</span>} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="var(--serie-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="gastos" name="Gastos" fill="var(--serie-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <TablaMeses filas={[...evolucion].reverse()} />
        </div>
      ) : vista === 'categoria' ? (
        <div className="space-y-4">
          <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
            {raices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <section className="tarjeta">
            <h2 className="mb-2 text-sm font-semibold">Gasto mensual y media móvil de 3 meses</h2>
            <div className="h-60" role="img" aria-label="Gráfico del gasto mensual de la categoría y su media móvil; los datos están en la tabla">
              <ResponsiveContainer>
                <ComposedChart data={serie} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--graf-rejilla)" />
                  <XAxis dataKey="nombre" {...ejes} />
                  <YAxis tickFormatter={euroCorto} {...ejes} width={52} />
                  <Tooltip {...tooltip} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: 'var(--graf-texto)' }}>{v}</span>} />
                  <Bar dataKey="importe" name="Gasto" fill="var(--serie-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line dataKey="mediaMovil" name="Media móvil" stroke="var(--serie-2)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'var(--serie-2)' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {[...serie].reverse().map((p) => (
              <div key={p.mes} className="flex items-center gap-3 px-4 py-2 text-[15px]">
                <span className="flex-1 capitalize">{mesCorto(p.mes)}</span>
                <span className="tabular-nums">{formatearImporte(p.importe)}</span>
                <span className="w-24 text-right text-xs text-zinc-500 tabular-nums">media {formatearImporte(p.mediaMovil)}</span>
              </div>
            ))}
          </section>
        </div>
      ) : (
        <section className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {anual.map((a) => (
            <div key={a.anio} className="space-y-1 px-4 py-3">
              <p className="flex items-baseline justify-between">
                <span className="text-[17px] font-semibold">{a.anio}</span>
                <span className="text-xs text-zinc-500">
                  {a.meses} {a.meses === 1 ? 'mes' : 'meses'} con datos
                </span>
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-zinc-500">Ingresos</dt>
                <dd className="text-right tabular-nums">{formatearImporte(a.ingresos)}</dd>
                <dt className="text-zinc-500">Gastos</dt>
                <dd className="text-right tabular-nums">{formatearImporte(a.gastos)}</dd>
                <dt className="text-zinc-500">Ahorro</dt>
                <dd className="text-right font-medium tabular-nums">{formatearImporte(a.ahorro)}</dd>
                <dt className="text-zinc-500">Tasa de ahorro</dt>
                <dd className="text-right tabular-nums">{a.tasaAhorro === null ? 'Sin ingresos' : porcentaje(a.tasaAhorro)}</dd>
              </dl>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

function TablaMeses({ filas }: { filas: { mes: string; ingresos: number; gastos: number; ahorro: number }[] }) {
  return (
    <section className="tarjeta overflow-x-auto p-0">
      <table className="w-full text-xs">
        <thead className="text-zinc-500">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Mes</th>
            <th className="py-2 text-right font-medium">Ingresos</th>
            <th className="py-2 text-right font-medium">Gastos</th>
            <th className="px-4 py-2 text-right font-medium">Ahorro</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {filas.map((f) => (
            <tr key={f.mes} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="px-4 py-2 capitalize">{mesCorto(f.mes)}</td>
              <td className="py-2 text-right whitespace-nowrap">{formatearImporte(f.ingresos)}</td>
              <td className="py-2 text-right whitespace-nowrap">{formatearImporte(f.gastos)}</td>
              <td className={`px-4 py-2 text-right whitespace-nowrap ${f.ahorro >= 0 ? 'text-[#248A3D] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF6961]'}`}>{formatearImporte(f.ahorro)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
