/** Tipos de las tablas de Supabase (supabase/migrations). */

export type TipoCuenta = 'cuenta' | 'tarjeta_credito' | 'hipoteca'

export type TipoMovimiento =
  | 'normal'
  | 'gasto_empleado'
  | 'reembolso_empresa'
  | 'traspaso_interno'
  | 'pago_deuda'

export type Naturaleza = 'gasto' | 'ingreso'

export interface Cuenta {
  id: string
  user_id: string
  alias: string
  entidad: string | null
  tipo: TipoCuenta
  activa: boolean
  orden: number
  created_at: string
}

export interface Categoria {
  id: string
  user_id: string
  padre_id: string | null
  nombre: string
  icono: string | null
  color: string | null
  naturaleza: Naturaleza
  activa: boolean
  orden: number
}

export interface AliasTercero {
  alias: string
  patrones: string[]
}

export interface Ajustes {
  user_id: string
  fecha_inicio: string
  fecha_corte_fintonic: string
  alias_terceros: AliasTercero[]
  dias_aviso_reembolso: number
  umbral_aviso_presupuesto: number
  zona_casa: string[]
}

export interface Compromiso {
  id: string
  nombre: string
  deuda_inicial: number
  fecha_referencia: string
  interes_anual: number
  colchon: number
  ventana_mes_inicio: number
  ventana_mes_fin: number
  mes_referencia: number
}

export const NOMBRE_TIPO_CUENTA: Record<TipoCuenta, string> = {
  cuenta: 'Cuenta bancaria',
  tarjeta_credito: 'Tarjeta de crédito',
  hipoteca: 'Hipoteca',
}

export const NOMBRE_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  normal: 'Normal',
  gasto_empleado: 'Gasto de empleado',
  reembolso_empresa: 'Reembolso de empresa',
  traspaso_interno: 'Traspaso interno',
  pago_deuda: 'Pago de deuda',
}

/** Regla 5: solo los movimientos de tipo Normal computan */
export function computa(tipo: TipoMovimiento): boolean {
  return tipo === 'normal'
}
