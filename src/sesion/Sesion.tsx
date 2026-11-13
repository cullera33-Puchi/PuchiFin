import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { mensajeError, supabase } from '../lib/supabase'

type Estado = 'cargando' | 'sin_sesion' | 'preparando' | 'lista' | 'error'

interface ValorSesion {
  estado: Estado
  sesion: Session | null
  error: string | null
  salir: () => Promise<void>
}

const ContextoSesion = createContext<ValorSesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  // Usuario para el que ya se ha hecho la carga inicial, o error al hacerla
  const [preparado, setPreparado] = useState<{ usuario: string; error: string | null } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => setSesion(nueva))
    return () => data.subscription.unsubscribe()
  }, [])

  const usuarioId = sesion?.user.id
  useEffect(() => {
    if (!usuarioId) return
    let cancelado = false
    // Carga idempotente de ajustes, cuentas, catálogo y compromiso en el primer acceso
    supabase.rpc('inicializar_datos_usuario').then(({ error: e }) => {
      if (!cancelado) setPreparado({ usuario: usuarioId, error: e ? mensajeError(e) : null })
    })
    return () => {
      cancelado = true
    }
  }, [usuarioId])

  let estado: Estado
  if (sesion === undefined) estado = 'cargando'
  else if (sesion === null) estado = 'sin_sesion'
  else if (preparado?.usuario !== sesion.user.id) estado = 'preparando'
  else estado = preparado.error ? 'error' : 'lista'
  const error = preparado?.error ?? null

  const salir = async () => {
    await supabase.auth.signOut()
  }

  return (
    <ContextoSesion.Provider value={{ estado, sesion: sesion ?? null, error, salir }}>{children}</ContextoSesion.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion)
  if (!valor) throw new Error('useSesion fuera de ProveedorSesion')
  return valor
}
