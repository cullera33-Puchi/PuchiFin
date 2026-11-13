import { ArrowLeft, ChartPie, ChevronsLeftRight, EyeOff, List, ReceiptText, Settings, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { registrar } from '../lib/registro'
import { useVolverDesdeBorde } from './gestos'
import { Hoja } from './Interfaz'

/**
 * Estructura de la app del iPhone: contenido en una columna y barra de pestañas de iOS abajo,
 * translúcida, con cuatro secciones. Solo móvil: el diseño de escritorio queda para más adelante.
 */
const SECCIONES = [
  { a: '/', texto: 'Extracto', icono: ReceiptText, fin: true },
  { a: '/movimientos', texto: 'Movimientos', icono: List, fin: false },
  { a: '/informes', texto: 'Informes', icono: ChartPie, fin: false },
  { a: '/ajustes', texto: 'Ajustes', icono: Settings, fin: false },
]

const CLAVE_BIENVENIDA = 'puchifin-bienvenida'
const DOS_HORAS = 2 * 60 * 60 * 1000

export function Estructura() {
  const borde = useVolverDesdeBorde()
  const { pathname } = useLocation()
  const navegar = useNavigate()
  // Pantallas secundarias del Extracto: su pestaña sigue marcada
  const enExtracto = pathname === '/' || ['/extracto', '/analisis', '/resumenes'].some((p) => pathname.startsWith(p))

  // Al volver tras más de dos horas fuera, la app vuelve a la pantalla principal (salvo con una hoja abierta)
  useEffect(() => {
    let oculta = 0
    const cambio = () => {
      if (document.visibilityState === 'hidden') oculta = Date.now()
      else if (oculta && Date.now() - oculta > DOS_HORAS) {
        if (document.documentElement.classList.contains('con-hoja')) registrar('info', 'Vuelta a la pantalla principal omitida: hoja abierta')
        else if (window.location.pathname.replace(import.meta.env.BASE_URL, '/') !== '/') {
          registrar('info', 'Vuelta a la pantalla principal tras dos horas fuera')
          navegar('/', { replace: true })
        }
        oculta = 0
      }
    }
    document.addEventListener('visibilitychange', cambio)
    return () => document.removeEventListener('visibilitychange', cambio)
  }, [navegar])

  return (
    <div className="min-h-dvh overflow-x-clip">
      <main
        className="mx-auto max-w-lg px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[calc(env(safe-area-inset-bottom)+5rem)]"
        style={{
          transform: borde.dx ? `translateX(${borde.dx}px)` : undefined,
          transition: borde.animar ? 'transform 0.4s var(--curva)' : 'none',
          boxShadow: borde.dx ? '-8px 0 24px rgba(0,0,0,0.12)' : undefined,
        }}
      >
        <div id="contenido">
          <Outlet />
        </div>
      </main>

      {/* Barra de pestañas de iOS: abajo, translúcida, icono relleno en la activa */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-[#F9F9F9]/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#161618]/80">
        <div className="mx-auto grid h-12 max-w-lg grid-cols-4">
          {SECCIONES.map(({ a, texto, icono: Icono, fin }) => (
            <NavLink key={a} to={a} end={fin} className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium">
              {({ isActive }) => {
                const activa = a === '/' ? enExtracto : isActive
                return (
                  <span className={`flex flex-col items-center gap-0.5 ${activa ? 'text-marca-700 dark:text-marca-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
                    <Icono className="size-6" strokeWidth={activa ? 2 : 1.6} fill={activa ? 'currentColor' : 'none'} fillOpacity={activa ? 0.18 : 0} />
                    {texto}
                  </span>
                )
              }}
            </NavLink>
          ))}
        </div>
      </nav>
      <Bienvenida />
    </div>
  )
}

/** Primera vez que se abre la app: los gestos principales */
function Bienvenida() {
  const [abierta, setAbierta] = useState(() => {
    try {
      return !localStorage.getItem(CLAVE_BIENVENIDA)
    } catch {
      return false
    }
  })
  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE_BIENVENIDA, new Date().toISOString())
    } catch {
      // sin almacenamiento
    }
    setAbierta(false)
  }
  const gestos = [
    { icono: EyeOff, color: '#5856D6', texto: 'Desliza un movimiento hacia la derecha para que no cuente: un gasto de empleado o un reembolso.' },
    { icono: Tag, color: '#FF9500', texto: 'Desliza hacia la izquierda para cambiar su categoría.' },
    { icono: ChevronsLeftRight, color: '#007AFF', texto: 'Desliza a los lados en el Extracto o en Informes para cambiar de mes.' },
    { icono: ArrowLeft, color: '#8E8E93', texto: 'Desde el borde izquierdo, vuelves a la pantalla anterior. Las hojas se cierran arrastrándolas hacia abajo.' },
  ]
  return (
    <Hoja
      abierta={abierta}
      titulo="Bienvenido a PuchiFin"
      onCerrar={cerrar}
      acciones={
        <button className="boton-primario h-12 w-full rounded-xl text-[17px]" onClick={cerrar}>
          Entendido
        </button>
      }
    >
      <ul className="space-y-4">
        {gestos.map(({ icono: Icono, color, texto }) => (
          <li key={texto} className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[9px] text-white" style={{ backgroundColor: color }}>
              <Icono className="size-5" strokeWidth={2} />
            </span>
            <span className="pt-1.5 text-[15px]">{texto}</span>
          </li>
        ))}
      </ul>
    </Hoja>
  )
}
