import { Building2, Car, ChevronRight, HandCoins, Home, Landmark, Package, PiggyBank, Plus, TrendingUp, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHacer } from '../componentes/acciones'
import { HojaCompra, ResumenCompra } from '../componentes/Compra'
import { BarraNavegacion } from '../componentes/Encabezado'
import { BotonClaude, HojaClaude } from '../componentes/HojaClaude'
import { Baldosa } from '../componentes/Icono'
import { Hoja, Interruptor, useInterfaz } from '../componentes/Interfaz'
import { useSimulacion } from '../componentes/simulacion'
import { borrarBien, guardarBien, guardarPrestamo } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { textoPatrimonio } from '../lib/analizar'
import { movimientosUltimoAno } from '../lib/csvClaude'
import { hoyIso, MESES, mesLargo } from '../lib/fechas'
import { formatearRedondo, leerImporteUsuario } from '../lib/formato'
import { calcularPatrimonio, cuotaDe, finPrestamo, interesesRestantes, NOMBRE_TIPO_BIEN, type LineaBien, type Patrimonio as DatosPatrimonio } from '../lib/patrimonio'
import { calcularPlan, SIN_SIMULACION } from '../lib/plan'
import type { Bien, Cuenta, TipoBien } from '../lib/tipos'

const GLIFO: Record<TipoBien, { glifo: LucideIcon; color: string }> = {
  inmueble: { glifo: Home, color: '#34C759' },
  inversion: { glifo: TrendingUp, color: '#007AFF' },
  pension: { glifo: PiggyBank, color: '#FF9500' },
  vehiculo: { glifo: Car, color: '#5856D6' },
  otro: { glifo: Package, color: '#8E8E93' },
}
const texto = (n: number) => String(n).replace('.', ',')
const mesTexto = (mes: string) => mesLargo(`${mes}-01`).toLowerCase()
const VERDE = 'text-[#248A3D] dark:text-[#30D158]'
const ROJO = 'text-[#D70015] dark:text-[#FF6961]'
const NARANJA = 'text-[#C93400] dark:text-[#FF9F0A]'

/**
 * Patrimonio completo (v0.41.0): liquidez, inmuebles y otros activos con el valor que pone el usuario,
 * hipoteca calculada con su cuadro de amortización y deuda familiar. Patrimonio neto con su evolución,
 * compra de una vivienda simulada y la situación completa para Claude.
 */
