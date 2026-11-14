import { Briefcase, CalendarClock, ChevronRight, HandCoins, Landmark, SlidersHorizontal, Tags, Target, Wand2, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BarraNavegacion, Encabezado } from '../../componentes/Encabezado'
import { Baldosa } from '../../componentes/Icono'
import { useDatos } from '../../datos/ProveedorDatos'
import { formatearRedondo, plural } from '../../lib/formato'
import { APP_VERSION } from '../../lib/version'

type Glifo = typeof Landmark

interface Opcion {
  a: string
  texto: string
  glifo: Glifo
  color: string
  detalle?: string
}

/**
 * Ajustes al estilo del iPhone (v0.26.0): una lista agrupada con un apartado por fila. Cada uno abre su
 * pantalla, que vuelve a Ajustes con «‹ Ajustes» o deslizando.
 */
export function Ajustes() {
  const db = useDatos()
  const nominas = db.ajustes.nominas ?? []
  const presupuesto = db.presupuestos.reduce((s, p) => s + p.importe_mensual, 0)
  const deuda = db.compromisos.find((c) => c.activo)
  const grupos: { titulo: string; opciones: Opcion[] }[] = [
    {
      titulo: 'Datos',
      opciones: [
        { a: '/ajustes/cuentas', texto: 'Cuentas', glifo: Landmark, color: '#007AFF', detalle: String(db.cuentas.filter((c) => c.activa).length) },
        { a: '/ajustes/categorias', texto: 'Categorías', glifo: Tags, color: '#FF9500', detalle: String(db.categorias.filter((c) => c.activa && !c.padre_id).length) },
        { a: '/ajustes/reglas', texto: 'Reglas de categorización', glifo: Wand2, color: '#5856D6', detalle: String(db.reglas.filter((r) => r.activa).length) },
      ],
    },
    {
      titulo: 'Planificación',
      opciones: [
        { a: '/extracto/ingresos', texto: 'Nóminas e ingresos', glifo: Briefcase, color: '#34C759', detalle: nominas.length ? String(nominas.length) : undefined },
        { a: '/extracto/presupuesto', texto: 'Presupuesto', glifo: Target, color: '#30B0C7', detalle: presupuesto ? `${formatearRedondo(presupuesto)} al mes` : undefined },
        { a: '/extracto/previstos', texto: 'Gastos previstos', glifo: CalendarClock, color: '#FF2D55', detalle: db.eventos_previstos.length ? String(db.eventos_previstos.length) : undefined },
        ...(deuda ? [{ a: '/extracto/plan', texto: 'Plan de pagos', glifo: HandCoins, color: '#AF52DE', detalle: deuda.deuda_inicial ? undefined : 'Sin configurar' }] : []),
      ],
    },
    {
      titulo: 'App',
      opciones: [
        { a: '/ajustes/general', texto: 'General', glifo: SlidersHorizontal, color: '#8E8E93' },
        { a: '/ajustes/herramientas', texto: 'Copias, archivo y herramientas', glifo: Wrench, color: '#8E8E93' },
      ],
    },
  ]
  return (
    <>
      <Encabezado titulo="Ajustes" />
      <div className="space-y-6">
        {grupos.map((g) => (
          <section key={g.titulo}>
            <h3 className="cabecera-grupo">{g.titulo}</h3>
            <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {g.opciones.map((o) => (
                <li key={o.a}>
                  <Link to={o.a} state={{ atras: 'Ajustes' }} className="fila min-h-12 active:bg-zinc-100 dark:active:bg-zinc-800">
                    <Baldosa glifo={o.glifo} color={o.color} tamano="sm" />
                    <span className="min-w-0 flex-1 truncate text-[17px]">{o.texto}</span>
                    {o.detalle && <span className="shrink-0 text-[15px] text-zinc-500 tabular-nums">{o.detalle}</span>}
                    <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-center text-[13px] text-zinc-500">
          PuchiFin {APP_VERSION}. {plural(db.movimientos.length, 'movimiento', 'movimientos')}, solo en este iPhone.
        </p>
      </div>
    </>
  )
}

/** Pantalla de un apartado de Ajustes: barra con «‹ Ajustes» y su contenido */
export function PaginaAjuste({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <>
      <BarraNavegacion titulo={titulo} atras="Ajustes" inicio="/ajustes" />
      {children}
    </>
  )
}
