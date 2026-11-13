import { CalendarClock, ChevronRight, Copy, Repeat, Share, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { Hoja, useInterfaz } from '../componentes/Interfaz'
import { useDatos } from '../datos/ProveedorDatos'
import { compartirArchivo, copiarTexto } from '../lib/compartir'
import { claveComercio } from '../lib/conceptos'
import { hoyIso } from '../lib/fechas'
import { formatearFecha, formatearImporte, plural } from '../lib/formato'
import { mesEfectivo } from '../lib/imputacion'
import { enlaceClaude, textoOptimizar } from '../lib/optimizar'
import { avisosRecurrentes, detectarRecurrentes, fijoYVariable, NOMBRE_PERIODICIDAD, resumenFijos, type Recurrente, type TipoAviso } from '../lib/recurrentes'
import { registrar } from '../lib/registro'
import { calcularTotales } from '../lib/resumen'
import { nombreCategoria } from '../lib/vista'

const ICONO_AVISO: Record<TipoAviso, { glifo: typeof TrendingUp; color: string }> = {
  subida: { glifo: TrendingUp, color: '#FF3B30' },
  no_llega: { glifo: TriangleAlert, color: '#FF9500' },
  nuevo: { glifo: Repeat, color: '#5856D6' },
}

/**
 * Gastos fijos y recurrentes: lo que se cobra solo cada mes, cada trimestre o cada año. Coste
 * mensual y anual, fijo frente a variable este mes, avisos, próximos cargos y optimizar con Claude.
 */
export function Fijos() {
  const db = useDatos()
  const navegar = useNavigate()
  const hoy = hoyIso()
  const recurrentes = useMemo(() => detectarRecurrentes(db), [db])
  const r = useMemo(() => resumenFijos(recurrentes, hoy), [recurrentes, hoy])
  const avisos = useMemo(() => avisosRecurrentes(db, recurrentes), [db, recurrentes])
  const mes = hoy.slice(0, 7)
  const reparto = useMemo(() => {
    const delMes = db.movimientos.filter((m) => mesEfectivo(m) === mes)
    const gastos = calcularTotales(delMes, db.categorias).gastos
    const { fijo } = fijoYVariable(delMes, recurrentes)
    return { fijo, variable: Math.max(0, Math.round((gastos - fijo) * 100) / 100) }
  }, [db, mes, recurrentes])
  const [verBajas, setVerBajas] = useState(false)
  const [optimizar, setOptimizar] = useState(false)
  const bajas = recurrentes.filter((x) => !x.activo)
  const abrir = (x: Recurrente) => navegar(`/movimientos?q=${encodeURIComponent(claveComercio(x.nombre) || x.clave)}`)

  return (
    <>
      <BarraNavegacion titulo="Gastos fijos" atras="Informes" subtitulo={r.activos.length ? plural(r.activos.length, 'cargo recurrente', 'cargos recurrentes') : undefined} />
      {!recurrentes.length ? (
        <p className="tarjeta text-center text-[15px] text-zinc-500">Aún no hay cargos que se repitan. Con tres meses de datos aparecen los recibos y las suscripciones.</p>
      ) : (
        <div className="space-y-4">
          <section className="tarjeta">
            <p className="text-[13px] text-zinc-500">Lo que se cobra solo</p>
            <p className="text-[28px] leading-tight font-bold tabular-nums">{formatearImporte(r.alMes)} al mes</p>
            <p className="text-[13px] text-zinc-500 tabular-nums">{formatearImporte(r.alAno)} al año</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                <span className="block text-zinc-500">Fijo este mes</span>
                <span className="text-[17px] font-semibold tabular-nums">{formatearImporte(reparto.fijo)}</span>
              </div>
              <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                <span className="block text-zinc-500">Variable este mes</span>
                <span className="text-[17px] font-semibold tabular-nums">{formatearImporte(reparto.variable)}</span>
              </div>
            </div>
            <button className="boton-primario mt-3 w-full" onClick={() => setOptimizar(true)}>
              <Sparkles className="size-4" strokeWidth={2} /> Optimizar con Claude
            </button>
          </section>

          {avisos.length > 0 && (
            <section>
              <h3 className="cabecera-grupo">Avisos</h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {avisos.map((a) => {
                  const i = ICONO_AVISO[a.tipo]
                  return (
                    <li key={`${a.tipo}|${a.clave}`} className="fila">
                      <Baldosa glifo={i.glifo} color={i.color} tamano="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{a.nombre}</span>
                        <span className="block text-[12px] text-zinc-500">{a.texto}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {r.proximos.length > 0 && (
            <section>
              <h3 className="cabecera-grupo">Próximos 30 días</h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {r.proximos.map((x) => (
                  <li key={x.clave} className="fila">
                    <Baldosa glifo={CalendarClock} color="#007AFF" tamano="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{x.nombre}</span>
                      <span className="block text-[12px] text-zinc-500">Hacia el {formatearFecha(x.proxima)}</span>
                    </span>
                    <span className="text-[15px] tabular-nums">{x.variable ? 'unos ' : ''}{formatearImporte(x.importe)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 px-4 text-[12px] text-zinc-500">
                Total previsto: {formatearImporte(r.proximos.reduce((s, x) => s + x.importe, 0))}. Fecha estimada con los cargos anteriores.
              </p>
            </section>
          )}

          <section>
            <h3 className="cabecera-grupo">Todos los fijos</h3>
            <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {r.activos.map((x) => (
                <li key={x.clave}>
                  <button className="fila min-h-14 w-full active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => abrir(x)}>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[15px]">{x.nombre}</span>
                      <span className="block truncate text-[12px] text-zinc-500">
                        {NOMBRE_PERIODICIDAD[x.periodicidad]}, {nombreCategoria(db, x.categoria_id)}
                        {x.variable ? ', importe variable' : ''}
                      </span>
                      {x.subida && (
                        <span className="block text-[12px] text-[#D70015] dark:text-[#FF6961]">
                          Subió de {formatearImporte(x.subida.antes)} a {formatearImporte(x.subida.ahora)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[15px] tabular-nums">{formatearImporte(x.importe)}</span>
                      <span className="block text-[11px] text-zinc-500 tabular-nums">{formatearImporte(x.alAno)} al año</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {bajas.length > 0 && (
            <section>
              <button className="boton-texto px-4" onClick={() => setVerBajas((v) => !v)}>
                {verBajas ? 'Ocultar' : 'Ver'} {plural(bajas.length, 'cargo que ya no se cobra', 'cargos que ya no se cobran')}
              </button>
              {verBajas && (
                <ul className="lista mt-2 divide-y divide-zinc-200/70 dark:divide-zinc-800">
                  {bajas.map((x) => (
                    <li key={x.clave} className="fila text-zinc-500">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{x.nombre}</span>
                        <span className="block text-[12px]">Último cargo el {formatearFecha(x.ultima)}</span>
                      </span>
                      <span className="text-[15px] tabular-nums">{formatearImporte(x.importe)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <p className="px-4 text-[12px] text-zinc-500">
            Se detectan solos: cargos del mismo comercio con una periodicidad regular (mensual, cada dos meses, trimestral, semestral o anual) y un importe parecido.
          </p>
        </div>
      )}
      <HojaOptimizar abierta={optimizar} recurrentes={recurrentes} onCerrar={() => setOptimizar(false)} />
    </>
  )
}

/** Texto para Claude: se ve antes de enviarlo; copiar, compartir o abrir claude.ai */
function HojaOptimizar({ abierta, recurrentes, onCerrar }: { abierta: boolean; recurrentes: Recurrente[]; onCerrar: () => void }) {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const texto = useMemo(() => (abierta ? textoOptimizar(db, recurrentes, hoyIso()) : ''), [abierta, db, recurrentes])
  const abrirClaude = async () => {
    await copiarTexto(texto)
    registrar('info', 'Optimizar con Claude: abierto', { fijos: recurrentes.filter((r) => r.activo).length })
    window.open(enlaceClaude(texto), '_blank', 'noopener')
  }
  return (
    <Hoja abierta={abierta} titulo="Optimizar con Claude" listo="Listo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-[15px] text-zinc-600 dark:text-zinc-400">
          Claude revisa tus fijos y gastos hormiga: suscripciones que sobran, tarifas de luz, fibra y seguros mejores y qué recortar. Se usa tu suscripción de Claude, sin coste
          en la app. Solo salen comercios, categorías e importes.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="boton-primario" onClick={abrirClaude}>
            <Sparkles className="size-4" strokeWidth={2} /> Abrir en Claude
          </button>
          <button
            className="boton-secundario"
            onClick={async () => {
              const ok = await copiarTexto(texto)
              registrar('info', 'Optimizar con Claude: copiado')
              avisar(ok ? 'Copiado. Pégalo en el chat con Claude' : 'No se ha podido copiar')
            }}
          >
            <Copy className="size-4" strokeWidth={2} /> Copiar
          </button>
          <button className="boton-secundario" onClick={() => compartirArchivo(new Blob([texto], { type: 'text/plain' }), 'puchifin-gastos-fijos.txt', 'Gastos fijos para Claude')}>
            <Share className="size-4" strokeWidth={2} /> Compartir
          </button>
        </div>
        <p className="text-xs text-zinc-500">«Abrir en Claude» también lo copia: si el chat no aparece escrito, pégalo. Esto es exactamente lo que se envía:</p>
        <pre className="max-h-72 overflow-auto rounded-xl bg-zinc-100 p-3 font-mono text-[11px] leading-snug whitespace-pre-wrap select-text dark:bg-zinc-800">{texto}</pre>
      </div>
    </Hoja>
  )
}
