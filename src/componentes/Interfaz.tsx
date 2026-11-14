/**
 * Piezas comunes de la interfaz: aviso breve abajo (con acción opcional, como Deshacer),
 * hoja modal que sube desde abajo y confirmación.
 */
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { vibrar } from '../lib/haptica'
import { registrar } from '../lib/registro'
import { crearVelocidad, esLanzamiento, type Velocidad } from '../lib/velocidad'

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
    temporizador.current = window.setTimeout(() => setAviso((a) => (a?.id === id ? null : a)), duracion ?? (!accion ? 3000 : accion.texto === 'Deshacer' ? 4000 : 12000))
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
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--alto-pestanas)+0.5rem)] z-50 flex justify-center px-3">
          <div
            role="status"
            key={aviso.id}
            className="hoja-velo pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[14px] bg-zinc-800/90 px-4 py-3 text-[15px] text-white shadow-lg backdrop-blur-xl backdrop-saturate-150 dark:bg-zinc-700/90"
          >
            <span className="flex-1">{aviso.texto}</span>
            {aviso.accion && (
              <button
                className="-my-2 min-h-11 px-1 font-semibold text-[#0A84FF]"
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
      <HojaAcciones c={confirmacion} onResultado={cerrarConfirmacion} />
    </Contexto.Provider>
  )
}

/**
 * Con una hoja abierta, la pantalla de detrás no se desplaza. Safari en el iPhone pasa el scroll a la
 * página cuando el contenido de la hoja llega a su principio o a su final, o cuando el dedo está fuera de
 * una zona desplazable (cabecera, velo): ahí se anula el gesto. Dentro de la hoja, lo que se desplaza
 * sigue funcionando (lista, nota) y los gestos laterales no se tocan.
 */
let inicioToque = { x: 0, y: 0 }
function alEmpezarToque(e: TouchEvent) {
  const t = e.touches[0]
  if (t) inicioToque = { x: t.clientX, y: t.clientY }
}
function desplazable(desde: Element | null, tope: Element): HTMLElement | null {
  for (let el = desde; el && el !== tope.parentElement; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el
  }
  return null
}
function bloquearFondo(e: TouchEvent) {
  const t = e.touches[0]
  if (!t || !e.cancelable) return
  const dx = t.clientX - inicioToque.x
  const dy = t.clientY - inicioToque.y
  const objetivo = e.target instanceof Element ? e.target : null
  const panel = objetivo?.closest('[role="dialog"]')
  // Lateral dentro de una hoja (filas, chips): no afecta a la página
  if (panel && Math.abs(dx) > Math.abs(dy)) return
  const zona = panel ? desplazable(objetivo, panel) : null
  if (!zona) return e.preventDefault()
  const arriba = zona.scrollTop <= 0
  const abajo = zona.scrollTop + zona.clientHeight >= zona.scrollHeight - 1
  if ((dy > 0 && arriba) || (dy < 0 && abajo)) e.preventDefault()
}

/**
 * Teclado (guía 6.4): --kb es la parte de la pantalla que tapa el teclado, para subir la hoja. Si iOS
 * encoge la ventana entera (iOS 26), la página ya cabe encima y no hay que subir nada.
 */
