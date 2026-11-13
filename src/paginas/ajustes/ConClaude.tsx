import { ClipboardPaste, FileSpreadsheet, Share, Sparkles, Copy } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useHacer } from '../../componentes/acciones'
import { Aviso } from '../../componentes/Encabezado'
import { FilaInterruptor, Hoja, useInterfaz } from '../../componentes/Interfaz'
import { useDatos } from '../../datos/ProveedorDatos'
import { importarReglas, leerReglas, resumirComercios, textoResumen } from '../../importacion/claude'
import { ErrorLectura, leerFichero, leerPortapapeles, type Lectura } from '../../importacion/lector'
import { aplicarReglasAPendientes } from '../../importacion/pendientes'
import { compartirArchivo, copiarTexto } from '../../lib/compartir'
import { plural } from '../../lib/formato'
import { registrar } from '../../lib/registro'

/**
 * Categorizar con Claude en el chat: resumen anonimizado de comercios para pegar en el chat y, a la
 * vuelta, las reglas que propone Claude. Nada de esto va al código de la app.
 */
export function SeccionClaude() {
  const [resumen, setResumen] = useState(false)
  const [reglas, setReglas] = useState(false)
  return (
    <section className="tarjeta space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Categorizar con Claude</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Para la primera carga: prepara un resumen de comercios, pégalo en el chat con Claude y trae de vuelta las reglas que te proponga. El resumen no lleva fechas, saldos,
          cuentas ni nombres, y no se guarda nada.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="boton-secundario" onClick={() => setResumen(true)}>
          <FileSpreadsheet className="size-4" strokeWidth={2} /> 1. Preparar resumen
        </button>
        <button className="boton-secundario" onClick={() => setReglas(true)}>
          <Sparkles className="size-4" strokeWidth={2} /> 2. Importar reglas
        </button>
      </div>
      <HojaResumen abierta={resumen} onCerrar={() => setResumen(false)} />
      <HojaReglas abierta={reglas} onCerrar={() => setReglas(false)} />
    </section>
  )
}

