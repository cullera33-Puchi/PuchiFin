import { Copy, Download, FlaskConical, RotateCcw, Share2, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useActualizacion } from '../../componentes/Actualizacion'
import { Aviso } from '../../componentes/Encabezado'
import { Baldosa } from '../../componentes/Icono'
import { Hoja, useInterfaz } from '../../componentes/Interfaz'
import { compartirArchivo, copiarTexto } from '../../lib/compartir'
import {
  borrarCopia,
  borrarTodasLasCopias,
  exportarArchivo,
  hacerCopia,
  leerArchivo,
  leerCopia,
  listarCopias,
  restaurarCopia,
  saltarCopiaDeHoy,
  suscribirCopias,
  type Copia,
  type MetaCopia,
} from '../../lib/copias'
import { borrarDatosPrueba, contarDatosPrueba, crearDatosPrueba } from '../../lib/datosPruebaSupabase'
import { formatearFecha } from '../../lib/formato'
import { borrarRegistro, entradasRegistro, recuperarRegistro, registrar, suscribirRegistro, textoRegistro } from '../../lib/registro'
import { APP_VERSION } from '../../lib/version'
import { useSesion } from '../../sesion/Sesion'

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
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
const NOMBRE_TIPO: Record<MetaCopia['tipo'], string> = {
  diaria: 'Copia diaria',
  manual: 'Copia manual',
  'antes de restaurar': 'Antes de restaurar',
  'antes de importar': 'Antes de importar',
}