export function Patrimonio() {
  const db = useDatos()
  const hoy = hoyIso()
  const p = useMemo(() => calcularPatrimonio(db, hoy), [db, hoy])
  const [sim] = useSimulacion()
  const base = useMemo(() => (sim.compra ? calcularPlan(db, hoy).plan : null), [db, hoy, sim.compra])
  const conCompra = useMemo(() => (sim.compra ? calcularPlan(db, hoy, { ...SIN_SIMULACION, compra: sim.compra }).plan : null), [db, hoy, sim.compra])
  const [bien, setBien] = useState<Bien | TipoBien | null>(null)
  const [hipoteca, setHipoteca] = useState<Cuenta | null>(null)
  const [compra, setCompra] = useState(false)
  const [claude, setClaude] = useState(false)
  const anterior = p.evolucion.length >= 2 ? p.evolucion[p.evolucion.length - 2] : null

  return (
    <>
      <BarraNavegacion
        titulo="Patrimonio"
        atras="Extracto"
        accion={
          <button className="boton-icono justify-self-end" aria-label="Añadir un bien" onClick={() => setBien('inmueble')}>
            <Plus className="size-6" strokeWidth={1.75} />
          </button>
        }
      />
      <section className="tarjeta">
        <p className="text-[13px] text-zinc-500">Patrimonio neto</p>
        <p className="text-[30px] leading-tight font-bold tracking-tight tabular-nums">{formatearRedondo(p.neto)}</p>
        {anterior && (
          <p className={`text-[13px] tabular-nums ${p.neto - anterior.neto >= 0 ? VERDE : ROJO}`}>
            {p.neto - anterior.neto >= 0 ? '+' : ''}
            {formatearRedondo(p.neto - anterior.neto)} desde el cierre de {mesTexto(anterior.mes).replace(/ de \d+$/, '')}
          </p>
        )}
        <p className="mt-1 text-[13px] text-zinc-500 tabular-nums">
          Tienes {formatearRedondo(p.activos)} y debes {formatearRedondo(p.deudas)}.
        </p>
        <Evolucion p={p} />
      </section>

      <section className="mt-4">
        <h3 className="cabecera-grupo">Lo que tienes</h3>
        <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <li>
            <Link to="/extracto/posicion" className="fila min-h-14 active:bg-zinc-100 dark:active:bg-zinc-800">
              <Baldosa glifo={Landmark} color="#007AFF" tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">Cuentas</span>
                <span className="block text-[12px] text-zinc-500">{p.liquidez === null ? 'Importa los Excel de BBVA' : 'Según el banco, menos lo pendiente de la tarjeta'}</span>
              </span>
              <span className="text-[15px] tabular-nums">{p.liquidez === null ? '' : formatearRedondo(p.liquidez)}</span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" />
            </Link>
          </li>
          {[...p.inmuebles, ...p.otros].map((l) => (
            <FilaBien key={l.bien.id} l={l} onEditar={() => setBien(l.bien)} />
          ))}
          <li className="flex">
            <button className="fila min-h-12 flex-1 text-[15px] text-marca-700 active:bg-zinc-100 dark:text-marca-500 dark:active:bg-zinc-800" aria-label="Añadir un inmueble" onClick={() => setBien('inmueble')}>
              <Plus className="size-4" strokeWidth={2} /> Inmueble
            </button>
            <button className="fila min-h-12 flex-1 justify-end text-[15px] text-marca-700 active:bg-zinc-100 dark:text-marca-500 dark:active:bg-zinc-800" aria-label="Añadir otro activo" onClick={() => setBien('inversion')}>
              <Plus className="size-4" strokeWidth={2} /> Otro activo
            </button>
          </li>
        </ul>
        <p className="mt-1 px-4 text-[12px] text-zinc-500">El valor de cada bien lo pones tú, con su fecha. Actualízalo una vez al año; la app avisa si tiene más de un año.</p>
      </section>

      <section className="mt-4">
        <h3 className="cabecera-grupo">Lo que debes</h3>
        <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {p.hipotecas.map((h) => (
            <li key={h.cuenta.id}>
              <button className="fila min-h-14 w-full text-left active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setHipoteca(h.cuenta)}>
                <Baldosa glifo={Building2} color="#FF3B30" tamano="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{h.cuenta.alias}</span>
                  <span className="block truncate text-[12px] text-zinc-500 tabular-nums">
                    {formatearRedondo(h.cuota)} al mes al {texto(h.prestamo.interes)} %, hasta {mesTexto(h.fin)}
                  </span>
                </span>
                <span className="text-[15px] tabular-nums">{formatearRedondo(h.pendiente)}</span>
                <ChevronRight className="size-4 shrink-0 text-zinc-400" />
              </button>
            </li>
          ))}
          {p.hipotecasSinDatos.map((c) => (
            <li key={c.id}>
              <button className="fila min-h-14 w-full text-left active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setHipoteca(c)}>
                <Baldosa glifo={Building2} color="#FF3B30" tamano="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{c.alias}</span>
                  <span className={`block truncate text-[12px] ${NARANJA}`}>Indica lo que queda por pagar</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-zinc-400" />
              </button>
            </li>
          ))}
          <li>
            <Link to="/extracto/plan" className="fila min-h-14 active:bg-zinc-100 dark:active:bg-zinc-800">
              <Baldosa glifo={HandCoins} color="#AF52DE" tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">Deuda familiar</span>
                <span className="block text-[12px] text-zinc-500">Sin intereses, en el plan de pagos</span>
              </span>
              <span className="text-[15px] tabular-nums">{formatearRedondo(p.deudaFamiliar)}</span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" />
            </Link>
          </li>
        </ul>
        <p className="mt-1 px-4 text-[12px] text-zinc-500">La hipoteca se calcula con su cuadro de amortización: lo que queda baja solo cada mes.</p>
      </section>

      <section className="mt-4">
        <h3 className="cabecera-grupo">Comprar una vivienda</h3>
        <div className="lista space-y-3 px-4 py-3">
          {sim.compra && conCompra?.compra ? (
            <>
              <p className="text-[13px] text-zinc-500">
                {formatearRedondo(sim.compra.precio)} en {mesTexto(sim.compra.mes)}
              </p>
              <ResumenCompra r={conCompra.compra} base={base} con={conCompra} />
              <div className="flex gap-4">
                <button className="boton-texto px-0 text-[15px]" onClick={() => setCompra(true)}>
                  Cambiar
                </button>
                <Link to="/extracto/plan" className="boton-texto px-0 text-[15px]">
                  Ver en el plan de pagos
                </Link>
              </div>
            </>
          ) : sim.compra ? (
            <p className="text-[13px] text-zinc-500">Configura el plan de pagos (deuda, colchón y cuenta de ahorro) para ver si llega el dinero de la compra.</p>
          ) : (
            <>
              <p className="text-[13px] text-zinc-500">Precio, entrada, gastos de compra, hipoteca y alquiler: si llega el dinero, la cuota, el esfuerzo sobre tus nóminas y el efecto en la deuda.</p>
              <button className="boton-secundario w-full" onClick={() => setCompra(true)}>
                Simular una compra
              </button>
            </>
          )}
        </div>
      </section>

      <div className="mt-4">
        <BotonClaude onPulsar={() => setClaude(true)} />
      </div>
      <p className="mt-1 px-4 text-[12px] text-zinc-500">
        Envía a Claude tu situación completa con las cifras exactas, sin nombres de bienes, cuentas ni comercios, y la compra si la estás simulando.
      </p>

      <HojaBien bien={bien} onCerrar={() => setBien(null)} />
      <HojaHipoteca cuenta={hipoteca} onCerrar={() => setHipoteca(null)} />
      <HojaCompra abierta={compra} onCerrar={() => setCompra(false)} />
      <HojaClaude
        abierta={claude}
        titulo="Analizar con Claude"
        explicacion="Claude revisa tu situación completa y qué margen tienes para invertir, o la compra que estás simulando."
        texto={claude ? textoPatrimonio(db, hoy, sim) : ''}
        archivo="puchifin-situacion.txt"
        registro="Analizar patrimonio"
        detalle={claude ? { movimientos: movimientosUltimoAno(db, hoy), archivo: 'puchifin-movimientos-ultimo-ano.csv' } : undefined}
        onCerrar={() => setClaude(false)}
      />
    </>
  )
}