function HojaResumen({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const [lecturas, setLecturas] = useState<Lectura[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pegando, setPegando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const r = useMemo(() => (lecturas.length ? resumirComercios(db, lecturas) : null), [db, lecturas])
  const texto = useMemo(() => (r ? textoResumen(db, r) : ''), [db, r])

  const anadir = async (obtener: () => Promise<Lectura>) => {
    setError(null)
    try {
      const l = await obtener()
      setLecturas((x) => [...x, l])
      setPegando(false)
    } catch (e) {
      setError(e instanceof ErrorLectura ? e.message : 'No se ha podido leer')
    }
  }
  const pegar = async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('sin lectura')
      for (const item of await navigator.clipboard.read()) {
        const tipo = item.types.find((t) => /sheet|excel|octet-stream|csv/.test(t))
        if (tipo) return anadir(async () => leerPortapapeles({ archivo: await item.getType(tipo) }))
        if (item.types.includes('text/html')) {
          const html = await (await item.getType('text/html')).text()
          if (/<table[\s>]/i.test(html)) return anadir(() => leerPortapapeles({ html }))
        }
        if (item.types.includes('text/plain')) {
          const t = await (await item.getType('text/plain')).text()
          return anadir(() => leerPortapapeles({ texto: t }))
        }
      }
    } catch {
      setPegando(true)
    }
  }
  const copiar = async () => {
    const ok = await copiarTexto(texto)
    registrar('info', 'Resumen de comercios copiado', { comercios: r?.lineas.length ?? 0 })
    avisar(ok ? 'Resumen copiado. Pégalo en el chat con Claude' : 'No se ha podido copiar')
  }
  const compartir = async () => {
    await compartirArchivo(new Blob([texto], { type: 'text/plain' }), 'puchifin-comercios.txt', 'Comercios para categorizar')
    registrar('info', 'Resumen de comercios compartido', { comercios: r?.lineas.length ?? 0 })
  }

  return (
    <Hoja
      abierta={abierta}
      titulo="Resumen para Claude"
      listo="Listo"
      onCerrar={() => {
        setLecturas([])
        setError(null)
        onCerrar()
      }}
    >
      <div className="space-y-4">
        <p className="text-[15px] text-zinc-600 dark:text-zinc-400">
          Añade los Excel de BBVA de todo el periodo que quieras (cuentas y tarjeta). Se leen y se anonimizan aquí; no se guardan.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="boton-primario" onClick={() => entrada.current?.click()}>
            <FileSpreadsheet className="size-4" strokeWidth={2} /> Elegir Excel
          </button>
          <button className="boton-secundario" onClick={pegar}>
            <ClipboardPaste className="size-4" strokeWidth={2} /> Pegar
          </button>
          <input
            ref={entrada}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={async (e) => {
              for (const f of [...(e.target.files ?? [])]) await anadir(async () => leerFichero(new Uint8Array(await f.arrayBuffer())))
              e.target.value = ''
            }}
          />
        </div>
        {pegando && (
          <div
            contentEditable
            suppressContentEditableWarning
            className="campo min-h-20 text-[15px] text-zinc-500"
            onPaste={(e) => {
              e.preventDefault()
              const html = e.clipboardData.getData('text/html')
              const t = e.clipboardData.getData('text/plain')
              void anadir(async () => (html && /<table[\s>]/i.test(html) ? leerPortapapeles({ html }) : leerPortapapeles({ texto: t })))
            }}
          >
            Mantén pulsado aquí y elige «Pegar»
          </div>
        )}
        {error && <Aviso>{error}</Aviso>}
        {r && (
          <>
            <p className="text-[15px]">
              {plural(lecturas.length, 'fichero', 'ficheros')}: {plural(r.movimientos, 'movimiento', 'movimientos')} en {plural(r.lineas.length, 'comercio', 'comercios')},{' '}
              {plural(r.lineas.filter((l) => !l.categoriaApp).length, 'sin categoría', 'sin categoría')} con las reglas de ahora.
              {r.descartadas > 0 && ` ${plural(r.descartadas, 'fila descartada', 'filas descartadas')} por precaución.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="boton-primario" onClick={copiar}>
                <Copy className="size-4" strokeWidth={2} /> Copiar resumen
              </button>
              <button className="boton-secundario" onClick={compartir}>
                <Share className="size-4" strokeWidth={2} /> Compartir
              </button>
              <button className="boton-texto px-2" onClick={() => setLecturas([])}>
                Vaciar
              </button>
            </div>
            <p className="text-xs text-zinc-500">Esto es exactamente lo que se envía. Revísalo antes:</p>
            <pre className="max-h-64 overflow-auto rounded-xl bg-zinc-100 p-3 font-mono text-[11px] leading-snug whitespace-pre select-text dark:bg-zinc-800">{texto}</pre>
          </>
        )}
      </div>
    </Hoja>
  )
}

function HojaReglas({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const db = useDatos()
  const hacer = useHacer()
  const [texto, setTexto] = useState('')
  const [aplicar, setAplicar] = useState(true)
  const lineas = useMemo(() => leerReglas(db, texto), [db, texto])
  const validas = lineas.filter((l) => !l.error)
  const errores = lineas.filter((l) => l.error)

  const importar = async () => {
    let resultado = { nuevas: 0, actualizadas: 0, categorizados: 0 }
    const ok = await hacer(
      (d) => {
        const r = importarReglas(d, lineas)
        const p = aplicar ? aplicarReglasAPendientes(r.db) : { db: r.db, categorizados: 0 }
        resultado = { nuevas: r.nuevas, actualizadas: r.actualizadas, categorizados: p.categorizados }
        return p.db
      },
      `${plural(validas.length, 'regla importada', 'reglas importadas')}`,
    )
    if (ok) {
      registrar('info', 'Reglas importadas de Claude', resultado)
      setTexto('')
      onCerrar()
    }
  }

  return (
    <Hoja abierta={abierta} titulo="Importar reglas" listo="Cerrar" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-[15px] text-zinc-600 dark:text-zinc-400">
          Pega lo que te ha devuelto Claude: una línea por comercio con la clave, un tabulador (o «;») y «Categoría &gt; Subcategoría». Con «~» delante, la palabra se busca en
          cualquier parte del concepto (~cumple). En lugar de la categoría puede ir un tipo (Tipo: Traspaso interno). Las reglas se guardan solo en este iPhone.
        </p>
        <textarea className="campo min-h-40 font-mono text-[13px]" placeholder={'mercadona\tAlimentación > Supermercado'} value={texto} onChange={(e) => setTexto(e.target.value)} />
        {lineas.length > 0 && (
          <p className="text-[15px]">
            {plural(validas.length, 'regla válida', 'reglas válidas')}
            {errores.length > 0 && `, ${plural(errores.length, 'línea con error', 'líneas con error')}`}.
          </p>
        )}
        {errores.length > 0 && (
          <ul className="space-y-1 text-[13px] text-red-700 dark:text-red-400">
            {errores.slice(0, 8).map((l) => (
              <li key={l.linea}>
                Línea {l.linea} ({l.clave}): {l.error}
              </li>
            ))}
          </ul>
        )}
        <div className="lista bg-zinc-100/70 dark:bg-zinc-800/50">
          <FilaInterruptor texto="Aplicar también a lo pendiente" nota="Solo a lo que está sin categoría; lo ya categorizado no cambia" activo={aplicar} onCambio={setAplicar} />
        </div>
        <button className="boton-primario w-full py-3" disabled={!validas.length} onClick={importar}>
          Importar {plural(validas.length, 'regla', 'reglas')}
        </button>
      </div>
    </Hoja>
  )
}
