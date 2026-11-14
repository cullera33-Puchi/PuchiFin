import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useHacer } from '../../componentes/acciones'
import { Hoja, Interruptor } from '../../componentes/Interfaz'
import { fijarSinConceptos, guardarPlantillaClaude } from '../../datos/operaciones'
import { useDatos } from '../../datos/ProveedorDatos'
import { CLAVES_PLANTILLA, instrucciones, MAX_PLANTILLA, plantillaCambiada, PLANTILLAS, sinConceptos } from '../../lib/plantillas'
import type { ClavePlantilla } from '../../lib/tipos'

/**
 * Ajustes de «Analizar con Claude» (apartado 11, v0.35.0): enviar sin comercios y lo que se le pide a
 * Claude en cada vista. La app pone siempre el periodo y los datos; aquí solo cambia la petición.
 */
export function AjustesClaude() {
  const db = useDatos()
  const hacer = useHacer()
  const sin = sinConceptos(db)
  const [editando, setEditando] = useState<ClavePlantilla | null>(null)
  return (
    <div className="space-y-6">
      <section>
        <h3 className="cabecera-grupo">Privacidad</h3>
        <div className="lista fila min-h-12">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px]">Enviar sin comercios</span>
            <span className="block text-[12px] text-zinc-500">Claude recibe solo categorías e importes, en el texto y en el CSV del detalle.</span>
          </span>
          <Interruptor etiqueta="Enviar sin comercios" activo={sin} onCambio={(v) => hacer((d) => fijarSinConceptos(d, v), v ? 'Se enviará sin comercios' : 'Se enviará con comercios')} />
        </div>
        <p className="mt-1.5 px-4 text-[12px] text-zinc-500">
          Nunca salen cuentas, saldos de una cuenta concreta, notas ni nombres de personas: todo parte de los datos ya anonimizados.
        </p>
      </section>
      <section>
        <h3 className="cabecera-grupo">Lo que se pide a Claude</h3>
        <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {CLAVES_PLANTILLA.map((k) => (
            <li key={k}>
              <button className="fila min-h-14 w-full text-left active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setEditando(k)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{PLANTILLAS[k].titulo}</span>
                  <span className="block truncate text-[12px] text-zinc-500">{PLANTILLAS[k].donde}</span>
                </span>
                {plantillaCambiada(db, k) && <span className="shrink-0 text-[13px] text-zinc-500">Cambiada</span>}
                <ChevronRight className="size-4 shrink-0 text-zinc-400" />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 px-4 text-[12px] text-zinc-500">La app añade siempre el periodo y los datos. Aquí cambias solo las preguntas.</p>
      </section>
      <HojaPlantilla clave={editando} onCerrar={() => setEditando(null)} />
    </div>
  )
}

function HojaPlantilla({ clave, onCerrar }: { clave: ClavePlantilla | null; onCerrar: () => void }) {
  const db = useDatos()
  const hacer = useHacer()
  // El borrador se reinicia al abrir otra plantilla (ajuste durante el render, sin efecto)
  const [abiertaCon, setAbiertaCon] = useState<ClavePlantilla | null>(null)
  const [texto, setTexto] = useState('')
  if (clave && clave !== abiertaCon) {
    setAbiertaCon(clave)
    setTexto(instrucciones(db, clave))
  }
  const cerrar = () => {
    setAbiertaCon(null)
    onCerrar()
  }
  const p = clave ? PLANTILLAS[clave] : null
  const guardar = async () => {
    if (clave && (await hacer((d) => guardarPlantillaClaude(d, clave, texto), `${PLANTILLAS[clave].titulo}: guardada`))) cerrar()
  }
  const restablecer = async () => {
    if (clave && (await hacer((d) => guardarPlantillaClaude(d, clave, null), `${PLANTILLAS[clave].titulo}: la de la app`))) cerrar()
  }
  return (
    <Hoja abierta={!!clave} titulo={p?.titulo ?? ''} onCerrar={cerrar}>
      {p && clave && (
        <div className="space-y-4">
          <p className="text-[13px] text-zinc-500">Se usa en {p.donde}. Escribe lo que quieres que Claude haga con tus datos, una petición por línea.</p>
          <textarea
            className="campo min-h-48 rounded-xl border-0 bg-zinc-100/70 px-4 py-3 text-[15px] leading-snug dark:bg-zinc-800/50"
            aria-label={`Plantilla: ${p.titulo}`}
            maxLength={MAX_PLANTILLA}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button className="boton-primario w-full" onClick={guardar}>
            Guardar
          </button>
          {(plantillaCambiada(db, clave) || texto.trim() !== p.porDefecto) && (
            <button className="boton-texto w-full" onClick={plantillaCambiada(db, clave) ? restablecer : () => setTexto(p.porDefecto)}>
              Volver a la de la app
            </button>
          )}
        </div>
      )}
    </Hoja>
  )
}
