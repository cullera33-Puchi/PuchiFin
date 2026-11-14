/**
 * Gestos con el pulgar, al estilo de iOS:
 * - FilaDeslizable: deslizar una fila a la izquierda o a la derecha descubre acciones; deslizar del todo
 *   ejecuta la primera (como «Eliminar» en Mail).
 * - Deslizable: deslizar a los lados cambia de mes o de periodo, con la página siguiendo al dedo.
 * - useVolverDesdeBorde: en una pantalla apilada, deslizar hacia la derecha vuelve a la anterior: desde el
 *   borde o desde cualquier punto que no tenga deslizamiento propio (filas, cambio de mes, campos).
 * Usan eventos de puntero con touch-action: pan-y, así el desplazamiento vertical sigue siendo nativo.
 * Un gesto que empieza sobre una fila deslizable es solo de la fila: no cambia de mes ni vuelve atrás
 * (para eso, desde fuera de las filas o desde el mismo borde de la pantalla).
 * Todos aceptan distancia o velocidad: un gesto corto y rápido cuenta como uno largo.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { vibrar } from '../lib/haptica'
import { crearVelocidad, esLanzamiento, type Velocidad } from '../lib/velocidad'

export interface AccionFila {
  texto: string
  color: string
  icono?: ReactNode
  fn: () => void
}

const ANCHO_ACCION = 76
const UMBRAL_BLOQUEO = 8
let abierta: (() => void) | null = null

export function FilaDeslizable({
  derecha = [],
  izquierda = [],
  onPulsar,
  onPulsacionLarga,
  children,
  etiqueta,
}: {
  /** Acciones que aparecen al deslizar hacia la izquierda (quedan a la derecha) */
  derecha?: AccionFila[]
  /** Acciones que aparecen al deslizar hacia la derecha */
  izquierda?: AccionFila[]
  onPulsar?: () => void
  /** Mantener pulsado medio segundo sin mover el dedo (menú de la fila) */
  onPulsacionLarga?: () => void
  children: ReactNode
  etiqueta?: string
}) {
  const temporizador = useRef<number | null>(null)
  const largo = useRef(false)
  const pararLarga = () => {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current)
    temporizador.current = null
  }
  const [x, setX] = useState(0)
  const [animar, setAnimar] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const inicio = useRef<{ x: number; y: number; base: number; id: number; horizontal: boolean | null; vel: Velocidad } | null>(null)
  const movido = useRef(false)
  const pasoUmbral = useRef(false)

  const [fija, setFija] = useState(false)
  const cerrar = () => {
    setAnimar(true)
    setX(0)
    setFija(false)
  }

  useEffect(() => () => {
    if (abierta === cerrar) abierta = null
    if (temporizador.current !== null) window.clearTimeout(temporizador.current)
  })

  const fijar = (destino: number) => {
    setAnimar(true)
    setX(destino)
    setFija(destino !== 0)
    if (destino !== 0) {
      if (abierta && abierta !== cerrar) abierta()
      abierta = cerrar
    }
  }

  // Con los botones a la vista, el primer toque en cualquier otro sitio solo cierra la fila (como en iOS)
  useEffect(() => {
    if (!fija) return
    const fuera = (e: PointerEvent) => {
      if (caja.current?.contains(e.target as Node)) return
      // La barra de pestañas responde siempre al primer toque (y cierra la fila)
      if (e.target instanceof Element && e.target.closest('[data-pestanas]')) {
        setAnimar(true)
        setX(0)
        setFija(false)
        return
      }
      e.stopPropagation()
      setAnimar(true)
      setX(0)
      setFija(false)
      const anular = (c: MouseEvent) => {
        c.stopPropagation()
        c.preventDefault()
      }
      window.addEventListener('click', anular, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', anular, { capture: true }), 600)
    }
    window.addEventListener('pointerdown', fuera, { capture: true })
    return () => window.removeEventListener('pointerdown', fuera, { capture: true })
  }, [fija])

  const ejecutar = (a: AccionFila) => {
    cerrar()
    a.fn()
  }

  const ancho = () => caja.current?.offsetWidth ?? 360

  return (
    <div ref={caja} data-fila-deslizable="" className="relative overflow-hidden">
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
          // Sin transform en reposo: en iOS cada transform crea una capa que, con el scroll rápido, se
          // pinta a veces por encima de las cabeceras fijas
          transform: x !== 0 || animar ? `translateX(${x}px)` : undefined,
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
          inicio.current = { x: e.clientX, y: e.clientY, base: x, id: e.pointerId, horizontal: null, vel: crearVelocidad(e.clientX, e.timeStamp) }
          movido.current = false
          pasoUmbral.current = false
          largo.current = false
          pararLarga()
          if (onPulsacionLarga && x === 0)
            temporizador.current = window.setTimeout(() => {
              temporizador.current = null
              if (movido.current || !inicio.current) return
              largo.current = true
              // El gesto termina aquí: mover el dedo mientras se abre el menú no desliza la fila
              inicio.current = null
              vibrar()
              onPulsacionLarga()
            }, 500)
        }}
        onContextMenu={(e) => onPulsacionLarga && e.preventDefault()}
        onPointerMove={(e) => {
          const s = inicio.current
          if (!s || s.id !== e.pointerId) return
          const dx = e.clientX - s.x
          const dy = e.clientY - s.y
          if (s.horizontal === null) {
            if (Math.abs(dx) < UMBRAL_BLOQUEO && Math.abs(dy) < UMBRAL_BLOQUEO) return
            pararLarga()
            s.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2
            if (s.horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }
          if (!s.horizontal) return
          movido.current = true
          s.vel.mover(e.clientX, e.timeStamp)
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
          pararLarga()
          if (!s || s.id !== e.pointerId) return
          // Tras una pulsación larga, soltar no abre el detalle
          if (largo.current) {
            largo.current = false
            return
          }
          if (!movido.current) {
            if (x !== 0) cerrar()
            else onPulsar?.()
            return
          }
          const w = ancho()
          const v = s.vel.valor(e.timeStamp)
          const recorrido = x - s.base
          if (x < -w * 0.55 && derecha[0]) return ejecutar(derecha[0])
          if (x > w * 0.55 && izquierda[0]) return ejecutar(izquierda[0])
          // Abre los botones con 70 px o con un lanzamiento rápido; un lanzamiento al revés la cierra
          if (derecha.length && (x < -70 || (x < 0 && esLanzamiento(v, recorrido, -1)))) return fijar(-derecha.length * ANCHO_ACCION)
          if (izquierda.length && (x > 70 || (x > 0 && esLanzamiento(v, recorrido, 1)))) return fijar(izquierda.length * ANCHO_ACCION)
          cerrar()
        }}
        onPointerCancel={() => {
          inicio.current = null
          pararLarga()
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
  const s = useRef<{ x: number; y: number; id: number; horizontal: boolean | null; vel: Velocidad } | null>(null)

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
      data-deslizable=""
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || e.clientX < 28) return // el borde izquierdo es para volver
        if (enFila(e.target)) return // el gesto es de la fila
        s.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null, vel: crearVelocidad(e.clientX, e.timeStamp) }
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
        t.vel.mover(e.clientX, e.timeStamp)
        const limitado = (mx > 0 && !hayAnterior) || (mx < 0 && !haySiguiente)
        setAnimar(false)
        setDx(limitado ? mx / 5 : mx * 0.9)
      }}
      onPointerUp={(e) => {
        const t = s.current
        s.current = null
        if (!t?.horizontal) return
        const v = t.vel.valor(e.timeStamp)
        if (hayAnterior && (dx > window.innerWidth / 3 || esLanzamiento(v, dx, 1))) return soltar(window.innerWidth * 0.5, onAnterior)
        if (haySiguiente && (dx < -window.innerWidth / 3 || esLanzamiento(v, dx, -1))) return soltar(-window.innerWidth * 0.5, onSiguiente)
        soltar(0)
      }}
      onPointerCancel={() => {
        s.current = null
        soltar(0)
      }}
    >
      <div
        style={{
          // Sin transform ni opacidad en reposo (ver FilaDeslizable): las cabeceras fijas de dentro se ven limpias
          transform: dx !== 0 || animar ? `translateX(${dx}px)` : undefined,
          opacity: dx !== 0 ? 1 - Math.min(Math.abs(dx) / 600, 0.4) : undefined,
          transition: animar ? 'transform 0.22s ease-out, opacity 0.22s ease-out' : 'none',
        }}
        onTransitionEnd={() => setAnimar(false)}
      >
        {children}
      </div>
    </div>
  )
}

