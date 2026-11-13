import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Falso si faltan las variables de entorno: la app muestra cómo configurarlas. */
export const supabaseConfigurado = Boolean(url && clave)

// Solo la clave pública. La clave de servicio nunca va en el frontal (regla 4).
export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  clave ?? 'sin-configurar',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)

/** Traduce los errores de Postgres más habituales a un mensaje legible. */
export function mensajeError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return ''
  switch (error.code) {
    case '23514':
      return 'El dato no se ha guardado: contiene un número de cuenta, tarjeta, IBAN o DNI, o un valor no admitido.'
    case '23505':
      return 'Ya existe un registro con ese nombre.'
    case '42501':
      return 'No tienes permiso para esta operación.'
    default:
      return error.message ?? 'Error desconocido'
  }
}
