import { Briefcase, LogOut, ReceiptText, Rows3, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useSesion } from '../sesion/Sesion'

const SECCIONES = [
  { a: '/', texto: 'Extracto', icono: ReceiptText, fin: true },
  { a: '/movimientos', texto: 'Movimientos', icono: Rows3, fin: false },
  { a: '/empleado', texto: 'Empleado', icono: Briefcase, fin: false },
  { a: '/ajustes', texto: 'Ajustes', icono: Settings, fin: false },
]

export function Estructura() {
  const { sesion, salir } = useSesion()

  return (
    <div className="min-h-dvh md:flex">
      {/* Escritorio: menú lateral */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-5 md:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-lg font-semibold tracking-tight">PuchiFin</span>
        </div>
        <nav className="flex flex-col gap-1">
          {SECCIONES.map(({ a, texto, icono: Icono, fin }) => (
            <NavLink
              key={a}
              to={a}
              end={fin}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-marca-50 text-marca-700 dark:bg-marca-900/40 dark:text-marca-100'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`
              }
            >
              <Icono className="size-4" />
              {texto}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-zinc-200 px-2 pt-4 dark:border-zinc-800">
          <p className="truncate text-xs text-zinc-500" title={sesion?.user.email ?? ''}>
            {sesion?.user.email}
          </p>
          <button
            onClick={salir}
            className="mt-2 flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <LogOut className="size-4" /> Salir
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28 md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>

      {/* Móvil: barra inferior de cuatro pestañas */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/95">
        {SECCIONES.map(({ a, texto, icono: Icono, fin }) => (
          <NavLink
            key={a}
            to={a}
            end={fin}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive ? 'text-marca-700 dark:text-marca-500' : 'text-zinc-500'
              }`
            }
          >
            <Icono className="size-5" />
            {texto}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
