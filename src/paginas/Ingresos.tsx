import { Briefcase, ChevronRight, CircleCheck, Plus, TriangleAlert } from 'lucide-react'
import { Fragment, useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHacer } from '../componentes/acciones'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { Hoja, Interruptor, Segmentado, useInterfaz } from '../componentes/Interfaz'
import { borrarNomina, guardarNomina } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { hoyIso, MESES, mesLargo, sumarMeses } from '../lib/fechas'
import { formatearImporte, formatearRedondo, leerImporteUsuario, plural } from '../lib/formato'
import { fijoEn, objetivoEn, resumenBruta, vigenteDesde } from '../lib/nomina'
import { useSimulacion } from '../componentes/simulacion'
import {
  calcularPlan,
  comprobarPrevision,
  evolucionAnual,
  hayCrecimiento,
  haySimulacion,
  inflacionDe,
  preverIngresos,
  SIN_SIMULACION,
  tieneBonus,
  type AnioPrevisto,
  type Comprobacion,
  type Simulacion,
} from '../lib/plan'
import type { BaseDatos, Nomina, NominaBruta, PagaExtra } from '../lib/tipos'

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const nombreMes = (mes: string) => conMayuscula(mesLargo(`${mes}-01`).toLowerCase())
const texto = (n: number) => String(n).replace('.', ',')

/** «2.800 € al mes, pagas en junio y diciembre, desde marzo de 2027» */
// oxlint-disable-next-line react/only-export-components
export function resumenNomina(n: Nomina): string {
  if (n.bruto) {
    const b = n.bruto
    const hoy = hoyIso().slice(0, 7)
    const partes = [`${formatearRedondo(fijoEn(b, hoy))} brutos en ${b.pagas} pagas, unos ${formatearRedondo(n.neto_mensual)} netos al mes`]
    if (b.bonus_objetivo > 0) partes.push(`bonus de ${formatearRedondo(objetivoEn(b, hoy))} al ${texto(b.bonus_consecucion)} % en ${MESES[b.bonus_mes - 1]}`)
    if (b.subida_anual) partes.push(`subida del ${texto(b.subida_anual)} % cada ${MESES[b.subida_mes - 1]}`)
    if (n.desde) partes.push(`desde ${mesLargo(`${n.desde}-01`).toLowerCase()}`)
    if (n.hasta) partes.push(`hasta ${mesLargo(`${n.hasta}-01`).toLowerCase()}`)
    return partes.join(', ')
  }
  const partes = [`${formatearRedondo(n.neto_mensual)} al mes`]
  if (n.pagas.length) {
    const meses = n.pagas.map((p) => MESES[p.mes - 1])
    partes.push(`${n.pagas.length === 1 ? 'paga extra en' : 'pagas en'} ${meses.length > 1 ? `${meses.slice(0, -1).join(', ')} y ${meses.at(-1)}` : meses[0]}`)
  }
  if (n.bonus) partes.push(`bonus de ${formatearRedondo(n.bonus.importe)} en ${MESES[n.bonus.mes - 1]}`)
  if (n.desde) partes.push(`desde ${mesLargo(`${n.desde}-01`).toLowerCase()}`)
  if (n.hasta) partes.push(`hasta ${mesLargo(`${n.hasta}-01`).toLowerCase()}`)
  return partes.join(', ')
}

/** Interruptores de simulación: cada nómina se suma o se quita sin cambiar lo guardado */
export function SimularNominas({ db, sim, setSim }: { db: BaseDatos; sim: Simulacion; setSim: (s: Simulacion) => void }) {
  const nominas = db.ajustes.nominas ?? []
  if (!nominas.length)
    return (
      <Link to="/extracto/ingresos" className="text-[13px] text-marca-700 dark:text-marca-500">
        Añadir tus nóminas para simular una segunda
      </Link>
    )
  return (
    <ul className="space-y-1">
      {nominas.map((n) => {
        const activa = sim.nominas?.[n.id] ?? n.incluida
        return (
          <Fragment key={n.id}>
            <li className="flex min-h-11 items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{n.nombre}</span>
                <span className="block truncate text-[12px] text-zinc-500">{resumenNomina(n)}</span>
              </span>
              <Interruptor etiqueta={`Simular con ${n.nombre}`} activo={activa} onCambio={(v) => setSim({ ...sim, nominas: { ...sim.nominas, [n.id]: v } })} />
            </li>
            {tieneBonus(n) && activa && (
              <li key={`${n.id}-bonus`} className="flex min-h-11 items-center gap-3 pl-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">Bonus de {MESES[(n.bruto ? n.bruto.bonus_mes : n.bonus!.mes) - 1]}</span>
                  <span className="block truncate text-[12px] text-zinc-500">
                    {n.bruto ? `Objetivo de ${formatearRedondo(objetivoEn(n.bruto, hoyIso().slice(0, 7)))} brutos` : `${formatearRedondo(n.bonus!.importe)} neto`}, de {n.nombre}
                  </span>
                </span>
                <Interruptor
                  etiqueta={`Simular con el bonus de ${n.nombre}`}
                  activo={sim.bonus?.[n.id] !== false}
                  onCambio={(v) => setSim({ ...sim, bonus: { ...sim.bonus, [n.id]: v } })}
                />
              </li>
            )}
          </Fragment>
        )
      })}
    </ul>
  )
}

const SUBIDAS = [0, 3, 5, 8, 10, 12, 15]
const CONSECUCIONES = [50, 75, 80, 85, 90, 95, 100, 110]
const INFLACIONES = [0, 2, 3, 4, 5]

