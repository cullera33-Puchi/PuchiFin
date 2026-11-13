import { ArrowLeftRight, Briefcase, CircleCheck, FileSpreadsheet, ShieldAlert, Tag } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Aviso, BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { Interruptor, useInterfaz } from '../componentes/Interfaz'
import { ContenidoMovimiento, SelectorCategoria } from '../componentes/movimientos'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { confirmarImportacion, cuentaSugerida, deshacerImportacion, proponer, type MovimientoPropuesto } from '../importacion/importar'
import { ErrorLectura, leerFichero, type Lectura } from '../importacion/lector'
import { hacerCopia } from '../lib/copias'
import { formatearFecha, formatearImporte } from '../lib/formato'
import { registrar } from '../lib/registro'
import { NOMBRE_TIPO_MOVIMIENTO } from '../lib/tipos'

const CLAVE_CUENTA = 'puchifin-importar-cuenta-'

function Bloque({ titulo, icono, color, nota, children }: { titulo: string; icono: typeof Tag; color: string; nota?: string; children?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <Baldosa glifo={icono} color={color} tamano="sm" />
        <h3 className="text-[15px] font-semibold">{titulo}</h3>
      </div>
      {nota && <p className="mb-2 px-1 text-xs text-zinc-500">{nota}</p>}
      {children}
    </section>
  )
}

