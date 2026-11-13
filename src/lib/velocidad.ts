/**
 * Velocidad del dedo suavizada (px por ms), para que un gesto corto y rápido cuente como uno largo.
 * Si el dedo se queda quieto más de 80 ms antes de soltar, la velocidad es cero.
 */
export interface Velocidad {
  mover: (pos: number, t: number) => void
  valor: (t: number) => number
}

export const VELOCIDAD_LANZAMIENTO = 0.4
export const DISTANCIA_LANZAMIENTO = 30

export function crearVelocidad(pos: number, t: number): Velocidad {
  let ultima = pos
  let ultimoT = t
  let v = 0
  return {
    mover(p, ahora) {
      const dt = ahora - ultimoT
      if (dt <= 0) return
      v = (0.6 * (p - ultima)) / dt + 0.4 * v
      ultima = p
      ultimoT = ahora
    },
    valor: (ahora) => (ahora - ultimoT > 80 ? 0 : v),
  }
}

/** Lanzamiento en el sentido del signo indicado: rápido y con un mínimo de recorrido */
export function esLanzamiento(v: number, recorrido: number, signo: 1 | -1): boolean {
  return v * signo > VELOCIDAD_LANZAMIENTO && recorrido * signo >= DISTANCIA_LANZAMIENTO
}
