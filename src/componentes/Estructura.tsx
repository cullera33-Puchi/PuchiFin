import { Briefcase, ChartPie, FileText, List, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

// Las cuatro pestañas del móvil (apartado 12). Resúmenes se abre desde el Extracto en el móvil
const SECCIONES = [
  { a: '/', texto: 'Extracto', icono: ChartPie, fin: true },
  { a: '/movimientos', texto: 'Movimientos', icono: List, fin: false },
  { a: '/empleado', texto: 'Empleado', icono: Briefcase, fin: false },
  { a: '/ajustes', texto: 'Ajustes', icono: Settings, fin: false },
]
const MENU_ESCRITORIO = [...SECCIONES.slice(0, 3), { a: '/resumenes', texto: 'Resúmenes', icono: FileText, fin: false }, SECCIONES[3]]

export function Estructura() {
  return (
    <div className="min-h-dvh md:flex">
      {/* Escritorio: barra lateral al estilo de las apps de iPad y Mac */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-zinc-100/80 px-3 py-5 backdrop-blur md:flex dark:bg-zinc-900/80">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-lg font-semibold tracking-tight">PuchiFin</span>
        </div>
        <nav className="flex flex-col gap-0.5">
          {MENU_ESCRITORIO.map(({ a, texto, icono: Icono, fin }) => (
            <NavLink
              key={a}
              to={a}
              end={fin}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-1.5 text-[15px] transition-colors ${
                  isActive ? 'bg-zinc-200/90 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-700 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icono className={`size-[18px] ${isActive ? 'text-marca-700 dark:text-marca-500' : 'text-marca-700/80 dark:text-marca-500/80'}`} strokeWidth={isActive ? 2.25 : 1.75} />
                  {texto}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto px-2 pt-4 text-xs text-zinc-500">Datos guardados en este dispositivo</p>
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32 md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>

      {/* Móvil: barra de pestañas flotante, translúcida, con la pestaña activa resaltada */}
      <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 grid grid-cols-4 rounded-full border border-white/60 bg-white/75 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-150 md:hidden dark:border-white/10 dark:bg-zinc-900/75">
        {SECCIONES.map(({ a, texto, icono: Icono, fin }) => (
          <NavLink
            key={a}
            to={a}
            end={fin}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium transition-colors ${
                isActive ? 'bg-zinc-900/[0.06] text-marca-700 dark:bg-white/10 dark:text-marca-500' : 'text-zinc-600 dark:text-zinc-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icono className="size-[22px]" strokeWidth={isActive ? 2.25 : 1.75} />
                {texto}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
