import { useEffect, useState } from 'react'
import { FileText, FlaskConical } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Aviso, Encabezado, Proximamente } from '../componentes/Encabezado'
import { formatearFecha, formatearImporte } from '../lib/formato'
import { contarDatosPrueba } from '../lib/datosPruebaSupabase'
import { mensajeError, supabase } from '../lib/supabase'
import type { Ajustes, Compromiso } from '../lib/tipos'

interface Resumen {
  cuentas: number
  categorias: number
  subcategorias: number
  movimientos: number
  prueba: number
  ajustes: Ajustes | null
  deuda: Compromiso | null
}

async function cargarResumen(): Promise<Resumen> {
  const contar = async (tabla: string, filtro?: (q: any) => any) => {
    let q = supabase.from(tabla).select('*', { count: 'exact', head: true })
    if (filtro) q = filtro(q)
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  }
  const [cuentas, categorias, subcategorias, movimientos, ajustes, deuda, prueba] = await Promise.all([
    contar('cuentas', (q) => q.eq('activa', true)),
    contar('categorias', (q) => q.is('padre_id', null)),
    contar('categorias', (q) => q.not('padre_id', 'is', null)),
    contar('movimientos'),
    supabase.from('ajustes').select('*').maybeSingle(),
    supabase.from('compromisos').select('*').eq('activo', true).limit(1).maybeSingle(),
    contarDatosPrueba(),
  ])
  if (ajustes.error) throw ajustes.error
  if (deuda.error) throw deuda.error
  return { cuentas, categorias, subcategorias, movimientos, prueba, ajustes: ajustes.data, deuda: deuda.data }
}

export function Extracto() {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cargarResumen().then(setResumen, (e) => setError(mensajeError(e)))
  }, [])

  return (
    <>
      <Encabezado
        titulo="Extracto"
        subtitulo="Ingresos, gastos y ahorro del mes"
        accion={
          <Link to="/resumenes" className="boton-secundario">
            <FileText className="size-4" /> Resúmenes
          </Link>
        }
      />
      {error && <Aviso>{error}</Aviso>}
      {!!resumen?.prueba && (
        <div className="mb-4">
          <Aviso tipo="info">
            <span className="flex flex-wrap items-center gap-2">
              <FlaskConical className="size-4 text-amber-600" /> Hay {resumen.prueba} movimientos de prueba.
              <Link to="/ajustes/herramientas" className="font-medium text-marca-700 underline dark:text-marca-500">
                Gestionarlos
              </Link>
            </span>
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Proximamente fase={3}>
          El extracto mensual se activa cuando haya movimientos importados (fase 2) y llega completo en la fase 3:
          cabecera de ingresos, gastos y tasa de ahorro, desglose por categoría y comparativa con la media.
        </Proximamente>

        <section className="tarjeta">
          <h2 className="mb-3 text-sm font-semibold">Estado de la base</h2>
          {!resumen ? (
            <p className="text-sm text-zinc-500">Cargando…</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Dato etiqueta="Cuentas activas" valor={resumen.cuentas} a="/ajustes/cuentas" />
              <Dato
                etiqueta="Categorías"
                valor={`${resumen.categorias} (${resumen.subcategorias} subcategorías)`}
                a="/ajustes/categorias"
              />
              <Dato etiqueta="Movimientos" valor={resumen.movimientos} />
              {resumen.ajustes && (
                <Dato etiqueta="Fecha de inicio" valor={formatearFecha(resumen.ajustes.fecha_inicio)} a="/ajustes/general" />
              )}
              {resumen.deuda && (
                <Dato
                  etiqueta={resumen.deuda.nombre}
                  valor={`${formatearImporte(resumen.deuda.deuda_inicial)} a ${formatearFecha(resumen.deuda.fecha_referencia)}`}
                />
              )}
            </dl>
          )}
        </section>
      </div>
    </>
  )
}

function Dato({ etiqueta, valor, a }: { etiqueta: string; valor: string | number; a?: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{etiqueta}</dt>
      <dd className="font-medium tabular-nums">
        {a ? (
          <Link to={a} className="hover:text-marca-700 hover:underline">
            {valor}
          </Link>
        ) : (
          valor
        )}
      </dd>
    </div>
  )
}
