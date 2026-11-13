import { ChevronRight, Plus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Encabezado'
import { contieneIdentificativo } from '../../lib/identificativos'
import { formatearImporte } from '../../lib/formato'
import { guardarAjustes } from '../../datos/operaciones'
import { intentar, useDatos } from '../../datos/ProveedorDatos'
import type { Ajustes } from '../../lib/tipos'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function General() {
  const db = useDatos()
  const deuda = db.compromisos.find((c) => c.activo)
  // Borrador local: se guarda al pulsar «Guardar ajustes»
  const [ajustes, setAjustes] = useState<Ajustes>(() => structuredClone(db.ajustes))
  const [nuevoAlias, setNuevoAlias] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  const cambiar = (parcial: Partial<Ajustes>) => {
    setGuardado(false)
    setAjustes({ ...ajustes, ...parcial })
  }

  const anadirAlias = () => {
    const a = nuevoAlias.trim()
    if (!a) return
    if (contieneIdentificativo(a)) {
      setError('El alias no puede contener números de cuenta, tarjeta ni DNI')
      return
    }
    if (ajustes.alias_terceros.some((x) => x.alias.toLowerCase() === a.toLowerCase())) return
    cambiar({ alias_terceros: [...ajustes.alias_terceros, { alias: a, patrones: [] }] })
    setNuevoAlias('')
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (ajustes.fecha_corte_fintonic >= ajustes.fecha_inicio) {
      setError('La fecha de corte con Fintonic debe ser anterior a la fecha de inicio')
      return
    }
    const err = await intentar((d) => guardarAjustes(d, ajustes), 'Ajustes guardados')
    if (err) setError(err)
    else setGuardado(true)
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <section className="tarjeta space-y-3">
        <h2 className="text-sm font-semibold">Fechas</h2>
        <div className="grid gap-3">
          <label>
            <span className="etiqueta">Fecha de inicio de la app</span>
            <input type="date" className="campo" value={ajustes.fecha_inicio} onChange={(e) => cambiar({ fecha_inicio: e.target.value })} />
            <span className="mt-1 block text-xs text-zinc-500">Los movimientos de BBVA anteriores se descartan al importar.</span>
          </label>
          <label>
            <span className="etiqueta">Fecha de corte con Fintonic</span>
            <input type="date" className="campo" value={ajustes.fecha_corte_fintonic} onChange={(e) => cambiar({ fecha_corte_fintonic: e.target.value })} />
            <span className="mt-1 block text-xs text-zinc-500">El histórico de Fintonic (fase 5) llega hasta esta fecha.</span>
          </label>
        </div>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="text-sm font-semibold">Umbrales</h2>
        <div className="grid gap-3">
          <label>
            <span className="etiqueta">Aviso de gasto de empleado pendiente (días)</span>
            <input type="number" min={1} className="campo" value={ajustes.dias_aviso_reembolso} onChange={(e) => cambiar({ dias_aviso_reembolso: Number(e.target.value) })} />
          </label>
          <label>
            <span className="etiqueta">Aviso de presupuesto (%)</span>
            <input type="number" min={1} max={100} className="campo" value={ajustes.umbral_aviso_presupuesto} onChange={(e) => cambiar({ umbral_aviso_presupuesto: Number(e.target.value) })} />
          </label>
        </div>
      </section>

      <section className="tarjeta space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Alias de terceros</h2>
          <p className="text-xs text-zinc-500">
            Al importar, el nombre del ordenante o beneficiario de transferencias y Bizum se sustituye por su alias si coincide con uno de
            estos nombres; si no, se quita. Los nombres se guardan solo en el iPhone.
          </p>
        </div>
        <ul className="space-y-3">
          {ajustes.alias_terceros.map((a, i) => (
            <li key={a.alias} className="rounded-[10px] bg-zinc-50 p-3 dark:bg-zinc-800/40">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[15px] font-medium">{a.alias}</span>
                <button
                  type="button"
                  className="boton-texto text-xs text-red-600 dark:text-red-500"
                  onClick={() => cambiar({ alias_terceros: ajustes.alias_terceros.filter((x) => x.alias !== a.alias) })}
                >
                  Quitar alias
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {a.patrones.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full bg-white py-0.5 pr-1 pl-2.5 text-[13px] dark:bg-zinc-900">
                    {p}
                    <button
                      type="button"
                      aria-label={`Quitar ${p}`}
                      className="rounded-full p-0.5 text-zinc-400"
                      onClick={() => cambiar({ alias_terceros: ajustes.alias_terceros.map((x, j) => (j === i ? { ...x, patrones: x.patrones.filter((y) => y !== p) } : x)) })}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                {!a.patrones.length && <span className="text-xs text-zinc-500">Sin nombres: no sustituye nada</span>}
              </div>
              <input
                className="campo mt-2"
                placeholder={a.alias === 'Empresa' ? 'Nombre de la empresa, como aparece en BBVA' : 'Añadir un nombre'}
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const v = e.currentTarget.value.trim()
                  if (!v) return
                  if (contieneIdentificativo(v)) {
                    setError('El nombre no puede contener números de cuenta, tarjeta ni DNI')
                    return
                  }
                  cambiar({ alias_terceros: ajustes.alias_terceros.map((x, j) => (j === i && !x.patrones.includes(v) ? { ...x, patrones: [...x.patrones, v] } : x)) })
                  e.currentTarget.value = ''
                }}
              />
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="campo"
            placeholder="Nuevo alias"
            maxLength={30}
            value={nuevoAlias}
            onChange={(e) => setNuevoAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                anadirAlias()
              }
            }}
          />
          <button type="button" className="boton-secundario shrink-0" onClick={anadirAlias}>
            <Plus className="size-4" /> Añadir
          </button>
        </div>
        <p className="text-xs text-zinc-500">Escribe el nombre y pulsa Intro. Guarda los cambios con «Guardar ajustes».</p>
      </section>

      <Link to="/ajustes/reglas" className="lista fila">
        <span className="flex-1 text-[15px]">Reglas de categorización</span>
        <span className="text-[15px] text-zinc-500">{db.reglas.filter((r) => r.activa).length} activas</span>
        <ChevronRight className="size-4 text-zinc-400" />
      </Link>

      {deuda && (
        <section className="tarjeta space-y-2">
          <h2 className="text-sm font-semibold">{deuda.nombre}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {formatearImporte(deuda.deuda_inicial)} pendientes, colchón de {formatearImporte(deuda.colchon)}, pago entre{' '}
            {MESES[deuda.ventana_mes_inicio - 1]} y {MESES[deuda.ventana_mes_fin - 1]} con {MESES[deuda.mes_referencia - 1]} como
            referencia, {deuda.interes_anual > 0 ? `${deuda.interes_anual} % de interés` : 'sin intereses'}.
          </p>
          <p className="text-xs text-zinc-500">Valores iniciales. Se podrán editar en la fase 4, con el plan de pagos.</p>
        </section>
      )}

      {error && <Aviso>{error}</Aviso>}
      {guardado && <Aviso tipo="ok">Ajustes guardados.</Aviso>}
      <button type="submit" className="boton-primario">Guardar ajustes</button>
    </form>
  )
}
