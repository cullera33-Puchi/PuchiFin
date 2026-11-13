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

/**
 * Tira de periodos que se desliza de lado, con botones grandes y el elegido resaltado y centrado.
 * Sustituye a las flechas pequeñas de mes anterior y siguiente.
 */
export function TiraPeriodos({ opciones, valor, onElegir, etiqueta }: { opciones: OpcionPeriodo[]; valor: string; onElegir: (clave: string) => void; etiqueta: string }) {
  const caja = useRef<HTMLDivElement>(null)

  // El elegido, centrado (sin animar la primera vez)
  const primera = useRef(true)
  useLayoutEffect(() => {
    const c = caja.current
    const el = c?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (!c || !el) return
    const destino = el.offsetLeft - c.clientWidth / 2 + el.clientWidth / 2
    c.scrollTo({ left: destino, behavior: primera.current ? 'auto' : 'smooth' })
    primera.current = false
  }, [valor, opciones.length])

  return (
    <div ref={caja} role="radiogroup" aria-label={etiqueta} className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {opciones.map((o) => {
        const activa = o.clave === valor
        return (
          <button
            key={o.clave}
            role="radio"
            aria-checked={activa}
            onClick={() => onElegir(o.clave)}
            className={`flex min-h-12 min-w-[3.75rem] shrink-0 snap-center flex-col items-center justify-center rounded-2xl px-3 leading-tight transition-colors active:opacity-70 ${
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
