import { ArrowLeft, ChartPie, ChevronsLeftRight, EyeOff, List, ReceiptText, Settings, Tag } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { registrar } from '../lib/registro'
import { useDiscreto } from './discreto'
import { useVolverDesdeBorde } from './gestos'
import { Hoja } from './Interfaz'

/**
 * Estructura de la app del iPhone: contenido en una columna y barra de pestañas de iOS abajo,
 * flotante y de cristal, con cuatro secciones. Solo móvil: el diseño de escritorio queda para más adelante.
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
  const [discreto] = useDiscreto()
  const pantalla = useRef<HTMLElement>(null)
  const sombra = useRef<HTMLDivElement>(null)
  useVolverDesdeBorde(pantalla, sombra)
  const { pathname } = useLocation()
  const navegar = useNavigate()
  // Pantallas secundarias del Extracto: su pestaña sigue marcada
  const enExtracto = pathname === '/' || ['/extracto', '/analisis', '/resumenes'].some((p) => pathname.startsWith(p))
  // Pestaña activa: la del Extracto incluye sus pantallas secundarias; las demás, todo lo que cuelga de ellas
  const activa = enExtracto ? 0 : SECCIONES.findIndex((s, i) => i > 0 && pathname.startsWith(s.a))
  // Entre pestañas solo se cambia con la barra (decisión del usuario, v0.26.0); deslizar vuelve atrás en las pantallas apiladas

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
      {/* Sombra del borde izquierdo al volver deslizando: franja fija que se mueve con la pantalla */}
      <div
        ref={sombra}
        aria-hidden
        className="pointer-events-none fixed inset-y-0 -left-4 z-10 w-4 bg-gradient-to-l from-black/15 to-transparent opacity-0"
      />
      <main ref={pantalla} className="mx-auto max-w-lg px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[calc(var(--alto-pestanas)+1.5rem)]">
        {/* Al activar o quitar el modo discreto, la pantalla se vuelve a pintar con o sin cifras */}
        <div id="contenido" key={discreto ? 'discreto' : 'cifras'}>
          <Outlet />
        </div>
      </main>

      {/* Barra de pestañas flotante, de cristal (iOS 26 y posteriores): cápsula con la pestaña activa resaltada */}
      <nav data-pestanas="" aria-label="Pestañas" className="barra-pestanas pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4">
        <div className="cristal-pestanas pointer-events-auto relative mx-auto grid h-[62px] max-w-md grid-cols-4 rounded-full p-1">
          {activa >= 0 && (
            <span
              aria-hidden
              className="pestana-marca absolute inset-y-1 left-1 rounded-full"
              style={{ width: 'calc((100% - 0.5rem) / 4)', transform: `translateX(${activa * 100}%)` }}
            />
          )}
          {SECCIONES.map(({ a, texto, icono: Icono, fin }, i) => {
            const esta = i === activa
            return (
              <NavLink
                key={a}
                to={a}
                end={fin}
                aria-current={esta ? 'page' : undefined}
                onClick={(e) => {
                  // Tocar la pestaña en la que ya estás sube al principio, como en iOS
                  if (pathname === a) {
                    e.preventDefault()
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                className={`pestana relative z-10 flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold ${esta ? 'text-marca-700 dark:text-marca-500' : 'text-zinc-600 dark:text-zinc-300'}`}
              >
                <Icono className="size-6" strokeWidth={esta ? 2 : 1.7} />
                {texto}
              </NavLink>
            )
          })}
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
    { icono: ChevronsLeftRight, color: '#007AFF', texto: 'Desliza a los lados para cambiar de mes en el Extracto e Informes, o de pestaña fuera de las listas. Mantén pulsado un movimiento para ver sus opciones.' },
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
