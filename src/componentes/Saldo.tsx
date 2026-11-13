import { CircleAlert, CircleCheck } from 'lucide-react'
import { formatearFecha, formatearImporte } from '../lib/formato'
import type { CuadreCuenta } from '../lib/saldos'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Saldo de la app frente al del banco, con los huecos y repetidos que lo descuadran */
export function CuadreSaldo({ cuadre, compacto = false }: { cuadre: CuadreCuenta; compacto?: boolean }) {
  if (!cuadre.conSaldo) {
    return <p className="text-sm text-zinc-500">El Excel de esta cuenta no trae saldo. La tarjeta se comprueba con su liquidación en la cuenta.</p>
  }
  const repetidos = cuadre.duplicados.reduce((s, g) => s + g.length - 1, 0)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {cuadre.cuadra ? (
          <CircleCheck className="size-5 shrink-0 text-[#34C759]" strokeWidth={2} />
        ) : (
          <CircleAlert className="size-5 shrink-0 text-[#FF9500]" strokeWidth={2} />
        )}
        <p className="text-[15px] font-semibold">{cuadre.cuadra ? 'Cuadra con el banco' : 'No cuadra con el banco'}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-[10px] bg-zinc-50 py-2 dark:bg-zinc-800/50">
          <dt className="text-[11px] text-zinc-500">Banco, {formatearFecha(cuadre.fecha!)}</dt>
          <dd className="text-[15px] font-semibold tabular-nums">{formatearImporte(cuadre.saldoBanco!)}</dd>
        </div>
        <div className="rounded-[10px] bg-zinc-50 py-2 dark:bg-zinc-800/50">
          <dt className="text-[11px] text-zinc-500">App</dt>
          <dd className="text-[15px] font-semibold tabular-nums">{formatearImporte(cuadre.saldoApp!)}</dd>
        </div>
      </dl>
      {!compacto && repetidos > 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {plural(repetidos, 'movimiento guardado dos veces', 'movimientos guardados dos veces')} (misma fecha, importe, saldo y concepto).
        </p>
      )}
      {!compacto &&
        cuadre.huecos.map((h) => (
          <p key={`${h.desde}${h.hasta}`} className="text-sm text-zinc-600 dark:text-zinc-400">
            Faltan movimientos entre el {formatearFecha(h.desde)} y el {formatearFecha(h.hasta)} ({formatearImporte(h.diferencia)}). Importa ese tramo.
          </p>
        ))}
    </div>
  )
}
