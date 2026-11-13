/**
 * Gestos con el pulgar, al estilo de iOS:
 * - FilaDeslizable: deslizar una fila a la izquierda o a la derecha descubre acciones; deslizar del todo
 *   ejecuta la primera (como «Eliminar» en Mail).
 * - Deslizable: deslizar a los lados cambia de mes o de periodo, con la página siguiendo al dedo.
 * - useVolverDesdeBorde: deslizar desde el borde izquierdo vuelve a la pantalla anterior.
 * Usan eventos de puntero con touch-action: pan-y, así el desplazamiento vertical sigue siendo nativo.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export interface AccionFila {
  texto: string
  color: string
  icono?: ReactNode
  fn: () => void
}

const ANCHO_ACCION = 76
const UMBRAL_BLOQUEO = 8
let abierta: (() => void) | null = null

function vibrar() {
  try {
    navigator.vibrate?.(8)
  } catch {
    // sin vibración
  }
}

export function FilaDeslizable({
  derecha = [],
  izquierda = [],
  onPulsar,
  children,
  etiqueta,
}: {
  /** Acciones que aparecen al deslizar hacia la izquierda (quedan a la derecha) */
  derecha?: AccionFila[]
  /** Acciones que aparecen al deslizar hacia la derecha */
  izquierda?: AccionFila[]
  onPulsar?: () => void
  children: ReactNode
  etiqueta?: string
}) {
  const [x, setX] = useState(0)
  const [animar, setAnimar] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const inicio = useRef<{ x: number; y: number; base: number; id: number; horizontal: boolean | null } | null>(null)
  const movido = useRef(false)
  const pasoUmbral = useRef(false)

  const cerrar = () => {
    setAnimar(true)
    setX(0)
  }

  useEffect(() => () => {
    if (abierta === cerrar) abierta = null
  })

  const fijar = (destino: number) => {
    setAnimar(true)
    setX(destino)
    if (destino !== 0) {
      if (abierta && abierta !== cerrar) abierta()
      abierta = cerrar
    }
  }

  const ejecutar = (a: AccionFila) => {
    cerrar()
    a.fn()
  }

  const ancho = () => caja.current?.offsetWidth ?? 360

  return (
    <div ref={caja} className="relative overflow-hidden">
      {/* Acciones de debajo */}
      {x < 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(-x, derecha.length * ANCHO_ACCION) }}>
          {derecha.map((a, i) => (
            <button
              key={a.texto}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-medium text-white"
              style={{ backgroundColor: a.color, flexGrow: i === 0 && -x > derecha.length * ANCHO_ACCION ? 10 : 1 }}
              onClick={() => ejecutar(a)}
            >
              {a.icono}
              {a.texto}
            </button>
          ))}
        </div>
      )}
      {x > 0 && (
        <div className="absolute inset-y-0 left-0 flex" style={{ width: Math.max(x, izquierda.length * ANCHO_ACCION) }}>
          {izquierda.map((a, i) => (
            <button
              key={a.texto}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-medium text-white"
              style={{ backgroundColor: a.color, flexGrow: i === 0 && x > izquierda.length * ANCHO_ACCION ? 10 : 1 }}
              onClick={() => ejecutar(a)}
            >
              {a.icono}
              {a.texto}
            </button>
          ))}
        </div>
      )}
      <div
        role={onPulsar ? 'button' : undefined}
        tabIndex={onPulsar ? 0 : undefined}
        aria-label={etiqueta}
        className="relative bg-white select-none dark:bg-zinc-900"
        style={{
          transform: `translateX(${x}px)`,
          transition: animar ? 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none',
          touchAction: 'pan-y',
        }}
        onTransitionEnd={() => setAnimar(false)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && onPulsar) {
            e.preventDefault()
            onPulsar()
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          inicio.current = { x: e.clientX, y: e.clientY, base: x, id: e.pointerId, horizontal: null }
          movido.current = false
          pasoUmbral.current = false
        }}
        onPointerMove={(e) => {
          const s = inicio.current
          if (!s || s.id !== e.pointerId) return
          const dx = e.clientX - s.x
          const dy = e.clientY - s.y
          if (s.horizontal === null) {
            if (Math.abs(dx) < UMBRAL_BLOQUEO && Math.abs(dy) < UMBRAL_BLOQUEO) return
            s.horizontal = Math.abs(dx) > Math.abs(dy)
            if (s.horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }
          if (!s.horizontal) return
          movido.current = true
          let nx = s.base + dx
          if (nx < 0 && !derecha.length) nx = nx / 6
          if (nx > 0 && !izquierda.length) nx = nx / 6
          // Al pasar el 55 % del ancho se ejecutará la primera acción: aviso táctil
          const pasa = Math.abs(nx) > ancho() * 0.55
          if (pasa !== pasoUmbral.current) {
            pasoUmbral.current = pasa
            if (pasa) vibrar()
          }
          setAnimar(false)
          setX(nx)
        }}
        onPointerUp={(e) => {
          const s = inicio.current
          inicio.current = null
          if (!s || s.id !== e.pointerId) return
          if (!movido.current) {
            if (x !== 0) cerrar()
            else onPulsar?.()
            return
          }
          const w = ancho()
          if (x < -w * 0.55 && derecha[0]) return ejecutar(derecha[0])
          if (x > w * 0.55 && izquierda[0]) return ejecutar(izquierda[0])
          if (x < -40 && derecha.length) return fijar(-derecha.length * ANCHO_ACCION)
          if (x > 40 && izquierda.length) return fijar(izquierda.length * ANCHO_ACCION)
          cerrar()
        }}
        onPointerCancel={() => {
          inicio.current = null
          if (x !== 0 && !movido.current) return
          cerrar()
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Contenedor que cambia de página al deslizar a los lados (mes anterior o siguiente).
 * El contenido sigue al dedo con resistencia en los extremos.
 */
export function Deslizable({
  onAnterior,
  onSiguiente,
  hayAnterior = true,
  haySiguiente = true,
  children,
}: {
  onAnterior: () => void
  onSiguiente: () => void
  hayAnterior?: boolean
  haySiguiente?: boolean
  children: ReactNode
}) {
  const [dx, setDx] = useState(0)
  const [animar, setAnimar] = useState(false)
  const s = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null)

  const soltar = (destino: number, despues?: () => void) => {
    setAnimar(true)
    setDx(destino)
    window.setTimeout(() => {
      if (despues) {
        despues()
        setAnimar(false)
        setDx(-destino / 3)
        requestAnimationFrame(() => {
          setAnimar(true)
          setDx(0)
        })
      }
    }, despues ? 160 : 0)
  }

  return (
    <div
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || e.clientX < 24) return // el borde izquierdo es para volver
        s.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null }
      }}
      onPointerMove={(e) => {
        const t = s.current
        if (!t || t.id !== e.pointerId) return
        const mx = e.clientX - t.x
        const my = e.clientY - t.y
        if (t.horizontal === null) {
          if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
          t.horizontal = Math.abs(mx) > Math.abs(my) * 1.2
        }
        if (!t.horizontal) return
        const limitado = (mx > 0 && !hayAnterior) || (mx < 0 && !haySiguiente)
        setAnimar(false)
        setDx(limitado ? mx / 5 : mx * 0.9)
      }}
      onPointerUp={() => {
        const t = s.current
        s.current = null
        if (!t?.horizontal) return
        if (dx > 70 && hayAnterior) return soltar(window.innerWidth * 0.5, onAnterior)
        if (dx < -70 && haySiguiente) return soltar(-window.innerWidth * 0.5, onSiguiente)
        soltar(0)
      }}
      onPointerCancel={() => {
        s.current = null
        soltar(0)
      }}
    >
      <div
        style={{
          transform: `translateX(${dx}px)`,
          opacity: 1 - Math.min(Math.abs(dx) / 600, 0.4),
          transition: animar ? 'transform 0.22s ease-out, opacity 0.22s ease-out' : 'none',
        }}
        onTransitionEnd={() => setAnimar(false)}
      >
        {children}
      </div>
    </div>
  )
}

