import { Copy, Share, Sparkles } from 'lucide-react'
import { compartirArchivo, copiarTexto } from '../lib/compartir'
import { enlaceClaude } from '../lib/optimizar'
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
  onCerrar: () => void
}) {
  const { avisar } = useInterfaz()
  const abrirClaude = async () => {
    await copiarTexto(texto)
    registrar('info', `${registro}: abierto en Claude`)
    window.open(enlaceClaude(texto), '_blank', 'noopener')
  }
  return (
    <Hoja abierta={abierta} titulo={titulo} listo="Listo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-[15px] text-zinc-600 dark:text-zinc-400">{explicacion} Se usa tu suscripción de Claude, sin coste en la app. Solo salen categorías, comercios e importes.</p>
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