export function Importar() {
  const db = useDatos()
  const navegar = useNavigate()
  const { avisar, confirmar } = useInterfaz()
  const entrada = useRef<HTMLInputElement>(null)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rechazadas, setRechazadas] = useState<Set<string>>(new Set())
  const [categorias, setCategorias] = useState<Map<string, string | null>>(new Map())
  const [eligiendo, setEligiendo] = useState<MovimientoPropuesto | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const [hecha, setHecha] = useState<{ id: string; nuevos: number } | null>(null)
  const [guardando, setGuardando] = useState(false)

  // La propuesta se calcula con los datos del momento de leer el fichero o de cambiar de cuenta
  const [base, setBase] = useState(db)
  const calculo = useMemo(() => {
    if (!lectura || !cuentaId) return { propuesta: null, error: null }
    try {
      return { propuesta: proponer(base, lectura, cuentaId), error: null }
    } catch (e) {
      return { propuesta: null, error: (e as Error).message }
    }
  }, [lectura, cuentaId, base])
  const propuesta = calculo.propuesta

  const leer = async (f: File) => {
    setError(null)
    setHecha(null)
    try {
      const l = leerFichero(new Uint8Array(await f.arrayBuffer()))
      let ultima: string | undefined
      try {
        ultima = localStorage.getItem(CLAVE_CUENTA + l.plantilla.origen) ?? undefined
      } catch {
        ultima = undefined
      }
      const sugerida = cuentaSugerida(db, l, ultima)
      setBase(db)
      setLectura(l)
      setCuentaId(sugerida?.id ?? null)
      setRechazadas(new Set())
      setCategorias(new Map())
      registrar('info', 'Excel leído', { origen: l.plantilla.origen, filas: l.filas.length, ilegibles: l.ilegibles.length })
    } catch (e) {
      const msg = e instanceof ErrorLectura ? e.message : 'No se ha podido leer el fichero'
      registrar('aviso', `Leer Excel: ${msg}`)
      setError(msg)
      setLectura(null)
    }
  }

  const cuentasPosibles = lectura ? db.cuentas.filter((c) => c.activa && c.tipo === lectura.plantilla.tipo_cuenta) : []
  const sugeridas = propuesta?.nuevos.filter((m) => m.sugerencia) ?? []
  const sinCategoria = propuesta?.nuevos.filter((m) => m.tipo === 'normal' && !(categorias.has(m.id) ? categorias.get(m.id) : m.categoria_id) && !(m.sugerencia && !rechazadas.has(m.id))) ?? []

  const importar = async () => {
    if (!propuesta) return
    setGuardando(true)
    setError(null)
    try {
      await hacerCopia('antes de importar')
      const aceptadas = new Set(sugeridas.filter((m) => !rechazadas.has(m.id)).map((m) => m.id))
      let id = ''
      const e = await intentar((d) => {
        const r = confirmarImportacion(d, propuesta, { aceptadas, categorias })
        id = r.importaciones[r.importaciones.length - 1].id
        return r
      })
      if (e) {
        setError(e)
        return
      }
      try {
        localStorage.setItem(CLAVE_CUENTA + propuesta.origen, propuesta.cuenta_id)
      } catch {
        // sin almacenamiento
      }
      registrar('info', 'Importación confirmada', {
        origen: propuesta.origen,
        nuevos: propuesta.nuevos.length,
        duplicados: propuesta.duplicados,
        anteriores: propuesta.anteriores,
        empleado: aceptadas.size,
        traspasos: propuesta.traspasos.length,
      })
      setHecha({ id, nuevos: propuesta.nuevos.length })
      setLectura(null)
    } finally {
      setGuardando(false)
    }
  }

  const deshacer = async () => {
    if (!hecha) return
    const ok = await confirmar({ titulo: 'Deshacer la importación', texto: `Se quitan los ${hecha.nuevos} movimientos importados y todo lo que dependía de ellos.`, aceptar: 'Deshacer', peligro: true })
    if (!ok) return
    const e = await intentar((d) => deshacerImportacion(d, hecha.id), 'Importación deshecha')
    if (e) setError(e)
    else {
      avisar('Importación deshecha')
      setHecha(null)
    }
  }

  return (
    <>
      <BarraNavegacion titulo="Importar" atras="Movimientos" destino="/movimientos" subtitulo="Excel de movimientos de BBVA, de cuenta o de tarjeta" />
      <input
        ref={entrada}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) leer(f)
        }}
      />

      {(error || calculo.error) && (
        <div className="mb-3">
          <Aviso>{error ?? calculo.error}</Aviso>
        </div>
      )}

      {hecha && (
        <div className="tarjeta space-y-3 text-center">
          <CircleCheck className="mx-auto size-12 text-[#34C759]" strokeWidth={1.5} />
          <p className="text-[17px] font-semibold">{hecha.nuevos} movimientos importados</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="boton-primario" onClick={() => navegar('/movimientos')}>
              Ver movimientos
            </button>
            <button className="boton-secundario" onClick={() => entrada.current?.click()}>
              Importar otro
            </button>
          </div>
          <button className="boton-texto text-red-600 dark:text-red-500" onClick={deshacer}>
            Deshacer esta importación
          </button>
        </div>
      )}

      {!lectura && !hecha && (
        <div className="tarjeta space-y-4 text-center">
          <FileSpreadsheet className="mx-auto size-12 text-[#34C759]" strokeWidth={1.5} />
          <p className="text-[15px]">Descarga el Excel de movimientos en la app o la web de BBVA, guárdalo en Archivos y elígelo aquí. La app reconoce si es de una cuenta o de la tarjeta.</p>
          <button className="boton-primario w-full" onClick={() => entrada.current?.click()}>
            Elegir fichero
          </button>
          <p className="text-xs text-zinc-500">
            El fichero se lee en el iPhone y no se guarda: solo los movimientos, ya sin números de cuenta, tarjetas ni nombres. ¿Sin ficheros todavía? Descarga los{' '}
            <Link to="/ajustes/herramientas" className="text-marca-700 underline dark:text-marca-500">
              Excel de prueba
            </Link>
            .
          </p>
        </div>
      )}

      {lectura && propuesta && (
        <div className="space-y-5 pb-20">
          <div className="tarjeta space-y-3">
            <div className="flex items-center gap-3">
              <Baldosa glifo={FileSpreadsheet} color="#34C759" />
              <div className="flex-1">
                <p className="font-semibold">{lectura.plantilla.nombre}</p>
                <p className="text-xs text-zinc-500">
                  {propuesta.fecha_desde ? `Del ${formatearFecha(propuesta.fecha_desde)} al ${formatearFecha(propuesta.fecha_hasta!)}` : 'Sin movimientos nuevos'}
                </p>
              </div>
              <button className="boton-texto" onClick={() => entrada.current?.click()}>
                Cambiar
              </button>
            </div>
            <label className="block">
              <span className="etiqueta">Cuenta</span>
              <select className="campo" value={cuentaId ?? ''} onChange={(e) => setCuentaId(e.target.value)}>
                {cuentasPosibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.alias}
                  </option>
                ))}
              </select>
            </label>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[10px] bg-zinc-50 py-2 dark:bg-zinc-800/50">
                <dt className="text-[11px] text-zinc-500">Nuevos</dt>
                <dd className="text-lg font-semibold">{propuesta.nuevos.length}</dd>
              </div>
              <div className="rounded-[10px] bg-zinc-50 py-2 dark:bg-zinc-800/50">
                <dt className="text-[11px] text-zinc-500">Ya importados</dt>
                <dd className="text-lg font-semibold">{propuesta.duplicados}</dd>
              </div>
              <div className="rounded-[10px] bg-zinc-50 py-2 dark:bg-zinc-800/50">
                <dt className="text-[11px] text-zinc-500">Antes del inicio</dt>
                <dd className="text-lg font-semibold">{propuesta.anteriores}</dd>
              </div>
            </dl>
          </div>

          {propuesta.problemas.length > 0 && (
            <Bloque titulo="Importación bloqueada" icono={ShieldAlert} color="#FF3B30" nota="Quedan datos identificativos en estas filas. Revisa el fichero o las plantillas de lectura.">
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {propuesta.problemas.map((p) => (
                  <li key={p.fila} className="px-4 py-2 text-sm text-red-700 dark:text-red-400">
                    {p.texto}
                  </li>
                ))}
              </ul>
            </Bloque>
          )}

          {propuesta.avisos.map((a) => (
            <Aviso key={a} tipo="info">
              {a}
            </Aviso>
          ))}

          {sugeridas.length > 0 && (
            <Bloque titulo={`Sugerencias (${sugeridas.length})`} icono={Briefcase} color="#5856D6" nota="Gastos de empleado, reembolsos y pagos de deuda que proponen las reglas. Desactiva los que no lo sean.">
              <div className="mb-2 flex gap-3 px-1">
                <button className="boton-texto" onClick={() => setRechazadas(new Set())}>
                  Aceptar todas
                </button>
                <button className="boton-texto" onClick={() => setRechazadas(new Set(sugeridas.map((m) => m.id)))}>
                  Ninguna
                </button>
              </div>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {sugeridas.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">{m.concepto_limpio}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {formatearFecha(m.fecha_operacion)}, {formatearImporte(m.importe)}. {NOMBRE_TIPO_MOVIMIENTO[m.sugerencia!.tipo]}: {m.sugerencia!.motivo.toLowerCase()}
                      </p>
                    </div>
                    <Interruptor
                      etiqueta={`${NOMBRE_TIPO_MOVIMIENTO[m.sugerencia!.tipo]}: ${m.concepto_limpio}`}
                      activo={!rechazadas.has(m.id)}
                      onCambio={(v) =>
                        setRechazadas((s) => {
                          const n = new Set(s)
                          if (v) n.delete(m.id)
                          else n.add(m.id)
                          return n
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            </Bloque>
          )}

          {propuesta.traspasos.length > 0 && (
            <Bloque
              titulo={`Traspasos entre tus cuentas (${propuesta.traspasos.length})`}
              icono={ArrowLeftRight}
              color="#8E8E93"
              nota="Emparejados con el movimiento opuesto de otra cuenta. Se marcan como traspaso interno en los dos lados y no computan."
            />
          )}

          {sinCategoria.length > 0 && (
            <Bloque titulo={`Sin categoría (${sinCategoria.length})`} icono={Tag} color="#FF9500" nota="Toca uno para elegir su categoría. También puedes hacerlo después, en Movimientos.">
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {sinCategoria.map((m) => (
                  <li key={m.id}>
                    <button className="w-full text-left" onClick={() => setEligiendo(m)}>
                      <ContenidoMovimiento m={m} conFecha />
                    </button>
                  </li>
                ))}
              </ul>
            </Bloque>
          )}

          <Bloque titulo={`Movimientos nuevos (${propuesta.nuevos.length})`} icono={FileSpreadsheet} color="#34C759">
            <button className="boton-texto mb-2 px-1" onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? 'Ocultar' : 'Ver todos'}
            </button>
            {verTodos && (
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {propuesta.nuevos.map((m) => {
                  const cat = categorias.has(m.id) ? categorias.get(m.id)! : m.categoria_id
                  const tipo = m.sugerencia && !rechazadas.has(m.id) ? m.sugerencia.tipo : m.tipo
                  return (
                    <li key={m.id}>
                      <button className="w-full text-left" onClick={() => setEligiendo(m)}>
                        <ContenidoMovimiento m={{ ...m, categoria_id: cat, tipo }} conFecha />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Bloque>

          <div className="fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] z-30 mx-auto max-w-md">
            <button
              className="boton-primario w-full py-3 text-[17px] shadow-lg"
              disabled={guardando || !propuesta.nuevos.length || propuesta.problemas.length > 0}
              onClick={importar}
            >
              {guardando ? 'Importando…' : propuesta.nuevos.length ? `Importar ${propuesta.nuevos.length} movimientos` : 'Nada nuevo que importar'}
            </button>
          </div>
        </div>
      )}

      <SelectorCategoria
        abierta={!!eligiendo}
        actual={eligiendo ? (categorias.has(eligiendo.id) ? categorias.get(eligiendo.id) : eligiendo.categoria_id) : undefined}
        onElegir={(c) => {
          if (eligiendo) setCategorias((m) => new Map(m).set(eligiendo.id, c))
          setEligiendo(null)
        }}
        onCerrar={() => setEligiendo(null)}
      />
    </>
  )
}