/** Un porcentaje de la simulación: las opciones habituales más el valor guardado */
function ElegirPorcentaje({ etiqueta, detalle, opciones, guardado, valor, onCambio }: { etiqueta: string; detalle: string; opciones: number[]; guardado: number; valor: number | undefined; onCambio: (v: number | undefined) => void }) {
  const lista = [...new Set([...opciones, guardado])].sort((a, b) => a - b)
  return (
    <label className="flex min-h-11 items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{etiqueta}</span>
        <span className="block truncate text-[12px] text-zinc-500">{detalle}</span>
      </span>
      <select
        className="rounded-lg bg-zinc-100 px-2 py-1.5 text-[15px] tabular-nums outline-none dark:bg-zinc-800"
        aria-label={etiqueta}
        value={valor ?? guardado}
        onChange={(e) => onCambio(Number(e.target.value) === guardado ? undefined : Number(e.target.value))}
      >
        {lista.map((x) => (
          <option key={x} value={x}>
            {texto(x)} %
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * Simulación del crecimiento (v0.39.0): otra subida de sueldo, otro porcentaje de bonus cobrado u otra
 * inflación, o todo plano. Solo aparece si hay algo que crezca: una nómina en bruto o inflación.
 */
export function SimularCrecimiento({ db, sim, setSim }: { db: BaseDatos; sim: Simulacion; setSim: (s: Simulacion) => void }) {
  const brutas = (db.ajustes.nominas ?? []).filter((n) => n.bruto && (sim.nominas?.[n.id] ?? n.incluida))
  const inflacion = db.ajustes.prevision?.inflacion ?? 0
  if (!brutas.length && !inflacion) return null
  const principal = brutas[0]?.bruto
  const conBonus = brutas.find((n) => n.bruto!.bonus_objetivo > 0)?.bruto
  const plano = !!sim.sinCrecimiento
  return (
    <div className="space-y-1">
      {hayCrecimiento(db) && (
        <div className="flex min-h-11 items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px]">Subidas e inflación</span>
            <span className="block text-[12px] text-zinc-500">Apágalo para ver el plan con el sueldo y los precios de hoy</span>
          </span>
          <Interruptor etiqueta="Subidas e inflación" activo={!plano} onCambio={(v) => setSim({ ...sim, sinCrecimiento: v ? undefined : true })} />
        </div>
      )}
      {!plano && principal && (
        <ElegirPorcentaje
          etiqueta="Subida anual del sueldo"
          detalle={`Fijo y bonus, cada ${MESES[principal.subida_mes - 1]}`}
          opciones={SUBIDAS}
          guardado={principal.subida_anual}
          valor={sim.subida}
          onCambio={(v) => setSim({ ...sim, subida: v })}
        />
      )}
      {conBonus && (
        <ElegirPorcentaje
          etiqueta="Bonus que cobras"
          detalle="Porcentaje del objetivo"
          opciones={CONSECUCIONES}
          guardado={conBonus.bonus_consecucion}
          valor={sim.consecucion}
          onCambio={(v) => setSim({ ...sim, consecucion: v })}
        />
      )}
      {!plano && (
        <ElegirPorcentaje
          etiqueta="Inflación del gasto"
          detalle="Al año, salvo lo que no sube"
          opciones={INFLACIONES}
          guardado={inflacion}
          valor={sim.inflacion}
          onCambio={(v) => setSim({ ...sim, inflacion: v })}
        />
      )}
      {!plano && inflacionDe(db, sim) > 0 && brutas.length === 0 && <p className="text-[12px] text-zinc-500">Con tu nómina en bruto, el sueldo también sube cada año.</p>}
    </div>
  )
}

/** Diferencia con signo y color */
function Dif({ n }: { n: number }) {
  if (Math.abs(n) < 0.5) return null
  return (
    <span className={n > 0 ? 'text-[#248A3D] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF6961]'}>
      {' '}
      ({n > 0 ? '+' : ''}
      {formatearRedondo(n)})
    </span>
  )
}

/**
 * Ingresos previstos: las nóminas netas con sus pagas extra, los próximos 12 meses y la simulación de
 * sumar o quitar una nómina (capital dentro de un año y efecto en el plan de pagos).
 */
export function Ingresos() {
  const db = useDatos()
  const hacer = useHacer()
  const hoy = hoyIso()
  const nominas = db.ajustes.nominas ?? []
  const [editando, setEditando] = useState<Nomina | 'nueva' | null>(null)
  const [sim, setSim] = useSimulacion()
  const diferida = useDeferredValue(sim)
  const simulando = haySimulacion(db, diferida)
  const otrosCambios = diferida.ahorroExtra !== 0 || diferida.recorte !== null || diferida.colchon !== undefined || diferida.deuda !== undefined
  // Sin subidas ni inflación, para comparar con el plan que cuenta con ellas
  const crece = hayCrecimiento(db)
  const planPlano = useMemo(() => (crece ? calcularPlan(db, hoy, { ...SIN_SIMULACION, sinCrecimiento: true }).plan : null), [db, hoy, crece])
  const base = useMemo(() => preverIngresos(db, hoy), [db, hoy])
  const conSim = useMemo(() => (simulando ? preverIngresos(db, hoy, diferida) : null), [db, hoy, diferida, simulando])
  const plan = useMemo(() => calcularPlan(db, hoy).plan, [db, hoy])
  const planSim = useMemo(() => (simulando && plan ? calcularPlan(db, hoy, diferida).plan : null), [db, hoy, diferida, simulando, plan])
  const vista = conSim ?? base
  // De dónde sale el ahorro y la evolución por años, con la simulación si la hay
  const comprobacion = useMemo(() => comprobarPrevision(db, hoy, diferida), [db, hoy, diferida])
  const anios = useMemo(() => (nominas.length ? evolucionAnual(db, hoy, diferida) : null), [db, hoy, diferida, nominas.length])
  const [porAnios, setPorAnios] = useState(false)
  const total12 = vista ? vista.meses.reduce((s, m) => s + m.total, 0) : 0

  const alternar = (n: Nomina) =>
    hacer((d) => guardarNomina(d, { ...n, incluida: !n.incluida }, n.id), n.incluida ? `${n.nombre}: fuera de la previsión` : `${n.nombre}: cuenta en la previsión`)

  return (
    <>
      <BarraNavegacion
        titulo="Ingresos previstos"
        atras="Extracto"
        accion={
          <button className="boton-icono justify-self-end" aria-label="Añadir una nómina" onClick={() => setEditando('nueva')}>
            <Plus className="size-6" strokeWidth={1.75} />
          </button>
        }
      />
      <p className="mb-3 px-1 text-[13px] text-zinc-500">
        Tus nóminas. En bruto, la app calcula el neto de cada mes y aplica la subida anual; en neto, escribes lo que llega al banco. Si una cuenta en la previsión, sustituye a
        tu historial de nómina; el resto de ingresos sale del historial. Una nómina que no cuenta sirve para simular, por ejemplo una segunda.
      </p>

      {!nominas.length ? (
        <div className="tarjeta space-y-3 py-6 text-center">
          <Briefcase className="mx-auto size-12 text-zinc-400" strokeWidth={1.5} />
          <p className="text-[15px]">Aún no hay nóminas. Mientras tanto, la previsión usa tu historial.</p>
          {base?.mediaNomina && <p className="text-[13px] text-zinc-500">Tu nómina de los últimos meses: unos {formatearRedondo(base.mediaNomina)} al mes.</p>}
          <button className="boton-primario" onClick={() => setEditando('nueva')}>
            <Plus className="size-4" strokeWidth={2} /> Añadir mi nómina
          </button>
        </div>
      ) : (
        <section>
          <h3 className="cabecera-grupo">Nóminas</h3>
          <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {nominas.map((n) => (
              <li key={n.id} className="flex items-center">
                <button className="fila min-h-14 min-w-0 flex-1 active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setEditando(n)}>
                  <Baldosa glifo={Briefcase} color={n.incluida ? '#34C759' : '#8E8E93'} tamano="sm" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[15px]">{n.nombre}</span>
                    <span className="block text-[12px] text-zinc-500">{resumenNomina(n)}</span>
                  </span>
                </button>
                <span className="mr-3 shrink-0">
                  <Interruptor etiqueta={`${n.nombre} cuenta en la previsión`} activo={n.incluida} onCambio={() => alternar(n)} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 px-4 text-[12px] text-zinc-500">
            El interruptor decide si cuenta en la previsión y en el plan de pagos.
            {base?.mediaNomina ? ` Nómina real de los últimos meses: unos ${formatearRedondo(base.mediaNomina)} al mes.` : ''}
          </p>
        </section>
      )}

      {nominas.length > 0 && base && (
        <section className="mt-4">
          <div className="flex items-baseline justify-between">
            <h3 className="cabecera-grupo">Simular</h3>
            {simulando && (
              <button className="boton-texto px-4 text-[15px]" onClick={() => setSim(SIN_SIMULACION)}>
                Restablecer
              </button>
            )}
          </div>
          <div className="lista space-y-3 px-4 py-3">
            <SimularNominas db={db} sim={sim} setSim={setSim} />
            <SimularCrecimiento db={db} sim={sim} setSim={setSim} />
            {otrosCambios && <p className="text-[12px] text-zinc-500">También cuenta lo que has cambiado en la simulación del plan de pagos (deuda, colchón, ahorro o recorte).</p>}
            <div className="rounded-xl bg-zinc-100 px-3 py-2 text-[15px] tabular-nums dark:bg-zinc-800">
              <p>
                Ahorro previsto: {formatearRedondo(vista!.ahorroMensual)} al mes
                {conSim && <Dif n={conSim.ahorroMensual - base.ahorroMensual} />}
              </p>
              {vista!.capital12 !== null && (
                <p>
                  Capital dentro de un año: {formatearRedondo(vista!.capital12)}
                  {conSim && conSim.capital12 !== null && base.capital12 !== null && <Dif n={conSim.capital12 - base.capital12} />}
                </p>
              )}
              {plan && plan.pagos[0] && (
                <p>
                  Pago de {MESES[Number(plan.pagos[0].mes.slice(5, 7)) - 1]} de {plan.pagos[0].anio}: {formatearRedondo((planSim ?? plan).pagos[0]?.pago ?? 0)}
                  {planSim && <Dif n={(planSim.pagos[0]?.pago ?? 0) - plan.pagos[0].pago} />}
                </p>
              )}
              {plan && (
                <p>
                  {(planSim ?? plan).saldadaEn ? `Deuda saldada en ${(planSim ?? plan).saldadaEn}` : 'La deuda no se salda en 30 años'}
                  {planSim && plan.saldadaEn && planSim.saldadaEn && planSim.saldadaEn !== plan.saldadaEn
                    ? `, ${plural(Math.abs(plan.saldadaEn - planSim.saldadaEn), 'año', 'años')} ${planSim.saldadaEn < plan.saldadaEn ? 'antes' : 'después'}`
                    : ''}
                </p>
              )}
              {plan && planPlano && !simulando && (
                <p className="text-[13px] text-zinc-500">
                  Sin subidas ni inflación: {planPlano.saldadaEn ? `saldada en ${planPlano.saldadaEn}` : 'no se salda en 30 años'}.
                </p>
              )}
            </div>
            {plan && (
              <Link to="/extracto/plan" className="flex items-center gap-1 text-[13px] text-marca-700 dark:text-marca-500">
                Ver el plan de pagos <ChevronRight className="size-3.5" />
              </Link>
            )}
          </div>
        </section>
      )}

      {comprobacion && <ComoSale c={comprobacion} simulando={simulando} />}

      {vista && anios && (
        <div className="mt-5 px-1">
          <Segmentado
            etiqueta="Ingresos previstos"
            opciones={[
              ['meses', 'Mes a mes'],
              ['anios', 'Por años'],
            ]}
            valor={porAnios ? 'anios' : 'meses'}
            onCambio={(v) => setPorAnios(v === 'anios')}
          />
        </div>
      )}
      {vista && anios && porAnios && <PorAnios anios={anios} simulando={simulando} />}
      {vista && !(anios && porAnios) && (
        <section className="mt-4">
          <h3 className="cabecera-grupo">Próximos 12 meses{simulando ? ', con la simulación' : ''}</h3>
          <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {vista.meses.map((m) => (
              <li key={m.mes} className="flex min-h-12 items-center gap-3 px-4 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{nombreMes(m.mes)}</span>
                  <span className="block truncate text-[12px] text-zinc-500 tabular-nums">
                    {[
                      ...m.nominas.map((x) =>
                        x.bonus ? `${x.nombre} ${formatearRedondo(x.importe - x.bonus)}, bonus ${formatearRedondo(x.bonus)}` : `${x.nombre} ${formatearRedondo(x.importe)}`,
                      ),
                      m.otros >= 1 ? `otros ${formatearRedondo(m.otros)}` : '',
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </span>
                <span className="text-[15px] tabular-nums">{formatearRedondo(m.total)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 px-4 text-[12px] text-zinc-500 tabular-nums">
            Total del año: {formatearRedondo(total12)}. Otros ingresos: los del mismo mes del año anterior o la media de los meses cerrados.
          </p>
        </section>
      )}
      {!base && (
        <p className="tarjeta mt-4 text-center text-[13px] text-zinc-500">
          Con un mes completo de datos, además del primero importado, aparece la previsión de los próximos meses.
        </p>
      )}

      <HojaNomina nomina={editando} onCerrar={() => setEditando(null)} sugerido={base?.mediaNomina ?? null} />
    </>
  )
}

/**
 * De dónde sale el ahorro previsto (v0.40.0): la media al mes de los meses cerrados frente a la de los
 * 12 próximos, partida a partida, y lo que conviene revisar si la previsión se aleja del historial.
 */
function ComoSale({ c, simulando }: { c: Comprobacion; simulando: boolean }) {
  const filas: [string, number | null, number][] = c.conNominas
    ? [
        ['Nóminas', c.real.nominas, c.previsto.nominas],
        ['Otros ingresos', c.real.otros, c.previsto.otros],
      ]
    : [['Ingresos', c.real.nominas + c.real.otros, c.previsto.nominas + c.previsto.otros]]
  filas.push(['Gastos', -c.real.gastos, -c.previsto.gastos])
  if (c.previsto.puntuales) filas.push(['Gastos previstos', null, c.previsto.puntuales])
  if (c.previsto.extra) filas.push(['Ahorro de más', null, c.previsto.extra])
  const celda = 'py-1 text-right'
  return (
    <section className="mt-4">
      <h3 className="cabecera-grupo">De dónde sale el ahorro{simulando ? ', con la simulación' : ''}</h3>
      <div className="lista px-4 py-3">
        <table className="w-full text-[15px] tabular-nums">
          <thead>
            <tr className="text-[12px] text-zinc-500">
              <th className="py-1 text-left font-normal">Media al mes</th>
              <th className="py-1 text-right font-normal">{c.meses === 1 ? 'Último mes' : `Últimos ${c.meses} meses`}</th>
              <th className="py-1 text-right font-normal">Próximos 12</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([nombre, real, previsto]) => (
              <tr key={nombre}>
                <th scope="row" className="py-1 text-left font-normal">
                  {nombre}
                </th>
                <td className={`${celda} text-zinc-500`}>{real === null ? '' : formatearRedondo(real)}</td>
                <td className={celda}>{formatearRedondo(previsto)}</td>
              </tr>
            ))}
            <tr className="border-t border-zinc-200/70 font-semibold dark:border-zinc-800">
              <th scope="row" className="py-1.5 text-left font-semibold">
                Ahorro
              </th>
              <td className={`${celda} text-zinc-500`}>{formatearRedondo(c.real.ahorro)}</td>
              <td className={celda}>{formatearRedondo(c.previsto.ahorro)}</td>
            </tr>
          </tbody>
        </table>
        {c.banco && (
          <p className="mt-2 text-[12px] text-zinc-500 tabular-nums">
            Según el banco, en {plural(c.banco.meses, 'mes', 'meses')} tu capital ha {c.banco.capital >= 0 ? 'subido' : 'bajado'} {formatearRedondo(Math.abs(c.banco.capital))} al mes, sin contar los
            pagos de la deuda. El extracto de esos meses da {formatearRedondo(c.banco.extracto)}.
          </p>
        )}
        {c.avisos.length ? (
          <ul className="mt-3 space-y-2" aria-label="Para revisar">
            {c.avisos.map((a) => (
              <li key={a} className="flex gap-2 text-[13px]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#C93400] dark:text-[#FF9F0A]" strokeWidth={2} />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 flex gap-2 text-[13px]">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-[#248A3D] dark:text-[#30D158]" strokeWidth={2} />
            <span>La previsión es coherente con tu historial: no hay nada que revisar.</span>
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Evolución por años naturales (v0.40.0): neto de las nóminas con su bruto y su retención y, desde el año
 * siguiente, el gasto y el ahorro previstos. Dos barras por año sobre la misma escala: lo que entra y lo que se gasta.
 */
function PorAnios({ anios, simulando }: { anios: AnioPrevisto[]; simulando: boolean }) {
  const max = Math.max(...anios.map((a) => Math.max(a.neto + (a.otros ?? 0), a.gastos ?? 0)), 1)
  const ancho = (n: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`
  return (
    <section className="mt-4">
      <h3 className="cabecera-grupo">Por años{simulando ? ', con la simulación' : ''}</h3>
      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {anios.map((a, i) => {
          const antes = i ? anios[i - 1].neto : 0
          const sube = antes > 0 ? Math.round((a.neto / antes - 1) * 1000) / 10 : null
          return (
            <li key={a.anio} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium">{a.anio}</span>
                <span className="text-[15px] tabular-nums">
                  {formatearRedondo(a.neto)} netos
                  {sube !== null && (
                    <span className="text-[12px] text-zinc-500">
                      {' '}
                      ({sube >= 0 ? '+' : ''}
                      {texto(sube)} %)
                    </span>
                  )}
                </span>
              </div>
              {a.bruto !== null && a.retencion !== null && (
                <p className="text-[12px] text-zinc-500 tabular-nums">
                  {formatearRedondo(a.bruto)} brutos{a.bonusBruto > 0 ? `, ${formatearRedondo(a.bonusBruto)} de bonus` : ''}. IRPF {texto(a.retencion)}{'\u00a0'}%
                </p>
              )}
              <div className="mt-1.5 space-y-[2px]" aria-hidden="true">
                <span className="block h-1.5 rounded-r-[4px]" style={{ width: ancho(a.neto + (a.otros ?? 0)), background: 'var(--serie-1)' }} />
                {a.gastos !== null && <span className="block h-1.5 rounded-r-[4px]" style={{ width: ancho(a.gastos), background: 'var(--serie-2)' }} />}
              </div>
              {a.gastos !== null && a.ahorro !== null && (
                <p className="mt-1 text-[12px] text-zinc-500 tabular-nums">
                  {(a.otros ?? 0) >= 12 ? `Otros ingresos ${formatearRedondo(a.otros ?? 0)}. ` : ''}Gastos {formatearRedondo(a.gastos)}. Ahorro {formatearRedondo(a.ahorro)}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-1.5 flex flex-wrap gap-x-4 px-4 text-[12px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: 'var(--serie-1)' }} /> Ingresos netos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: 'var(--serie-2)' }} /> Gastos
        </span>
      </div>
      <p className="mt-1 px-4 text-[12px] text-zinc-500">
        Años naturales. De {anios[0].anio} se enseñan solo las nóminas, calculadas con tu sueldo; desde {anios[0].anio + 1}, también el gasto y el ahorro previstos. El sueldo sube
        con la subida anual y el gasto, con la inflación. El ahorro cuenta los gastos previstos que has dado de alta.
      </p>
    </section>
  )
}

/** Alta y edición de una nómina */
/** Porcentaje escrito por el usuario («10», «82,5»); null si no es un número */
function leerPorcentaje(t: string): number | null {
  const limpio = t.trim().replace('%', '').replace(',', '.')
  if (!limpio) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** Años de nacimiento escritos seguidos («2020, 2024»); null si alguno no es un año */
function leerHijos(t: string): number[] | null {
  const partes = t.split(/[\s,;y]+/).filter(Boolean)
  const lista = partes.map(Number)
  return lista.every((n) => Number.isInteger(n) && n >= 1950 && n <= 2100) ? lista : null
}

interface CamposBruto {
  fijo: string
  pagas: '12' | '14'
  extra1: number
  extra2: number
  objetivo: string
  consecucion: string
  bonusMes: number
  subida: string
  subidaMes: number
  flexible: string
  especie: string
  hijos: string
  tipo: string
}

const BRUTO_VACIO: CamposBruto = { fijo: '', pagas: '12', extra1: 6, extra2: 12, objetivo: '', consecucion: '85', bonusMes: 8, subida: '', subidaMes: 9, flexible: '', especie: '', hijos: '', tipo: '' }

/** Lo escrito en el formulario, como nómina en bruto; un texto con lo que falta si no vale */
function leerBruto(c: CamposBruto, hoy: string): NominaBruta | string {
  const fijo = leerImporteUsuario(c.fijo)
  if (fijo === null || fijo <= 0) return 'Escribe el bruto fijo al año'
  if (c.pagas === '14' && c.extra1 === c.extra2) return 'Las dos pagas extra van en meses distintos'
  const objetivo = c.objetivo.trim() ? leerImporteUsuario(c.objetivo) : 0
  if (objetivo === null) return 'Revisa el objetivo del bonus'
  const consecucion = leerPorcentaje(c.consecucion) ?? 100
  if (consecucion < 0 || consecucion > 200) return 'El porcentaje del bonus va de 0 a 200'
  const subida = c.subida.trim() ? leerPorcentaje(c.subida) : 0
  if (subida === null || subida < -50 || subida > 100) return 'Revisa la subida anual'
  const flexible = c.flexible.trim() ? leerImporteUsuario(c.flexible) : 0
  const especie = c.especie.trim() ? leerImporteUsuario(c.especie) : 0
  if (flexible === null || especie === null) return 'Revisa la retribución flexible y la especie'
  const hijos = leerHijos(c.hijos)
  if (!hijos) return 'Escribe el año de nacimiento de cada hijo, por ejemplo 2020'
  const tipo = c.tipo.trim() ? leerPorcentaje(c.tipo) : null
  if (c.tipo.trim() && (tipo === null || tipo < 0 || tipo > 60)) return 'La retención va de 0 a 60 %'
  return {
    fijo_anual: fijo,
    pagas: c.pagas === '14' ? 14 : 12,
    meses_extra: c.pagas === '14' ? [c.extra1, c.extra2] : [],
    bonus_objetivo: objetivo,
    bonus_consecucion: consecucion,
    bonus_mes: c.bonusMes,
    flexible_mes: flexible,
    especie_mes: especie,
    subida_anual: subida,
    subida_mes: c.subidaMes,
    vigente_desde: vigenteDesde(hoy, c.subidaMes),
    hijos,
    tipo_actual: tipo === null ? null : { porcentaje: tipo, anio: Number(hoy.slice(0, 4)) },
  }
}

function ElegirMes({ etiqueta, valor, onCambio, clase = 'bg-transparent text-right text-[15px] outline-none' }: { etiqueta: string; valor: number; onCambio: (m: number) => void; clase?: string }) {
  return (
    <select className={clase} aria-label={etiqueta} value={valor} onChange={(e) => onCambio(Number(e.target.value))}>
      {MESES.map((m, k) => (
        <option key={m} value={k + 1}>
          {conMayuscula(m)}
        </option>
      ))}
    </select>
  )
}

/** Lo que sale de la nómina en bruto: neto de un mes, paga extra, bonus y retención calculada */
function ResultadoBruto({ bruta, inflacion }: { bruta: NominaBruta | string; inflacion: number }) {
  if (typeof bruta === 'string') return null
  const hoy = hoyIso()
  const r = resumenBruta(bruta, hoy, { inflacion })
  const fila = (etiqueta: string, valor: string, detalle?: string) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-[13px] text-zinc-500">
        {etiqueta}
        {detalle && <span className="block text-[12px]">{detalle}</span>}
      </span>
      <span className="shrink-0 text-[15px] font-medium tabular-nums">{valor}</span>
    </div>
  )
  return (
    <div className="space-y-1.5 rounded-xl bg-zinc-100/70 px-4 py-3 dark:bg-zinc-800/50" aria-label="Neto calculado">
      {fila('Neto de un mes normal', formatearImporte(r.netoMes), `Retención del ${texto(r.tipo)} %${bruta.tipo_actual ? ', la de tu nómina' : ', calculada'}`)}
      {bruta.pagas === 14 && fila('Cada paga extra', formatearImporte(r.netoExtra))}
      {r.bonusBruto > 0 && fila(`Bonus de ${MESES[bruta.bonus_mes - 1]}`, formatearImporte(r.bonusNeto), `${formatearRedondo(r.bonusBruto)} brutos`)}
      {fila('Neto de los próximos 12 meses', formatearRedondo(r.netoAnual))}
    </div>
  )
}

function HojaNomina({ nomina, onCerrar, sugerido }: { nomina: Nomina | 'nueva' | null; onCerrar: () => void; sugerido: number | null }) {
  const db = useDatos()
  const hacer = useHacer()
  const { confirmar } = useInterfaz()
  const existente = nomina && nomina !== 'nueva' ? nomina : null
  const clave = existente?.id ?? (nomina ? 'nueva' : '')
  const actual = hoyIso().slice(0, 7)
  const futuros = (n: number) => Array.from({ length: n }, (_, i) => sumarMeses(`${actual}-01`, i).slice(0, 7))
  const [abiertaCon, setAbiertaCon] = useState('')
  const [modo, setModo] = useState<'bruto' | 'neto'>('bruto')
  const [b, setB] = useState<CamposBruto>(BRUTO_VACIO)
  const [nombre, setNombre] = useState('')
  const [neto, setNeto] = useState('')
  const [pagas, setPagas] = useState<{ mes: number; importe: string }[]>([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [incluida, setIncluida] = useState(true)
  const [conBonus, setConBonus] = useState(false)
  const [bonusMes, setBonusMes] = useState(8)
  const [bonusImporte, setBonusImporte] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Al abrir otra nómina, sus valores (ajuste durante el render, sin efecto)
  if (clave && clave !== abiertaCon) {
    setAbiertaCon(clave)
    const primera = !(db.ajustes.nominas ?? []).length
    setNombre(existente?.nombre ?? (primera ? 'Mi nómina' : `Nómina ${(db.ajustes.nominas ?? []).length + 1}`))
    // La propia, en bruto, que es lo que permite las subidas; las siguientes (para simular), en neto; una ya guardada, como se guardó
    setModo(existente ? (existente.bruto ? 'bruto' : 'neto') : primera ? 'bruto' : 'neto')
    const g = existente?.bruto
    setB(
      g
        ? {
            // El sueldo y el objetivo, al nivel de hoy: las subidas ya pasadas van incluidas
            fijo: texto(Math.round(fijoEn(g, actual) * 100) / 100),
            pagas: g.pagas === 14 ? '14' : '12',
            extra1: g.meses_extra[0] ?? 6,
            extra2: g.meses_extra[1] ?? 12,
            objetivo: g.bonus_objetivo ? texto(Math.round(objetivoEn(g, actual) * 100) / 100) : '',
            consecucion: texto(g.bonus_consecucion),
            bonusMes: g.bonus_mes,
            subida: g.subida_anual ? texto(g.subida_anual) : '',
            subidaMes: g.subida_mes,
            flexible: g.flexible_mes ? texto(g.flexible_mes) : '',
            especie: g.especie_mes ? texto(g.especie_mes) : '',
            hijos: g.hijos.join(', '),
            tipo: g.tipo_actual && g.tipo_actual.anio === Number(actual.slice(0, 4)) ? texto(g.tipo_actual.porcentaje) : '',
          }
        : BRUTO_VACIO,
    )
    setNeto(existente ? texto(existente.neto_mensual) : primera && sugerido ? texto(Math.round(sugerido)) : '')
    setPagas(
      existente
        ? existente.pagas.map((p) => ({
            mes: p.mes,
            importe: texto(p.importe),
          }))
        : [],
    )
    setDesde(existente?.desde ?? '')
    setHasta(existente?.hasta ?? '')
    // La primera es la propia y cuenta; las siguientes, para simular
    setIncluida(existente ? existente.incluida : primera)
    setConBonus(!!existente?.bonus)
    setBonusMes(existente?.bonus?.mes ?? 8)
    setBonusImporte(existente?.bonus ? texto(existente.bonus.importe) : '')
    setError(null)
  }
  const cerrar = () => {
    setAbiertaCon('')
    onCerrar()
  }
  const inflacion = db.ajustes.prevision?.inflacion ?? 0
  const bruta = useMemo(() => leerBruto(b, hoyIso()), [b])
  const cambiar = (c: Partial<CamposBruto>) => setB((x) => ({ ...x, ...c }))
  const guardar = async () => {
    const comunes = { nombre, desde: desde || null, hasta: hasta || null, incluida }
    let datos
    if (modo === 'bruto') {
      if (typeof bruta === 'string') return setError(bruta)
      // El neto, las pagas y el bonus se guardan ya calculados, como referencia
      const r = resumenBruta(bruta, hoyIso(), { inflacion })
      if (!(r.netoMes > 0)) return setError('Con esos datos no sale un neto. Revisa el bruto')
      datos = {
        ...comunes,
        neto_mensual: r.netoMes,
        pagas: bruta.pagas === 14 && r.netoExtra > 0 ? bruta.meses_extra.map((mes) => ({ mes, importe: r.netoExtra })) : [],
        bonus: r.bonusNeto > 0 ? { mes: bruta.bonus_mes, importe: r.bonusNeto } : null,
        bruto: bruta,
      }
    } else {
      const valor = leerImporteUsuario(neto)
      if (valor === null || valor <= 0) return setError('Escribe el neto mensual')
      const lista: PagaExtra[] = []
      for (const p of pagas) {
        const v = leerImporteUsuario(p.importe)
        if (v === null || v <= 0) return setError(`Escribe el importe de la paga de ${MESES[p.mes - 1]}`)
        lista.push({ mes: p.mes, importe: v })
      }
      let bonus = null
      if (conBonus) {
        const v = leerImporteUsuario(bonusImporte)
        if (v === null || v <= 0) return setError('Escribe el importe neto del bonus')
        bonus = { mes: bonusMes, importe: v }
      }
      datos = { ...comunes, neto_mensual: valor, pagas: lista, bonus, bruto: null }
    }
    setError(null)
    if (await hacer((d) => guardarNomina(d, datos, existente?.id), existente ? 'Nómina guardada' : `${nombre.trim()}: añadida`)) cerrar()
  }
  const borrar = async () => {
    if (!existente) return
    if (
      !(await confirmar({
        titulo: 'Borrar la nómina',
        texto: existente.nombre,
        aceptar: 'Borrar',
        peligro: true,
      }))
    )
      return
    if (await hacer((d) => borrarNomina(d, existente.id), 'Nómina borrada')) cerrar()
  }
  const libre = [6, 12, 7, 3, 9, 1, 2, 4, 5, 8, 10, 11].find((m) => !pagas.some((p) => p.mes === m))
  const campo = 'min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none'
  const numero = (etiqueta: string, valor: string, onCambio: (v: string) => void, placeholder: string, ancho = 'w-40') => (
    <label className="fila min-h-12">
      <span className={`${ancho} shrink-0 text-[15px]`}>{etiqueta}</span>
      <input className={`${campo} tabular-nums`} inputMode="decimal" placeholder={placeholder} aria-label={etiqueta} value={valor} onChange={(e) => onCambio(e.target.value)} />
    </label>
  )

  return (
    <Hoja abierta={!!nomina} titulo={existente ? existente.nombre : 'Nueva nómina'} onCerrar={cerrar}>
      <div className="space-y-4">
        <Segmentado
          etiqueta="Cómo la escribes"
          opciones={[
            ['bruto', 'En bruto'],
            ['neto', 'En neto'],
          ]}
          valor={modo}
          onCambio={(v) => {
            setModo(v)
            setError(null)
          }}
        />
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <label className="fila min-h-12">
            <span className="w-32 shrink-0 text-[15px]">Nombre</span>
            <input className={campo} maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          {modo === 'neto' && (
            <label className="fila min-h-12">
              <span className="w-32 shrink-0 text-[15px]">Neto al mes</span>
              <input className={`${campo} tabular-nums`} inputMode="decimal" placeholder="0,00 €" value={neto} onChange={(e) => setNeto(e.target.value)} />
            </label>
          )}
          {modo === 'bruto' && numero('Bruto fijo al año', b.fijo, (v) => cambiar({ fijo: v }), '0 €')}
          {modo === 'bruto' && (
            <div className="fila min-h-12">
              <span className="flex-1 text-[15px]">Pagas</span>
              <div className="w-32">
                <Segmentado
                  etiqueta="Número de pagas"
                  opciones={[
                    ['12', '12'],
                    ['14', '14'],
                  ]}
                  valor={b.pagas}
                  onCambio={(v) => cambiar({ pagas: v })}
                />
              </div>
            </div>
          )}
          {modo === 'bruto' && b.pagas === '14' && (
            <div className="fila min-h-12">
              <span className="flex-1 text-[15px]">Extras en</span>
              <ElegirMes etiqueta="Mes de la primera paga extra" valor={b.extra1} onCambio={(m) => cambiar({ extra1: m })} />
              <span className="text-[15px] text-zinc-500">y</span>
              <ElegirMes etiqueta="Mes de la segunda paga extra" valor={b.extra2} onCambio={(m) => cambiar({ extra2: m })} />
            </div>
          )}
        </div>
        {modo === 'bruto' && (
          <>
            <section>
              <h3 className="cabecera-grupo">Bonus</h3>
              <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {numero('Objetivo bruto', b.objetivo, (v) => cambiar({ objetivo: v }), 'Sin bonus')}
                {numero('Cobras (%)', b.consecucion, (v) => cambiar({ consecucion: v }), '100')}
                <div className="fila min-h-12">
                  <span className="flex-1 text-[15px]">Se cobra en</span>
                  <ElegirMes etiqueta="Mes del bonus" valor={b.bonusMes} onCambio={(m) => cambiar({ bonusMes: m })} />
                </div>
              </div>
              <p className="mt-1 px-4 text-[12px] text-zinc-500">
                El objetivo es el bonus al 100 %. En «Cobras» va el porcentaje que esperas cobrar; en la simulación puedes probar otro. Si el del año pasado está en otra
                categoría, pásalo a Ingresos, Nómina para no contarlo dos veces.
              </p>
            </section>
            <section>
              <h3 className="cabecera-grupo">Subida anual</h3>
              <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {numero('Subida (%)', b.subida, (v) => cambiar({ subida: v }), 'Sin subida')}
                <div className="fila min-h-12">
                  <span className="flex-1 text-[15px]">Se aplica en</span>
                  <ElegirMes etiqueta="Mes de la subida" valor={b.subidaMes} onCambio={(m) => cambiar({ subidaMes: m })} />
                </div>
              </div>
              <p className="mt-1 px-4 text-[12px] text-zinc-500">Sube el fijo y el objetivo del bonus cada año desde ese mes. Escribe el sueldo que tienes hoy.</p>
            </section>
            <section>
              <h3 className="cabecera-grupo">Para calcular el neto</h3>
              <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {numero('Hijos, año de nacimiento', b.hijos, (v) => cambiar({ hijos: v }), '2020, 2024', 'w-48')}
                {numero('Retribución flexible al mes', b.flexible, (v) => cambiar({ flexible: v }), '0 €', 'w-52')}
                {numero('Especie que tributa al mes', b.especie, (v) => cambiar({ especie: v }), '0 €', 'w-52')}
                {numero('Retención de tu nómina (%)', b.tipo, (v) => cambiar({ tipo: v }), 'Calculada', 'w-52')}
              </div>
              <p className="mt-1 px-4 text-[12px] text-zinc-500">
                La retribución flexible es lo que se descuenta del bruto sin tributar (seguro médico, guardería, transporte). Si escribes la retención que pone tu nómina,
                manda este año; los siguientes los calcula la app. Es una estimación para planificar, no un cálculo oficial.
              </p>
            </section>
            <ResultadoBruto bruta={bruta} inflacion={inflacion} />
          </>
        )}
        {modo === 'neto' && (
          <>
        <section>
          <h3 className="cabecera-grupo">Pagas extra</h3>
          <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {pagas.map((p, i) => (
              <div key={i} className="fila min-h-12">
                <select
                  className="bg-transparent text-[15px] outline-none"
                  aria-label="Mes de la paga extra"
                  value={p.mes}
                  onChange={(e) => setPagas(pagas.map((x, j) => (j === i ? { ...x, mes: Number(e.target.value) } : x)))}
                >
                  {MESES.map((m, k) => (
                    <option key={m} value={k + 1} disabled={pagas.some((x, j) => j !== i && x.mes === k + 1)}>
                      {conMayuscula(m)}
                    </option>
                  ))}
                </select>
                <input
                  className={`${campo} tabular-nums`}
                  inputMode="decimal"
                  placeholder="0,00 €"
                  aria-label={`Importe de la paga de ${MESES[p.mes - 1]}`}
                  value={p.importe}
                  onChange={(e) => setPagas(pagas.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)))}
                />
                <button type="button" className="boton-texto px-1 text-red-600 dark:text-red-500" onClick={() => setPagas(pagas.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              </div>
            ))}
            {libre && (
              <button
                type="button"
                className="fila min-h-12 w-full text-[15px] text-marca-700 active:bg-zinc-100 dark:text-marca-500 dark:active:bg-zinc-800"
                onClick={() => setPagas([...pagas, { mes: libre, importe: neto }])}
              >
                <Plus className="size-4" strokeWidth={2} /> Añadir paga extra
              </button>
            )}
          </div>
          <p className="mt-1 px-4 text-[12px] text-zinc-500">Si las pagas van prorrateadas en la nómina, no añadas ninguna.</p>
        </section>
        <section>
          <h3 className="cabecera-grupo">Bonus</h3>
          <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            <div className="fila min-h-12">
              <span className="flex-1 text-[15px]">Bonus anual</span>
              <Interruptor etiqueta="Bonus anual" activo={conBonus} onCambio={setConBonus} />
            </div>
            {conBonus && (
              <div className="fila min-h-12">
                <select className="bg-transparent text-[15px] outline-none" aria-label="Mes del bonus" value={bonusMes} onChange={(e) => setBonusMes(Number(e.target.value))}>
                  {MESES.map((m, k) => (
                    <option key={m} value={k + 1}>
                      {conMayuscula(m)}
                    </option>
                  ))}
                </select>
                <input
                  className={`${campo} tabular-nums`}
                  inputMode="decimal"
                  placeholder="Neto, 0,00 €"
                  aria-label="Importe neto del bonus"
                  value={bonusImporte}
                  onChange={(e) => setBonusImporte(e.target.value)}
                />
              </div>
            )}
          </div>
          <p className="mt-1 px-4 text-[12px] text-zinc-500">
            Neto, lo que llega al banco. Cuenta en su mes y se puede quitar en la simulación. Si el del año pasado está en otra categoría, pásalo a Ingresos, Nómina para no
            contarlo dos veces.
          </p>
        </section>
          </>
        )}
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <label className="fila min-h-12">
            <span className="w-32 shrink-0 text-[15px]">Desde</span>
            <select className={campo} value={desde} onChange={(e) => setDesde(e.target.value)}>
              <option value="">Ya se cobra</option>
              {futuros(24).map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="fila min-h-12">
            <span className="w-32 shrink-0 text-[15px]">Hasta</span>
            <select className={campo} value={hasta} onChange={(e) => setHasta(e.target.value)}>
              <option value="">Sin fin</option>
              {futuros(48).map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="fila min-h-12">
            <span className="flex-1 text-[15px]">Cuenta en la previsión</span>
            <Interruptor etiqueta="Cuenta en la previsión" activo={incluida} onCambio={setIncluida} />
          </div>
        </div>
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
  )
}
