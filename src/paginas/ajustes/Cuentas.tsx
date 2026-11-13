import { ChevronRight, CreditCard, House, Landmark, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Encabezado'
import { Baldosa } from '../../componentes/Icono'
import { FilaInterruptor } from '../../componentes/Interfaz'
import { validarAlias } from '../../lib/identificativos'
import { registrar } from '../../lib/registro'
import { mensajeError, supabase } from '../../lib/supabase'
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
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | 'nueva' | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('cuentas').select('*').order('orden').order('created_at')
    if (e) setError(mensajeError(e))
    else setCuentas(data as Cuenta[])
  }, [])

  useEffect(() => {
    // Carga asíncrona: el estado se actualiza al llegar la respuesta de Supabase
    // oxlint-disable-next-line react/set-state-in-effect
    cargar()
  }, [cargar])

  const guardar = async (b: Borrador, id?: string): Promise<string | null> => {
    const motivo = validarAlias(b.alias)
    if (motivo) return motivo
    const fila = { alias: b.alias.trim(), entidad: b.entidad.trim() || null, tipo: b.tipo, activa: b.activa }
    const { error: e } = id
      ? await supabase.from('cuentas').update(fila).eq('id', id)
      : await supabase.from('cuentas').insert({ ...fila, orden: (cuentas?.length ?? 0) + 1 })
    if (e) return mensajeError(e)
    registrar('info', id ? 'Cuenta modificada' : 'Cuenta creada', { tipo: b.tipo, activa: b.activa })
    setEditando(null)
    await cargar()
    return null
  }

  return (
    <div className="space-y-4">
      {error && <Aviso>{error}</Aviso>}

      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {cuentas?.map((c) => {
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
      <div className="grid gap-3 sm:grid-cols-3">
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
