import { Copy, Download, FileSpreadsheet, FlaskConical, HardDriveDownload, HardDriveUpload, RotateCcw, Share2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useActualizacion } from '../../componentes/Actualizacion'
import { Aviso } from '../../componentes/Encabezado'
import { Baldosa } from '../../componentes/Icono'
import { Hoja, useInterfaz } from '../../componentes/Interfaz'
import { resumenArchivo, type ArchivoPuchiFin } from '../../datos/archivo'
import { borrarDatosPrueba, contarDatosPrueba } from '../../datos/operaciones'
import { intentar, useDatos } from '../../datos/ProveedorDatos'
import { compartirArchivo, compartirArchivos, copiarTexto } from '../../lib/compartir'
import { guardarAjustes } from '../../datos/operaciones'
import {
  borrarCopia,
  borrarTodasLasCopias,
  exportarArchivo,
  hacerCopia,
  leerArchivoDeUsuario,
  leerCopia,
  listarCopias,
  restaurar,
  saltarCopiaDeHoy,
  suscribirCopias,
  ultimaExportacion,
  type MetaCopia,
} from '../../lib/copias'
import { generarDatosPrueba } from '../../lib/datosPrueba'
import { hoyIso } from '../../lib/fechas'
import { formatearFecha } from '../../lib/formato'
import { borrarRegistro, entradasRegistro, recuperarRegistro, registrar, suscribirRegistro, textoRegistro } from '../../lib/registro'
import { APP_VERSION } from '../../lib/version'

