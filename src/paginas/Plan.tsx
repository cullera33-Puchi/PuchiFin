import { CalendarCheck, CircleCheck, FileText, HandCoins, Settings2 } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHacer } from '../componentes/acciones'
import { BarraNavegacion } from '../componentes/Encabezado'
import { GraficoCapital } from '../componentes/GraficoCapital'
import { SimularNominas } from './Ingresos'
import { BotonClaude, HojaClaude } from '../componentes/HojaClaude'
import { Baldosa } from '../componentes/Icono'
import { Hoja } from '../componentes/Interfaz'
import { SelectorCategoria } from '../componentes/movimientos'
import { guardarCompromiso } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { textoPlan } from '../lib/analizar'
import { hoyIso, MESES } from '../lib/fechas'
import { formatearFecha, formatearRedondo, leerImporteUsuario } from '../lib/formato'
import { useSimulacion } from '../componentes/simulacion'
import { calcularPlan, efectoMesCerrado, haySimulacion, SIN_SIMULACION, type Plan as DatosPlan, type ResultadoPlan, type Simulacion } from '../lib/plan'
import type { BaseDatos, Compromiso } from '../lib/tipos'
import { nombreCategoria } from '../lib/vista'

const mesNombre = (n: number) => MESES[n - 1]
const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const EXTRAS = [-100, 0, 100, 200, 300, 500]
const RECORTES = [10, 20, 30, 50]

const FALTA: Record<Exclude<ResultadoPlan['falta'], null>, string> = {
  sin_compromiso: 'No hay ninguna deuda activa.',
  sin_deuda: 'Introduce la deuda pendiente y el colchón para ver el plan. Los importes solo se guardan en el iPhone.',
  sin_cuenta: 'Elige la cuenta de ahorro sobre la que va el colchón.',
  sin_saldo: 'Importa un Excel de la cuenta de ahorro para conocer su saldo.',
  sin_historia: 'Hace falta al menos un mes completo de datos, además del primero importado, para prever el ahorro.',
}

/** Año en que queda saldada, en palabras */
const textoSaldada = (p: DatosPlan) => (p.deudaPendiente === 0 ? 'Deuda saldada' : p.saldadaEn ? `Saldada en ${p.saldadaEn}` : 'No se salda en 30 años al ritmo previsto')

/**
 * Plan de pagos de la deuda familiar (apartado 10): deuda pendiente, pago previsto de cada verano,
 * calendario hasta saldarla, simulación y pagos hechos. Se recalcula con cada importación.
 */
export function Plan() {
  const db = useDatos()
  const hoy = hoyIso()
  const r = useMemo(() => calcularPlan(db, hoy), [db, hoy])
  const [sim, setSim] = useSimulacion()
  // El cálculo va un paso por detrás de lo que se escribe: el campo no se bloquea
  const diferida = useDeferredValue(sim)
  const simulando = haySimulacion(db, diferida)
  const simulado = useMemo(() => (simulando ? calcularPlan(db, hoy, diferida).plan : null), [db, hoy, diferida, simulando])
  const efecto = useMemo(() => efectoMesCerrado(db, hoy), [db, hoy])
  const [ajustes, setAjustes] = useState(false)
  const [claude, setClaude] = useState(false)
  const compromiso = db.compromisos.find((c) => c.activo)

  return (
    <>
      <BarraNavegacion
        titulo="Plan de pagos"
        atras="Extracto"
        subtitulo={compromiso?.nombre}
        accion={
          compromiso && (
            <button className="boton-icono justify-self-end" aria-label="Ajustar la deuda y la regla de pago" onClick={() => setAjustes(true)}>
              <Settings2 className="size-[22px]" strokeWidth={1.75} />
            </button>
          )
        }
      />
      {!r.plan ? (
        <div className="tarjeta space-y-3 py-8 text-center">
          <HandCoins className="mx-auto size-12 text-zinc-400" strokeWidth={1.5} />
          <p className="text-[15px]">{FALTA[r.falta]}</p>
          {compromiso && (r.falta === 'sin_deuda' || r.falta === 'sin_cuenta') && (
            <button className="boton-primario" onClick={() => setAjustes(true)}>
              Configurar
            </button>
          )}
        </div>
      ) : (
        <ContenidoPlan db={db} plan={r.plan} sim={sim} setSim={setSim} simulado={simulado} efecto={efecto} onClaude={() => setClaude(true)} />
      )}
      {compromiso && <HojaAjustes compromiso={compromiso} abierta={ajustes} onCerrar={() => setAjustes(false)} />}
      {r.plan && (
        <HojaClaude
          abierta={claude}
          titulo="Analizar con Claude"
          explicacion="Claude revisa si el plan es realista, cómo adelantar el año en que queda saldada y qué riesgos ves."
          texto={claude ? textoPlan(db, r.plan, sim, simulado) : ''}
          archivo="puchifin-plan-de-pagos.txt"
          registro="Analizar plan de pagos"
          onCerrar={() => setClaude(false)}
        />
      )}
    </>
  )
}

