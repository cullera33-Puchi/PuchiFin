import { useMemo, useState } from 'react'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { Segmentado } from '../componentes/Interfaz'
import { useDatos } from '../datos/ProveedorDatos'
import { compararPeriodos, periodosDisponibles, type PeriodoComparable, type TipoComparacion } from '../lib/comparar'
import { hoyIso } from '../lib/fechas'
import { formatearRedondo } from '../lib/formato'
import { porcentaje, type Totales } from '../lib/resumen'

const VERDE = 'text-[#248A3D] dark:text-[#30D158]'
const ROJO = 'text-[#D70015] dark:text-[#FF6961]'

/** Diferencia con signo y color: subir es bueno en ingresos y ahorro, malo en gastos */
function Dif({ n, subirEsBueno }: { n: number; subirEsBueno: boolean }) {
  if (Math.abs(n) < 1) return <span className="text-zinc-500">igual</span>
  return <span className={n > 0 === subirEsBueno ? VERDE : ROJO}>{`${n > 0 ? '+' : '−'}${formatearRedondo(Math.abs(n))}`}</span>
}

/** Por defecto: el periodo más reciente y el mismo del año anterior (o el anterior, si no hay) */
function porDefecto(lista: PeriodoComparable[], tipo: TipoComparacion): [string, string] {
  const b = lista[0]?.clave ?? ''
  const haceUnAno = tipo === 'anio' ? String(Number(b) - 1) : `${Number(b.slice(0, 4)) - 1}${b.slice(4)}`
  const a = lista.find((p) => p.clave === haceUnAno)?.clave ?? lista[1]?.clave ?? b
  return [a, b]
}

/**
 * Comparar dos periodos cualesquiera (R4, v0.34.0): meses, trimestres o años, con los totales y el gasto
 * por categoría. Por defecto, el más reciente frente al mismo del año anterior.
 */
export function Comparar() {
  const db = useDatos()
  const hoy = hoyIso()
  const [tipo, setTipo] = useState<TipoComparacion>('mes')
  const lista = useMemo(() => periodosDisponibles(db, tipo, hoy), [db, tipo, hoy])
  const [elegidos, setElegidos] = useState<Record<TipoComparacion, [string, string] | null>>({ mes: null, trimestre: null, anio: null })
  const [ca, cb] = elegidos[tipo] ?? porDefecto(lista, tipo)
  const pa = lista.find((p) => p.clave === ca)
  const pb = lista.find((p) => p.clave === cb)
  const r = useMemo(() => (pa && pb ? compararPeriodos(db, pa, pb) : null), [db, pa, pb])
  const elegir = (i: 0 | 1, clave: string) => setElegidos((e) => ({ ...e, [tipo]: i === 0 ? [clave, cb] : [ca, clave] }))
  const filas: [string, (t: Totales) => number, boolean, boolean][] = [
    ['Ingresos', (t) => t.ingresos, true, false],
    ['Gastos', (t) => t.gastos, false, false],
    ['Ahorro', (t) => t.ahorro, true, false],
  ]
  const selector = (i: 0 | 1, valor: string) => (
    <select
      className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 text-[15px] font-medium dark:bg-zinc-900"
      aria-label={i === 0 ? 'Primer periodo' : 'Segundo periodo'}
      value={valor}
      onChange={(e) => elegir(i, e.target.value)}
    >
      {lista.map((p) => (
        <option key={p.clave} value={p.clave}>
          {p.nombre}
          {p.enCurso ? ' (en curso)' : ''}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <BarraNavegacion titulo="Comparar periodos" atras="Informes" />
      <div className="space-y-4">
        <Segmentado
          etiqueta="Tipo de periodo"
          opciones={[
            ['mes', 'Mes'],
            ['trimestre', 'Trimestre'],
            ['anio', 'Año'],
          ]}
          valor={tipo}
          onCambio={setTipo}
        />
        {lista.length < 2 ? (
          <p className="tarjeta text-center text-[15px] text-zinc-500">Hace falta más de un periodo con datos para comparar.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex">{selector(0, ca)}</div>
              <p className="px-1 text-center text-[13px] text-zinc-500">frente a</p>
              <div className="flex">{selector(1, cb)}</div>
            </div>
            {(pa?.enCurso || pb?.enCurso) && <p className="px-1 text-[12px] text-zinc-500">Un periodo en curso aún no está completo: la comparación es orientativa.</p>}
            {r && pa && pb && (
              <>
                <section className="lista overflow-hidden">
                  <table className="w-full text-[15px] tabular-nums">
                    <thead>
                      <tr className="text-[12px] text-zinc-500">
                        <th className="px-4 py-2 text-left font-normal"></th>
                        <th className="px-2 py-2 text-right font-normal">{pa.nombre}</th>
                        <th className="px-2 py-2 text-right font-normal">{pb.nombre}</th>
                        <th className="px-4 py-2 text-right font-normal">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
                      {filas.map(([nombre, f, bueno]) => (
                        <tr key={nombre}>
                          <td className="px-4 py-2">{nombre}</td>
                          <td className="px-2 py-2 text-right text-zinc-500">{formatearRedondo(f(r.a))}</td>
                          <td className="px-2 py-2 text-right">{formatearRedondo(f(r.b))}</td>
                          <td className="px-4 py-2 text-right text-[13px]">
                            <Dif n={f(r.b) - f(r.a)} subirEsBueno={bueno} />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="px-4 py-2">Tasa de ahorro</td>
                        <td className="px-2 py-2 text-right text-zinc-500">{r.a.tasaAhorro === null ? '—' : porcentaje(r.a.tasaAhorro)}</td>
                        <td className="px-2 py-2 text-right">{r.b.tasaAhorro === null ? '—' : porcentaje(r.b.tasaAhorro)}</td>
                        <td className="px-4 py-2" />
                      </tr>
                    </tbody>
                  </table>
                </section>
                <section>
                  <h3 className="cabecera-grupo">Gasto por categoría, de más a menos cambio</h3>
                  <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                    {r.categorias.map((c) => (
                      <li key={c.id ?? 'sin'} className="fila min-h-12">
                        <Baldosa icono={c.icono} color={c.color} tamano="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px]">{c.nombre}</span>
                          <span className="block text-[12px] text-zinc-500 tabular-nums">
                            {formatearRedondo(c.a)} y {formatearRedondo(c.b)}
                          </span>
                        </span>
                        <span className="text-[15px] tabular-nums">
                          <Dif n={c.diferencia} subirEsBueno={false} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
