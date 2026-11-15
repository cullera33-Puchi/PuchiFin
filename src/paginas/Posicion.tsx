import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BarraNavegacion } from '../componentes/Encabezado'
import { TarjetaPosicion } from '../componentes/Posicion'

/** Tu posición en su propia pantalla (v0.31.0): capital, cuentas, tarjeta y evolución */
export function Posicion() {
  return (
    <>
      <BarraNavegacion titulo="Tu posición" atras="Extracto" />
      <TarjetaPosicion />
      <Link to="/extracto/patrimonio" className="lista fila mt-4 min-h-12 active:bg-zinc-100 dark:active:bg-zinc-800">
        <span className="flex-1 text-[15px]">Patrimonio completo</span>
        <span className="text-[13px] text-zinc-500">Inmuebles, hipoteca y más</span>
        <ChevronRight className="size-4 shrink-0 text-zinc-400" />
      </Link>
      <p className="mt-3 px-4 text-[13px] text-zinc-500">
        El capital mes a mes y el ahorro real están en{' '}
        <Link to="/informes" className="text-marca-700 dark:text-marca-500">
          Informes
        </Link>
        .
      </p>
    </>
  )
}
