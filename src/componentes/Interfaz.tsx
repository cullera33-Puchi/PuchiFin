/**
 * Piezas comunes de la interfaz: aviso breve abajo (con acción opcional, como Deshacer),
 * hoja modal (abajo en el móvil, centrada en escritorio) y confirmación.
 */
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface AvisoBreve {
  texto: string
  accion?: { texto: string; fn: () => void }
  duracion?: number
}

interface Confirmacion {
  titulo: string
  texto: ReactNode
  aceptar: string
  peligro?: boolean
}

interface ValorInterfaz {
  avisar: (texto: string, accion?: AvisoBreve['accion'], duracion?: number) => void
  confirmar: (c: Confirmacion) => Promise<boolean>
}

const Contexto = createContext<ValorInterfaz | null>(null)

// oxlint-disable-next-line react/only-export-components
export function useInterfaz(): ValorInterfaz {
  const v = useContext(Contexto)
  if (!v) throw new Error('useInterfaz fuera de ProveedorInterfaz')
  return v
}

export function ProveedorInterfaz({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<(AvisoBreve & { id: number }) | null>(null)
  const [confirmacion, setConfirmacion] = useState<(Confirmacion & { resolver: (ok: boolean) => void }) | null>(null)
  const temporizador = useRef<number | undefined>(undefined)

  const avisar = useCallback((texto: string, accion?: AvisoBreve['accion'], duracion?: number) => {
    window.clearTimeout(temporizador.current)
    const id = Date.now()
    setAviso({ texto, accion, duracion, id })
    temporizador.current = window.setTimeout(() => setAviso((a) => (a?.id === id ? null : a)), duracion ?? (accion ? 6000 : 3000))
  }, [])

  const confirmar = useCallback(
    (c: Confirmacion) => new Promise<boolean>((resolver) => setConfirmacion({ ...c, resolver })),
    [],
  )

  const cerrarConfirmacion = (ok: boolean) => {
    confirmacion?.resolver(ok)
    setConfirmacion(null)
  }

  return (
    <Contexto.Provider value={{ avisar, confirmar }}>
      {children}
      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
          <div role="status" className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
            <span className="flex-1">{aviso.texto}</span>
            {aviso.accion && (
              <button
                className="font-semibold text-marca-500 dark:text-marca-700"
                onClick={() => {
                  aviso.accion?.fn()
                  setAviso(null)
                }}
              >
                {aviso.accion.texto}
              </button>
            )}
          </div>
        </div>
      )}
      <Hoja
        abierta={!!confirmacion}
        titulo={confirmacion?.titulo ?? ''}
        onCerrar={() => cerrarConfirmacion(false)}
        acciones={
          <>
            <button className="boton-secundario" onClick={() => cerrarConfirmacion(false)}>
              Cancelar
            </button>
            <button
              className={confirmacion?.peligro ? 'boton bg-red-600 text-white hover:bg-red-500' : 'boton-primario'}
              onClick={() => cerrarConfirmacion(true)}
              autoFocus
            >
              {confirmacion?.aceptar}
            </button>
          </>
        }
      >
        <div className="text-sm text-zinc-600 dark:text-zinc-400">{confirmacion?.texto}</div>
      </Hoja>
    </Contexto.Provider>
  )
}

export function Hoja({
  abierta,
  titulo,
  onCerrar,
  children,
  acciones,
  ancha,
}: {
  abierta: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
  acciones?: ReactNode
  ancha?: boolean
}) {
  useEffect(() => {
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierta, onCerrar])

  if (!abierta) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center md:p-6" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl md:rounded-2xl md:pb-0 dark:bg-zinc-900 ${ancha ? 'md:max-w-2xl' : 'md:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="font-semibold">{titulo}</h2>
          <button aria-label="Cerrar" className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onCerrar}>
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {acciones && <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">{acciones}</div>}
      </div>
    </div>
  )
}
