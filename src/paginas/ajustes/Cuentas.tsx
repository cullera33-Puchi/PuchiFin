import { CreditCard, Home, Landmark, Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Encabezado'
import { validarAlias } from '../../lib/identificativos'
import { mensajeError, supabase } from '../../lib/supabase'
import { NOMBRE_TIPO_CUENTA, type Cuenta, type TipoCuenta } from '../../lib/tipos'

const ICONO_TIPO = { cuenta: Landmark, tarjeta_credito: CreditCard, hipoteca: Home }

interface Borrador {
  alias: string
  entidad: string
  tipo: TipoCuenta
}

const VACIO: Borrador = { alias: '', entidad: 'BBVA', tipo: 'cuenta' }

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
    const fila = { alias: b.alias.trim(), entidad: b.entidad.trim() || null, tipo: b.tipo }
    const { error: e } = id
      ? await supabase.from('cuentas').update(fila).eq('id', id)
      : await supabase.from('cuentas').insert({ ...fila, orden: (cuentas?.length ?? 0) + 1 })
    if (e) return mensajeError(e)
    setEditando(null)
    await cargar()
    return null
  }

  const alternarActiva = async (c: Cuenta) => {
    const { error: e } = await supabase.from('cuentas').update({ activa: !c.activa }).eq('id', c.id)
    if (e) setError(mensajeError(e))
    else cargar()
  }

  return (
    <div className="space-y-4">
      <Aviso tipo="info">
        Cada cuenta se identifica solo por su alias. No escribas números de cuenta, IBAN ni números de tarjeta: la app
        los rechaza.
      </Aviso>
      {error && <Aviso>{error}</Aviso>}

      <ul className="space-y-2">
        {cuentas?.map((c) => {
          const Icono = ICONO_TIPO[c.tipo]
          return (
            <li key={c.id} className={`tarjeta ${c.activa ? '' : 'opacity-60'}`}>
              {editando === c.id ? (
                <Formulario
                  inicial={{ alias: c.alias, entidad: c.entidad ?? '', tipo: c.tipo }}
                  onGuardar={(b) => guardar(b, c.id)}
                  onCancelar={() => setEditando(null)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-marca-50 text-marca-700 dark:bg-marca-900/40 dark:text-marca-100">
                    <Icono className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.alias}</p>
                    <p className="text-xs text-zinc-500">
                      {NOMBRE_TIPO_CUENTA[c.tipo]}
                      {c.entidad ? `, ${c.entidad}` : ''}
                      {c.activa ? '' : '. Inactiva'}
                    </p>
                  </div>
                  <button className="boton-secundario px-2" onClick={() => alternarActiva(c)}>
                    {c.activa ? 'Desactivar' : 'Activar'}
                  </button>
                  <button className="boton-secundario px-2" aria-label={`Editar ${c.alias}`} onClick={() => setEditando(c.id)}>
                    <Pencil className="size-4" />
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {editando === 'nueva' ? (
        <div className="tarjeta">
          <Formulario inicial={VACIO} onGuardar={(b) => guardar(b)} onCancelar={() => setEditando(null)} />
        </div>
      ) : (
        <button className="boton-primario" onClick={() => setEditando('nueva')}>
          <Plus className="size-4" /> Añadir cuenta
        </button>
      )}

      <p className="text-xs text-zinc-500">
        La hipoteca no tiene movimientos propios: su cuota se carga en una de las cuentas y computa en Vivienda,
        subcategoría Hipoteca.
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
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-1">
          <span className="etiqueta">Alias</span>
          <input
            className="campo"
            value={b.alias}
            maxLength={40}
            autoFocus
            placeholder="Cuenta principal"
            onChange={(e) => setB({ ...b, alias: e.target.value })}
          />
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
          <input
            className="campo"
            value={b.entidad}
            maxLength={40}
            placeholder="BBVA"
            onChange={(e) => setB({ ...b, entidad: e.target.value })}
          />
        </label>
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex gap-2">
        <button type="submit" className="boton-primario" disabled={guardando}>
          Guardar
        </button>
        <button type="button" className="boton-secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
