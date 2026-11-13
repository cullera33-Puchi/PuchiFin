import { createElement } from 'react'
import { glifoDe } from './iconos'
import type { LucideIcon } from 'lucide-react'

/** Baldosa de color con glifo blanco, al estilo de Ajustes del iPhone (catálogo en iconos.ts) */
const TAMANOS = {
  sm: { caja: 'size-7 rounded-[8px]', glifo: 'size-4' },
  md: { caja: 'size-8 rounded-[9px]', glifo: 'size-[18px]' },
  lg: { caja: 'size-10 rounded-[11px]', glifo: 'size-[22px]' },
}

export function Baldosa({
  icono,
  glifo,
  color,
  tamano = 'md',
}: {
  icono?: string | null
  glifo?: LucideIcon
  color: string | null | undefined
  tamano?: keyof typeof TAMANOS
}) {
  const t = TAMANOS[tamano]
  return (
    <span className={`grid shrink-0 place-items-center text-white ${t.caja}`} style={{ backgroundColor: color ?? '#8E8E93' }} aria-hidden="true">
      {createElement(glifo ?? glifoDe(icono), { className: t.glifo, strokeWidth: 2 })}
    </span>
  )
}
