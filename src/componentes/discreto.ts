import { useSyncExternalStore } from 'react'
import { esDiscreto, fijarDiscreto, suscribirDiscreto } from '../lib/discreto'

/** Modo discreto: si está activo y cómo cambiarlo (las pantallas se vuelven a pintar al cambiar) */
export function useDiscreto(): [boolean, (v: boolean) => void] {
  return [useSyncExternalStore(suscribirDiscreto, esDiscreto), fijarDiscreto]
}
