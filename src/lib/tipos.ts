/**
 * Modelo de datos (apartado 4 de CLAUDE.md). Todo se guarda en el dispositivo como un único
 * documento (BaseDatos), que es también el contenido del archivo de exportación.
 */

export type TipoCuenta = 'cuenta' | 'tarjeta_credito' | 'hipoteca'

export type TipoMovimiento = 'normal' | 'gasto_empleado' | 'reembolso_empresa' | 'traspaso_interno' | 'pago_deuda'

export type Naturaleza = 'gasto' | 'ingreso'

export type OrigenImportacion = 'bbva_cuenta' | 'bbva_tarjeta' | 'fintonic' | 'datos_prueba'

export interface Cuenta {
  id: string
  alias: string
  entidad: string | null
  tipo: TipoCuenta
  activa: boolean
  orden: number
  created_at: string
}

export interface Categoria {
  id: string
  padre_id: string | null
  nombre: string
  icono: string | null
  color: string | null
  naturaleza: Naturaleza
  activa: boolean
  orden: number
}

export interface Importacion {
  id: string
  cuenta_id: string
  origen: OrigenImportacion
  fecha_desde: string | null
  fecha_hasta: string | null
  movimientos_nuevos: number
  movimientos_duplicados: number
  movimientos_descartados: number
  estado: 'confirmada' | 'deshecha'
  /** Movimientos que ya existían y la importación cambió (traspasos emparejados): su tipo anterior, para deshacer */
  modificados: { id: string; tipo: TipoMovimiento }[]
  created_at: string
}

export interface Regla {
  id: string
  nombre: string | null
  patron: string
  tipo_patron: 'contiene' | 'empieza' | 'exacto' | 'regex'
  cuenta_id: string | null
  importe_min: number | null
  importe_max: number | null
  categoria_id: string | null
  tipo_movimiento: TipoMovimiento | null
  es_sugerencia: boolean
  prioridad: number
  origen: 'manual' | 'aprendida' | 'sistema'
  activa: boolean
  confirmaciones: number
  descartes: number
  created_at: string
}

export interface Movimiento {
  id: string
  cuenta_id: string
  importacion_id: string | null
  fecha_operacion: string
  fecha_valor: string | null
  concepto_original: string // ya anonimizado
  concepto_limpio: string
  concepto_normalizado: string // forma usada en la deduplicación
  ocurrencia: number
  importe: number // negativo gasto, positivo ingreso
  saldo: number | null
  categoria_id: string | null
  tipo: TipoMovimiento
  regla_id: string | null
  origen_categoria: 'regla' | 'aprendida' | 'manual' | null
  nota: string | null
  reembolso_cerrado: boolean
  created_at: string
}

export interface Conciliacion {
  id: string
  reembolso_id: string
  gasto_id: string
  importe_aplicado: number
  created_at: string
}

export interface Presupuesto {
  id: string
  categoria_id: string
  importe_mensual: number
  excepciones: Record<string, number> // { "2027-08": 2500 }
  created_at: string
}

export interface Compromiso {
  id: string
  nombre: string
  deuda_inicial: number
  fecha_referencia: string
  interes_anual: number
  colchon: number
  base_colchon: 'saldo_conjunto' | 'cuenta_principal'
  ventana_mes_inicio: number
  ventana_mes_fin: number
  mes_referencia: number
  activo: boolean
  created_at: string
}

export interface EventoPrevisto {
  id: string
  fecha: string
  concepto: string
  importe: number
  categoria_id: string | null
  created_at: string
}

export interface AliasTercero {
  alias: string
  patrones: string[]
}

export interface Ajustes {
  fecha_inicio: string
  fecha_corte_fintonic: string
  alias_terceros: AliasTercero[]
  dias_aviso_reembolso: number
  umbral_aviso_presupuesto: number
  zona_casa: string[]
}

export const VERSION_ESQUEMA = 2

export interface BaseDatos {
  esquema: number
  ajustes: Ajustes
  cuentas: Cuenta[]
  categorias: Categoria[]
  reglas: Regla[]
  importaciones: Importacion[]
  movimientos: Movimiento[]
  conciliaciones: Conciliacion[]
  presupuestos: Presupuesto[]
  compromisos: Compromiso[]
  eventos_previstos: EventoPrevisto[]
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
