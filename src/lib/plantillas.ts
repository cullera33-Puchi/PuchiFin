/**
 * Plantillas de «Analizar con Claude» (apartado 11, v0.35.0): lo que se le pide a Claude en cada vista.
 * El usuario puede cambiarlas en Ajustes, Analizar con Claude; las que no cambia usan las de la app. La
 * cabecera con el periodo y los datos los pone siempre la app: la plantilla es solo la petición.
 */
import type { BaseDatos, ClavePlantilla } from './tipos'

export const MAX_PLANTILLA = 2000

export const PLANTILLAS: Record<ClavePlantilla, { titulo: string; donde: string; porDefecto: string }> = {
  mes: {
    titulo: 'Análisis del mes',
    donde: 'Extracto',
    porDefecto: [
      '1. Qué categorías se desvían de mi media y por qué puede ser.',
      '2. Si mi tasa de ahorro es razonable y qué la mejoraría.',
      '3. Tres medidas concretas para el mes que viene, con el ahorro estimado de cada una.',
    ].join('\n'),
  },
  informe: {
    titulo: 'Comparativa con el periodo anterior',
    donde: 'Informes, por mes o por año',
    porDefecto: [
      '1. Dónde ha subido o bajado el gasto y qué lo explica.',
      '2. Comercios en los que gasto más de lo razonable.',
      '3. Qué recortar, con el ahorro anual estimado de cada medida.',
    ].join('\n'),
  },
  presupuesto: {
    titulo: 'Desviaciones de presupuesto',
    donde: 'Presupuesto',
    porDefecto: [
      '1. Qué categorías tienen un presupuesto poco realista, por arriba o por abajo, frente a lo que gasto.',
      '2. Cómo repartirías el presupuesto para ahorrar más sin que sea imposible de cumplir.',
      '3. En qué categorías me desvío de forma repetida y qué hacer.',
    ].join('\n'),
  },
  recurrentes: {
    titulo: 'Gastos recurrentes y suscripciones',
    donde: 'Gastos fijos, Optimizar con Claude',
    porDefecto: [
      '1. Suscripciones duplicadas o que quizá no uso.',
      '2. Luz, agua, fibra y móvil, y seguros: compáralos con ofertas actuales en España y dime si me conviene cambiar.',
      '3. Qué recortar, con el ahorro anual estimado de cada medida, de más a menos ahorro.',
      '4. Subidas de precio recientes que conviene reclamar o renegociar.',
    ].join('\n'),
  },
  plan: {
    titulo: 'Plan de pagos',
    donde: 'Plan de pagos',
    porDefecto: [
      '1. Si la proyección es realista con mi ahorro mensual.',
      '2. Cómo adelantar el año en que queda saldada sin quedarme sin colchón.',
      '3. Qué riesgos ves (gastos anuales, imprevistos) y cómo cubrirlos.',
    ].join('\n'),
  },
}

export const CLAVES_PLANTILLA = Object.keys(PLANTILLAS) as ClavePlantilla[]

/** La petición de una vista: la del usuario si la ha cambiado; si no, la de la app */
export function instrucciones(db: BaseDatos, clave: ClavePlantilla): string {
  const propia = db.ajustes.claude?.plantillas?.[clave]?.trim()
  return propia || PLANTILLAS[clave].porDefecto
}

export const plantillaCambiada = (db: BaseDatos, clave: ClavePlantilla) => !!db.ajustes.claude?.plantillas?.[clave]?.trim()

/** Sin conceptos: no salen comercios ni conceptos, solo categorías e importes */
export const sinConceptos = (db: BaseDatos) => !!db.ajustes.claude?.sin_conceptos
