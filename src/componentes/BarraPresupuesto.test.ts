import { describe, expect, it } from 'vitest'
import { textoEstado } from './BarraPresupuesto'

const sin = (s: string) => s.replace(/\s/g, ' ')

describe('cómo va un presupuesto, en pocas palabras', () => {
  it('lo que queda descuenta los recibos que faltan', () => {
    expect(sin(textoEstado({ presupuesto: 360, gastado: 172, comprometido: 0, cierre: 300, estado: 'dentro' }))).toBe('Quedan 188 €')
    expect(sin(textoEstado({ presupuesto: 190, gastado: 79, comprometido: 60, cierre: 150, estado: 'dentro' }))).toBe('Quedan 51 €')
    expect(sin(textoEstado({ presupuesto: 190, gastado: 79, comprometido: 60, cierre: 150, estado: 'dentro' }, true))).toBe('Quedan 51 €, descontados los recibos que faltan (60 €)')
  })

  it('justo, camino de pasarse y superado', () => {
    expect(textoEstado({ presupuesto: 440, gastado: 440, comprometido: 0, cierre: 440, estado: 'dentro' })).toBe('Justo')
    expect(sin(textoEstado({ presupuesto: 360, gastado: 300, comprometido: 0, cierre: 420, estado: 'riesgo' }))).toBe('Cerrarás en 420 €')
    expect(sin(textoEstado({ presupuesto: 360, gastado: 300, comprometido: 0, cierre: 420, estado: 'riesgo' }, true))).toBe('Cerrarás en unos 420 €, 60 € por encima')
    expect(sin(textoEstado({ presupuesto: 50, gastado: 70, comprometido: 0, cierre: 90, estado: 'superado' }))).toBe('Superado en 20 €')
  })

  it('en un mes cerrado, lo que sobró', () => {
    expect(sin(textoEstado({ presupuesto: 360, gastado: 300, comprometido: 0, cierre: null, estado: 'dentro' }))).toBe('Sobraron 60 €')
  })
})
