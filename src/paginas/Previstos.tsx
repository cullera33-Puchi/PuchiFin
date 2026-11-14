import { CalendarClock, CalendarPlus, CircleCheck, Plus, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useHacer } from '../componentes/acciones'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { Hoja, Segmentado, useInterfaz } from '../componentes/Interfaz'
import { SelectorCategoria } from '../componentes/movimientos'
import { borrarEvento, guardarEvento } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { hoyIso, mismoDiaEn } from '../lib/fechas'
import { formatearFecha, formatearImporte, formatearRedondo, leerImporteUsuario, plural } from '../lib/formato'
import { estadoEventos, type EstadoEvento, type EventoConEstado } from '../lib/previstos'
import type { EventoPrevisto } from '../lib/tipos'
import { nombreCategoria } from '../lib/vista'

const ESTADO: Record<EstadoEvento, { texto: string; glifo: typeof CalendarClock; color: string }> = {
  pendiente: { texto: 'Pendiente', glifo: CalendarClock, color: '#007AFF' },
  cobrado: { texto: 'Ya cargado', glifo: CircleCheck, color: '#34C759' },
  no_visto: { texto: 'No aparece en los movimientos', glifo: TriangleAlert, color: '#FF9500' },
}

/**
 * Gastos previstos del año: lo que se sabe que llega (IBI, seguros anuales, vacaciones, colegio) y
 * también ingresos puntuales. Los pendientes entran en la previsión de cierre del mes y en el plan de
 * pagos; al aparecer un cargo parecido cerca de su fecha, se dan por cargados.
 */
export function Previstos() {
  const db = useDatos()
  const hacer = useHacer()
  const hoy = hoyIso()
  const eventos = useMemo(() => estadoEventos(db, hoy), [db, hoy])
  const [editando, setEditando] = useState<EventoPrevisto | 'nuevo' | null>(null)
  const pendientes = eventos.filter((e) => e.estado === 'pendiente')
  const pasados = eventos.filter((e) => e.estado !== 'pendiente').reverse()
  const totalPendiente = pendientes.reduce((s, e) => s + e.evento.importe, 0)
  // Pasados que aún no tienen su copia del año siguiente
  const sinRepetir = (e: EventoPrevisto) => {
    const siguiente = mismoDiaEn(e.fecha, 12)
    return !db.eventos_previstos.some((x) => x.concepto === e.concepto && Math.abs(Date.parse(x.fecha) - Date.parse(siguiente)) < 45 * 86400000)
  }
  const repetir = (e: EventoPrevisto) =>
    hacer(
      (d) => guardarEvento(d, { fecha: mismoDiaEn(e.fecha, 12), concepto: e.concepto, importe: e.importe, categoria_id: e.categoria_id }),
      `${e.concepto}: previsto para ${formatearFecha(mismoDiaEn(e.fecha, 12))}`,
    )

  const fila = (x: EventoConEstado, conRepetir: boolean) => {
    const e = x.evento
    const est = ESTADO[x.estado]
    return (
      <li key={e.id} className="flex items-center">
        <button className="fila min-h-14 min-w-0 flex-1 active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setEditando(e)}>
          <Baldosa glifo={est.glifo} color={est.color} tamano="sm" />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[15px]">{e.concepto}</span>
            <span className="block truncate text-[12px] text-zinc-500">
              {formatearFecha(e.fecha)}
              {e.categoria_id ? `, ${nombreCategoria(db, e.categoria_id)}` : ''}
              {x.estado !== 'pendiente' ? `. ${est.texto}` : ''}
            </span>
          </span>
          <span className={`shrink-0 text-[15px] tabular-nums ${e.importe > 0 ? 'text-[#248A3D] dark:text-[#30D158]' : ''}`}>
            {e.importe > 0 ? '+' : ''}
            {formatearImporte(e.importe)}
          </span>
        </button>
        {conRepetir && sinRepetir(e) && (
          <button className="boton-icono mr-2 shrink-0" aria-label={`Repetir ${e.concepto} el año que viene`} onClick={() => repetir(e)}>
            <CalendarPlus className="size-5" strokeWidth={1.75} />
          </button>
        )}
      </li>
    )
  }

  return (
    <>
      <BarraNavegacion
        titulo="Gastos previstos"
        atras="Extracto"
        subtitulo={pendientes.length ? plural(pendientes.length, 'pendiente', 'pendientes') : undefined}
        accion={
          <button className="boton-icono" aria-label="Añadir un gasto previsto" onClick={() => setEditando('nuevo')}>
            <Plus className="size-6" strokeWidth={1.75} />
          </button>
        }
      />
      <p className="mb-3 px-1 text-[13px] text-zinc-500">
        Lo que sabes que llega en una fecha y no es de todos los meses: IBI, seguros anuales, vacaciones, colegio o una paga extra. Cuentan en la previsión del mes y en el plan
        de pagos. Los recibos que ya se repiten solos (Gastos fijos) no hace falta darlos de alta.
      </p>
      {!eventos.length ? (
        <div className="tarjeta space-y-3 py-8 text-center">
          <CalendarClock className="mx-auto size-12 text-zinc-400" strokeWidth={1.5} />
          <p className="text-[15px]">Aún no hay gastos previstos.</p>
          <button className="boton-primario" onClick={() => setEditando('nuevo')}>
            <Plus className="size-4" strokeWidth={2} /> Añadir el primero
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {pendientes.length > 0 && (
            <section>
              <h3 className="cabecera-grupo">Pendientes</h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">{pendientes.map((x) => fila(x, false))}</ul>
              <p className="mt-1 px-4 text-[12px] text-zinc-500 tabular-nums">Total pendiente: {formatearRedondo(totalPendiente)}</p>
            </section>
          )}
          {pasados.length > 0 && (
            <section>
              <h3 className="cabecera-grupo">Pasados</h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">{pasados.map((x) => fila(x, true))}</ul>
              <p className="mt-1 px-4 text-[12px] text-zinc-500">Con el calendario de la derecha, se prevé otra vez para el año que viene.</p>
            </section>
          )}
        </div>
      )}
      <HojaEvento evento={editando} onCerrar={() => setEditando(null)} />
    </>
  )
}