export function Herramientas() {
  const { sesion } = useSesion()
  const usuario = sesion?.user.id ?? ''
  const { avisar, confirmar } = useInterfaz()
  const { pendiente, actualizar, verNovedades, buscar } = useActualizacion()

  const [copias, setCopias] = useState<MetaCopia[] | null>(null)
  const [prueba, setPrueba] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verRegistro, setVerRegistro] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)
  const entradas = useSyncExternalStore(suscribirRegistro, entradasRegistro)

  const recargar = useCallback(async () => {
    try {
      setCopias(await listarCopias(usuario))
    } catch (e) {
      registrar('error', `No se pudieron leer las copias: ${(e as Error).message}`)
      setCopias([])
    }
    contarDatosPrueba().then(setPrueba, () => setPrueba(null))
  }, [usuario])

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
      recargar()
    }
  }

  const restaurar = async (copia: Copia, cuando: string) => {
    const n = copia.datos.movimientos?.length ?? 0
    const ok = await confirmar({
      titulo: `Restaurar copia ${cuando}`,
      texto: (
        <>
          <p>
            Se sustituyen todos los datos (cuentas, categorías, reglas y movimientos) por los de esa copia ({n} movimientos). Lo creado
            después se perderá.
          </p>
          <p className="mt-2">Antes se guarda en este dispositivo una copia del estado actual, para poder volver atrás.</p>
        </>
      ),
      aceptar: 'Restaurar',
      peligro: true,
    })
    if (!ok) return
    await ejecutar('restaurar', async () => {
      await restaurarCopia(copia, usuario)
      avisar(`Copia ${cuando} restaurada`)
    })
  }

  const restaurarLocal = async (m: MetaCopia) => {
    const copia = await leerCopia(m.clave)
    if (!copia) {
      setError('No se encuentra la copia en este dispositivo')
      return
    }
    await restaurar(copia, `del ${formatearFecha(m.dia)} a las ${hora(m.creada)}`)
  }

  const importarArchivo = async (f: File) => {
    try {
      const copia = await leerArchivo(f)
      registrar('info', 'Copia leída desde archivo', { movimientos: copia.datos.movimientos?.length ?? 0 })
      await restaurar(copia, `del ${formatearFecha(copia.exportado)}`)
    } catch (e) {
      registrar('aviso', `Importar archivo: ${(e as Error).message}`)
      setError((e as Error).message)
    }
  }

  const borrarUna = async (m: MetaCopia) => {
    const ok = await confirmar({
      titulo: 'Borrar copia',
      texto: `La copia del ${formatearFecha(m.dia)} a las ${hora(m.creada)} se borrará de este dispositivo. No se puede deshacer.`,
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
      texto: `${n === 1 ? 'La copia' : `Las ${n} copias`} de este dispositivo se borrarán. No se puede deshacer. La copia automática vuelve mañana.`,
      aceptar: 'Borrar todas',
      peligro: true,
    })
    if (!ok) return
    await ejecutar('borrar', async () => {
      const b = await borrarTodasLasCopias(usuario)
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
    await ejecutar('prueba', async () => {
      const n = await crearDatosPrueba()
      avisar(`${n} movimientos de prueba creados`)
    })
  }

  const eliminarPrueba = async () => {
    const ok = await confirmar({
      titulo: 'Eliminar datos de prueba',
      texto: `Se eliminan los ${prueba} movimientos de prueba y sus conciliaciones. Los datos reales no se tocan.`,
      aceptar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    await ejecutar('prueba', async () => {
      const n = await borrarDatosPrueba()
      avisar(`${n} movimientos de prueba eliminados`)
    })
  }

  const textoReg = () => textoRegistro(copias?.[0] ? `movimientos ${copias[0].movimientos}` : undefined)
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

      <Seccion
        titulo="Copias de seguridad"
        nota="Cada día, al abrir la app, se guarda una copia en este dispositivo (se conservan las 7 últimas). Son los mismos datos anonimizados que hay en Supabase."
      >
        {copias === null ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : copias.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía ninguna copia en este dispositivo.</p>
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
                  title="Guardar como archivo"
                  aria-label="Guardar como archivo"
                  disabled={!!ocupado}
                  onClick={async () => {
                    const c = await leerCopia(m.clave)
                    if (c) await exportarArchivo(c)
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
        <div className="flex flex-wrap gap-2">
          <button className="boton-primario" disabled={!!ocupado} onClick={() => ejecutar('copia', async () => { await hacerCopia(usuario, 'manual'); avisar('Copia guardada en este dispositivo') })}>
            {ocupado === 'copia' ? 'Guardando…' : 'Hacer copia ahora'}
          </button>
          <button className="boton-secundario" disabled={!!ocupado} onClick={() => ejecutar('exportar', async () => { await exportarArchivo() })}>
            <Share2 className="size-4" /> Exportar a archivo
          </button>
          <button className="boton-secundario" disabled={!!ocupado} onClick={() => archivo.current?.click()}>
            <Upload className="size-4" /> Restaurar desde archivo
          </button>
          {!!copias?.length && (
            <button className="boton-texto px-2 text-red-600 dark:text-red-500" disabled={!!ocupado} onClick={borrarTodas}>
              Borrar todas
            </button>
          )}
          <input
            ref={archivo}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) importarArchivo(f)
            }}
          />
        </div>
        {ocupado === 'restaurar' && <Aviso tipo="info">Restaurando…</Aviso>}
      </Seccion>

      <Seccion
        titulo="Datos de prueba"
        nota="Movimientos inventados para probar el extracto y los resúmenes sin datos reales. Se eliminan de una vez sin tocar lo real."
      >
        {prueba ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto flex items-center gap-2 text-sm">
              <Baldosa glifo={FlaskConical} color="#FF9500" tamano="sm" /> {prueba} movimientos de prueba
            </span>
            <button className="boton-secundario text-red-600 dark:text-red-500" disabled={!!ocupado} onClick={eliminarPrueba}>
              {ocupado === 'prueba' ? 'Eliminando…' : 'Eliminar datos de prueba'}
            </button>
          </div>
        ) : (
          <button className="boton-secundario" disabled={!!ocupado || prueba === null} onClick={generarPrueba}>
            <FlaskConical className="size-4" /> {ocupado === 'prueba' ? 'Generando…' : 'Generar datos de prueba'}
          </button>
        )}
      </Seccion>

      <Seccion titulo="Registro" nota="Errores y eventos de este dispositivo. Cópialo o compártelo para pegarlo en el chat. No incluye conceptos ni importes.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm">{entradas.length} entradas</span>
          <button className="boton-secundario" onClick={() => setVerRegistro(true)}>
            Ver
          </button>
          <button className="boton-secundario" onClick={async () => (await copiarTexto(textoReg())) && avisar('Registro copiado')}>
            <Copy className="size-4" /> Copiar
          </button>
          <button className="boton-secundario" onClick={compartirRegistro}>
            <Share2 className="size-4" /> Compartir
          </button>
        </div>
      </Seccion>

      <Hoja
        abierta={verRegistro}
        titulo="Registro"
        ancha
        onCerrar={() => setVerRegistro(false)}
        acciones={
          <>
            <button className="boton-secundario text-red-600" disabled={!entradas.length} onClick={borrarReg}>
              Borrar
            </button>
            <button
              className="boton-secundario"
              onClick={() => compartirArchivo(new Blob([textoReg()], { type: 'text/plain' }), `puchifin-registro-${new Date().toISOString().slice(0, 10)}.txt`, 'Registro de PuchiFin')}
            >
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