/** Pantallas raíz de cada pestaña: desde ellas no se vuelve atrás */
const RAICES = ['/', '/movimientos', '/empleado', '/ajustes', '/ajustes/cuentas', '/ajustes/categorias', '/ajustes/general', '/ajustes/herramientas']

/**
 * Deslizar desde el borde izquierdo vuelve a la pantalla anterior, con la pantalla actual siguiendo
 * al dedo. Devuelve el desplazamiento para aplicarlo al contenido.
 */
// oxlint-disable-next-line react/only-export-components
export function useVolverDesdeBorde(): { dx: number; animar: boolean } {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const [dx, setDx] = useState(0)
  const [animar, setAnimar] = useState(false)
  const raiz = RAICES.includes(pathname)

  useEffect(() => {
    if (raiz) return
    let inicio: { x: number; y: number } | null = null
    let actual = 0
    const alEmpezar = (e: TouchEvent) => {
      const t = e.touches[0]
      if (e.touches.length !== 1 || t.clientX > 22) return
      inicio = { x: t.clientX, y: t.clientY }
    }
    const alMover = (e: TouchEvent) => {
      if (!inicio) return
      const t = e.touches[0]
      const mx = t.clientX - inicio.x
      if (Math.abs(t.clientY - inicio.y) > Math.abs(mx) && mx < 30) {
        inicio = null
        setAnimar(true)
        setDx(0)
        return
      }
      actual = Math.max(0, mx)
      setAnimar(false)
      setDx(actual)
    }
    const alTerminar = () => {
      if (!inicio) return
      inicio = null
      setAnimar(true)
      if (actual > Math.min(110, window.innerWidth * 0.3)) {
        setDx(window.innerWidth)
        window.setTimeout(() => {
          if (window.history.state?.idx > 0) navegar(-1)
          else navegar('/')
          setAnimar(false)
          setDx(0)
        }, 180)
      } else setDx(0)
      actual = 0
    }
    window.addEventListener('touchstart', alEmpezar, { passive: true })
    window.addEventListener('touchmove', alMover, { passive: true })
    window.addEventListener('touchend', alTerminar)
    window.addEventListener('touchcancel', alTerminar)
    return () => {
      window.removeEventListener('touchstart', alEmpezar)
      window.removeEventListener('touchmove', alMover)
      window.removeEventListener('touchend', alTerminar)
      window.removeEventListener('touchcancel', alTerminar)
    }
  }, [raiz, navegar])

  return { dx: raiz ? 0 : dx, animar }
}
