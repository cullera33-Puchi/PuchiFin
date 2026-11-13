import { Briefcase, ChartPie, List, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useVolverDesdeBorde } from './gestos'

/**
 * Estructura de la app del iPhone: contenido en una columna y barra de pestañas flotante con las
 * cuatro secciones (apartado 12). Resúmenes se abre desde el Extracto.
 * Solo móvil: el diseño de escritorio queda para más adelante.
 */
const SECCIONES = [
  { a: '/', texto: 'Extracto', icono: ChartPie, fin: true },
  { a: '/movimientos', texto: 'Movimientos', icono: List, fin: false },
  { a: '/empleado', texto: 'Empleado', icono: Briefcase, fin: false },
  { a: '/ajustes', texto: 'Ajustes', icono: Settings, fin: false },
]

export function Estructura() {
  const borde = useVolverDesdeBorde()
  const { pathname } = useLocation()
  // Pantallas secundarias del Extracto: su pestaña sigue marcada
  const enExtracto = pathname === '/' || ['/extracto', '/analisis', '/resumenes'].some((p) => pathname.startsWith(p))
  return (
    <div className="min-h-dvh overflow-x-clip">
      <main
        className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32"
        style={{
          transform: borde.dx ? `translateX(${borde.dx}px)` : undefined,
          transition: borde.animar ? 'transform 0.18s ease-out' : 'none',
          boxShadow: borde.dx ? '-8px 0 24px rgba(0,0,0,0.12)' : undefined,
        }}
      >
        <Outlet />
      </main>

      {/* Barra de pestañas flotante, translúcida, con la pestaña activa resaltada */}
      <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-md grid-cols-4 rounded-full border border-white/60 bg-white/75 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-zinc-900/75">
        {SECCIONES.map(({ a, texto, icono: Icono, fin }) => (
          <NavLink
            key={a}
            to={a}
            end={fin}
 className={({ isActive: activa }) => {
              const isActive = a === '/' ? enExtracto : activa
              return `flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium transition-colors ${
                isActive ? 'bg-zinc-900/[0.06] text-marca-700 dark:bg-white/10 dark:text-marca-500' : 'text-zinc-600 dark:text-zinc-400'
              }`
            }}
          >
            {({ isActive: activa }) => (
              <>
                <Icono className="size-[22px]" strokeWidth={(a === '/' ? enExtracto : activa) ? 2.25 : 1.75} />
                {texto}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