function FilaBien({ l, onEditar }: { l: LineaBien; onEditar: () => void }) {
  const g = GLIFO[l.bien.tipo]
  return (
    <li>
      <button className="fila min-h-14 w-full text-left active:bg-zinc-100 dark:active:bg-zinc-800" onClick={onEditar}>
        <Baldosa glifo={g.glifo} color={g.color} tamano="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]">{l.bien.alias}</span>
          <span className={`block truncate text-[12px] ${l.antigua ? NARANJA : 'text-zinc-500'}`}>
            {l.bien.habitual ? 'Vivienda habitual. ' : l.bien.tipo === 'inmueble' ? '' : `${NOMBRE_TIPO_BIEN[l.bien.tipo]}. `}
            {l.antigua ? 'Valoración de hace más de un año' : `Valorado en ${mesTexto(l.fecha.slice(0, 7))}`}
          </span>
        </span>
        <span className="text-[15px] tabular-nums">{formatearRedondo(l.valor)}</span>
        <ChevronRight className="size-4 shrink-0 text-zinc-400" />
      </button>
    </li>
  )
}

/** Patrimonio neto a final de cada mes: línea de 2 px con el primer y el último valor en texto */
function Evolucion({ p }: { p: DatosPatrimonio }) {
  const e = p.evolucion
  if (e.length < 2) return null
  const ancho = 300
  const alto = 64
  const valores = e.map((x) => x.neto)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const x = (i: number) => 4 + (i * (ancho - 8)) / (e.length - 1)
  const y = (v: number) => 6 + (alto - 12) * (1 - (v - min) / rango)
  const corto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1].slice(0, 3)} ${mes.slice(2, 4)}`
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label={`Patrimonio neto de ${corto(e[0].mes)} a hoy`}>
        <polyline
          points={e.map((p, i) => `${x(i).toFixed(1)},${y(p.neto).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--serie-1)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[12px] text-zinc-500 tabular-nums">
        <span>
          {corto(e[0].mes)}: {formatearRedondo(e[0].neto)}
        </span>
        <span>Hoy: {formatearRedondo(e[e.length - 1].neto)}</span>
      </figcaption>
    </figure>
  )
}

const TIPOS: TipoBien[] = ['inmueble', 'inversion', 'pension', 'vehiculo', 'otro']

