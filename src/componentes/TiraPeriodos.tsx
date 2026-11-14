import { useLayoutEffect, useRef } from 'react'
import { MESES } from '../lib/fechas'

export interface OpcionPeriodo {
  clave: string
  /** Texto principal: «Nov» o «2026» */
  arriba: string
  /** Debajo, más pequeño: el año de un mes */
  abajo?: string
}

/** Meses de «desde» a «hasta» (AAAA-MM), ambos incluidos, como opciones de la tira */
// oxlint-disable-next-line react/only-export-components
export function opcionesMeses(desde: string, hasta: string): OpcionPeriodo[] {
  const res: OpcionPeriodo[] = []
  let [a, m] = desde.split('-').map(Number)
  const [ah, mh] = hasta.split('-').map(Number)
  while (a < ah || (a === ah && m <= mh)) {
    const nombre = MESES[m - 1]
    res.push({ clave: `${a}-${String(m).padStart(2, '0')}`, arriba: nombre.charAt(0).toUpperCase() + nombre.slice(1, 3), abajo: String(a) })
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return res
}

/** Años de «desde» a «hasta», ambos incluidos */
// oxlint-disable-next-line react/only-export-components
export function opcionesAnios(desde: string, hasta: string): OpcionPeriodo[] {
  const res: OpcionPeriodo[] = []
  for (let a = Number(desde.slice(0, 4)); a <= Number(hasta.slice(0, 4)); a++) res.push({ clave: String(a), arriba: String(a) })
  return res
}

/** Botones que caben enteros a la vez en la tira */
const VISIBLES = 5

/**
 * Tira de periodos que se desliza de lado, con botones grandes y el elegido resaltado. Siempre se ven
 * cinco botones enteros: la tira ocupa el ancho de las tarjetas, cada botón una quinta parte, y al soltarla
 * se encaja en un botón, sin medios meses en los bordes (v0.26.0).
 */
export function TiraPeriodos({ opciones, valor, onElegir, etiqueta }: { opciones: OpcionPeriodo[]; valor: string; onElegir: (clave: string) => void; etiqueta: string }) {
  const caja = useRef<HTMLDivElement>(null)

  // El elegido, hacia el centro y encajado en un botón (sin animar la primera vez)
  const primera = useRef(true)
  useLayoutEffect(() => {
    const c = caja.current
    if (!c) return
    const botones = c.querySelectorAll<HTMLElement>('[role="radio"]')
    const i = opciones.findIndex((o) => o.clave === valor)
    if (i < 0 || botones.length < 2) return
    const paso = botones[1].offsetLeft - botones[0].offsetLeft
    const primero = Math.max(0, Math.min(i - Math.floor(VISIBLES / 2), botones.length - VISIBLES))
    c.scrollTo({ left: primero * paso, behavior: primera.current ? 'auto' : 'smooth' })
    primera.current = false
  }, [valor, opciones])

  return (
    <div
      ref={caja}
      role="radiogroup"
      aria-label={etiqueta}
      className="flex snap-x snap-mandatory gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {opciones.map((o) => {
        const activa = o.clave === valor
        return (
          <button
            key={o.clave}
            role="radio"
            aria-checked={activa}
            onClick={() => onElegir(o.clave)}
            className={`flex min-h-12 shrink-0 basis-[calc((100%-2rem)/5)] snap-start flex-col items-center justify-center rounded-2xl px-1 leading-tight transition-colors active:opacity-70 ${
              activa ? 'bg-marca-700 text-white dark:bg-marca-600' : 'bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            <span className="text-[15px] font-semibold">{o.arriba}</span>
            {o.abajo && <span className={`text-[11px] tabular-nums ${activa ? 'text-white/80' : 'text-zinc-500'}`}>{o.abajo}</span>}
          </button>
        )
      })}
    </div>
  )
}
