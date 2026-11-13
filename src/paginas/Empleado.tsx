import { Briefcase, Check, ChevronRight, Search, Sheet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { candidatosEmpleado } from '../importacion/empleado'
import { guardarAjustes } from '../datos/operaciones'
import { useMemo, useState } from 'react'
import { Aviso, Encabezado } from '../componentes/Encabezado'
import { FilaMovimientoDeslizable } from '../componentes/FilaMovimientoDeslizable'
import { Baldosa } from '../componentes/Icono'
import { useHacer } from '../componentes/acciones'
import { Hoja, useInterfaz } from '../componentes/Interfaz'
import { DetalleMovimiento } from '../componentes/movimientos'
import { aplicado, conciliar, desconciliar, gastosPendientes, indicadoresEmpleado, proponerConciliacion } from '../datos/movimientos'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { hoyIso } from '../lib/fechas'
import { formatearFecha, formatearImporte } from '../lib/formato'
import type { Movimiento } from '../lib/tipos'

const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000)

export function Empleado() {
  const db = useDatos()
  const { avisar, confirmar } = useInterfaz()
  const hacer = useHacer()
  const hoy = hoyIso()
  const ind = useMemo(() => indicadoresEmpleado(db, hoy), [db, hoy])
  const pendientes = useMemo(() => gastosPendientes(db), [db])
  const { reembolsos: aplicadoReembolso } = aplicado(db)
  const reembolsos = db.movimientos.filter((m) => m.tipo === 'reembolso_empresa').sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion))
  const [conciliando, setConciliando] = useState<Movimiento | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const umbral = db.ajustes.dias_aviso_reembolso
  const porRevisar = useMemo(() => candidatosEmpleado(db).length, [db])
  const empresa = db.ajustes.alias_terceros.find((a) => a.alias === 'Empresa')

  const exportar = async () => {
    const movs = db.movimientos.filter((m) => m.tipo === 'gasto_empleado' || m.tipo === 'reembolso_empresa')
    const r = await (await import('../lib/exportarExcel')).exportarVista(db, 'gastos de empleado', movs, [
      ['Pendiente de reembolso', ind.pendiente],
      ['Gastos pendientes', ind.pendienteNumero],
      ['Antigüedad (días)', ind.antiguedad ?? ''],
      ['Reembolsado en el año', ind.reembolsadoAnio],
      ['No reembolsado (cerrados)', ind.diferencias.reduce((s, d) => s + d.noReembolsado, 0)],
    ])
    if (r === 'descargado') avisar('Excel descargado')
  }

  const kpis = [
    { etiqueta: 'Pendiente de reembolso', valor: formatearImporte(ind.pendiente), nota: `${ind.pendienteNumero} ${ind.pendienteNumero === 1 ? 'gasto' : 'gastos'}` },
    { etiqueta: 'Antigüedad', valor: ind.antiguedad === null ? 'Al día' : `${ind.antiguedad} días`, nota: ind.atrasados ? `${ind.atrasados} con más de ${umbral} días` : 'Desde el más antiguo', alerta: ind.atrasados > 0 },
    { etiqueta: 'Reembolsado en el año', valor: formatearImporte(ind.reembolsadoAnio), nota: hoy.slice(0, 4) },
    {
      etiqueta: 'Diferencias',
      valor: formatearImporte(ind.diferencias.reduce((s, d) => s + d.noReembolsado, 0)),
      nota: `${ind.diferencias.length} sin reembolso completo${ind.reembolsosDeMas.length ? `, ${ind.reembolsosDeMas.length} reembolsos de más` : ''}`,
    },
  ]

  return (
    <>
      <Encabezado
        titulo="Empleado"
        accion={
          <button className="boton-icono" aria-label="Exportar a Excel" title="Exportar a Excel" onClick={exportar}>
            <Sheet className="size-[22px]" strokeWidth={1.75} />
          </button>
        }
      />
      <div className="space-y-5">
        {empresa && !empresa.patrones.length && (
          <div className="tarjeta space-y-2">
            <p className="text-sm font-semibold">¿Cómo aparece tu empresa en el banco?</p>
            <p className="text-xs text-zinc-500">
              Escribe su nombre tal como sale en las transferencias. Así la app reconoce los reembolsos y la nómina, y lo sustituye por «Empresa». Solo se guarda en el iPhone.
            </p>
            <input
              className="campo"
              placeholder="Nombre de la empresa"
              maxLength={60}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter') return
                const v = e.currentTarget.value.trim()
                if (!v) return
                const alias = db.ajustes.alias_terceros.map((a) => (a.alias === 'Empresa' ? { ...a, patrones: [v] } : a))
                avisar((await intentar((d) => guardarAjustes(d, { alias_terceros: alias }), 'Nombre de la empresa guardado')) ?? 'Guardado. Se aplica en las próximas importaciones')
              }}
            />
          </div>
        )}

        {porRevisar > 0 && (
          <Link to="/empleado/revisar" className="lista fila">
            <span className="grid size-8 place-items-center rounded-[9px] bg-[#5856D6] text-white">
              <Search className="size-[18px]" strokeWidth={2} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px]">Revisar posibles gastos de empleado</span>
              <span className="block text-xs text-zinc-500">Cafeterías, taxis y restaurantes que parecen de trabajo</span>
            </span>
            <span className="rounded-full bg-[#5856D6] px-2 py-0.5 text-[13px] font-semibold text-white">{porRevisar}</span>
            <ChevronRight className="size-4 text-zinc-400" />
          </Link>
        )}

        <div className="grid grid-cols-2 gap-3">
          {kpis.map((k) => (
            <div key={k.etiqueta} className="tarjeta p-3">
              <p className="text-xs text-zinc-500">{k.etiqueta}</p>
              <p className={`mt-0.5 text-lg font-semibold tabular-nums ${k.alerta ? 'text-[#D70015] dark:text-[#FF6961]' : ''}`}>{k.valor}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-zinc-500">{k.nota}</p>
            </div>
          ))}
        </div>

        <section>
          <h3 className="mb-1.5 px-4 text-[13px] font-medium text-zinc-500 uppercase">Reembolsos de la empresa</h3>
          {reembolsos.length === 0 ? (
            <p className="tarjeta text-sm text-zinc-500">Ningún reembolso todavía. Llegan al importar la cuenta, o marca uno como «Reembolso de empresa» en su detalle.</p>
          ) : (
            <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {reembolsos.map((r) => {
                const hecho = aplicadoReembolso.get(r.id) ?? 0
                const resto = Math.round((r.importe - hecho) * 100) / 100
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Baldosa glifo={Check} color={resto <= 0 ? '#34C759' : '#C7C7CC'} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setDetalle(r.id)}>
                      <p className="truncate text-[15px]">{formatearImporte(r.importe)}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {formatearFecha(r.fecha_operacion)}. {hecho ? `Aplicado ${formatearImporte(hecho)}` : 'Sin conciliar'}
                        {hecho && resto > 0 ? `, quedan ${formatearImporte(resto)}` : ''}
                      </p>
                    </button>
                    {resto > 0 && pendientes.length > 0 && (
                      <button className="boton-texto" onClick={() => setConciliando(r)}>
                        Conciliar
                      </button>
                    )}
                    {hecho > 0 && (
                      <button
                        className="boton-texto text-zinc-500"
                        onClick={async () => {
                          const ok = await confirmar({ titulo: 'Desvincular', texto: 'Los gastos vinculados a este reembolso vuelven a estar pendientes. Podrás deshacerlo durante unos segundos.', aceptar: 'Desvincular' })
                          if (ok) await hacer((d) => desconciliar(d, r.id), 'Reembolso desvinculado')
                        }}
                      >
                        Desvincular
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 px-4 text-[13px] font-medium text-zinc-500 uppercase">Pendientes de reembolso</h3>
          {pendientes.length === 0 ? (
            <p className="tarjeta text-sm text-zinc-500">Nada pendiente. Para marcar un gasto de empleado, desliza el movimiento a la izquierda en Movimientos.</p>
          ) : (
            <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {pendientes.map(({ gasto, pendiente }) => {
                const d = dias(gasto.fecha_operacion, hoy)
                return (
                  <li key={gasto.id}>
                    <FilaMovimientoDeslizable m={gasto} conFecha onPulsar={() => setDetalle(gasto.id)} />
                    {(d > umbral || pendiente < -gasto.importe) && (
                      <p className={`-mt-1 px-4 pb-2 pl-[60px] text-[11px] ${d > umbral ? 'text-[#D70015] dark:text-[#FF6961]' : 'text-zinc-500'}`}>
                        {d > umbral ? `Hace ${d} días. ` : ''}
                        {pendiente < -gasto.importe ? `Quedan ${formatearImporte(pendiente)} por reembolsar` : ''}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {(ind.diferencias.length > 0 || ind.reembolsosDeMas.length > 0) && (
          <section>
            <h3 className="mb-1.5 px-4 text-[13px] font-medium text-zinc-500 uppercase">Diferencias</h3>
            <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {ind.diferencias.map(({ gasto, noReembolsado }) => (
                <li key={gasto.id}>
                  <button className="fila w-full" onClick={() => setDetalle(gasto.id)}>
                    <Baldosa glifo={Briefcase} color="#8E8E93" tamano="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{gasto.concepto_limpio}</span>
                      <span className="block text-xs text-zinc-500">{formatearFecha(gasto.fecha_operacion)}. Cerrado sin reembolso completo</span>
                    </span>
                    <span className="text-[15px] text-[#D70015] tabular-nums dark:text-[#FF6961]">{formatearImporte(-noReembolsado)}</span>
                  </button>
                </li>
              ))}
              {ind.reembolsosDeMas.map(({ reembolso, sinAplicar }) => (
                <li key={reembolso.id} className="fila">
                  <Baldosa glifo={Check} color="#34C759" tamano="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">Reembolso de más</span>
                    <span className="block text-xs text-zinc-500">{formatearFecha(reembolso.fecha_operacion)}. Sin gastos a los que aplicarlo</span>
                  </span>
                  <span className="text-[15px] tabular-nums">{formatearImporte(sinAplicar)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <HojaConciliacion reembolso={conciliando} onCerrar={() => setConciliando(null)} />
      <DetalleMovimiento id={detalle} onCerrar={() => setDetalle(null)} />
    </>
  )
}

/** Conciliación: propone los gastos pendientes que suman el reembolso; se pueden cambiar a mano */
function HojaConciliacion({ reembolso, onCerrar }: { reembolso: Movimiento | null; onCerrar: () => void }) {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const [elegidos, setElegidos] = useState<{ para: string; ids: Set<string>; exacta: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!reembolso) return null
  const pendientes = gastosPendientes(db).filter((p) => p.gasto.fecha_operacion <= reembolso.fecha_operacion)
  let actual = elegidos
  if (!actual || actual.para !== reembolso.id) {
    const p = proponerConciliacion(db, reembolso.id)
    actual = { para: reembolso.id, ids: new Set(p.gastos), exacta: p.exacta }
  }
  const restante = Math.round((reembolso.importe - (aplicado(db).reembolsos.get(reembolso.id) ?? 0)) * 100) / 100
  const suma = Math.round(pendientes.filter((p) => actual.ids.has(p.gasto.id)).reduce((s, p) => s + p.pendiente, 0) * 100) / 100
  const dif = Math.round((restante - suma) * 100) / 100
  const cambiar = (id: string) => {
    const n = new Set(actual.ids)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setElegidos({ para: reembolso.id, ids: n, exacta: false })
  }

  return (
    <Hoja
      abierta
      titulo={`Conciliar ${formatearImporte(restante)}`}
      onCerrar={() => {
        setElegidos(null)
        setError(null)
        onCerrar()
      }}
      acciones={
        <>
          <button className="boton-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            className="boton-primario"
            disabled={!actual.ids.size}
            onClick={async () => {
              const e = await intentar((d) => conciliar(d, reembolso.id, [...actual.ids]), `Reembolso conciliado con ${actual.ids.size} gastos`)
              if (e) setError(e)
              else {
                avisar(`Reembolso conciliado con ${actual.ids.size} gastos`)
                setElegidos(null)
                onCerrar()
              }
            }}
          >
            Vincular {actual.ids.size}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className={`rounded-[10px] px-3 py-2 text-sm ${dif === 0 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'}`}>
          {dif === 0
            ? `Cuadra: los gastos elegidos suman ${formatearImporte(suma)}.`
            : dif > 0
              ? `Faltan ${formatearImporte(dif)}: quedaría reembolso de más.`
              : `Sobran ${formatearImporte(-dif)}: el último gasto quedará reembolsado en parte.`}
          {actual.exacta && ' Propuesta automática, del más antiguo al más reciente.'}
        </p>
        <ul className="lista divide-y divide-zinc-200/70 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {pendientes.map(({ gasto, pendiente }) => (
            <li key={gasto.id}>
              <button className="fila w-full" onClick={() => cambiar(gasto.id)}>
                <span className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${actual.ids.has(gasto.id) ? 'border-marca-600 bg-marca-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                  {actual.ids.has(gasto.id) && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{gasto.concepto_limpio}</span>
                  <span className="block text-xs text-zinc-500">{formatearFecha(gasto.fecha_operacion)}</span>
                </span>
                <span className="text-[15px] tabular-nums">{formatearImporte(pendiente)}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && <Aviso>{error}</Aviso>}
      </div>
    </Hoja>
  )
}
