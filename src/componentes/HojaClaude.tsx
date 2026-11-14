import { Copy, FileSpreadsheet, Share, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDatos } from '../datos/ProveedorDatos'
import { compartirArchivo, copiarTexto, descargar } from '../lib/compartir'
import { csvMovimientos, lineaDetalle, type DetalleClaude } from '../lib/csvClaude'
import { plural } from '../lib/formato'
import { enlaceClaude } from '../lib/optimizar'
import { sinConceptos } from '../lib/plantillas'
import { registrar } from '../lib/registro'
import { Hoja, useInterfaz } from './Interfaz'

/**
 * Texto preparado para Claude: se ve antes de enviarlo y se copia, se comparte o se abre en claude.ai.
 * Sin API ni coste: el análisis se hace con la suscripción del usuario. El texto ya llega anonimizado.
 */
export function HojaClaude({
  abierta,
  titulo,
  explicacion,
  texto,
  archivo,
  registro,
  detalle,
  onCerrar,
}: {
  abierta: boolean
  titulo: string
  explicacion: string
  texto: string
  /** Nombre del archivo al compartir */
  archivo: string
  /** Nombre de la vista en el registro (sin datos) */
  registro: string
  /** Movimientos de la vista para enviarlos en CSV con el texto (apartado 11, v0.35.0) */
  detalle?: DetalleClaude
  onCerrar: () => void
}) {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const sin = sinConceptos(db)
  const n = detalle?.movimientos.length ?? 0
  // Detalle completo: el CSV por la hoja de compartir (a la app de Claude) con el texto. El texto se copia
  // antes, por si la app de destino no lo recoge; sin hoja de compartir, se descarga el CSV
  const enviarDetalle = async () => {
    if (!detalle || !n) return
    const conDetalle = `${texto}\n\n${lineaDetalle(db, n)}`
    const csv = csvMovimientos(db, detalle.movimientos)
    await copiarTexto(conDetalle)
    try {
      const archivoCsv = new File([csv], detalle.archivo, { type: 'text/csv' })
      if (navigator.canShare?.({ files: [archivoCsv], text: conDetalle })) {
        await navigator.share({ files: [archivoCsv], text: conDetalle, title: titulo })
        registrar('info', `${registro}: detalle compartido`, { movimientos: n, sinConceptos: sin })
        return
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      registrar('aviso', `${registro}: no se pudo compartir el detalle: ${(e as Error)?.message ?? e}`)
    }
    descargar(new Blob([csv], { type: 'text/csv' }), detalle.archivo)
    registrar('info', `${registro}: detalle descargado`, { movimientos: n, sinConceptos: sin })
    avisar('CSV descargado y texto copiado: adjunta el CSV en Claude y pega el texto')
  }
  const abrirClaude = async () => {
    await copiarTexto(texto)
    registrar('info', `${registro}: abierto en Claude`)
    window.open(enlaceClaude(texto), '_blank', 'noopener')
  }
  return (
    <Hoja abierta={abierta} titulo={titulo} listo="Listo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-[15px] text-zinc-600 dark:text-zinc-400">
          {explicacion} Se usa tu suscripción de Claude, sin coste en la app. {sin ? 'Solo salen categorías e importes, sin comercios.' : 'Solo salen categorías, comercios e importes.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="boton-primario" onClick={abrirClaude}>
            <Sparkles className="size-4" strokeWidth={2} /> Abrir en Claude
          </button>
          <button
            className="boton-secundario"
            onClick={async () => {
              const ok = await copiarTexto(texto)
              registrar('info', `${registro}: copiado`)
              avisar(ok ? 'Copiado. Pégalo en el chat con Claude' : 'No se ha podido copiar')
            }}
          >
            <Copy className="size-4" strokeWidth={2} /> Copiar
          </button>
          <button className="boton-secundario" onClick={() => compartirArchivo(new Blob([texto], { type: 'text/plain' }), archivo, titulo)}>
            <Share className="size-4" strokeWidth={2} /> Compartir
          </button>
        </div>
        {n > 0 && (
          <div className="lista space-y-2 px-4 py-3">
            <button className="boton-secundario w-full" onClick={enviarDetalle}>
              <FileSpreadsheet className="size-4" strokeWidth={2} /> Enviar con el detalle
            </button>
            <p className="text-[12px] text-zinc-500">
              Añade un CSV con {plural(n, 'movimiento', 'movimientos')} ({sin ? 'fecha, cuenta, categoría, tipo e importe' : 'fecha, cuenta, concepto, categoría, tipo e importe'}). Elige Claude en la hoja de compartir; el texto
              queda copiado por si no aparece escrito.
            </p>
          </div>
        )}
        <Link to="/ajustes/claude" state={{ atras: 'Ajustes' }} className="block text-[13px] text-marca-700 dark:text-marca-500" onClick={onCerrar}>
          Cambiar lo que se pide a Claude o enviar sin comercios
        </Link>
        <p className="text-xs text-zinc-500">«Abrir en Claude» también lo copia: si el chat no aparece escrito, pégalo. Esto es exactamente lo que se envía:</p>
        <pre className="max-h-72 overflow-auto rounded-xl bg-zinc-100 p-3 font-mono text-[11px] leading-snug whitespace-pre-wrap select-text dark:bg-zinc-800">{texto}</pre>
      </div>
    </Hoja>
  )
}

/** Botón «Analizar con Claude» de las vistas */
export function BotonClaude({ onPulsar, texto = 'Analizar con Claude' }: { onPulsar: () => void; texto?: string }) {
  return (
    <button className="boton-secundario w-full" onClick={onPulsar}>
      <Sparkles className="size-4" strokeWidth={2} /> {texto}
    </button>
  )
}
