import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function Encabezado({ titulo, subtitulo, accion }: { titulo: string; subtitulo?: string; accion?: ReactNode }) {
  // Como en iOS: los botones en la barra de arriba y el título grande debajo
  return (
    <header className="mb-4">
      <div className="flex min-h-9 items-center justify-end gap-1">{accion}</div>
      <h1 className="text-[32px] leading-tight font-bold tracking-tight">{titulo}</h1>
      {subtitulo && <p className="mt-0.5 text-sm text-zinc-500">{subtitulo}</p>}
    </header>
  )
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const estilos = {
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
    info: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
  }[tipo]
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${estilos}`}>
      {children}
    </div>
  )
}

export function Proximamente({ fase, children }: { fase: number; children: ReactNode }) {
  return (
    <div className="tarjeta text-sm text-zinc-600 dark:text-zinc-400">
      <span className="mb-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        Fase {fase}
      </span>
      <div>{children}</div>
    </div>
  )
}

/**
 * Barra de navegación de una pantalla secundaria, al estilo de iOS: «‹ Atrás» a la izquierda,
 * título y una acción opcional a la derecha. También se vuelve deslizando desde el borde izquierdo.
 */
export function BarraNavegacion({ titulo, atras = 'Atrás', destino, accion, subtitulo }: { titulo: string; atras?: string; destino?: string; accion?: ReactNode; subtitulo?: string }) {
  const navegar = useNavigate()
  return (
    <header className="mb-4">
      <div className="mb-1 flex min-h-9 items-center justify-between gap-2">
        <button
          className="-ml-2 flex items-center text-[17px] text-marca-700 active:opacity-60 dark:text-marca-500"
          onClick={() => (destino ? navegar(destino) : window.history.state?.idx > 0 ? navegar(-1) : navegar('/'))}
        >
          <ChevronLeft className="size-7" strokeWidth={2.25} />
          {atras}
        </button>
        {accion}
      </div>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight">{titulo}</h1>
      {subtitulo && <p className="mt-0.5 text-sm text-zinc-500">{subtitulo}</p>}
    </header>
  )
}