let tecladoInstalado = false
function vigilarTeclado() {
  const vv = window.visualViewport
  if (tecladoInstalado || !vv) return
  tecladoInstalado = true
  const medir = () => {
    const encogida = window.innerHeight < window.screen.height * 0.75
    const kb = encogida ? 0 : Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`)
    document.documentElement.classList.toggle('con-teclado', kb >= 60 || encogida)
  }
  vv.addEventListener('resize', medir)
  vv.addEventListener('scroll', medir)
  medir()
}

/** Hojas abiertas a la vez: mientras haya alguna, la pantalla de detrás se encoge y no se desplaza */
let hojasAbiertas = 0
function marcarHoja(abre: boolean) {
  const antes = hojasAbiertas
  hojasAbiertas = Math.max(0, hojasAbiertas + (abre ? 1 : -1))
  if (!antes && hojasAbiertas) {
    vigilarTeclado()
    document.addEventListener('touchstart', alEmpezarToque, { passive: true, capture: true })
    document.addEventListener('touchmove', bloquearFondo, { passive: false, capture: true })
  } else if (antes && !hojasAbiertas) {
    document.removeEventListener('touchstart', alEmpezarToque, { capture: true })
    document.removeEventListener('touchmove', bloquearFondo, { capture: true })
  }
  const contenido = document.getElementById('contenido')
  if (abre && contenido) {
    // Que se encoja hacia el centro de lo que se ve, no hacia el centro de la página entera
    const r = contenido.getBoundingClientRect()
    contenido.style.transformOrigin = `50% ${window.innerHeight / 2 - r.top}px`
  }
  document.documentElement.classList.toggle('con-hoja', hojasAbiertas > 0)
}

/** Ciclo de vida de una hoja: se queda montada mientras sale y aplica la guardia de toques */
function useCicloHoja(abierta: boolean) {
  const [montada, setMontada] = useState(abierta)
  const [saliendo, setSaliendo] = useState(false)
  const abiertaEn = useRef(0)
  if (abierta && !montada) {
    setMontada(true)
    setSaliendo(false)
  }
  if (!abierta && montada && !saliendo) setSaliendo(true)
  useEffect(() => {
    if (!abierta) return
    abiertaEn.current = Date.now()
    marcarHoja(true)
    return () => marcarHoja(false)
  }, [abierta])
  useEffect(() => {
    if (!saliendo) return
    const t = window.setTimeout(() => {
      setMontada(false)
      setSaliendo(false)
    }, 450)
    return () => window.clearTimeout(t)
  }, [saliendo])
  // Toques fantasma: iOS repite a veces el toque que abrió la hoja; se ignoran 450 ms
  const recien = () => Date.now() - abiertaEn.current < 450
  return { montada, saliendo, recien }
}

export function Hoja({
  abierta,
  titulo,
  onCerrar,
  children,
  acciones,
  listo,
}: {
  abierta: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
  acciones?: ReactNode
  /** Botón de texto a la derecha de la cabecera, como «Listo» en iOS (sustituye a la X) */
  listo?: string
}) {
  const { montada, saliendo, recien } = useCicloHoja(abierta)
  // Mientras sale, se sigue mostrando lo último que tenía (el padre ya puede haberlo vaciado)
  const [guardado, setGuardado] = useState({ titulo, children, acciones })
  if (abierta && (guardado.titulo !== titulo || guardado.children !== children || guardado.acciones !== acciones)) setGuardado({ titulo, children, acciones })
  const v = abierta ? { titulo, children, acciones } : guardado
  // Arrastrar la cabecera hacia abajo cierra la hoja: más de 110 px o un lanzamiento rápido
  const [dy, setDy] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const inicio = useRef<{ y: number; id: number; vel: Velocidad } | null>(null)
  const cuerpo = useRef<HTMLDivElement>(null)
  const cerrarRef = useRef(onCerrar)
  // Respaldo: si un campo tiene el foco y no se detecta el teclado, la hoja pasa arriba (guía 6.4)
  const [arriba, setArriba] = useState(false)
  if (!abierta && arriba) setArriba(false)
  useEffect(() => {
    const el = cuerpo.current
    if (!el || !abierta) return
    let espera: number | null = null
    const enfocar = (e: FocusEvent) => {
      const t = e.target as HTMLElement
      if (!t.matches('input, textarea, [contenteditable]')) return
      // Que el campo quede a la vista cuando el teclado termina de subir
      window.setTimeout(() => t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350)
      if (espera !== null) window.clearTimeout(espera)
      espera = window.setTimeout(() => {
        const teclado = document.documentElement.classList.contains('con-teclado')
        const tactil = matchMedia('(pointer: coarse)').matches
        if (!teclado && tactil && document.activeElement === t) {
          setArriba(true)
          registrar('info', 'Teclado no detectado: hoja arriba', { pantalla: window.screen.height, ventana: window.innerHeight, visible: Math.round(window.visualViewport?.height ?? 0) })
        }
      }, 1200)
    }
    const salir = () => {
      if (espera !== null) window.clearTimeout(espera)
      window.setTimeout(() => {
        if (!el.contains(document.activeElement)) setArriba(false)
      }, 100)
    }
    el.addEventListener('focusin', enfocar)
    el.addEventListener('focusout', salir)
    return () => {
      if (espera !== null) window.clearTimeout(espera)
      el.removeEventListener('focusin', enfocar)
      el.removeEventListener('focusout', salir)
    }
  }, [abierta])
  useEffect(() => {
    cerrarRef.current = onCerrar
  })

  // También se cierra arrastrando hacia abajo desde el contenido, si está arriba del todo
  // (como en iOS: primero se desplaza el contenido y, al llegar arriba, baja la hoja)
  useEffect(() => {
    const el = cuerpo.current
    if (!el || !abierta) return
    let y0: number | null = null
    let activo = false
    let actual = 0
    let vel: Velocidad | null = null
    const empezar = (e: TouchEvent) => {
      y0 = null
      activo = false
      if (e.touches.length !== 1 || el.scrollTop > 0 || (e.target as HTMLElement).closest('textarea, input, select')) return
      y0 = e.touches[0].clientY
      vel = crearVelocidad(y0, e.timeStamp)
    }
    const mover = (e: TouchEvent) => {
      if (y0 === null) return
      const d = e.touches[0].clientY - y0
      if (!activo) {
        if (d > 6 && el.scrollTop <= 0) activo = true
        else {
          if (d < -6) y0 = null
          return
        }
      }
      e.preventDefault()
      vel?.mover(e.touches[0].clientY, e.timeStamp)
      actual = Math.max(0, d)
      setArrastrando(true)
      setDy(actual)
    }
    const terminar = (e: TouchEvent) => {
      if (y0 === null || !activo) return
      y0 = null
      activo = false
      setArrastrando(false)
      if (e.type === 'touchend' && (actual > 110 || esLanzamiento(vel?.valor(e.timeStamp) ?? 0, actual, 1))) cerrarRef.current()
      actual = 0
      setDy(0)
    }
    el.addEventListener('touchstart', empezar, { passive: true })
    el.addEventListener('touchmove', mover, { passive: false })
    el.addEventListener('touchend', terminar)
    el.addEventListener('touchcancel', terminar)
    return () => {
      el.removeEventListener('touchstart', empezar)
      el.removeEventListener('touchmove', mover)
      el.removeEventListener('touchend', terminar)
      el.removeEventListener('touchcancel', terminar)
    }
  }, [abierta, montada])

  useEffect(() => {
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierta, onCerrar])

  if (!montada) return null
  const cerrarSiProcede = () => {
    if (recien()) return registrar('info', 'Toque ignorado en una hoja recién abierta')
    onCerrar()
  }
  return createPortal(
    <div
      className={`hoja-velo fixed inset-0 z-40 flex justify-center bg-black/40 ${arriba ? 'items-start px-2 pt-[calc(env(safe-area-inset-top)+8px)]' : 'items-end'} ${saliendo ? 'saliendo pointer-events-none' : ''}`}
      style={{ opacity: 1 - Math.min(dy / 500, 0.5) }}
      onClick={cerrarSiProcede}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={v.titulo}
        className={`hoja-panel flex w-full max-w-lg flex-col bg-white shadow-xl dark:bg-zinc-900 ${
          arriba ? 'max-h-[46dvh] rounded-2xl' : 'max-h-[min(85dvh,calc(100dvh-var(--kb,0px)-3rem))] rounded-t-2xl pb-[env(safe-area-inset-bottom)]'
        } ${saliendo ? 'saliendo' : ''}`}
        style={{
          // Con el teclado abierto, la hoja sube lo que tapa el teclado
          transform: arriba ? undefined : `translate3d(0, calc(${dy}px - var(--kb, 0px)), 0)`,
          transition: arrastrando ? 'none' : 'transform 0.5s var(--curva)',
        }}
        onClick={(e) => e.stopPropagation()}
        onClickCapture={(e) => {
          if (!recien()) return
          e.stopPropagation()
          e.preventDefault()
        }}
      >
        <div
          className="cursor-grab border-b border-zinc-200 dark:border-zinc-800"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            inicio.current = { y: e.clientY, id: e.pointerId, vel: crearVelocidad(e.clientY, e.timeStamp) }
            setArrastrando(true)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!inicio.current || inicio.current.id !== e.pointerId) return
            inicio.current.vel.mover(e.clientY, e.timeStamp)
            setDy(Math.max(0, e.clientY - inicio.current.y))
          }}
          onPointerUp={(e) => {
            const s = inicio.current
            inicio.current = null
            setArrastrando(false)
            if (s && (dy > 110 || esLanzamiento(s.vel.valor(e.timeStamp), dy, 1))) onCerrar()
            setDy(0)
          }}
          onPointerCancel={() => {
            inicio.current = null
            setArrastrando(false)
            setDy(0)
          }}
        >
          <div className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden="true" />
          {listo ? (
            <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center px-4 pb-1">
              <span />
              <h2 className="truncate text-center text-[17px] font-semibold">{v.titulo}</h2>
              <button className="-mr-2 min-h-11 justify-self-end px-2 text-[17px] font-semibold text-marca-700 active:opacity-60 dark:text-marca-500" onClick={onCerrar}>
                {listo}
              </button>
            </div>
          ) : (
            <div className="flex min-h-11 items-center justify-between px-4 pb-2">
              <h2 className="text-[17px] font-semibold">{v.titulo}</h2>
              <button aria-label="Cerrar" className="grid size-11 place-items-center -mr-2" onClick={onCerrar}>
                <span className="rounded-full bg-zinc-100 p-1 text-zinc-500 dark:bg-zinc-800">
                  <X className="size-4" strokeWidth={2.5} />
                </span>
              </button>
            </div>
          )}
        </div>
        <div ref={cuerpo} className="overflow-y-auto overscroll-contain px-4 py-4">
          {v.children}
        </div>
        {v.acciones && <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">{v.acciones}</div>}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Hoja de acciones para confirmar, al estilo de iOS: un grupo con el texto y la acción (en rojo si
 * borra algo) y debajo, aparte, «Cancelar».
 */
function HojaAcciones({ c, onResultado }: { c: Confirmacion | null; onResultado: (ok: boolean) => void }) {
  const { montada, saliendo, recien } = useCicloHoja(!!c)
  const [guardada, setGuardada] = useState(c)
  if (c && c !== guardada) setGuardada(c)
  const v = c ?? guardada
  useEffect(() => {
    if (!c) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onResultado(false)
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [c, onResultado])
  if (!montada || !v) return null
  const pulsar = (ok: boolean) => {
    if (recien()) return registrar('info', 'Toque ignorado en una confirmación recién abierta')
    onResultado(ok)
  }
  return createPortal(
    <div className={`hoja-velo fixed inset-0 z-50 flex items-end justify-center bg-black/40 ${saliendo ? 'saliendo pointer-events-none' : ''}`} onClick={() => pulsar(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={v.titulo}
        className={`hoja-panel w-full max-w-lg space-y-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${saliendo ? 'saliendo' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-[14px] bg-white/95 text-center backdrop-blur-xl dark:bg-zinc-800/95">
          <div className="px-4 py-3">
            <p className="text-[13px] font-semibold text-zinc-500">{v.titulo}</p>
            <div className="mt-1 text-[13px] text-zinc-500">{v.texto}</div>
          </div>
          <button
            className={`h-14 w-full border-t border-zinc-200 text-[20px] active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-700 ${
              v.peligro ? 'text-[#FF3B30] dark:text-[#FF453A]' : 'text-[#007AFF] dark:text-[#0A84FF]'
            }`}
            onClick={() => pulsar(true)}
          >
            {v.aceptar}
          </button>
        </div>
        <button
          className="h-14 w-full rounded-[14px] bg-white text-[20px] font-semibold text-[#007AFF] active:bg-zinc-100 dark:bg-zinc-800 dark:text-[#0A84FF] dark:active:bg-zinc-700"
          onClick={() => pulsar(false)}
        >
          Cancelar
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** Barra o botón flotante encima de la barra de pestañas (fuera de la pantalla, para que no se encoja con las hojas) */
export function Flotante({ children }: { children: ReactNode }) {
  return createPortal(<div className="fixed inset-x-3 bottom-[calc(var(--alto-pestanas)+0.5rem)] z-30 mx-auto max-w-md">{children}</div>, document.body)
}

/**
 * Interruptor al estilo Liquid Glass (iOS 26 y posteriores): carril ancho, botón en cápsula alargada y,
 * mientras se pulsa, la cápsula crece y se vuelve una lente de cristal translúcida con un rebote suave.
 * Zona táctil de 44 pt aunque el dibujo sea más pequeño.
 */
export function Interruptor({ activo, onCambio, etiqueta, disabled }: { activo: boolean; onCambio: (v: boolean) => void; etiqueta: string; disabled?: boolean }) {
  const [pulsado, setPulsado] = useState(false)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => {
        vibrar()
        onCambio(!activo)
      }}
      onPointerDown={() => setPulsado(true)}
      onPointerUp={() => setPulsado(false)}
      onPointerLeave={() => setPulsado(false)}
      onPointerCancel={() => setPulsado(false)}
      className="interruptor relative inline-grid h-11 w-16 shrink-0 place-items-center disabled:opacity-40"
      data-activo={activo}
      data-pulsado={pulsado}
    >
      <span className="interruptor-carril" />
      <span className="interruptor-boton" />
    </button>
  )
}

export function FilaInterruptor({ texto, nota, activo, onCambio }: { texto: string; nota?: string; activo: boolean; onCambio: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{texto}</p>
        {nota && <p className="text-xs text-zinc-500">{nota}</p>}
      </div>
      <Interruptor activo={activo} onCambio={onCambio} etiqueta={texto} />
    </div>
  )
}

/** Control segmentado al estilo de iOS */
export function Segmentado<T extends string>({ opciones, valor, onCambio, etiqueta }: { opciones: [T, string][]; valor: T; onCambio: (v: T) => void; etiqueta: string }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex gap-0.5 rounded-[9px] bg-zinc-200/80 p-0.5 dark:bg-zinc-800">
      {opciones.map(([v, texto]) => (
        <button
          key={v}
          role="radio"
          aria-checked={valor === v}
          onClick={() => onCambio(v)}
          className={`flex-1 rounded-[7px] px-3 py-1 text-[13px] font-medium transition ${
            valor === v ? 'bg-white text-zinc-900 shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-zinc-600 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'
          }`}
        >
          {texto}
        </button>
      ))}
    </div>
  )
}

