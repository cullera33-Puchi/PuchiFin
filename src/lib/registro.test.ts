// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CLAVE_REGISTRO,
  MAX_ENTRADAS,
  borrarRegistro,
  entradasRegistro,
  recuperarRegistro,
  registrar,
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
