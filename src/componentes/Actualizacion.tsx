/**
 * Aviso de nueva versión con sus novedades (como en PuchiTask).
 * Al publicarse una versión, el service worker la descarga y espera. La app avisa «Nueva versión
 * disponible»; «Actualizar» abre las novedades que este dispositivo no tiene, con «Actualizar» y
 * «Más tarde». Sin conexión o sin novedades, actualiza directamente.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { registrar } from '../lib/registro'
import { APP_VERSION, cargarNovedades, compararVersiones, novedadesPosteriores, type Novedad } from '../lib/version'
import { Hoja, useInterfaz } from './Interfaz'

interface ValorActualizacion {
  pendiente: boolean
  actualizar: () => void
  verNovedades: () => Promise<void>
  buscar: () => Promise<void>
}

const Contexto = createContext<ValorActualizacion | null>(null)

// oxlint-disable-next-line react/only-export-components
export function useActualizacion(): ValorActualizacion {
  const v = useContext(Contexto)
  if (!v) throw new Error('useActualizacion fuera de ProveedorActualizacion')
  return v
}

export function ProveedorActualizacion({ children }: { children: ReactNode }) {
  const { avisar } = useInterfaz()
  const registro = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const [hoja, setHoja] = useState<{ lista: Novedad[]; oferta: boolean } | null>(null)

  const {
    needRefresh: [pendiente],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      registro.current = reg
    },
    onRegisterError(e) {
      registrar('aviso', `Service worker no registrado: ${(e as Error)?.message ?? e}`)
    },
  })

  const actualizar = useCallback(() => {
    registrar('info', 'Actualización aplicada por el usuario')
    updateServiceWorker(true)
  }, [updateServiceWorker])

  // «Actualizar» en el aviso: las novedades que faltan, o la actualización directa
  const alTocarActualizar = useCallback(async () => {
    const lista = await cargarNovedades()
    const nuevas = novedadesPosteriores(lista ?? [])
    if (!nuevas.length) {
      actualizar()
      return
    }
    setHoja({ lista: nuevas, oferta: true })
    registrar('info', 'Novedades mostradas', { versiones: nuevas.length })
  }, [actualizar])

  useEffect(() => {
    if (!pendiente) return
    registrar('info', 'Nueva versión descargada, pendiente de aplicar')
    avisar('Nueva versión disponible', { texto: 'Actualizar', fn: alTocarActualizar }, 12000)
  }, [pendiente, avisar, alTocarActualizar])

  // Al volver a la app se comprueba si hay versión nueva
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') registro.current?.update().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  const verNovedades = useCallback(async () => {
    const lista = await cargarNovedades()
    if (!lista?.length) {
      avisar('No se pudieron cargar las novedades. Prueba con conexión.')
      return
    }
    setHoja({ lista, oferta: false })
  }, [avisar])

  const buscar = useCallback(async () => {
    if (!registro.current) {
      avisar('Las actualizaciones solo se comprueban en la app publicada')
      return
    }
    try {
      await registro.current.update()
      if (!registro.current.waiting) avisar(`Tienes la última versión (${APP_VERSION})`)
    } catch (e) {
      registrar('aviso', `Buscar actualización: ${(e as Error)?.message ?? e}`)
      avisar('No se pudo comprobar. Prueba con conexión.')
    }
  }, [avisar])

  const titulo = hoja?.oferta ? `Novedades de la ${hoja.lista[0]?.version}` : 'Novedades'
  return (
    <Contexto.Provider value={{ pendiente, actualizar, verNovedades, buscar }}>
      {children}
      <Hoja
        abierta={!!hoja}
        titulo={titulo}
        onCerrar={() => {
          if (hoja?.oferta) registrar('info', 'Actualización aplazada desde Novedades')
          setHoja(null)
        }}
        acciones={
          pendiente ? (
            <>
              <button className="boton-secundario" onClick={() => setHoja(null)}>
                Más tarde
              </button>
              <button className="boton-primario" onClick={actualizar}>
                Actualizar
              </button>
            </>
          ) : (
            <button className="boton-secundario" onClick={() => setHoja(null)}>
              Cerrar
            </button>
          )
        }
      >
        <ListaNovedades lista={hoja?.lista ?? []} />
      </Hoja>
    </Contexto.Provider>
  )
}

function ListaNovedades({ lista }: { lista: Novedad[] }) {
  return (
    <div className="space-y-5">
      {lista.map((n) => {
        const c = compararVersiones(n.version, APP_VERSION)
        return (
          <section key={n.version}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="font-semibold">Versión {n.version}</span>
              {c === 0 && <span className="rounded-full bg-marca-50 px-2 py-0.5 text-[11px] font-medium text-marca-700 dark:bg-marca-900/50 dark:text-marca-100">Instalada</span>}
              {n.fecha && <span className="ml-auto text-xs text-zinc-500">{fechaCorta(n.fecha)}</span>}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {n.cambios.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function fechaCorta(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]}` : ''
}
