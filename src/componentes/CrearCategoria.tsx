import { CircleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { obtenerDatos } from '../datos/almacen'
import { actualizarCategoria, crearCategoria } from '../datos/operaciones'
import { categoriasParecidas, type CategoriaParecida, type MotivoParecido } from '../datos/parecidas'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { registrar } from '../lib/registro'
import type { Naturaleza } from '../lib/tipos'
import { Aviso } from './Encabezado'
import { Baldosa } from './Icono'
import { ICONO_POR_DEFECTO } from './iconos'
import { Segmentado } from './Interfaz'

const TEXTO_MOTIVO: Record<MotivoParecido, string> = { igual: 'Igual', parecido: 'Parecida', sinonimo: 'Puede ser lo mismo' }

/** Aviso con las categorías parecidas que ya existen; con onUsar, cada una se puede elegir */
export function ListaParecidas({ parecidas, onUsar }: { parecidas: CategoriaParecida[]; onUsar?: (p: CategoriaParecida) => void }) {
  const db = useDatos()
  if (!parecidas.length) return null
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-[#C93400] dark:text-[#FF9F0A]">
        <CircleAlert className="size-4" strokeWidth={2} /> Ya {parecidas.length === 1 ? 'existe una parecida' : 'existen parecidas'}
      </p>
      <ul className="lista divide-y divide-zinc-200/70 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {parecidas.slice(0, 5).map((p) => {
          const raiz = p.categoria.padre_id ? db.categorias.find((c) => c.id === p.categoria.padre_id) : p.categoria
          const contenido = (
            <>
              <Baldosa icono={raiz?.icono ?? null} color={p.categoria.color ?? raiz?.color ?? '#8E8E93'} tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{p.ruta}</span>
                <span className="block text-[12px] text-zinc-500">
                  {TEXTO_MOTIVO[p.motivo]}
                  {!p.categoria.activa && ', desactivada'}
                </span>
              </span>
              {onUsar && <span className="shrink-0 text-[15px] text-marca-700 dark:text-marca-500">Usar esta</span>}
            </>
          )
          return (
            <li key={p.categoria.id}>
              {onUsar ? (
                <button type="button" className="fila min-h-12 w-full active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => onUsar(p)}>
                  {contenido}
                </button>
              ) : (
                <div className="fila min-h-12">{contenido}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Crear una categoría sin salir de lo que se está haciendo (al categorizar un movimiento). Antes de
 * crearla avisa de las parecidas que ya existen y permite usar una de ellas; la igual en el mismo nivel
 * no se puede crear. Devuelve la categoría creada o elegida.
 */
export function FormCrearCategoria({
  nombreInicial,
  padreInicial,
  onListo,
  onCancelar,
}: {
  nombreInicial: string
  padreInicial: string | null
  onListo: (id: string) => void
  onCancelar: () => void
}) {
  const db = useDatos()
  const [nombre, setNombre] = useState(nombreInicial)
  const [padre, setPadre] = useState<string>(padreInicial ?? '')
  const [naturaleza, setNaturaleza] = useState<Naturaleza>('gasto')
  const [error, setError] = useState<string | null>(null)
  const raices = useMemo(() => db.categorias.filter((c) => !c.padre_id && c.activa).sort((a, b) => a.orden - b.orden), [db.categorias])
  const parecidas = useMemo(() => categoriasParecidas(db, nombre), [db, nombre])
  const n = nombre.trim()
  // La misma en el mismo nivel no se puede crear (se usa la que hay)
  const repetida = parecidas.find((p) => p.motivo === 'igual' && p.categoria.padre_id === (padre || null) && p.categoria.nombre.toLowerCase() === n.toLowerCase())

  const usar = async (p: CategoriaParecida) => {
    if (!p.categoria.activa) {
      const e = await intentar((d) => actualizarCategoria(d, p.categoria.id, { activa: true }), 'Categoría reactivada')
      if (e) return setError(e)
    }
    onListo(p.categoria.id)
  }

  const crear = async () => {
    setError(null)
    const padreId = padre || null
    const e = await intentar(
      (d) => crearCategoria(d, { nombre: n, padre_id: padreId, naturaleza, icono: padreId ? null : ICONO_POR_DEFECTO }),
      'Categoría creada',
    )
    if (e) return setError(e)
    const nueva = obtenerDatos().categorias.find((c) => c.padre_id === padreId && c.nombre.toLowerCase() === n.toLowerCase())
    registrar('info', 'Categoría creada al categorizar', { subcategoria: !!padreId, parecidas: parecidas.length })
    if (nueva) onListo(nueva.id)
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="etiqueta">Nombre</span>
        <input className="campo" value={nombre} maxLength={60} placeholder="Por ejemplo, Videojuegos" onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label className="block">
        <span className="etiqueta">Dentro de</span>
        <select className="campo" value={padre} onChange={(e) => setPadre(e.target.value)}>
          <option value="">Ninguna: categoría principal</option>
          {raices.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </label>
      {!padre && (
        <Segmentado
          etiqueta="Gasto o ingreso"
          opciones={[
            ['gasto', 'Gasto'],
            ['ingreso', 'Ingreso'],
          ]}
          valor={naturaleza}
          onCambio={setNaturaleza}
        />
      )}
      <ListaParecidas parecidas={parecidas} onUsar={usar} />
      {repetida && <Aviso>Ya existe «{repetida.ruta}». Úsala en lugar de crear otra igual.</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      <div className="flex gap-2">
        <button type="button" className="boton-secundario flex-1" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="boton-primario flex-1" disabled={n.length < 2 || !!repetida} onClick={crear}>
          {parecidas.length ? 'Crear igualmente' : 'Crear y usar'}
        </button>
      </div>
    </div>
  )
}
