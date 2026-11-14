import { ChevronRight, Plus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Encabezado'
import { Segmentado } from '../../componentes/Interfaz'
import { guardarTema, leerTema, type Tema } from '../../lib/tema'
import { contieneIdentificativo } from '../../lib/identificativos'
import { formatearImporte, plural } from '../../lib/formato'
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
    // Lo que se guarda en otras pantallas (nóminas) o solo la app (versión de la lógica), tal como esté ahora
    const err = await intentar((d) => guardarAjustes(d, { ...ajustes, nominas: d.ajustes.nominas, version_logica: d.ajustes.version_logica }), 'Ajustes guardados')
    if (err) setError(err)
    else setGuardado(true)
  }

  return (
    <form onSubmit={guardar} className="space-y-4">

      <section className="tarjeta space-y-3">
        <h2 className="text-sm font-semibold">Umbrales</h2>
        <div className="grid gap-3">
          <label>
            <span className="etiqueta">Aviso de presupuesto (%)</span>
            <input type="number" min={1} max={100} className="campo" value={ajustes.umbral_aviso_presupuesto} onChange={(e) => cambiar({ umbral_aviso_presupuesto: Number(e.target.value) })} />
          </label>
          <label>
            <span className="etiqueta">Fin de mes (días)</span>
            <input type="number" min={0} max={10} className="campo" value={ajustes.dias_fin_de_mes} onChange={(e) => cambiar({ dias_fin_de_mes: Number(e.target.value) })} />
            <span className="mt-1 block text-xs text-zinc-500">
              En los últimos {ajustes.dias_fin_de_mes} días del mes, la nómina y la hipoteca cuentan ya en el mes siguiente. 0 para no hacerlo.
            </span>
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

      <Aspecto />

      <Link to="/ajustes/reglas" className="lista fila">
        <span className="flex-1 text-[15px]">Reglas de categorización</span>
        <span className="text-[15px] text-zinc-500">{db.reglas.filter((r) => r.activa).length} activas</span>
        <ChevronRight className="size-4 text-zinc-400" />
      </Link>

      <Link to="/extracto/ingresos" className="lista fila min-h-14">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px]">Nóminas e ingresos previstos</span>
          <span className="block text-[12px] text-zinc-500">
            {(db.ajustes.nominas ?? []).length ? plural((db.ajustes.nominas ?? []).length, 'nómina', 'nóminas') : 'Tu nómina neta y sus pagas extra, y otra para simular'}
          </span>
        </span>
        <ChevronRight className="size-4 text-zinc-400" />
      </Link>

      {deuda && (
        <Link to="/extracto/plan" className="lista fila min-h-14">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px]">{deuda.nombre}</span>
            <span className="block text-[12px] text-zinc-500">
              {deuda.deuda_inicial === 0
                ? 'Sin configurar. Deuda, colchón y ventana de pago en el plan de pagos'
                : `Colchón de ${formatearImporte(deuda.colchon)}, pago entre ${MESES[deuda.ventana_mes_inicio - 1]} y ${MESES[deuda.ventana_mes_fin - 1]}, sin intereses`}
            </span>
          </span>
          <ChevronRight className="size-4 text-zinc-400" />
        </Link>
      )}

      {error && <Aviso>{error}</Aviso>}
      {guardado && <Aviso tipo="ok">Ajustes guardados.</Aviso>}
      <button type="submit" className="boton-primario">Guardar ajustes</button>
    </form>
  )
}

/** Tema de la app: Automático (el del iPhone), Claro u Oscuro. Se guarda en este dispositivo */
function Aspecto() {
  const [tema, setTema] = useState<Tema>(leerTema)
  return (
    <section className="space-y-1.5">
      <h2 className="px-4 text-[13px] text-zinc-500 uppercase">Aspecto</h2>
      <Segmentado
        etiqueta="Tema"
        opciones={[
          ['auto', 'Automático'],
          ['claro', 'Claro'],
          ['oscuro', 'Oscuro'],
        ]}
        valor={tema}
        onCambio={(t) => {
          guardarTema(t)
          setTema(t)
        }}
      />
    </section>
  )
}
