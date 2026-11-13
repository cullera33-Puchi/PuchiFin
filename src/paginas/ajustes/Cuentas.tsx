import { ChevronRight, CircleAlert, CircleCheck, CreditCard, House, Landmark, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Encabezado'
import { Baldosa } from '../../componentes/Icono'
import { FilaInterruptor, Hoja, useInterfaz } from '../../componentes/Interfaz'
import { useHacer } from '../../componentes/acciones'
import { CuadreSaldo } from '../../componentes/Saldo'
import { borrarMovimientos, confirmarSaldo, guardarCuenta } from '../../datos/operaciones'
import { intentar, useDatos } from '../../datos/ProveedorDatos'
import { hoyIso } from '../../lib/fechas'
import { formatearFecha, formatearImporte, leerImporteUsuario } from '../../lib/formato'
import { cuadrarCuenta, idsDuplicados } from '../../lib/saldos'
import { NOMBRE_TIPO_CUENTA, type Cuenta, type TipoCuenta } from '../../lib/tipos'

const ESTILO_TIPO = {
  cuenta: { glifo: Landmark, color: '#007AFF' },
  tarjeta_credito: { glifo: CreditCard, color: '#FF9500' },
  hipoteca: { glifo: House, color: '#A2845E' },
}

interface Borrador {
  alias: string
  entidad: string
  tipo: TipoCuenta
  activa: boolean
}

const VACIO: Borrador = { alias: '', entidad: 'BBVA', tipo: 'cuenta', activa: true }

export function Cuentas() {
  const cuentas = [...useDatos().cuentas].sort((a, b) => a.orden - b.orden)
  const [editando, setEditando] = useState<string | 'nueva' | null>(null)

  const guardar = async (b: Borrador, id?: string): Promise<string | null> => {
    const error = await intentar((db) => guardarCuenta(db, b, id), id ? 'Cuenta modificada' : 'Cuenta creada')
    if (!error) setEditando(null)
    return error
  }

  return (
    <div className="space-y-4">
      <Saldos />
      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {cuentas.map((c) => {
          const estilo = ESTILO_TIPO[c.tipo]
          return (
            <li key={c.id}>
              {editando === c.id ? (
                <Formulario
                  inicial={{ alias: c.alias, entidad: c.entidad ?? '', tipo: c.tipo, activa: c.activa }}
                  onGuardar={(b) => guardar(b, c.id)}
                  onCancelar={() => setEditando(null)}
                />
              ) : (
                <button className={`fila hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800/60 ${c.activa ? '' : 'opacity-50'}`} onClick={() => setEditando(c.id)}>
                  <Baldosa glifo={estilo.glifo} color={estilo.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.alias}</span>
                    <span className="block text-xs text-zinc-500">
                      {NOMBRE_TIPO_CUENTA[c.tipo]}
                      {c.entidad ? `, ${c.entidad}` : ''}
                    </span>
                  </span>
                  {!c.activa && <span className="text-xs text-zinc-500">Inactiva</span>}
                  <ChevronRight className="size-4 text-zinc-400" strokeWidth={2} />
                </button>
              )}
            </li>
          )
        })}
        <li>
          {editando === 'nueva' ? (
            <Formulario inicial={VACIO} onGuardar={(b) => guardar(b)} onCancelar={() => setEditando(null)} />
          ) : (
            <button className="fila text-marca-700 hover:bg-zinc-50 dark:text-marca-500 dark:hover:bg-zinc-800/60" onClick={() => setEditando('nueva')}>
              <Plus className="size-5" strokeWidth={2} /> Añadir cuenta
            </button>
          )}
        </li>
      </ul>

      <p className="px-4 text-xs text-zinc-500">
        Cada cuenta se identifica solo por su alias: la app rechaza números de cuenta, IBAN y números de tarjeta. La hipoteca no tiene
        movimientos propios: su cuota se carga en una cuenta y computa en Vivienda, subcategoría Hipoteca.
      </p>
    </div>
  )
}

function Formulario({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: Borrador
  onGuardar: (b: Borrador) => Promise<string | null>
  onCancelar: () => void
}) {
  const [b, setB] = useState(inicial)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError(await onGuardar(b))
    setGuardando(false)
  }

  return (
    <form onSubmit={enviar} className="space-y-3 bg-zinc-50 px-4 py-4 dark:bg-zinc-800/40">
      <div className="grid gap-3">
        <label>
          <span className="etiqueta">Alias</span>
          <input className="campo" value={b.alias} maxLength={40} autoFocus placeholder="Cuenta principal" onChange={(e) => setB({ ...b, alias: e.target.value })} />
        </label>
        <label>
          <span className="etiqueta">Tipo</span>
          <select className="campo" value={b.tipo} onChange={(e) => setB({ ...b, tipo: e.target.value as TipoCuenta })}>
            {Object.entries(NOMBRE_TIPO_CUENTA).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="etiqueta">Entidad</span>
          <input className="campo" value={b.entidad} maxLength={40} placeholder="BBVA" onChange={(e) => setB({ ...b, entidad: e.target.value })} />
        </label>
      </div>
      <FilaInterruptor texto="Activa" nota="Las cuentas inactivas no aparecen al importar" activo={b.activa} onCambio={(activa) => setB({ ...b, activa })} />
      {error && <Aviso>{error}</Aviso>}
      <div className="flex justify-end gap-2">
        <button type="button" className="boton-secundario" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="boton-primario" disabled={guardando}>
          Guardar
        </button>
      </div>
    </form>
  )
}

/** Saldo de cada cuenta bancaria frente al banco: el del Excel y el que el usuario ve hoy en BBVA */
function Saldos() {
  const db = useDatos()
  const [abierta, setAbierta] = useState<string | null>(null)
  const bancarias = useMemo(() => db.cuentas.filter((c) => c.activa && c.tipo === 'cuenta').sort((a, b) => a.orden - b.orden), [db.cuentas])
  const cuadres = useMemo(
    () => new Map(bancarias.map((c) => [c.id, cuadrarCuenta(db.movimientos.filter((m) => m.cuenta_id === c.id))])),
    [db.movimientos, bancarias],
  )
  const conSaldo = bancarias.filter((c) => cuadres.get(c.id)!.conSaldo)
  if (!conSaldo.length) return null
  const cuenta = conSaldo.find((c) => c.id === abierta)
  return (
    <section>
      <h2 className="px-4 pb-1.5 text-[13px] uppercase text-zinc-500">Saldo frente al banco</h2>
      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {conSaldo.map((c) => {
          const q = cuadres.get(c.id)!
          const ok = q.cuadra && (!c.saldo_confirmado || c.saldo_confirmado.cuadra)
          return (
            <li key={c.id}>
              <button className="fila hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800/60" onClick={() => setAbierta(c.id)}>
                {ok ? <CircleCheck className="size-5 text-[#34C759]" strokeWidth={2} /> : <CircleAlert className="size-5 text-[#FF9500]" strokeWidth={2} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.alias}</span>
                  <span className="block text-xs text-zinc-500">
                    {c.saldo_confirmado
                      ? `Comprobado con el banco el ${formatearFecha(c.saldo_confirmado.fecha)}${c.saldo_confirmado.cuadra ? '' : ', con diferencia'}`
                      : q.cuadra
                        ? 'Cuadra con el Excel'
                        : 'No cuadra con el Excel'}
                  </span>
                </span>
                <span className="text-[15px] tabular-nums">{formatearImporte(q.saldoApp!)}</span>
                <ChevronRight className="size-4 text-zinc-400" strokeWidth={2} />
              </button>
            </li>
          )
        })}
      </ul>
      {cuenta && <HojaSaldo cuenta={cuenta} onCerrar={() => setAbierta(null)} />}
    </section>
  )
}

function HojaSaldo({ cuenta, onCerrar }: { cuenta: Cuenta; onCerrar: () => void }) {
  const db = useDatos()
  const { avisar, confirmar } = useInterfaz()
  const hacer = useHacer()
  const cuadre = useMemo(() => cuadrarCuenta(db.movimientos.filter((m) => m.cuenta_id === cuenta.id)), [db.movimientos, cuenta.id])
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sobran = idsDuplicados(cuadre)

  const comprobar = async (e: FormEvent) => {
    e.preventDefault()
    const importe = leerImporteUsuario(texto)
    if (importe === null) return setError('Escribe el saldo que ves en la app de BBVA, por ejemplo 1.234,56')
    const err = await intentar((d) => confirmarSaldo(d, cuenta.id, importe, cuadre.saldoApp!, hoyIso()))
    if (err) return setError(err)
    setError(null)
    setTexto('')
    const dif = Math.round((importe - cuadre.saldoApp!) * 100) / 100
    avisar(dif === 0 ? 'El saldo cuadra con el banco' : `Diferencia de ${formatearImporte(dif)} con el banco`)
  }

  const quitar = async () => {
    const ok = await confirmar({
      titulo: 'Quitar repetidos',
      texto: `Se borran ${sobran.length === 1 ? 'el movimiento guardado' : `los ${sobran.length} movimientos guardados`} dos veces. De cada uno se queda el primero. Podrás deshacerlo durante unos segundos.`,
      aceptar: 'Quitar',
      peligro: true,
    })
    if (ok) await hacer((d) => borrarMovimientos(d, new Set(sobran)), sobran.length === 1 ? 'Repetido quitado' : `${sobran.length} repetidos quitados`)
  }

  const conf = cuenta.saldo_confirmado
  const dif = conf ? Math.round((conf.importe - cuadre.saldoApp!) * 100) / 100 : 0
  return (
    <Hoja abierta titulo={cuenta.alias} onCerrar={onCerrar}>
      <div className="space-y-4">
        <CuadreSaldo cuadre={cuadre} />
        {sobran.length > 0 && (
          <button className="boton-secundario w-full" onClick={quitar}>
            Quitar {sobran.length === 1 ? 'el repetido' : `los ${sobran.length} repetidos`}
          </button>
        )}
        <form onSubmit={comprobar} className="space-y-2">
          <label className="block">
            <span className="etiqueta">Saldo que ves hoy en BBVA</span>
            <input className="campo tabular-nums" inputMode="decimal" placeholder="0,00" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          <p className="text-xs text-zinc-500">
            Si has importado hasta hoy, debe coincidir con el saldo de la app. Si no, la diferencia son los movimientos posteriores al{' '}
            {formatearFecha(cuadre.fecha!)} que faltan por importar.
          </p>
          {error && <Aviso>{error}</Aviso>}
          <button type="submit" className="boton-primario w-full">
            Comprobar
          </button>
        </form>
        {conf && (
          <Aviso tipo={conf.cuadra || dif === 0 ? 'ok' : 'info'}>
            {formatearFecha(conf.fecha)}: banco {formatearImporte(conf.importe)}.{' '}
            {dif === 0 ? 'Coincide con la app.' : `Diferencia con la app hoy: ${formatearImporte(dif)}.`}
          </Aviso>
        )}
      </div>
    </Hoja>
  )
}