function Seccion({ titulo, nota, children }: { titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section className="tarjeta space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {nota && <p className="mt-0.5 text-xs text-zinc-500">{nota}</p>}
      </div>
      {children}
    </section>
  )
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const cuando = (iso: string) => `del ${formatearFecha(iso)} a las ${hora(iso)}`
const NOMBRE_TIPO: Record<MetaCopia['tipo'], string> = {
  diaria: 'Copia diaria',
  manual: 'Copia manual',
  'antes de restaurar': 'Antes de restaurar',
  'antes de importar': 'Antes de importar',
}

/** Nombres inventados de los Excel de prueba (los mismos que importacion/excelPrueba.ts) */
const NOMBRES_PRUEBA = { empresa: 'ACME CONSULTING SL', familia: 'MARIA GARCIA LOPEZ' }

export function Herramientas() {
  const db = useDatos()
  const { avisar, confirmar } = useInterfaz()
  const { pendiente, actualizar, verNovedades, buscar } = useActualizacion()

  const [copias, setCopias] = useState<MetaCopia[] | null>(null)
  const [ultima, setUltima] = useState(ultimaExportacion)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verRegistro, setVerRegistro] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)
  const entradas = useSyncExternalStore(suscribirRegistro, entradasRegistro)
  const prueba = contarDatosPrueba(db)

  const recargar = useCallback(async () => {
    try {
      setCopias(await listarCopias())
    } catch (e) {
      registrar('error', `No se pudieron leer las copias: ${(e as Error).message}`)
      setCopias([])
    }
    setUltima(ultimaExportacion())
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    recargar()
    return suscribirCopias(() => {
      recargar()
    })
  }, [recargar])

  /** Ejecuta una operación mostrando el estado y el error, si lo hay */
  const ejecutar = async (etiqueta: string, fn: () => Promise<void>) => {
    setOcupado(etiqueta)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  const sustituir = async (a: ArchivoPuchiFin, titulo: string, tipo: 'antes de restaurar' | 'antes de importar') => {
    const n = resumenArchivo(a)
    const ok = await confirmar({
      titulo,
      texto: (
        <>
          <p>
            Se sustituyen todos los datos del iPhone por los del archivo: {n.cuentas} cuentas, {n.categorias} categorías y{' '}
            {n.movimientos} movimientos. Quedará exactamente igual que cuando se guardó.
          </p>
          <p className="mt-2">Antes se guarda una copia del estado actual en el iPhone, por si hay que volver atrás.</p>
        </>
      ),
      aceptar: tipo === 'antes de importar' ? 'Importar' : 'Restaurar',
      peligro: true,
    })
    if (!ok) return
    await ejecutar('restaurar', async () => {
      await restaurar(a, tipo)
      avisar(tipo === 'antes de importar' ? 'Datos importados' : 'Copia restaurada')
    })
  }

  const restaurarLocal = async (m: MetaCopia) => {
    const a = await leerCopia(m.clave)
    if (!a) {
      setError('No se encuentra la copia en el iPhone')
      return
    }
    await sustituir(a, `Restaurar copia ${cuando(m.creada)}`, 'antes de restaurar')
  }

  const importar = async (f: File) => {
    setError(null)
    try {
      const a = await leerArchivoDeUsuario(f)
      registrar('info', 'Archivo leído para importar', resumenArchivo(a))
      await sustituir(a, a.exportado ? `Importar datos ${cuando(a.exportado)}` : 'Importar datos', 'antes de importar')
    } catch (e) {
      registrar('aviso', `Importar archivo: ${(e as Error).message}`)
      setError((e as Error).message)
    }
  }

  const borrarUna = async (m: MetaCopia) => {
    const ok = await confirmar({
      titulo: 'Borrar copia',
      texto: `La copia ${cuando(m.creada)} se borrará del iPhone. No se puede deshacer.`,
      aceptar: 'Borrar',
      peligro: true,
    })
    if (!ok) return
    await ejecutar('borrar', async () => {
      await borrarCopia(m.clave)
      if (m.tipo === 'diaria' && m.dia === new Date().toISOString().slice(0, 10)) saltarCopiaDeHoy()
      avisar('Copia borrada')
    })
  }

  const borrarTodas = async () => {
    const n = copias?.length ?? 0
    const ok = await confirmar({
      titulo: 'Borrar todas las copias',
      texto: `${n === 1 ? 'La copia' : `Las ${n} copias`} del iPhone se borrarán. No se puede deshacer. La copia automática vuelve mañana.`,
      aceptar: 'Borrar todas',
      peligro: true,
    })
    if (!ok) return
    await ejecutar('borrar', async () => {
      const b = await borrarTodasLasCopias()
      saltarCopiaDeHoy()
      avisar(b === 1 ? 'Copia borrada' : `${b} copias borradas`)
    })
  }

  const generarPrueba = async () => {
    const ok = await confirmar({
      titulo: 'Generar datos de prueba',
      texto:
        'Se crean movimientos inventados desde la fecha de inicio hasta hoy en tus cuentas: nómina, recibos, compras con tarjeta, gastos de empleado con su reembolso y traspasos. Se ven en toda la app y en los resúmenes, marcados como datos de prueba, y se eliminan de una vez.',
      aceptar: 'Generar',
    })
    if (!ok) return
    let n = 0
    const err = await intentar((d) => {
      if (contarDatosPrueba(d)) throw new Error('Ya hay datos de prueba')
      const p = generarDatosPrueba({ cuentas: d.cuentas, categorias: d.categorias, desde: d.ajustes.fecha_inicio, hasta: hoyIso() })
      n = p.movimientos.length
      return {
        ...d,
        importaciones: [...d.importaciones, ...p.importaciones],
        movimientos: [...d.movimientos, ...p.movimientos],
        conciliaciones: [...d.conciliaciones, ...p.conciliaciones],
      }
    }, 'Datos de prueba generados')
    if (err) setError(err)
    else avisar(`${n} movimientos de prueba creados`)
  }

  const eliminarPrueba = async () => {
    const ok = await confirmar({
      titulo: 'Eliminar datos de prueba',
      texto: `Se eliminan los ${prueba} movimientos de prueba y sus conciliaciones. Los datos reales no se tocan.`,
      aceptar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    const err = await intentar(borrarDatosPrueba, 'Datos de prueba eliminados')
    if (err) setError(err)
    else avisar(`${prueba} movimientos de prueba eliminados`)
  }

  const textoReg = () => textoRegistro(`cuentas ${db.cuentas.length}, movimientos ${db.movimientos.length}, de prueba ${prueba}`)
  const compartirRegistro = async () => {
    const texto = textoReg()
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Registro de PuchiFin', text: texto })
        return
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    if (await copiarTexto(texto)) avisar('Registro copiado. Pégalo en el chat')
  }
  const borrarReg = () => {
    const antes = borrarRegistro()
    setVerRegistro(false)
    avisar('Registro borrado', { texto: 'Deshacer', fn: () => recuperarRegistro(antes) })
  }

  return (
    <div className="space-y-4">
      {error && <Aviso>{error}</Aviso>}

      <Seccion
        titulo="Exportar e importar"
        nota="Tus datos se guardan solo en este iPhone. Exporta de vez en cuando un archivo y guárdalo en Archivos o iCloud Drive: es tu copia fuera del móvil. Al importarlo (por ejemplo, en un iPhone nuevo), todo queda exactamente igual."
      >
        <p className="text-sm">
          {ultima ? (
            <>
              Última exportación: <strong>{cuando(ultima)}</strong>
            </>
          ) : (
            <span className="text-zinc-500">Todavía no has exportado.</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="boton-primario" disabled={!!ocupado} onClick={() => ejecutar('exportar', async () => { await exportarArchivo(); setUltima(ultimaExportacion()) })}>
            <HardDriveDownload className="size-4" strokeWidth={2} /> Exportar todos los datos
          </button>
          <button className="boton-secundario" disabled={!!ocupado} onClick={() => archivo.current?.click()}>
            <HardDriveUpload className="size-4" strokeWidth={2} /> Importar archivo
          </button>
          <input
            ref={archivo}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) importar(f)
            }}
          />
        </div>
        {ocupado === 'restaurar' && <Aviso tipo="info">Sustituyendo los datos…</Aviso>}
      </Seccion>

      <Seccion titulo="Copias de seguridad" nota="Cada día, al abrir la app, se guarda una copia en el iPhone (se conservan las 7 últimas). Si borras la app, se borran con ella: para eso está la exportación.">
        {copias === null ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : copias.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía ninguna copia en el iPhone.</p>
        ) : (
          <ul className="divide-y divide-zinc-200/70 rounded-[10px] bg-zinc-50 dark:divide-zinc-800 dark:bg-zinc-800/40">
            {copias.map((m) => (
              <li key={m.clave} className="flex items-center gap-1 py-1.5 pr-1 pl-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {formatearFecha(m.dia)} <span className="font-normal text-zinc-500">{hora(m.creada)}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {NOMBRE_TIPO[m.tipo]}. {m.movimientos} movimientos, {m.cuentas} cuentas, v{m.version}
                  </p>
                </div>
                <button className="boton-icono" title="Restaurar" aria-label="Restaurar" disabled={!!ocupado} onClick={() => restaurarLocal(m)}>
                  <RotateCcw className="size-5" strokeWidth={1.75} />
                </button>
                <button
                  className="boton-icono"
                  title="Exportar esta copia"
                  aria-label="Exportar esta copia"
                  disabled={!!ocupado}
                  onClick={async () => {
                    const a = await leerCopia(m.clave)
                    if (a) await exportarArchivo(a)
                  }}
                >
                  <Download className="size-5" strokeWidth={1.75} />
                </button>
                <button className="boton-icono text-red-600 dark:text-red-500" title="Borrar" aria-label="Borrar copia" disabled={!!ocupado} onClick={() => borrarUna(m)}>
                  <Trash2 className="size-5" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className="boton-secundario" disabled={!!ocupado} onClick={() => ejecutar('copia', async () => { await hacerCopia('manual'); avisar('Copia guardada en el iPhone') })}>
            {ocupado === 'copia' ? 'Guardando…' : 'Hacer copia ahora'}
          </button>
          {!!copias?.length && (
            <button className="boton-texto px-2 text-red-600 dark:text-red-500" disabled={!!ocupado} onClick={borrarTodas}>
              Borrar todas
            </button>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Datos de prueba" nota="Movimientos inventados para probar el extracto y los resúmenes sin datos reales. Se eliminan de una vez sin tocar lo real.">
        {prueba ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto flex items-center gap-2 text-sm">
              <Baldosa glifo={FlaskConical} color="#FF9500" tamano="sm" /> {prueba} movimientos de prueba
            </span>
            <button className="boton-secundario text-red-600 dark:text-red-500" onClick={eliminarPrueba}>
              Eliminar datos de prueba
            </button>
          </div>
        ) : (
          <button className="boton-secundario" onClick={generarPrueba}>
            <FlaskConical className="size-4" strokeWidth={2} /> Generar datos de prueba
          </button>
        )}
      </Seccion>

      <Seccion
        titulo="Excel de prueba"
        nota="Tres Excel inventados con el formato de BBVA (cuenta principal, cuenta 2 y tarjeta), desde la fecha de inicio hasta hoy. Guárdalos en Archivos e impórtalos desde Movimientos para probar la importación con datos de mentira."
      >
        <div className="flex flex-wrap gap-2">
          <button
            className="boton-secundario"
            onClick={async () => {
              const { escribirXlsx, generarExcelPrueba } = await import('../../importacion/excelPrueba')
              const excels = generarExcelPrueba({ desde: db.ajustes.fecha_inicio, hasta: hoyIso() })
              const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              const r = await compartirArchivos(excels.map((x) => ({ blob: new Blob([escribirXlsx(x.filas) as BlobPart], { type: tipo }), nombre: x.nombre })), 'Excel de prueba de PuchiFin')
              if (r === 'descargado') avisar('Excel de prueba descargados')
            }}
          >
            <FileSpreadsheet className="size-4" strokeWidth={2} /> Descargar Excel de prueba
          </button>
          {!db.ajustes.alias_terceros.some((a) => a.patrones.includes(NOMBRES_PRUEBA.empresa)) && (
            <button
              className="boton-texto px-2"
              onClick={async () => {
                const alias = db.ajustes.alias_terceros.map((a) =>
                  a.alias === 'Empresa' ? { ...a, patrones: [...a.patrones, NOMBRES_PRUEBA.empresa] } : a.alias === 'Familia' ? { ...a, patrones: [...a.patrones, NOMBRES_PRUEBA.familia] } : a,
                )
                const e = await intentar((d) => guardarAjustes(d, { alias_terceros: alias }), 'Alias de prueba añadidos')
                avisar(e ?? 'Nombres de prueba añadidos a Empresa y Familia')
              }}
            >
              Añadir sus nombres a los alias
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Llevan a propósito un IBAN, números de tarjeta, un DNI y nombres de personas, para comprobar que la importación los quita. Los nombres de la
          empresa ({NOMBRES_PRUEBA.empresa}) y de la familia ({NOMBRES_PRUEBA.familia}) se sustituyen por su alias si los añades.
        </p>
      </Seccion>

      <Seccion titulo="Registro" nota="Errores y eventos de la app. Cópialo o compártelo para pegarlo en el chat. No incluye conceptos ni importes.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm">{entradas.length} entradas</span>
          <button className="boton-secundario" onClick={() => setVerRegistro(true)}>
            Ver
          </button>
          <button className="boton-secundario" onClick={async () => (await copiarTexto(textoReg())) && avisar('Registro copiado')}>
            <Copy className="size-4" strokeWidth={2} /> Copiar
          </button>
          <button className="boton-secundario" onClick={compartirRegistro}>
            <Share2 className="size-4" strokeWidth={2} /> Compartir
          </button>
        </div>
      </Seccion>

      <Seccion titulo="Versión">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm">
            PuchiFin <strong>v{APP_VERSION}</strong>
            {pendiente && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Nueva versión lista</span>}
          </span>
          <button className="boton-secundario" onClick={verNovedades}>
            Novedades
          </button>
          {pendiente ? (
            <button className="boton-primario" onClick={actualizar}>
              Actualizar
            </button>
          ) : (
            <button className="boton-secundario" onClick={buscar}>
              Buscar actualización
            </button>
          )}
        </div>
      </Seccion>

      <Hoja
        abierta={verRegistro}
        titulo="Registro"
        onCerrar={() => setVerRegistro(false)}
        acciones={
          <>
            <button className="boton-secundario text-red-600" disabled={!entradas.length} onClick={borrarReg}>
              Borrar
            </button>
            <button className="boton-secundario" onClick={() => compartirArchivo(new Blob([textoReg()], { type: 'text/plain' }), `puchifin-registro-${hoyIso()}.txt`, 'Registro de PuchiFin')}>
              Guardar
            </button>
            <button className="boton-primario" onClick={async () => (await copiarTexto(textoReg())) && avisar('Registro copiado')}>
              Copiar
            </button>
          </>
        }
      >
        <textarea readOnly className="campo h-[50dvh] font-mono text-xs leading-snug" value={textoReg()} />
      </Hoja>
    </div>
  )
}
