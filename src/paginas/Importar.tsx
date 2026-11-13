import { ArrowLeftRight, Briefcase, CalendarArrowUp, CircleCheck, ClipboardPaste, CopyCheck, FileSpreadsheet, Landmark, ShieldAlert, Tag } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Aviso, BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { Flotante, Interruptor, useInterfaz } from '../componentes/Interfaz'
import { ContenidoMovimiento, SelectorCategoria } from '../componentes/movimientos'
import { CuadreSaldo } from '../componentes/Saldo'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { confirmarImportacion, cuentaSugerida, deshacerImportacion, proponer, type MovimientoPropuesto } from '../importacion/importar'
import { ErrorLectura, leerFichero, leerPortapapeles, type Lectura } from '../importacion/lector'
import { hacerCopia } from '../lib/copias'
import { formatearFecha, formatearImporte, plural } from '../lib/formato'
import { nombreMes } from '../lib/fechas'
import { mesSiguiente } from '../lib/imputacion'
import { registrar } from '../lib/registro'
import { cuadrarCuenta } from '../lib/saldos'
import { esPendiente } from '../importacion/pendientes'
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
  // Sugerencias desactivadas, ligadas a la propuesta a la que pertenecen
  const [desactivadas, setDesactivadas] = useState<{ para: unknown; ids: Set<string> } | null>(null)
  const [categorias, setCategorias] = useState<Map<string, string | null>>(new Map())
  const [alMes, setAlMes] = useState<Map<string, boolean>>(new Map())
  const [pegando, setPegando] = useState(false)
  const [eligiendo, setEligiendo] = useState<MovimientoPropuesto | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const [verRepetidos, setVerRepetidos] = useState(false)
  const [hecha, setHecha] = useState<{ id: string; nuevos: number; cuenta_id: string } | null>(null)
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
  // Saldo de la cuenta tal como quedará: lo guardado más lo nuevo
  const cuadre = useMemo(
    () => (propuesta ? cuadrarCuenta([...base.movimientos.filter((m) => m.cuenta_id === propuesta.cuenta_id), ...propuesta.nuevos]) : null),
    [propuesta, base],
  )
  const pendientesHecha = hecha ? db.movimientos.filter((m) => m.importacion_id === hecha.id && esPendiente(m)).length : 0
  const cuadreHecha = useMemo(() => (hecha ? cuadrarCuenta(db.movimientos.filter((m) => m.cuenta_id === hecha.cuenta_id)) : null), [hecha, db])
  // Por defecto, las sugerencias seguras (confianza 0,75 o más) vienen aceptadas y las dudosas no
  const rechazadas =
    desactivadas && desactivadas.para === propuesta
      ? desactivadas.ids
      : new Set((propuesta?.nuevos ?? []).filter((m) => m.sugerencia && m.sugerencia.confianza < 0.75).map((m) => m.id))
  const setRechazadas = (f: Set<string> | ((s: Set<string>) => Set<string>)) =>
    setDesactivadas({ para: propuesta, ids: typeof f === 'function' ? f(rechazadas) : f })

  const leer = (f: File) => cargar(async () => leerFichero(new Uint8Array(await f.arrayBuffer())))

  // Pegar: lo copiado en BBVA (fichero, tabla de la web o texto)
  const pegarDelPortapapeles = async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('sin lectura')
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const tipoArchivo = item.types.find((t) => /sheet|excel|octet-stream|csv/.test(t))
        if (tipoArchivo) return cargar(async () => leerPortapapeles({ archivo: await item.getType(tipoArchivo) }))
        if (item.types.includes('text/html')) {
          const html = await (await item.getType('text/html')).text()
          if (/<table[\s>]/i.test(html)) return cargar(() => leerPortapapeles({ html }))
        }
        if (item.types.includes('text/plain')) {
          const texto = await (await item.getType('text/plain')).text()
          return cargar(() => leerPortapapeles({ texto }))
        }
      }
      setError('Lo copiado no es un Excel ni una tabla de movimientos')
    } catch {
      // Safari puede no dejar leer el portapapeles desde un botón: se pega en la zona de pegado
      setPegando(true)
    }
  }

  const cargar = async (obtener: () => Promise<Lectura>) => {
    setError(null)
    setHecha(null)
    setPegando(false)
    try {
      const l = await obtener()
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
      setCategorias(new Map())
      setAlMes(new Map())
      setDesactivadas(null)
      registrar('info', 'Movimientos leídos', { origen: l.plantilla.origen, filas: l.filas.length, ilegibles: l.ilegibles.length, hoja: l.hoja })
    } catch (e) {
      const msg = e instanceof ErrorLectura ? e.message : 'No se ha podido leer lo copiado o el fichero'
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
        const r = confirmarImportacion(d, propuesta, { aceptadas, categorias, mesSiguiente: alMes })
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
        empleado: aceptadas.size,
        traspasos: propuesta.traspasos.length,
        cuadra: cuadre?.conSaldo ? cuadre.cuadra : null,
      })
      setHecha({ id, nuevos: propuesta.nuevos.length, cuenta_id: propuesta.cuenta_id })
      setLectura(null)
    } finally {
      setGuardando(false)
    }
  }

  const deshacer = async () => {
    if (!hecha) return
    const ok = await confirmar({ titulo: 'Deshacer la importación', texto: `Se quitan ${hecha.nuevos === 1 ? 'el movimiento importado' : `los ${hecha.nuevos} movimientos importados`} y todo lo que dependía de ellos.`, aceptar: 'Deshacer', peligro: true })
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
          <p className="text-[17px] font-semibold">{plural(hecha.nuevos, 'movimiento importado', 'movimientos importados')}</p>
          {cuadreHecha?.conSaldo && (
            <div className="text-left">
              <CuadreSaldo cuadre={cuadreHecha} />
            </div>
          )}
          {pendientesHecha > 0 && (
            <button className="boton-primario w-full" onClick={() => navegar('/movimientos/categorizar')}>
              Categorizar {plural(pendientesHecha, 'pendiente', 'pendientes')}
            </button>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button className={pendientesHecha > 0 ? 'boton-secundario' : 'boton-primario'} onClick={() => navegar('/movimientos')}>
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
          <p className="text-[15px]">
            Descarga el Excel de movimientos en BBVA y elígelo desde Archivos, o cópialo y pégalo aquí. La app reconoce si es de una cuenta o de la tarjeta.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button className="boton-primario" onClick={() => entrada.current?.click()}>
              <FileSpreadsheet className="size-4" strokeWidth={2} /> Elegir fichero
            </button>
            <button className="boton-secundario" onClick={pegarDelPortapapeles}>
              <ClipboardPaste className="size-4" strokeWidth={2} /> Pegar
            </button>
          </div>
          {pegando && (
            <div
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Zona de pegado"
              className="min-h-24 rounded-[10px] border-2 border-dashed border-marca-600 bg-marca-50/40 p-3 text-left text-sm text-zinc-500 outline-none dark:bg-marca-900/20"
              onPaste={(e) => {
                e.preventDefault()
                const dt = e.clipboardData
                const archivo = dt.files?.[0] ?? null
                const html = dt.getData('text/html')
                const texto = dt.getData('text/plain')
                cargar(() => leerPortapapeles({ archivo, html, texto }))
              }}
            >
              Mantén pulsado aquí y elige «Pegar».
            </div>
          )}
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
              <button className="boton-texto" onClick={() => { setLectura(null); setPegando(false) }}>
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
            <dl className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-[10px] bg-zinc-50 py-2 dark:bg-zinc-800/50">
                <dt className="text-[11px] text-zinc-500">Nuevos</dt>
                <dd className="text-lg font-semibold">{propuesta.nuevos.length}</dd>
              </div>
              <div className="rounded-[10px] bg-zinc-50 py-2 dark:bg-zinc-800/50">
                <dt className="text-[11px] text-zinc-500">Ya importados</dt>
                <dd className="text-lg font-semibold">{propuesta.duplicados}</dd>
              </div>
            </dl>
          </div>

          {cuadre?.conSaldo && propuesta.nuevos.length > 0 && (
            <Bloque
              titulo="Saldo tras importar"
              icono={Landmark}
              color="#007AFF"
              nota="Se comprueba con el saldo que trae el Excel tras cada movimiento. Si no cuadra, falta algún tramo o hay algo repetido."
            >
              <div className="tarjeta">
                <CuadreSaldo cuadre={cuadre} />
              </div>
            </Bloque>
          )}

          {propuesta.repetidos.length > 0 && (
            <Bloque
              titulo={`Ya importados (${propuesta.repetidos.length})`}
              icono={CopyCheck}
              color="#8E8E93"
              nota="Estaban guardados de otra importación (mismo día, importe y saldo del banco, o mismo concepto). No se vuelven a subir."
            >
              <button className="boton-texto mb-2 px-1" onClick={() => setVerRepetidos((v) => !v)}>
                {verRepetidos ? 'Ocultar' : 'Ver cuáles'}
              </button>
              {verRepetidos && (
                <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                  {propuesta.repetidos.map((r) => (
                    <li key={r.fila} className="flex items-center gap-3 px-4 py-2 text-[15px]">
                      <span className="w-12 shrink-0 text-xs text-zinc-500">{formatearFecha(r.fecha).slice(0, 5)}</span>
                      <span className="min-w-0 flex-1 truncate">{r.concepto}</span>
                      <span className="tabular-nums">{formatearImporte(r.importe)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>
          )}

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
            <Bloque titulo={`Sugerencias (${sugeridas.length})`} icono={Briefcase} color="#5856D6" nota="Gastos de empleado, reembolsos y pagos de deuda que propone la app. Los muy probables vienen activados; revisa el resto. Lo que descartes también enseña a la app.">
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

          {propuesta.nuevos.some((m) => m.mes_imputacion || propuesta.alMesSiguiente.includes(m.id)) && (
            <Bloque
              titulo="Cuentan en el mes siguiente"
              icono={CalendarArrowUp}
              color="#007AFF"
              nota="Cobros y cargos de fin de mes que son del mes siguiente (nómina, hipoteca o lo que pasaste a mano antes). Cuentan desde el día 1."
            >
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {propuesta.nuevos
                  .filter((m) => propuesta.alMesSiguiente.includes(m.id))
                  .map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px]">{m.concepto_limpio}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {formatearFecha(m.fecha_operacion)}, {formatearImporte(m.importe)}. Cuenta en {nombreMes(`${mesSiguiente(m.fecha_operacion)}-01`)}
                        </p>
                      </div>
                      <Interruptor
                        etiqueta={`Mes siguiente: ${m.concepto_limpio}`}
                        activo={alMes.get(m.id) ?? true}
                        onCambio={(v) => setAlMes((mapa) => new Map(mapa).set(m.id, v))}
                      />
                    </li>
                  ))}
              </ul>
            </Bloque>
          )}

          {propuesta.nuevos.some((m) => m.tipo === 'traspaso_interno') && (
            <Bloque
              titulo={`Traspasos entre tus cuentas (${propuesta.nuevos.filter((m) => m.tipo === 'traspaso_interno').length})`}
              icono={ArrowLeftRight}
              color="#8E8E93"
              nota={`Traspasos y liquidación de la tarjeta: no computan como gasto ni como ingreso, así que se netean entre las dos cuentas.${propuesta.traspasos.length ? ` ${propuesta.traspasos.length} ya están emparejados con su movimiento en la otra cuenta.` : ' Al importar la otra cuenta se emparejarán.'}`}
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

          <Flotante>
            <button
              className="boton-primario w-full py-3 text-[17px] shadow-lg"
              disabled={guardando || !propuesta.nuevos.length || propuesta.problemas.length > 0}
              onClick={importar}
            >
              {guardando ? 'Importando…' : propuesta.nuevos.length ? `Importar ${plural(propuesta.nuevos.length, 'movimiento', 'movimientos')}` : 'Nada nuevo que importar'}
            </button>
          </Flotante>
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
