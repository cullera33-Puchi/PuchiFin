import { useSyncExternalStore } from 'react'
import { SIN_SIMULACION, type Simulacion } from '../lib/plan'

/**
 * La simulación del plan es una sola: Ingresos previstos y el Plan de pagos enseñan el mismo escenario
 * mientras la app está abierta. No se guarda: al cerrar la app vuelve a lo guardado.
 */
let actual: Simulacion = SIN_SIMULACION
const oyentes = new Set<() => void>()

function suscribir(fn: () => void) {
  oyentes.add(fn)
  return () => {
    oyentes.delete(fn)
  }
}

export function fijarSimulacion(s: Simulacion) {
  actual = s
  oyentes.forEach((fn) => fn())
}

export function useSimulacion(): [Simulacion, (s: Simulacion) => void] {
  return [useSyncExternalStore(suscribir, () => actual), fijarSimulacion]
}
