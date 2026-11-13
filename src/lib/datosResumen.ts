/** Lectura de Supabase para los resúmenes */
import type { ConciliacionResumen, MovimientoResumen, Periodo } from './resumen'
import { desplazarPeriodo } from './resumen'
import { mensajeError, supabase } from './supabase'

const CAMPOS = 'id, cuenta_id, fecha_operacion, concepto_limpio, importe, tipo, categoria_id, reembolso_cerrado'
const PAGINA = 1000

async function todasLasPaginas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1)
    if (error) throw new Error(mensajeError(error))
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) return filas
  }
}

export async function cargarDatosResumen(periodo: Periodo): Promise<{ movimientos: MovimientoResumen[]; conciliaciones: ConciliacionResumen[] }> {
  const anterior = desplazarPeriodo(periodo, -1)
  const [enRango, empleadoPrevio, conciliaciones] = await Promise.all([
    todasLasPaginas<MovimientoResumen>((d, h) =>
      supabase.from('movimientos').select(CAMPOS).gte('fecha_operacion', anterior.inicio).lte('fecha_operacion', periodo.fin).order('fecha_operacion').range(d, h),
    ),
    // Gastos de empleado anteriores que siguen abiertos: cuentan en el pendiente de reembolso
    todasLasPaginas<MovimientoResumen>((d, h) =>
      supabase.from('movimientos').select(CAMPOS).eq('tipo', 'gasto_empleado').eq('reembolso_cerrado', false).lt('fecha_operacion', anterior.inicio).range(d, h),
    ),
    todasLasPaginas<ConciliacionResumen>((d, h) => supabase.from('conciliaciones').select('gasto_id, importe_aplicado').range(d, h)),
  ])
  const movimientos = [...enRango, ...empleadoPrevio].map((m) => ({ ...m, importe: Number(m.importe) }))
  return { movimientos, conciliaciones: conciliaciones.map((c) => ({ ...c, importe_aplicado: Number(c.importe_aplicado) })) }
}
