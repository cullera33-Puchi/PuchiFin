// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CLAVE_REGISTRO,
  MAX_ENTRADAS,
  borrarRegistro,
  entradasRegistro,
  recuperarRegistro,
  registrar,
  sanearDescripcion,
  textoRegistro,
} from './registro'

beforeEach(() => {
  borrarRegistro()
})

describe('registro', () => {
  it('guarda las entradas en el dispositivo', () => {
    registrar('info', 'Copia diaria hecha', { movimientos: 120 })
    const guardado = JSON.parse(localStorage.getItem(CLAVE_REGISTRO) ?? '[]')
    expect(guardado).toHaveLength(1)
    expect(guardado[0]).toMatchObject({ l: 'info', m: 'Copia diaria hecha', x: '{"movimientos":120}' })
  })

  it('conserva como máximo las últimas 400 entradas', () => {
    for (let i = 0; i < MAX_ENTRADAS + 25; i++) registrar('info', `evento ${i}`)
    const e = entradasRegistro()
    expect(e).toHaveLength(MAX_ENTRADAS)
    expect(e[0].m).toBe('evento 25')
  })

  it('enmascara IBAN, tarjetas y DNI aunque se cuelen en un mensaje', () => {
    registrar('error', 'Fila rechazada ES91 2100 0418 4502 0005 1332', 'tarjeta 4111 1111 1111 1111')
    const texto = textoRegistro()
    expect(texto).not.toContain('2100 0418')
    expect(texto).not.toContain('4111 1111 1111')
    expect(texto).toContain('1332')
  })

  it('el texto lleva cabecera con la versión y una línea por entrada', () => {
    registrar('aviso', 'Algo raro')
    const [cabecera, linea] = textoRegistro('movimientos 10').split('\n')
    expect(cabecera).toMatch(/^PuchiFin v\d+\.\d+\.\d+ \|/)
    expect(cabecera).toContain('movimientos 10')
    expect(linea).toMatch(/\[aviso\] Algo raro$/)
  })

  it('se puede deshacer el borrado sin perder lo anotado después', () => {
    registrar('info', 'a')
    const antes = borrarRegistro()
    registrar('info', 'b')
    recuperarRegistro(antes)
    expect(entradasRegistro().map((e) => e.m)).toEqual(['a', 'b'])
  })
})

describe('registro sin datos personales y sin ruido', () => {
  it('quita comercios, importes y categorías de las descripciones de los cambios', () => {
    expect(sanearDescripcion('Comercio Zeta: se queda en Restaurantes, Cafeterías')).toBe('Mejora de categoría descartada')
    expect(sanearDescripcion('7 movimientos: Hijos, Cuidado')).toBe('7 movimientos: categoría cambiada')
    expect(sanearDescripcion('3 cargos de 12,99 €: Ocio, Juegos')).toBe('3 cargos de (importe): categoría cambiada')
    expect(sanearDescripcion('Jardinería. Regla creada para las próximas')).toBe('Categoría elegida. Regla creada para las próximas')
    expect(sanearDescripcion('Tipo: Pago de deuda')).toBe('Tipo cambiado')
    expect(sanearDescripcion('Copia diaria guardada en el dispositivo')).toBe('Copia diaria guardada en el dispositivo')
  })

  it('agrupa lo mismo repetido seguido en una entrada con recuento', () => {
    registrar('info', 'Fuera del extracto')
    registrar('info', 'Fuera del extracto')
    registrar('info', 'Fuera del extracto')
    registrar('info', 'Otra cosa')
    const e = entradasRegistro()
    expect(e.map((x) => [x.m, x.n])).toEqual([
      ['Fuera del extracto', 3],
      ['Otra cosa', undefined],
    ])
    expect(textoRegistro()).toContain('Fuera del extracto (×3)')
  })
})
