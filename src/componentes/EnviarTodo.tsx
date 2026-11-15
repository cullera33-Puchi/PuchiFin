import { useDatos } from '../datos/ProveedorDatos'
import { textoCompleto } from '../lib/analizar'
import { hoyIso } from '../lib/fechas'
import { HojaClaude } from './HojaClaude'
import { useSimulacion } from './simulacion'

/**
 * Enviar todo a Claude (v0.43.0): la app entera en un texto y todos los movimientos en CSV, con la
 * simulación que haya abierta (segunda nómina, compra de vivienda…).
 */
export function HojaTodo({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const db = useDatos()
  const [sim] = useSimulacion()
  return (
    <HojaClaude
      abierta={abierta}
      titulo="Enviar todo a Claude"
      explicacion="Toda la app en un texto: el mes, el año, el presupuesto, los gastos fijos, el plan de pagos, el patrimonio, tus ingresos futuros y la compra que estés simulando. Con el CSV de todos tus movimientos."
      texto={abierta ? textoCompleto(db, hoyIso(), sim) : ''}
      archivo="puchifin-todo.txt"
      registro="Enviar todo a Claude"
      detalle={abierta ? { movimientos: db.movimientos, archivo: 'puchifin-todos-los-movimientos.csv' } : undefined}
      onCerrar={onCerrar}
    />
  )
}