function ContenidoPlan({
  db,
  plan,
  sim,
  setSim,
  simulado,
  efecto,
  onClaude,
}: {
  db: BaseDatos
  plan: DatosPlan
  sim: Simulacion
  setSim: (s: Simulacion) => void
  simulado: DatosPlan | null
  efecto: ReturnType<typeof efectoMesCerrado>
  onClaude: () => void
}) {
  const c = plan.compromiso
  const proximo = plan.pagos[0]
  const [eligiendo, setEligiendo] = useState(false)
  // Al restablecer, los campos de deuda y colchón vuelven a los importes del plan
  const [reinicio, setReinicio] = useState(0)
  const recorte = sim.recorte
  const diferencia = simulado && proximo ? (simulado.pagos[0]?.pago ?? 0) - proximo.pago : 0
  const anios = simulado?.saldadaEn && plan.saldadaEn ? plan.saldadaEn - simulado.saldadaEn : 0

  return (
    <div className="space-y-4">
      <section className="tarjeta">
        <p className="text-[13px] text-zinc-500">Deuda pendiente</p>
        <p className="text-[30px] leading-tight font-bold tracking-tight tabular-nums">{formatearRedondo(plan.deudaPendiente)}</p>
        {plan.pagado > 0 && <p className="text-[13px] text-zinc-500 tabular-nums">Ya pagado: {formatearRedondo(plan.pagado)}</p>}
        {proximo && (
          <div className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
            <span className="block text-[13px] text-zinc-500">
              Pago previsto en {mesNombre(Number(proximo.mes.slice(5, 7)))} de {proximo.anio}
            </span>
            <span className="text-[22px] font-semibold tabular-nums">{formatearRedondo(proximo.pago)}</span>
          </div>
        )}
        <p className="mt-2 text-[15px] font-medium">{textoSaldada(plan)}</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          {plan.cuenta.alias}: {formatearRedondo(plan.saldo)} al {formatearFecha(plan.fechaSaldo)}. Ahorro previsto: unos {formatearRedondo(plan.ahorroMensual)} al mes.
        </p>
        {efecto && (
          <p className={`mt-1 text-[12px] ${efecto.diferencia >= 0 ? 'text-[#248A3D] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF6961]'}`}>
            {conMayuscula(mesNombre(Number(efecto.mes.slice(5, 7))))} {efecto.diferencia >= 0 ? 'suma' : 'resta'} {formatearRedondo(Math.abs(efecto.diferencia))} al pago: ahorraste{' '}
            {formatearRedondo(efecto.real)} y se preveían {formatearRedondo(efecto.previsto)}.
          </p>
        )}
      </section>

      <section>
        <h3 className="cabecera-grupo">Capital previsto</h3>
        <div className="lista px-4 py-3">
          <GraficoCapital base={plan.serie} simulado={simulado?.serie ?? null} />
          <p className="mt-2 text-[12px] text-zinc-500">Cuentas menos lo pendiente de la tarjeta, más el ahorro previsto y menos los pagos de la deuda.</p>
        </div>
      </section>

      <section>
        <h3 className="cabecera-grupo">Calendario</h3>
        <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {plan.pagosReales.map((p) => (
            <li key={`r${p.anio}`} className="fila">
              <Baldosa glifo={CircleCheck} color="#34C759" tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">{p.anio}</span>
                <span className="block text-[12px] text-zinc-500">Pagado</span>
              </span>
              <span className="text-[15px] tabular-nums">{formatearRedondo(p.importe)}</span>
            </li>
          ))}
          {plan.pagos.map((p) => (
            <li key={p.mes} className="fila">
              <Baldosa glifo={CalendarCheck} color="#007AFF" tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">
                  {conMayuscula(mesNombre(Number(p.mes.slice(5, 7))))} de {p.anio}
                </span>
                <span className="block text-[12px] text-zinc-500 tabular-nums">{p.deudaTras > 0 ? `Quedan ${formatearRedondo(p.deudaTras)}` : 'Queda saldada'}</span>
              </span>
              <span className="text-[15px] tabular-nums">{formatearRedondo(p.pago)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 px-4 text-[12px] text-zinc-500">
          Cada {mesNombre(c.mes_referencia)}, todo lo que supere el colchón de {formatearRedondo(c.colchon)} en {plan.cuenta.alias}. Los pagos se marcan con el tipo Pago de
          deuda y se descuentan solos.
        </p>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="cabecera-grupo">Simulación</h3>
          {simulado && (
            <button
              className="boton-texto px-4 text-[15px]"
              onClick={() => {
                setSim(SIN_SIMULACION)
                setReinicio((n) => n + 1)
              }}
            >
              Restablecer
            </button>
          )}
        </div>
        <div className="lista space-y-3 px-4 py-3">
          <DeudaYColchon key={`${reinicio}-${plan.deudaPendiente}-${c.colchon}`} plan={plan} sim={sim} setSim={setSim} />
          <div>
            <p className="mb-1 text-[13px] text-zinc-500">Nóminas</p>
            <SimularNominas db={db} sim={sim} setSim={setSim} />
          </div>
          <div>
            <p className="text-[13px] text-zinc-500">Ahorro de más cada mes</p>
            <div className="mt-1.5 flex gap-2 overflow-x-auto [scrollbar-width:none]">
              {EXTRAS.map((x) => (
                <button
                  key={x}
                  role="radio"
                  aria-checked={sim.ahorroExtra === x}
                  className={`min-h-9 shrink-0 rounded-full px-3 text-[13px] font-medium tabular-nums ${sim.ahorroExtra === x ? 'bg-marca-700 text-white dark:bg-marca-600' : 'bg-zinc-100 dark:bg-zinc-800'}`}
                  onClick={() => setSim({ ...sim, ahorroExtra: x })}
                >
                  {x === 0 ? 'Igual' : `${x > 0 ? '+' : ''}${x} €`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[13px] text-zinc-500">Recortar una categoría</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <button className="boton-secundario min-h-9 px-3 py-1 text-[13px]" onClick={() => setEligiendo(true)}>
                {recorte ? nombreCategoria(db, recorte.categoria_id) : 'Elegir categoría'}
              </button>
              {recorte &&
                RECORTES.map((x) => (
                  <button
                    key={x}
                    role="radio"
                    aria-checked={recorte.porcentaje === x}
                    className={`min-h-9 shrink-0 rounded-full px-3 text-[13px] font-medium ${recorte.porcentaje === x ? 'bg-marca-700 text-white dark:bg-marca-600' : 'bg-zinc-100 dark:bg-zinc-800'}`}
                    onClick={() => setSim({ ...sim, recorte: { ...recorte, porcentaje: x } })}
                  >
                    {x} %
                  </button>
                ))}
              {recorte && (
                <button className="boton-texto px-1" onClick={() => setSim({ ...sim, recorte: null })}>
                  Quitar
                </button>
              )}
            </div>
          </div>
          {simulado && (
            <div className="rounded-xl bg-zinc-100 px-3 py-2 text-[15px] dark:bg-zinc-800">
              <p className="tabular-nums">
                Primer pago: {formatearRedondo(simulado.pagos[0]?.pago ?? 0)}{' '}
                <span className={diferencia >= 0 ? 'text-[#248A3D] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF6961]'}>
                  ({diferencia >= 0 ? '+' : ''}
                  {formatearRedondo(diferencia)})
                </span>
              </p>
              <p>
                {textoSaldada(simulado)}
                {anios > 0 ? `, ${anios === 1 ? 'un año' : `${anios} años`} antes` : anios < 0 ? `, ${-anios === 1 ? 'un año' : `${-anios} años`} después` : ''}
              </p>
            </div>
          )}
        </div>
      </section>

      <p className="px-4 text-[12px] text-zinc-500">
        Supuesto: lo que ahorras cada mes acaba en {plan.cuenta.alias} y la cuenta principal mantiene su nivel. Ingresos: tus{' '}
        <Link to="/extracto/ingresos" className="text-marca-700 dark:text-marca-500">
          nóminas
        </Link>{' '}
        y, para el resto, los del mismo mes del año anterior o la media; gastos: tu{' '}
        <Link to="/extracto/presupuesto" className="text-marca-700 dark:text-marca-500">
          presupuesto
        </Link>{' '}
        o la media de cada categoría ({plan.mesesBase} {plan.mesesBase === 1 ? 'mes cerrado' : 'meses cerrados'}), más los{' '}
        <Link to="/extracto/previstos" className="text-marca-700 dark:text-marca-500">
          gastos previstos
        </Link>
        .
      </p>
      <BotonClaude onPulsar={onClaude} />
      <Link to="/resumenes" className="boton-secundario w-full">
        <FileText className="size-4" strokeWidth={2} /> Compartir en PDF
      </Link>
      <p className="-mt-2 px-4 text-[12px] text-zinc-500">El resumen en PDF incluye el plan actual y el escenario con las nóminas que no cuentan.</p>

      <SelectorCategoria
        abierta={eligiendo}
        actual={recorte?.categoria_id ?? null}
        permitirNinguna={false}
        onElegir={(id) => {
          setEligiendo(false)
          if (!id) return
          // El recorte va sobre la categoría principal
          const raiz = db.categorias.find((x) => x.id === id)?.padre_id ?? id
          setSim({ ...sim, recorte: { categoria_id: raiz, porcentaje: recorte?.porcentaje ?? 20 } })
        }}
        onCerrar={() => setEligiendo(false)}
      />
    </div>
  )
}

/**
 * Deuda pendiente y colchón para simular: se prueban otros importes sin cambiar el plan y, si convencen,
 * «Guardar estos importes» los deja como valores del plan.
 */
function DeudaYColchon({ plan, sim, setSim }: { plan: DatosPlan; sim: Simulacion; setSim: (s: Simulacion) => void }) {
  const hacer = useHacer()
  const c = plan.compromiso
  const inicial = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
  const [deuda, setDeuda] = useState(inicial(sim.deuda ?? plan.deudaPendiente))
  const [colchon, setColchon] = useState(inicial(sim.colchon ?? c.colchon))
  const cambiar = (campo: 'deuda' | 'colchon', texto: string) => {
    if (campo === 'deuda') setDeuda(texto)
    else setColchon(texto)
    const v = leerImporteUsuario(texto || '0')
    if (v === null || v < 0) return
    const guardado = campo === 'deuda' ? plan.deudaPendiente : c.colchon
    setSim({ ...sim, [campo]: Math.abs(v - guardado) < 0.005 ? undefined : v })
  }
  const distinto = sim.deuda !== undefined || sim.colchon !== undefined
  const guardar = async () => {
    // La deuda se guarda a la fecha de referencia: lo pendiente más lo ya pagado desde entonces
    const ok = await hacer(
      (d) =>
        guardarCompromiso(d, c.id, {
          deuda_inicial: (sim.deuda ?? plan.deudaPendiente) + plan.pagado,
          colchon: sim.colchon ?? c.colchon,
          fecha_referencia: c.fecha_referencia,
          cuenta_colchon_id: c.cuenta_colchon_id,
          ventana_mes_inicio: c.ventana_mes_inicio,
          ventana_mes_fin: c.ventana_mes_fin,
          mes_referencia: c.mes_referencia,
        }),
      'Deuda y colchón guardados en el plan',
    )
    if (ok) setSim({ ...sim, deuda: undefined, colchon: undefined })
  }
  const campo = 'w-28 rounded-lg bg-zinc-100 px-2 py-1.5 text-right text-[15px] tabular-nums outline-none dark:bg-zinc-800'
  return (
    <div>
      <label className="flex min-h-11 items-center gap-3">
        <span className="flex-1 text-[15px]">Deuda pendiente</span>
        <input className={campo} inputMode="decimal" aria-label="Deuda pendiente para simular" value={deuda} onChange={(e) => cambiar('deuda', e.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <span className="flex-1 text-[15px]">Colchón en {plan.cuenta.alias}</span>
        <input className={campo} inputMode="decimal" aria-label="Colchón para simular" value={colchon} onChange={(e) => cambiar('colchon', e.target.value)} />
      </label>
      {distinto && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          <span className="text-[12px] text-zinc-500">
            En el plan: {formatearRedondo(plan.deudaPendiente)} de deuda y {formatearRedondo(c.colchon)} de colchón.
          </span>
          <button className="boton-texto px-0 text-[15px]" onClick={guardar}>
            Guardar estos importes
          </button>
        </div>
      )}
    </div>
  )
}

/** Deuda a la fecha de referencia, colchón, cuenta de ahorro y ventana de pago */
function HojaAjustes({ compromiso, abierta, onCerrar }: { compromiso: Compromiso; abierta: boolean; onCerrar: () => void }) {
  const db = useDatos()
  const hacer = useHacer()
  const bancarias = db.cuentas.filter((c) => c.tipo === 'cuenta' && c.activa)
  const inicial = () => ({
    deuda: compromiso.deuda_inicial ? String(compromiso.deuda_inicial).replace('.', ',') : '',
    colchon: compromiso.colchon ? String(compromiso.colchon).replace('.', ',') : '',
    fecha: compromiso.fecha_referencia,
    cuenta: compromiso.cuenta_colchon_id ?? bancarias[1]?.id ?? bancarias[0]?.id ?? '',
    inicio: compromiso.ventana_mes_inicio,
    fin: compromiso.ventana_mes_fin,
    referencia: compromiso.mes_referencia,
  })
  const [f, setF] = useState(inicial)
  const [abiertaAntes, setAbiertaAntes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Al abrir, los valores guardados (ajuste durante el render, sin efecto)
  if (abierta !== abiertaAntes) {
    setAbiertaAntes(abierta)
    if (abierta) {
      setF(inicial())
      setError(null)
    }
  }
  const guardar = async () => {
    const deuda = leerImporteUsuario(f.deuda || '0')
    const colchon = leerImporteUsuario(f.colchon || '0')
    if (deuda === null || colchon === null) return setError('Revisa los importes')
    const ok = await hacer(
      (d) =>
        guardarCompromiso(d, compromiso.id, {
          deuda_inicial: deuda,
          colchon,
          fecha_referencia: f.fecha,
          cuenta_colchon_id: f.cuenta || null,
          ventana_mes_inicio: f.inicio,
          ventana_mes_fin: f.fin,
          mes_referencia: f.referencia,
        }),
      'Plan de pagos guardado',
    )
    if (ok) onCerrar()
  }
  const selectorMes = (valor: number, cambiar: (n: number) => void, etiqueta: string) => (
    <select className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none" value={valor} aria-label={etiqueta} onChange={(e) => cambiar(Number(e.target.value))}>
      {MESES.map((m, i) => (
        <option key={m} value={i + 1}>
          {conMayuscula(m)}
        </option>
      ))}
    </select>
  )
  return (
    <Hoja abierta={abierta} titulo={compromiso.nombre} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">Deuda pendiente</span>
            <input className="w-32 bg-transparent text-right text-[15px] tabular-nums outline-none" inputMode="decimal" placeholder="0,00 €" value={f.deuda} onChange={(e) => setF({ ...f, deuda: e.target.value })} />
          </label>
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">A fecha de</span>
            <input type="date" className="bg-transparent text-right text-[15px] outline-none" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </label>
        </div>
        <p className="-mt-2 px-4 text-[12px] text-zinc-500">Los pagos de deuda posteriores a esa fecha se descuentan solos.</p>
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">Colchón</span>
            <input className="w-32 bg-transparent text-right text-[15px] tabular-nums outline-none" inputMode="decimal" placeholder="0,00 €" value={f.colchon} onChange={(e) => setF({ ...f, colchon: e.target.value })} />
          </label>
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">Sobre la cuenta</span>
            <select className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none" value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })}>
              {bancarias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">Se paga desde</span>
            {selectorMes(f.inicio, (n) => setF({ ...f, inicio: n }), 'Primer mes de la ventana de pago')}
          </label>
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">Hasta</span>
            {selectorMes(f.fin, (n) => setF({ ...f, fin: n }), 'Último mes de la ventana de pago')}
          </label>
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">Mes de referencia</span>
            {selectorMes(f.referencia, (n) => setF({ ...f, referencia: n }), 'Mes de referencia del pago')}
          </label>
        </div>
        <p className="-mt-2 px-4 text-[12px] text-zinc-500">Sin intereses. El pago previsto es todo lo que supere el colchón en el mes de referencia.</p>
        {error && <p className="px-1 text-[13px] text-[#D70015] dark:text-[#FF6961]">{error}</p>}
        <button className="boton-primario w-full" onClick={guardar}>
          Guardar
        </button>
      </div>
    </Hoja>
  )
}
