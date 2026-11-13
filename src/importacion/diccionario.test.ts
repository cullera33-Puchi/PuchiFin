import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { claveComercio, normalizarConcepto } from '../lib/conceptos'
import { clasificar } from './reglas'

const db = datosIniciales()
const ruta = (id: string | null) => {
  const c = db.categorias.find((x) => x.id === id)
  const p = c?.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : undefined
  return c ? (p ? `${p.nombre} > ${c.nombre}` : c.nombre) : null
}
const categoria = (concepto: string, importe = -10) => {
  const texto = normalizarConcepto(concepto)
  return ruta(clasificar({ texto, clave: claveComercio(concepto), cuenta_id: db.cuentas[0].id, importe }, db.reglas).categoria_id)
}

// Conceptos inventados con la forma de los de BBVA (comercio, población y país)
const CASOS: [string, string][] = [
  ['MERCADONA AV DEL PUERTO VALENCIA ES', 'Alimentación > Supermercado'],
  ['LIDL 1234 GANDIA ES', 'Alimentación > Supermercado'],
  ['FRUTERIA EL HUERTO', 'Alimentación > Mercado y tiendas'],
  ['MCDONALDS 523', 'Restaurantes > Comida rápida y a domicilio'],
  ['GLOVO 8FJ2K MADRID', 'Restaurantes > Comida rápida y a domicilio'],
  ['TELEPIZZA', 'Restaurantes > Comida rápida y a domicilio'],
  ['RESTAURANTE LA PERLA', 'Restaurantes > Restaurantes'],
  ['PIZZERIA NAPOLI', 'Restaurantes > Restaurantes'],
  ['CAFETERIA LUNA', 'Restaurantes > Cafeterías'],
  ['STARBUCKS COFFEE', 'Restaurantes > Cafeterías'],
  ['PUB EL FARO', 'Restaurantes > Bares y copas'],
  ['CINESA DIAGONAL', 'Ocio > Cine y espectáculos'],
  ['TICKETMASTER SPAIN', 'Ocio > Cine y espectáculos'],
  ['CASA DEL LIBRO', 'Ocio > Cultura'],
  ['BASIC FIT SPAIN', 'Ocio > Deporte'],
  ['PLAYTOMIC', 'Ocio > Deporte'],
  ['NETFLIX.COM', 'Suscripciones > Netflix'],
  ['DISNEY PLUS', 'Suscripciones > Disney+'],
  ['HBO MAX', 'Suscripciones > HBO Max'],
  ['AMAZON PRIME*2K4L1', 'Suscripciones > Amazon Prime'],
  ['PRIME VIDEO', 'Suscripciones > Amazon Prime'],
  ['SPOTIFY P2A3B4', 'Suscripciones > Spotify'],
  ['CLAUDE.AI SUBSCRIPTION', 'Suscripciones > Claude'],
  ['ANTHROPIC', 'Suscripciones > Claude'],
  ['PlayStation Network', 'Suscripciones > PlayStation'],
  ['SONY INTERACTIVE ENTERTAINMENT', 'Suscripciones > PlayStation'],
  ['NINTENDO ESHOP', 'Suscripciones > Nintendo'],
  ['AMAZON.ES MKTPLACE', 'Compras > Hogar'],
  ['APPLE.COM/BILL', 'Suscripciones > Otras plataformas'],
  ['REPSOL ESTACION DE SERVICIO', 'Transporte > Combustible'],
  ['BALLENOIL', 'Transporte > Combustible'],
  ['EMPARK APARCAMIENTOS', 'Transporte > Aparcamiento'],
  ['NORAUTO', 'Transporte > Mantenimiento del coche'],
  ['METROVALENCIA', 'Transporte > Transporte público'],
  ['FARMACIA LOPEZ', 'Salud > Farmacia'],
  ['CLINICA DENTAL SONRISA', 'Salud > Consultas'],
  ['ZARA', 'Compras > Ropa'],
  ['MEDIA MARKT', 'Compras > Tecnología'],
  ['IKEA VALENCIA', 'Compras > Hogar'],
  ['RECIBO IBERDROLA CLIENTES', 'Suministros > Luz'],
  ['RECIBO DIGI SPAIN TELECOM', 'Suministros > Fibra y móvil'],
  ['RECIBO MAPFRE SEGUROS', 'Seguros > Otros'],
  ['LINEA DIRECTA ASEGURADORA', 'Seguros > Coche'],
  ['AYUNTAMIENTO DE VALENCIA MULTA', 'Impuestos > Otros'],
]

describe('diccionario de comercios de la app', () => {
  it.each(CASOS)('%s → %s', (concepto, esperada) => {
    expect(categoria(concepto)).toBe(esperada)
  })

  it('las plataformas mandan sobre la regla general de Amazon', () => {
    expect(categoria('AMAZON PRIME')).toBe('Suscripciones > Amazon Prime')
    expect(categoria('AMAZON')).toBe('Compras > Hogar')
  })
})