/** El gesto empieza sobre una fila deslizable */
const enFila = (t: EventTarget | null) => t instanceof Element && !!t.closest('[data-fila-deslizable]')

/** Elementos con deslizamiento lateral propio: filas, cambio de mes, campos y listas que se desplazan en horizontal */
const conGestoPropio = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('[data-fila-deslizable], [data-deslizable], input, textarea, select, [contenteditable], .overflow-x-auto')

/** Pantallas raíz de cada pestaña: desde ellas no se vuelve atrás */
const RAICES = ['/', '/movimientos', '/informes', '/ajustes']

/**
 * Deslizar desde el borde izquierdo (o desde cualquier punto sin gesto propio) vuelve a la pantalla
 * anterior, con la pantalla siguiendo al dedo. El desplazamiento se aplica directamente a la capa de la
 * pantalla, una vez por fotograma y sin pasar por React (v0.29.0): el gesto no redibuja la app. La
 * sombra es una franja fina aparte, que se mueve con la pantalla.
 */
// oxlint-disable-next-line react/only-export-components
export function useVolverDesdeBorde(pantalla: RefObject<HTMLElement | null>, sombra: RefObject<HTMLElement | null>): void {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const raiz = RAICES.includes(pathname)

  useEffect(() => {
    if (raiz) return
    // horizontal: null mientras no se sabe si el gesto es de volver o de desplazar en vertical
    let inicio: { x: number; y: number; vel: Velocidad; horizontal: boolean | null } | null = null
    let actual = 0
    let ultimoT = 0
    let fotograma = 0
    let temporizador = 0
    const CURVA = 'transform 0.3s var(--curva)'

    const pintar = (dx: number, transicion: string) => {
      for (const el of [pantalla.current, sombra.current]) {
        if (!el) continue
        el.style.transition = transicion
        el.style.transform = dx ? `translate3d(${dx}px,0,0)` : ''
      }
      if (sombra.current) sombra.current.style.opacity = dx ? '1' : '0'
    }
    const preparar = (si: boolean) => {
      // Capa propia solo mientras dura el gesto: el navegador mueve la pantalla sin volver a pintarla
      if (pantalla.current) pantalla.current.style.willChange = si ? 'transform' : ''
    }

    const alEmpezar = (e: TouchEvent) => {
      inicio = null
      const t = e.touches[0]
      if (e.touches.length !== 1) return
      // Con una hoja abierta, el gesto es de la hoja
      if (document.documentElement.classList.contains('con-hoja')) return
      // Desde el borde vale casi siempre; sobre una fila, solo el mismo borde de la pantalla (las filas empiezan a 16 px)
      if (t.clientX > 12 && enFila(e.target)) return
      // Desde cualquier otro punto de una pantalla apilada, salvo en lo que tiene deslizamiento propio
      if (t.clientX > 28 && conGestoPropio(e.target)) return
      inicio = { x: t.clientX, y: t.clientY, vel: crearVelocidad(t.clientX, e.timeStamp), horizontal: null }
    }
    const alMover = (e: TouchEvent) => {
      if (!inicio) return
      const t = e.touches[0]
      const mx = t.clientX - inicio.x
      const my = t.clientY - inicio.y
      if (inicio.horizontal === null) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
        // Solo hacia la derecha y claramente lateral; si no, es scroll y no se toca
        inicio.horizontal = mx > 0 && Math.abs(mx) > Math.abs(my) * 1.2
        if (!inicio.horizontal) {
          inicio = null
          return
        }
        inicio.x = t.clientX - 1
        preparar(true)
      }
      // Mientras vuelve, la pantalla no se desplaza en vertical
      if (e.cancelable) e.preventDefault()
      actual = Math.max(0, t.clientX - inicio.x)
      inicio.vel.mover(t.clientX, e.timeStamp)
      ultimoT = e.timeStamp
      // Un solo cambio por fotograma, aunque lleguen varios movimientos del dedo
      if (!fotograma)
        fotograma = requestAnimationFrame(() => {
          fotograma = 0
          pintar(actual, 'none')
        })
    }
    const alTerminar = (e: TouchEvent) => {
      if (!inicio) return
      const fijo = inicio.horizontal
      const v = inicio.vel.valor(e.type === 'touchcancel' ? ultimoT + 1000 : e.timeStamp)
      inicio = null
      if (!fijo) return
      cancelAnimationFrame(fotograma)
      fotograma = 0
      if (e.type !== 'touchcancel' && (actual > window.innerWidth / 3 || esLanzamiento(v, actual, 1))) {
        vibrar()
        pintar(window.innerWidth, CURVA)
        temporizador = window.setTimeout(() => {
          if (window.history.state?.idx > 0) navegar(-1)
          else navegar('/')
          // La pantalla nueva aparece en su sitio, sin animar la vuelta
          pintar(0, 'none')
          preparar(false)
        }, 300)
      } else {
        pintar(0, CURVA)
        temporizador = window.setTimeout(() => preparar(false), 300)
      }
      actual = 0
    }
    window.addEventListener('touchstart', alEmpezar, { passive: true })
    // No pasivo: una vez decidido que es volver, se anula el desplazamiento vertical
    window.addEventListener('touchmove', alMover, { passive: false })
    window.addEventListener('touchend', alTerminar)
    window.addEventListener('touchcancel', alTerminar)
    return () => {
      window.removeEventListener('touchstart', alEmpezar)
      window.removeEventListener('touchmove', alMover)
      window.removeEventListener('touchend', alTerminar)
      window.removeEventListener('touchcancel', alTerminar)
      cancelAnimationFrame(fotograma)
      window.clearTimeout(temporizador)
    }
  }, [raiz, navegar, pantalla, sombra])
}
