import { Briefcase, ChevronRight, Plus } from 'lucide-react'
import { Fragment, useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHacer } from '../componentes/acciones'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { Hoja, Interruptor, useInterfaz } from '../componentes/Interfaz'
import { borrarNomina, guardarNomina } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { hoyIso, MESES, mesLargo, sumarMeses } from '../lib/fechas'
import { formatearRedondo, leerImporteUsuario, plural } from '../lib/formato'
import { useSimulacion } from '../componentes/simulacion'
import { calcularPlan, haySimulacion, preverIngresos, SIN_SIMULACION, type Simulacion } from '../lib/plan'
import type { BaseDatos, Nomina, PagaExtra } from '../lib/tipos'

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const nombreMes = (mes: string) => conMayuscula(mesLargo(`${mes}-01`).toLowerCase())
const texto = (n: number) => String(n).replace('.', ',')

/** «2.800 € al mes, pagas en junio y diciembre, desde marzo de 2027» */
// oxlint-disable-next-line react/only-export-components
export function resumenNomina(n: Nomina): string {
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
            {n.bonus && activa && (
              <li key={`${n.id}-bonus`} className="flex min-h-11 items-center gap-3 pl-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">Bonus de {MESES[n.bonus.mes - 1]}</span>
                  <span className="block truncate text-[12px] text-zinc-500">
                    {formatearRedondo(n.bonus.importe)} neto, de {n.nombre}
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
  const base = useMemo(() => preverIngresos(db, hoy), [db, hoy])
  const conSim = useMemo(() => (simulando ? preverIngresos(db, hoy, diferida) : null), [db, hoy, diferida, simulando])
  const plan = useMemo(() => calcularPlan(db, hoy).plan, [db, hoy])
  const planSim = useMemo(() => (simulando && plan ? calcularPlan(db, hoy, diferida).plan : null), [db, hoy, diferida, simulando, plan])
  const vista = conSim ?? base
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
        Tus nóminas netas, lo que llega al banco, con sus pagas extra. Si una cuenta en la previsión, sustituye a tu historial de nómina; el resto de ingresos sale del historial.
        Una nómina que no cuenta sirve para simular, por ejemplo una segunda.
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
                  Pago de julio de {plan.pagos[0].anio}: {formatearRedondo((planSim ?? plan).pagos[0]?.pago ?? 0)}
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
            </div>
            {plan && (
              <Link to="/extracto/plan" className="flex items-center gap-1 text-[13px] text-marca-700 dark:text-marca-500">
                Ver el plan de pagos <ChevronRight className="size-3.5" />
              </Link>
            )}
          </div>
        </section>
      )}

      {vista && (
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

/** Alta y edición de una nómina */
function HojaNomina({ nomina, onCerrar, sugerido }: { nomina: Nomina | 'nueva' | null; onCerrar: () => void; sugerido: number | null }) {
  const db = useDatos()
  const hacer = useHacer()
  const { confirmar } = useInterfaz()
  const existente = nomina && nomina !== 'nueva' ? nomina : null
  const clave = existente?.id ?? (nomina ? 'nueva' : '')
  const actual = hoyIso().slice(0, 7)
  const futuros = (n: number) => Array.from({ length: n }, (_, i) => sumarMeses(`${actual}-01`, i).slice(0, 7))
  const [abiertaCon, setAbiertaCon] = useState('')
  const [nombre, setNombre] = useState('')
  const [neto, setNeto] = useState('')
  const [pagas, setPagas] = useState<{ mes: number; importe: string }[]>([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [incluida, setIncluida] = useState(true)
  const [conBonus, setConBonus] = useState(false)
  const [bonusMes, setBonusMes] = useState(7)
  const [bonusImporte, setBonusImporte] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Al abrir otra nómina, sus valores (ajuste durante el render, sin efecto)
  if (clave && clave !== abiertaCon) {
    setAbiertaCon(clave)
    const primera = !(db.ajustes.nominas ?? []).length
    setNombre(existente?.nombre ?? (primera ? 'Mi nómina' : `Nómina ${(db.ajustes.nominas ?? []).length + 1}`))
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
    setBonusMes(existente?.bonus?.mes ?? 7)
    setBonusImporte(existente?.bonus ? texto(existente.bonus.importe) : '')
    setError(null)
  }
  const cerrar = () => {
    setAbiertaCon('')
    onCerrar()
  }
  const guardar = async () => {
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
    setError(null)
    const datos = {
      nombre,
      neto_mensual: valor,
      pagas: lista,
      desde: desde || null,
      hasta: hasta || null,
      incluida,
      bonus,
    }
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

  return (
    <Hoja abierta={!!nomina} titulo={existente ? existente.nombre : 'Nueva nómina'} onCerrar={cerrar}>
      <div className="space-y-4">
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <label className="fila min-h-12">
            <span className="w-32 shrink-0 text-[15px]">Nombre</span>
            <input className={campo} maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="fila min-h-12">
            <span className="w-32 shrink-0 text-[15px]">Neto al mes</span>
            <input className={`${campo} tabular-nums`} inputMode="decimal" placeholder="0,00 €" value={neto} onChange={(e) => setNeto(e.target.value)} />
          </label>
        </div>
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