/** Alta y cambio de un bien: nombre, tipo, vivienda habitual, valor y fecha de la valoración */
function HojaBien({ bien, onCerrar }: { bien: Bien | TipoBien | null; onCerrar: () => void }) {
  const hacer = useHacer()
  const { confirmar } = useInterfaz()
  const existente = bien && typeof bien !== 'string' ? bien : null
  const clave = existente?.id ?? (bien ? `nuevo-${bien}` : '')
  const [abiertaCon, setAbiertaCon] = useState('')
  const [f, setF] = useState({ alias: '', tipo: 'inmueble' as TipoBien, habitual: false, valor: '', fecha: '' })
  const [error, setError] = useState<string | null>(null)
  if (clave && clave !== abiertaCon) {
    setAbiertaCon(clave)
    setF(
      existente
        ? {
            alias: existente.alias,
            tipo: existente.tipo,
            habitual: existente.habitual,
            valor: texto(existente.valoraciones.at(-1)?.valor ?? 0),
            fecha: hoyIso(),
          }
        : { alias: '', tipo: bien as TipoBien, habitual: false, valor: '', fecha: hoyIso() },
    )
    setError(null)
  }
  const cerrar = () => {
    setAbiertaCon('')
    onCerrar()
  }
  const guardar = async () => {
    const valor = leerImporteUsuario(f.valor)
    if (valor === null) return setError('Escribe el valor estimado')
    setError(null)
    const datos = { alias: f.alias, tipo: f.tipo, habitual: f.habitual, valor, fecha: f.fecha }
    if (await hacer((d) => guardarBien(d, datos, existente?.id), existente ? `${f.alias.trim()}: guardado` : `${f.alias.trim()}: añadido`)) cerrar()
  }
  const borrar = async () => {
    if (!existente) return
    if (!(await confirmar({ titulo: 'Borrar el bien', texto: `${existente.alias}. También sus valoraciones anteriores.`, aceptar: 'Borrar', peligro: true }))) return
    if (await hacer((d) => borrarBien(d, existente.id), 'Bien borrado')) cerrar()
  }
  const campo = 'min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none'
  const ultima = existente?.valoraciones.at(-1)
  return (
    <Hoja abierta={!!bien} titulo={existente ? existente.alias : 'Nuevo bien'} onCerrar={cerrar}>
      <div className="space-y-4">
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <label className="fila min-h-12">
            <span className="w-32 shrink-0 text-[15px]">Nombre</span>
            <input
              className={campo}
              maxLength={40}
              placeholder={f.tipo === 'inmueble' ? 'Vivienda habitual' : 'Fondo indexado'}
              aria-label="Nombre del bien"
              value={f.alias}
              onChange={(e) => setF({ ...f, alias: e.target.value })}
            />
          </label>
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">Tipo</span>
            <select className="bg-transparent text-right text-[15px] outline-none" aria-label="Tipo de bien" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoBien })}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO_BIEN[t]}
                </option>
              ))}
            </select>
          </label>
          {f.tipo === 'inmueble' && (
            <div className="fila min-h-12">
              <span className="flex-1 text-[15px]">Vivienda habitual</span>
              <Interruptor etiqueta="Vivienda habitual" activo={f.habitual} onCambio={(v) => setF({ ...f, habitual: v })} />
            </div>
          )}
        </div>
        <p className="-mt-2 px-4 text-[12px] text-zinc-500">Solo un nombre: sin dirección ni referencia catastral.</p>
        <section>
          <h3 className="cabecera-grupo">Valor</h3>
          <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            <label className="fila min-h-12">
              <span className="w-32 shrink-0 text-[15px]">Valor estimado</span>
              <input className={`${campo} tabular-nums`} inputMode="decimal" placeholder="0 €" aria-label="Valor estimado" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
            </label>
            <label className="fila min-h-12">
              <span className="flex-1 text-[15px]">A fecha de</span>
              <input type="date" className="bg-transparent text-right text-[15px] outline-none" aria-label="Fecha de la valoración" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
            </label>
          </div>
          <p className="mt-1 px-4 text-[12px] text-zinc-500">
            {ultima
              ? `Última valoración: ${formatearRedondo(ultima.valor)} el ${ultima.fecha.split('-').reverse().join('/')}. Un valor nuevo se guarda con su fecha y no cambia el patrimonio de los meses anteriores.`
              : 'Por ejemplo, la valoración que enseña BBVA, la de una tasación o lo que pagaste.'}
          </p>
        </section>
        {error && <p className={`px-1 text-[13px] ${ROJO}`}>{error}</p>}
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

