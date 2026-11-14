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
  /** Último saldo confirmado a mano con el que muestra el banco (esquema 4) */
  saldo_confirmado: { importe: number; fecha: string; cuadra: boolean } | null
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
  /** Movimientos ya guardados que cambió la importación (traspasos emparejados), con lo que tenían antes */
  modificados: { id: string; tipo: TipoMovimiento; categoria_id?: string | null; origen_categoria?: Movimiento['origen_categoria'] }[]
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
  /** Si cae en los últimos días del mes, cuenta en el mes siguiente (nómina, hipoteca) */
  mes_siguiente: boolean
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
  /** Mes (AAAA-MM) en el que cuenta, si no es el de la fecha: la nómina del 30 cuenta en el mes siguiente */
  mes_imputacion: string | null
  /** Población del comercio, si el banco la da (sirve para detectar gastos fuera de casa) */
  poblacion: string | null
  /** Revisado en la detección de gastos de empleado y confirmado como personal: no se vuelve a proponer */
  revisado_empleado: boolean
  /** Liquidación de la tarjeta que no cuadra y el usuario ha dado por buena (esquema 9) */
  cuadre_confirmado?: boolean
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
  /** Desde el esquema 10, «cuenta»: el colchón y el pago van sobre la cuenta de ahorro (cuenta_colchon_id) */
  base_colchon: 'saldo_conjunto' | 'cuenta_principal' | 'cuenta'
  cuenta_colchon_id: string | null
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
  alias_terceros: AliasTercero[]
  dias_aviso_reembolso: number
  umbral_aviso_presupuesto: number
  /** Poblaciones de casa; vacío: se deducen de las más habituales */
  zona_casa: string[]
  /** Últimos días del mes en los que la nómina o la hipoteca cuentan ya en el mes siguiente */
  dias_fin_de_mes: number
  /** Versión de la app cuyas reglas ya se aplicaron a lo pendiente de categorizar (esquema 5) */
  version_logica: string | null
  /** Nóminas previstas (esquema 11): la del usuario y otras para simular; netas, lo que llega al banco */
  nominas: Nomina[]
}

export interface PagaExtra {
  /** Mes del año (1 a 12) */
  mes: number
  importe: number
}

export interface Nomina {
  id: string
  /** Nombre corto que elige el usuario («Mi nómina», «Nómina 2») */
  nombre: string
  neto_mensual: number
  pagas: PagaExtra[]
  /** Primer y último mes (AAAA-MM) en que se cobra; null: ya se cobra o sin fin */
  desde: string | null
  hasta: string | null
  /** Cuenta en la previsión; si no, solo se usa al simularla */
  incluida: boolean
}

export const VERSION_ESQUEMA = 11

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
