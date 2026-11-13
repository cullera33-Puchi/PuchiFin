/**
 * Antes de crear una categoría, las que ya existen con un nombre igual o parecido: sin acentos ni
 * plurales, con una errata, con una palabra en común, una dentro de otra o sinónimos habituales
 * («Gasolina» y «Combustible», «Gimnasio» y «Deporte»). Así no se duplican categorías.
 */
import type { BaseDatos, Categoria } from '../lib/tipos'

export type MotivoParecido = 'igual' | 'parecido' | 'sinonimo'

export interface CategoriaParecida {
  categoria: Categoria
  /** «Ocio > Juegos» */
  ruta: string
  motivo: MotivoParecido
}

/** Palabras que no distinguen una categoría de otra */
const VACIAS = new Set(['y', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'por', 'a', 'otros', 'otras', 'otro', 'otra', 'varios', 'gastos', 'pagos'])

/** Grupos de palabras que suelen querer decir lo mismo en una categoría de gastos o ingresos */
const SINONIMOS: string[][] = [
  ['gasolina', 'combustible', 'carburante', 'gasolinera', 'diesel'],
  ['gimnasio', 'gym', 'deporte', 'fitness', 'deportes'],
  ['videojuego', 'juego', 'gaming', 'consola'],
  ['streaming', 'plataforma', 'suscripcion', 'netflix'],
  ['ropa', 'moda', 'vestir', 'calzado', 'zapato'],
  ['farmacia', 'medicamento', 'parafarmacia'],
  ['medico', 'consulta', 'salud', 'dentista', 'clinica'],
  ['colegio', 'escuela', 'educacion', 'formacion', 'estudio', 'curso', 'academia'],
  ['mascota', 'perro', 'gato', 'veterinario', 'veterinaria'],
  ['peluqueria', 'barberia', 'estetica', 'belleza'],
  ['regalo', 'detalle', 'cumpleano'],
  ['luz', 'electricidad', 'energia'],
  ['internet', 'fibra', 'wifi'],
  ['movil', 'telefono', 'telefonia'],
  ['cafe', 'cafeteria'],
  ['bar', 'copa', 'cerveza', 'bebida'],
  ['restaurante', 'cena', 'comida fuera', 'comer fuera'],
  ['super', 'supermercado', 'compra', 'alimentacion', 'comida'],
  ['viaje', 'vacacion', 'escapada'],
  ['hotel', 'alojamiento', 'hostal', 'apartamento'],
  ['avion', 'vuelo', 'tren'],
  ['parking', 'aparcamiento', 'garaje'],
  ['taxi', 'uber', 'cabify', 'vtc'],
  ['libro', 'lectura', 'cultura'],
  ['cine', 'pelicula', 'espectaculo', 'teatro', 'concierto'],
  ['seguro', 'poliza'],
  ['impuesto', 'tasa', 'hacienda', 'irpf', 'ibi'],
  ['hipoteca', 'prestamo', 'credito'],
  ['bricolaje', 'ferreteria', 'reforma', 'mantenimiento', 'reparacion'],
  ['electronica', 'tecnologia', 'informatica', 'ordenador'],
  ['juguete', 'nino', 'hijo', 'bebe'],
  ['comision', 'banco', 'interes'],
  ['efectivo', 'cajero', 'retirada'],
  ['nomina', 'sueldo', 'salario'],
]

const sinAcentos = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Singular sencillo: «cafeterías» a «cafeteria», «bares» a «bar», «regalos» a «regalo» */
const singular = (p: string) => (p.length > 4 && /[^aeiou]es$/.test(p) ? p.slice(0, -2) : p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p)

const palabras = (t: string) => sinAcentos(t).split(' ').filter((p) => p && !VACIAS.has(p)).map(singular)

/** Distancia de edición (erratas) */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previa = fila[0]
    fila[0] = i
    for (let j = 1; j <= b.length; j++) {
      const guardada = fila[j]
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previa + (a[i - 1] === b[j - 1] ? 0 : 1))
      previa = guardada
    }
  }
  return fila[b.length]
}

const GRUPO = new Map<string, number>()
SINONIMOS.forEach((g, i) => g.forEach((p) => GRUPO.set(singular(sinAcentos(p)), i)))

function rutaDe(db: BaseDatos, c: Categoria): string {
  const p = c.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : undefined
  return p ? `${p.nombre} > ${c.nombre}` : c.nombre
}

/** Las categorías existentes parecidas a un nombre nuevo, de la más a la menos parecida */
export function categoriasParecidas(db: BaseDatos, nombre: string): CategoriaParecida[] {
  const nuevas = palabras(nombre)
  const juntoNuevo = nuevas.join(' ')
  if (!juntoNuevo || juntoNuevo.length < 3) return []
  const res: CategoriaParecida[] = []
  for (const c of db.categorias) {
    const suyas = palabras(c.nombre)
    const juntoSuyo = suyas.join(' ')
    if (!juntoSuyo) continue
    let motivo: MotivoParecido | null = null
    if (juntoSuyo === juntoNuevo) motivo = 'igual'
    else if (
      // Una dentro de otra («Videojuegos» y «Juegos»), una errata o una palabra en común
      (juntoNuevo.length >= 4 && juntoSuyo.length >= 4 && (juntoSuyo.includes(juntoNuevo) || juntoNuevo.includes(juntoSuyo))) ||
      distancia(juntoNuevo, juntoSuyo) <= (juntoNuevo.length >= 8 ? 2 : 1) ||
      nuevas.some((p) => p.length >= 4 && suyas.some((s) => s === p || (s.length >= 5 && distancia(s, p) <= 1)))
    )
      motivo = 'parecido'
    else if (nuevas.some((p) => GRUPO.has(p) && suyas.some((s) => GRUPO.get(s) === GRUPO.get(p))) || (GRUPO.has(juntoNuevo) && GRUPO.get(juntoNuevo) === GRUPO.get(juntoSuyo)))
      motivo = 'sinonimo'
    if (motivo) res.push({ categoria: c, ruta: rutaDe(db, c), motivo })
  }
  const peso: Record<MotivoParecido, number> = { igual: 0, parecido: 1, sinonimo: 2 }
  return res.sort((a, b) => peso[a.motivo] - peso[b.motivo] || Number(b.categoria.activa) - Number(a.categoria.activa) || a.ruta.localeCompare(b.ruta, 'es'))
}