/** Capital pendiente, tipo fijo y años que quedan de la hipoteca; la cuota y el resto los calcula la app */
function HojaHipoteca({ cuenta, onCerrar }: { cuenta: Cuenta | null; onCerrar: () => void }) {
  const hacer = useHacer()
  const [abiertaCon, setAbiertaCon] = useState('')
  const [f, setF] = useState({ capital: '', fecha: '', interes: '', anios: '' })
  const [error, setError] = useState<string | null>(null)
  if (cuenta && cuenta.id !== abiertaCon) {
    setAbiertaCon(cuenta.id)
    const p = cuenta.prestamo
    setF(
      p
        ? { capital: texto(p.capital), fecha: p.fecha, interes: texto(p.interes), anios: texto(Math.round((p.plazo_meses / 12) * 100) / 100) }
        : { capital: '', fecha: `${hoyIso().slice(0, 7)}-01`, interes: '', anios: '' },
    )
    setError(null)
  }
  const cerrar = () => {
    setAbiertaCon('')
    onCerrar()
  }
  const numero = (t: string) => {
    const n = Number(t.trim().replace('%', '').replace(',', '.'))
    return t.trim() && Number.isFinite(n) ? n : null
  }
  const capital = leerImporteUsuario(f.capital)
  const interes = numero(f.interes)
  const anios = numero(f.anios)
  const plazo = anios === null ? null : Math.round(anios * 12)
  const valido = capital !== null && capital > 0 && interes !== null && plazo !== null && plazo > 0
  const prestamo = valido ? { capital: capital!, fecha: f.fecha, interes: interes!, plazo_meses: plazo! } : null
  const guardar = async () => {
    if (!prestamo) return setError('Escribe el capital pendiente, el tipo y los años que quedan')
    setError(null)
    if (await hacer((d) => guardarPrestamo(d, cuenta!.id, prestamo), `${cuenta!.alias}: guardada`)) cerrar()
  }
  const quitar = async () => {
    if (await hacer((d) => guardarPrestamo(d, cuenta!.id, null), `${cuenta!.alias}: sin capital pendiente`)) cerrar()
  }
  const campo = 'min-w-0 flex-1 bg-transparent text-right text-[15px] tabular-nums outline-none'
  return (
    <Hoja abierta={!!cuenta} titulo={cuenta?.alias ?? ''} onCerrar={cerrar}>
      <div className="space-y-4">
        <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          <label className="fila min-h-12">
            <span className="w-40 shrink-0 text-[15px]">Capital pendiente</span>
            <input className={campo} inputMode="decimal" placeholder="0 €" aria-label="Capital pendiente" value={f.capital} onChange={(e) => setF({ ...f, capital: e.target.value })} />
          </label>
          <label className="fila min-h-12">
            <span className="flex-1 text-[15px]">A fecha de</span>
            <input type="date" className="bg-transparent text-right text-[15px] outline-none" aria-label="Fecha del capital pendiente" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </label>
          <label className="fila min-h-12">
            <span className="w-40 shrink-0 text-[15px]">Tipo fijo (%)</span>
            <input className={campo} inputMode="decimal" placeholder="2,5" aria-label="Tipo fijo" value={f.interes} onChange={(e) => setF({ ...f, interes: e.target.value })} />
          </label>
          <label className="fila min-h-12">
            <span className="w-40 shrink-0 text-[15px]">Años que quedan</span>
            <input className={campo} inputMode="decimal" placeholder="25" aria-label="Años que quedan" value={f.anios} onChange={(e) => setF({ ...f, anios: e.target.value })} />
          </label>
        </div>
        {prestamo && (
          <div className="space-y-1 rounded-xl bg-zinc-100/70 px-4 py-3 text-[15px] tabular-nums dark:bg-zinc-800/50" aria-label="Cuota calculada">
            <p>Cuota: {formatearRedondo(cuotaDe(prestamo.capital, prestamo.interes, prestamo.plazo_meses))} al mes</p>
            <p>Última cuota en {mesTexto(finPrestamo(prestamo))}</p>
            <p className="text-[13px] text-zinc-500">Intereses que quedan: {formatearRedondo(interesesRestantes(prestamo, prestamo.fecha))}</p>
          </div>
        )}
        <p className="px-4 text-[12px] text-zinc-500">
          El capital pendiente y los años están en BBVA o en el último recibo. Si la cuota calculada no coincide con la de tu recibo, revisa los años que quedan.
        </p>
        {error && <p className={`px-1 text-[13px] ${ROJO}`}>{error}</p>}
        <button className="boton-primario w-full" onClick={guardar}>
          Guardar
        </button>
        {cuenta?.prestamo && (
          <button className="boton-texto w-full text-red-600 dark:text-red-500" onClick={quitar}>
            Quitar el capital pendiente
          </button>
        )}
      </div>
    </Hoja>
  )
}