/** Alta y edición de un previsto: concepto, fecha, gasto o ingreso, importe y categoría */
function HojaEvento({ evento, onCerrar }: { evento: EventoPrevisto | 'nuevo' | null; onCerrar: () => void }) {
  const db = useDatos()
  const hacer = useHacer()
  const { confirmar } = useInterfaz()
  const existente = evento && evento !== 'nuevo' ? evento : null
  const clave = existente?.id ?? (evento ? 'nuevo' : '')
  // El formulario se reinicia al abrir otro evento (ajuste durante el render, sin efecto)
  const [abiertoCon, setAbiertoCon] = useState('')
  const [concepto, setConcepto] = useState('')
  const [fecha, setFecha] = useState('')
  const [signo, setSigno] = useState<'gasto' | 'ingreso'>('gasto')
  const [importe, setImporte] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [eligiendo, setEligiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (clave && clave !== abiertoCon) {
    setAbiertoCon(clave)
    setConcepto(existente?.concepto ?? '')
    setFecha(existente?.fecha ?? mismoDiaEn(hoyIso(), 1))
    setSigno(existente && existente.importe > 0 ? 'ingreso' : 'gasto')
    setImporte(existente ? String(Math.abs(existente.importe)).replace('.', ',') : '')
    setCategoria(existente?.categoria_id ?? null)
    setError(null)
  }
  const cerrar = () => {
    setAbiertoCon('')
    onCerrar()
  }
  const guardar = async () => {
    const valor = leerImporteUsuario(importe)
    if (valor === null || valor === 0) return setError('Escribe un importe')
    const datos = { concepto, fecha, importe: signo === 'gasto' ? -Math.abs(valor) : Math.abs(valor), categoria_id: categoria }
    if (await hacer((d) => guardarEvento(d, datos, existente?.id), existente ? 'Gasto previsto guardado' : `${concepto.trim()}: previsto`)) cerrar()
  }
  const borrar = async () => {
    if (!existente) return
    if (!(await confirmar({ titulo: 'Borrar el gasto previsto', texto: `${existente.concepto}, ${formatearFecha(existente.fecha)}`, aceptar: 'Borrar', peligro: true }))) return
    if (await hacer((d) => borrarEvento(d, existente.id), 'Gasto previsto borrado')) cerrar()
  }

  return (
    <>
      <Hoja abierta={!!evento} titulo={existente ? 'Gasto previsto' : 'Nuevo gasto previsto'} onCerrar={cerrar}>
        <div className="space-y-4">
          <Segmentado
            etiqueta="Gasto o ingreso"
            opciones={[
              ['gasto', 'Gasto'],
              ['ingreso', 'Ingreso'],
            ]}
            valor={signo}
            onCambio={setSigno}
          />
          <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            <label className="fila min-h-12">
              <span className="w-24 shrink-0 text-[15px]">Concepto</span>
              <input className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none" placeholder="IBI, seguro del coche…" maxLength={60} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
            </label>
            <label className="fila min-h-12">
              <span className="w-24 shrink-0 text-[15px]">Fecha</span>
              <input type="date" className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className="fila min-h-12">
              <span className="w-24 shrink-0 text-[15px]">Importe</span>
              <input className="min-w-0 flex-1 bg-transparent text-right text-[15px] tabular-nums outline-none" inputMode="decimal" placeholder="0,00 €" value={importe} onChange={(e) => setImporte(e.target.value)} />
            </label>
            <button type="button" className="fila min-h-12 w-full active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setEligiendo(true)}>
              <span className="w-24 shrink-0 text-left text-[15px]">Categoría</span>
              <span className="min-w-0 flex-1 truncate text-right text-[15px] text-zinc-500">{categoria ? nombreCategoria(db, categoria) : 'Ninguna'}</span>
            </button>
          </div>
          <p className="px-1 text-[12px] text-zinc-500">
            Con categoría, la app lo da por cargado cuando aparece un movimiento de esa categoría con un importe parecido, hasta 20 días antes o después.
          </p>
          {error && <p className="px-1 text-[13px] text-[#D70015] dark:text-[#FF6961]">{error}</p>}
          <button className="boton-primario w-full" onClick={guardar}>
            Guardar
          </button>
          {existente && (
            <button className="boton-texto w-full text-red-600 dark:text-red-500" onClick={borrar}>
              Borrar
            </button>
          )}
        </div>
      </Hoja>
      <SelectorCategoria
        abierta={eligiendo}
        actual={categoria}
        onElegir={(c) => {
          setEligiendo(false)
          setCategoria(c)
        }}
        onCerrar={() => setEligiendo(false)}
      />
    </>
  )
}
