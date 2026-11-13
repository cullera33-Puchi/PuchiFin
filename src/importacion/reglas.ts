/**
 * Reglas de categorización (apartado 5) y sugerencias.
 * Orden en cada importación:
 *   1. Reglas manuales (creadas por el usuario al corregir), por prioridad.
 *   2. Aprendidas: si el mismo concepto ya se categorizó a mano, se repite la categoría.
 *   3. Reglas de la app (origen «sistema»): comercios y recibos habituales.
 *   4. Sin coincidencia: sin categoría, a la bandeja.
 * Las reglas de sugerencia (hoy, el pago de la deuda familiar) nunca se aplican solas: aparecen en la
 * revisión para confirmarlas o descartarlas. Los gastos de empleado y reembolsos los marca el usuario.
 */
import { claveComercio, claveConImporte, esPasarela, normalizarConcepto, primeraPalabra } from '../lib/conceptos'
import type { BaseDatos, Categoria, Movimiento, Regla, TipoMovimiento } from '../lib/tipos'

interface ReglaBase {
  nombre: string
  patron: string // expresión regular sobre el concepto normalizado (minúsculas, sin acentos)
  ruta?: string // "Categoría > Subcategoría"
  tipo?: TipoMovimiento
  sugerencia?: boolean
  signo?: 'gasto' | 'ingreso'
  prioridad?: number
  /** A fin de mes, cuenta en el mes siguiente */
  mesSiguiente?: boolean
}

/** Reglas de la app de versiones anteriores que ya no existen: se quitan del dispositivo al actualizar */
export const REGLAS_RETIRADAS = ['Reembolso de la empresa', 'Viajes de trabajo: alojamiento', 'Viajes de trabajo: transporte', 'PayPal']

const REGLAS_BASE: ReglaBase[] = [
  { nombre: 'Liquidación de tarjeta', patron: '\\b(liquidacion|liq)\\b.*\\btarj|\\bpago\\b.*\\btarjeta (de )?credito\\b|\\bcargo\\b.*\\btarjeta\\b|\\badeudo mensual de tarjeta\\b', tipo: 'traspaso_interno', signo: 'gasto', prioridad: 10 },
  { nombre: 'Abono de la liquidación en la tarjeta', patron: '\\b(liquidacion|liq)\\b.*\\btarj|\\babono\\b.*\\bliquidacion\\b|\\b(rebut|recibo) (del )?mes anterior\\b', tipo: 'traspaso_interno', signo: 'ingreso', prioridad: 10 },
  { nombre: 'Fraccionamiento de gastos', patron: '\\babono por fraccionamiento\\b|\\babono capital prestamo\\b', tipo: 'traspaso_interno', signo: 'ingreso', prioridad: 12 },
  { nombre: 'Operación financiada', patron: '\\boperaci(on|o) financ?(i)?ada\\b', tipo: 'traspaso_interno', prioridad: 12 },
  { nombre: 'Traspaso desde la tarjeta', patron: '\\b(abo|abono) por traspaso desde\\b|\\btraspaso (a|desde) tarjeta\\b|\\bingres des de compte\\b', tipo: 'traspaso_interno', prioridad: 12 },
  { nombre: 'Traspaso entre cuentas', patron: '^traspaso\\b|\\btraspaso (a|de|desde) (cuenta|cta)\\b', tipo: 'traspaso_interno', prioridad: 15 },
  { nombre: 'Nómina', patron: '\\b(nomina|pension)\\b', ruta: 'Ingresos > Nómina', signo: 'ingreso', prioridad: 20, mesSiguiente: true },
  { nombre: 'Pago a la familia', patron: '\\b(transferencia|transf|trf|bizum)\\b.*\\bfamilia\\b', tipo: 'pago_deuda', sugerencia: true, signo: 'gasto', prioridad: 30 },
  { nombre: 'Alojamiento', patron: '\\b(camping|campings|hotel|hoteles|nh|melia|ac hotel|booking|hostal|hostel|ibis|airbnb|expedia|hotels com|vrbo|parador|paradores|barcelo|iberostar|riu|hesperia|catalonia hotels|eurostars|apartamentos)\\b', ruta: 'Viajes > Alojamiento', signo: 'gasto' },
  { nombre: 'Transporte de viaje', patron: '\\b(tfl|renfe|ouigo|iryo|iberia|vueling|ryanair|air europa|easyjet|volotea|binter|transavia|air nostrum|blablacar|balearia|trasmed|aena|aeropuerto)\\b', ruta: 'Viajes > Transporte', signo: 'gasto' },
  { nombre: 'Actividades de viaje', patron: '\\b(civitatis|getyourguide|tiqets|freetour)\\b', ruta: 'Viajes > Actividades', signo: 'gasto' },
  { nombre: 'Taxi y VTC', patron: '\\b(taxi|taxis|cabify|uber|ubr|bolt|freenow|free now)\\b|\\blicencia\\b.*\\btransporte\\b', ruta: 'Transporte > Taxi y VTC', signo: 'gasto', prioridad: 90 },
  { nombre: 'Efectivo', patron: '\\bret\\.? ?efectivo\\b|\\bretirada de efectivo\\b|\\breintegro\\b|\\bcajero aut', ruta: 'Efectivo > Retiradas de cajero', signo: 'gasto', prioridad: 95 },
  { nombre: 'Peluquería y estética', patron: '\\b(peluqueria|perruqueria|barberia|barber|estetica|centro de estetica|manicura|nails|depilacion)\\b', ruta: 'Cuidado personal > Peluquería y estética', signo: 'gasto' },
  { nombre: 'Perfumería', patron: '\\b(perfumeria|druni|primor|sephora|douglas|rituals|kiko|clarel|bodybell|marionnaud|beauty by dia)\\b', ruta: 'Cuidado personal > Perfumería y cosmética', signo: 'gasto', prioridad: 80 },
  { nombre: 'Masajes', patron: '\\b(masaje|masajes|massatge|spa|balneario|wellness)\\b', ruta: 'Cuidado personal > Masajes y bienestar', signo: 'gasto' },
  { nombre: 'Veterinario', patron: '\\b(veterinari|veterinario|veterinaria)\\b', ruta: 'Mascotas > Veterinario', signo: 'gasto', prioridad: 80 },
  { nombre: 'Tiendas de mascotas', patron: '\\b(kiwoko|tiendanimal|zooplus|miscota)\\b', ruta: 'Mascotas > Comida y accesorios', signo: 'gasto' },
  { nombre: 'Estudios', patron: '\\b(universitat|universidad|uoc|uned|gestio academica|gestion academica|matricula)\\b', ruta: 'Formación > Estudios', signo: 'gasto', prioridad: 80 },
  { nombre: 'Cursos', patron: '\\b(domestika|udemy|coursera|platzi|linkedin learning|masterclass|duolingo|babbel)\\b', ruta: 'Formación > Cursos y plataformas', signo: 'gasto', prioridad: 80 },
  { nombre: 'Hipoteca', patron: '\\b(prestamo hipotecario|hipoteca|prestamo)\\b', ruta: 'Vivienda > Hipoteca', signo: 'gasto', mesSiguiente: true },
  { nombre: 'Comunidad', patron: '\\b(comunidad|comunidad de propietarios|cdad prop)\\b', ruta: 'Vivienda > Comunidad', signo: 'gasto' },
  { nombre: 'IBI', patron: '\\b(ibi|impuesto bienes inmuebles|tasa basura|tasa residuos|recaudacion municipal|adeudo de impuestos|basuras)\\b', ruta: 'Impuestos > IBI y tasas', signo: 'gasto', prioridad: 90 },
  { nombre: 'Seguro de hogar', patron: '\\bseguro (de )?hogar\\b|\\bmultirriesgo hogar\\b', ruta: 'Vivienda > Seguro de hogar', signo: 'gasto', prioridad: 85 },
  { nombre: 'Mantenimiento del hogar', patron: '\\b(cerrajeria|serralleria|fontanero|fontaneria|electricista|cerrajero|reformas|pintor|lampista)\\b', ruta: 'Vivienda > Mantenimiento y reformas', signo: 'gasto' },
  { nombre: 'Luz', patron: '\\b(energia electrica|iberdrola|endesa|naturgy|holaluz|electricidad|totalenergies|octopus energy|octopus|lucera|som energia|factor energia|curenergia|energia xxi|edp|repsol luz|gas natural|nedgia)\\b', ruta: 'Suministros > Luz', signo: 'gasto' },
  { nombre: 'Agua', patron: '\\b(aguas?|aigues|agbar|aqualia|canal de isabel|canal isabel|emivasa|emasesa|emaya|global omnium)\\b', ruta: 'Suministros > Agua', signo: 'gasto' },
  { nombre: 'Fibra y móvil', patron: '\\b(pepe mobile|pepemobile|movistar|vodafone|orange|digi|o2|yoigo|fibra|telefonica|masmovil|pepephone|lowi|simyo|jazztel|finetwork|avatel|adamo|euskaltel|r cable|telecable|amena)\\b', ruta: 'Suministros > Fibra y móvil', signo: 'gasto' },
  { nombre: 'Gasolinera bonÀrea', patron: '\\b(guissona|bon ?area)\\b.*\\btransporte\\b|\\bbonarea car pay\\b|\\barea de guissona\\b', ruta: 'Transporte > Combustible', signo: 'gasto', prioridad: 70 },
  { nombre: 'Supermercado', patron: '\\b(carref|guissona|bon area|plus fresc|opencor|tesco|sainsbury s|condis|casa ametller|ametller origen|supermercat|cash fresh|mercadona|consum|lidl|carrefour|alcampo|eroski|aldi|dia|hipercor|supercor|caprabo|bonpreu|condis|bonarea|ametller|esclat|sorli|spar|coviran|keisy|charter|plusfresc|masymas|bm supermercados|gadis|froiz|ahorramas|hiperdino|supersol|simply|el arbol|lupa|family cash|alimerka|vegalsa|costco|makro|supermercado|supermercat|hiper|hipermercado)\\b', ruta: 'Alimentación > Supermercado', signo: 'gasto' },
  { nombre: 'Mercado y tiendas', patron: '\\b(fruteria|fruiteria|carniceria|carnisseria|panaderia|mercado|mercat|pescaderia|peixateria|xarcuteria|charcuteria|queseria|herbolario|ultramarinos|alimentacion|verduleria|polleria)\\b', ruta: 'Alimentación > Mercado y tiendas', signo: 'gasto' },
  { nombre: 'Comida rápida y a domicilio', patron: '\\b(mc donald s|mc donald|mcdonald|udon|enrique tomas|vips|mcdonalds|mc donalds|mcdonald s|burger king|kfc|telepizza|dominos|domino s|pizza hut|papa johns|five guys|taco bell|subway|popeyes|tgb|the good burger|just eat|glovo|uber eats|deliveroo|foodoo|100 montaditos|montaditos)\\b', ruta: 'Restaurantes > Comida rápida y a domicilio', signo: 'gasto', prioridad: 80 },
  { nombre: 'Cafeterías', patron: '\\b(faborit|caffe nero|haagen dazs|haeagen dazs|vending|365|fleca|orxateria|xocolateria|brunch|dunkin coffee|santagloria|granier|cafeteria|cafe|cafes|coffee|horno|forn|starbucks|granja|xurreria|churreria|pastisseria|pasteleria|heladeria|gelateria|dunkin|granier|panaria|rodilla|santagloria|pans company|costa coffee|tim hortons|manolo bakes)\\b', ruta: 'Restaurantes > Cafeterías', signo: 'gasto', prioridad: 95 },
  { nombre: 'Bares y copas', patron: '\\b(pub|cocteleria|coctel|discoteca|vermuteria|copas|cerveceria|cerveseria)\\b', ruta: 'Restaurantes > Bares y copas', signo: 'gasto', prioridad: 97 },
  { nombre: 'Restaurantes', patron: '\\b(ssp|eurest|fonda|yakisake|sushisom|kebab|doner|rest|restaurante|restaurant|rte|bar|pizzeria|pizza|taberna|sushi|burger|meson|asador|braseria|marisqueria|arroceria|pulperia|sidreria|trattoria|ristorante|wok|ramen|kebab|taqueria|tacos|creperia|hamburgueseria|tapes|tapas|bodega|vips|ginos|foster s|goiko|la tagliatella|lizarran|casa lucio)\\b', ruta: 'Restaurantes > Restaurantes', signo: 'gasto', prioridad: 98 },
  { nombre: 'Ocio', patron: '\\b(tixalia|entrapolis|teatre|auditori|cines?|yelmo|cinesa|kinepolis|ocine|odeon|teatro|teatre|ticketmaster|entradas|entrades|eventbrite|fever|concierto|concert|festival|atrapalo)\\b', ruta: 'Ocio > Cine y espectáculos', signo: 'gasto' },
  { nombre: 'Librerías', patron: '\\b(national gallery|museum|gallery|llibres|libreria|llibreria|casa del libro|abacus|museo|museu|exposicion)\\b', ruta: 'Ocio > Cultura', signo: 'gasto' },
  { nombre: 'Deporte', patron: '\\b(club deportivo|club esportiu|guies muntanya|piscines|gimnasio|gym|basic fit|mcfit|vivagym|altafit|holmes place|go fit|padel|playtomic|piscina|polideportivo|club de tenis|crossfit|yoga|pilates)\\b', ruta: 'Ocio > Deporte', signo: 'gasto' },
  { nombre: 'Juegos y apuestas', patron: '\\b(loterias|loteria|apuestas|bet365|codere|sportium|game stop|gamestop)\\b', ruta: 'Ocio > Juegos', signo: 'gasto' },
  { nombre: 'Planes y salidas', patron: '\\b(pista gel|pista de gel|camping park|parc d atraccions|bolera|karting|parque de atracciones|port aventura|portaventura|zoo|aquarium|oceanografic|escape room|tibidabo|warner|bioparc)\\b', ruta: 'Ocio > Planes y salidas', signo: 'gasto' },
  { nombre: 'Netflix', patron: '\\b(netflix)\\b', ruta: 'Suscripciones > Netflix', signo: 'gasto', prioridad: 80 },
  { nombre: 'Disney+', patron: '\\b(disney|disneyplus|disney plus)\\b', ruta: 'Suscripciones > Disney+', signo: 'gasto', prioridad: 80 },
  { nombre: 'HBO Max', patron: '\\b(hbo|hbomax|hbo max|max com)\\b', ruta: 'Suscripciones > HBO Max', signo: 'gasto', prioridad: 80 },
  { nombre: 'Amazon Prime', patron: '\\b(amazon|amzn) (prime|digital|video)\\b|\\bprime ?video\\b|\\bamazon prm\\b', ruta: 'Suscripciones > Amazon Prime', signo: 'gasto', prioridad: 80 },
  { nombre: 'Spotify', patron: '\\b(spotify)\\b', ruta: 'Suscripciones > Spotify', signo: 'gasto', prioridad: 80 },
  { nombre: 'Claude', patron: '\\b(claude|claude ai|anthropic)\\b', ruta: 'Suscripciones > Claude', signo: 'gasto', prioridad: 80 },
  { nombre: 'PlayStation', patron: '\\b(playstation|play station|ps store|psn|sony interactive|sony entertainment)\\b', ruta: 'Suscripciones > PlayStation', signo: 'gasto', prioridad: 80 },
  { nombre: 'Nintendo', patron: '\\b(nintendo)\\b', ruta: 'Suscripciones > Nintendo', signo: 'gasto', prioridad: 80 },
  { nombre: 'Plataformas', patron: '\\b(apple com|itunes|youtube|dazn|movistar plus|filmin|skyshowtime|atresplayer|crunchyroll|audible|twitch|xbox|steam|google play)\\b', ruta: 'Suscripciones > Otras plataformas', signo: 'gasto', prioridad: 90 },
  { nombre: 'Software', patron: '\\b(telegram|icloud|google one|google storage|dropbox|microsoft 365|office 365|microsoft|adobe|chatgpt|openai|github|notion|canva)\\b', ruta: 'Suscripciones > Software', signo: 'gasto', prioridad: 90 },
  { nombre: 'Colegio profesional', patron: '\\b(colegio profesional|col legi oficial|colegio oficial)\\b', ruta: 'Suscripciones > Cuotas', signo: 'gasto', prioridad: 70 },
  { nombre: 'Cuotas', patron: '\\b(cuota socio|cuota de socio|afiliacion|asociacion|colegio oficial)\\b', ruta: 'Suscripciones > Cuotas', signo: 'gasto' },
  { nombre: 'Combustible', patron: '\\b(benzinera|eess|cedipsa|petrol|carburants|e s|gasolinera|estacion de servicio|estacion servicio|repsol|cepsa|galp|bp|shell|gasolinera|ballenoil|plenoil|petronor|avia|petroprix|esclatoil|meroil|disa|carburantes|moeve)\\b', ruta: 'Transporte > Combustible', signo: 'gasto' },
  { nombre: 'Aparcamiento', patron: '\\b(aparc|pk|bsm|blinkay|barnaparking|parquing|estacionament|zona regulada|z regulada|regulada|parking|aparcamiento|aparcament|aparca|ora|saba|empark|interparking|telpark|easypark|elparking|parkia|zona azul)\\b', ruta: 'Transporte > Aparcamiento', signo: 'gasto' },
  { nombre: 'Peajes', patron: '\\b(aucat|ute explotacion|tunelspan|tunels|autopistes|peaje|autopista|autopistas|ap 7|via t|abertis|audasa|aucat|bip drive)\\b', ruta: 'Transporte > Peajes', signo: 'gasto', prioridad: 60 },
  { nombre: 'Transporte público', patron: '\\b(metro|emt|metrovalencia|tmb|bus|cercanias|fgc|fgv|alsa|avanza|tram|tranvia|bicing|valenbisi|bicimad|t mobilitat|monbus|lime|dott)\\b', ruta: 'Transporte > Transporte público', signo: 'gasto' },
  { nombre: 'Mantenimiento del coche', patron: '\\b(tallers|applus|iteuve|taller|talleres|neumaticos|norauto|feu vert|midas|euromaster|itv|lavado|elefante azul|recambios|autolavado)\\b', ruta: 'Transporte > Mantenimiento del coche', signo: 'gasto' },
  { nombre: 'Colegio', patron: '\\b(ausolan|serunion|menjador|comedor escolar|colegio|escola|escuela infantil|guarderia|escoleta|ampa|afa)\\b', ruta: 'Hijos > Colegio', signo: 'gasto' },
  { nombre: 'Extraescolares', patron: '\\b(escuela de musica|academia|extraescolar|extraescolares|conservatorio|campus|casal|campamento)\\b', ruta: 'Hijos > Extraescolares', signo: 'gasto' },
  { nombre: 'Farmacia', patron: '\\b(farmacia|parafarmacia|dosfarma|promofarma)\\b', ruta: 'Salud > Farmacia', signo: 'gasto' },
  { nombre: 'Seguro médico', patron: '\\b(seguro medico|sanitas|adeslas|asisa|dkv|mapfre salud|cigna)\\b', ruta: 'Salud > Seguro médico', signo: 'gasto', prioridad: 85 },
  { nombre: 'Consultas', patron: '\\b(clinica|dental|dentista|fisioterapia|fisio|optica|opticas|general optica|multiopticas|afflelou|hospital|quiron|vithas|hm hospitales|psicologo|psicologa|podologo|laboratorio|analisis clinicos|medico)\\b', ruta: 'Salud > Consultas', signo: 'gasto' },
  { nombre: 'Ropa', patron: '\\b(pepe jeans|mng|sprinter|primark|cortefiel|pull and bear|zara|primark|mango|h m|pull bear|pull and bear|massimo dutti|decathlon|zeeman|tezenis|calzedonia|intimissimi|lefties|stradivarius|bershka|oysho|kiabi|springfield|cortefiel|uniqlo|sfera|women secret|womens secret|skechers|foot locker|jd sports|nike|adidas|shein|zalando|vinted|asos|desigual|el ganso|scalpers|levis)\\b', ruta: 'Compras > Ropa', signo: 'gasto' },
  { nombre: 'H&M', patron: '^hm\\b(?! hospitales)', ruta: 'Compras > Ropa', signo: 'gasto' },
  { nombre: 'Tecnología', patron: '\\b(media markt|mediamarkt|fnac|pc componentes|pccomponentes|apple store|worten|xiaomi|phone house|backmarket|back market)\\b', ruta: 'Compras > Tecnología', signo: 'gasto' },
  { nombre: 'Regalos', patron: '\\b(wanapix|myposter|jugueteria|juguetes|toys|imaginarium|floristeria|flores|interflora|smartbox|wonderbox)\\b', ruta: 'Compras > Regalos', signo: 'gasto' },
  { nombre: 'Compras online', patron: '\\b(pepco|bazar|tintoreria|wallapop|normal stores|flying tiger|amazon|amzn|aliexpress|el corte ingles|ikea|leroy merlin|bauhaus|brico depot|bricomart|conforama|maisons du monde|zara home|jysk|tiger|temu)\\b', ruta: 'Compras > Hogar', signo: 'gasto', prioridad: 100 },
  { nombre: 'Seguro del coche', patron: '\\bseguro (del )?coche\\b|\\b(linea directa|mutua madrilena|verti|genesis|qualitas|regal)\\b', ruta: 'Seguros > Coche', signo: 'gasto', prioridad: 85 },
  { nombre: 'Seguro de vida', patron: '\\bseguro (de )?vida\\b', ruta: 'Seguros > Vida', signo: 'gasto', prioridad: 85 },
  { nombre: 'Servicio Fnac', patron: '\\bfnac pack\\b', ruta: 'Suscripciones > Cuotas', signo: 'gasto', prioridad: 80 },
  { nombre: 'Seguros', patron: '\\b(estarseguro|heymondo|mapfre|axa|allianz|generali|zurich|reale|pelayo|santalucia|ocaso|catalana occidente|mutua|seguro|seguros)\\b', ruta: 'Seguros > Otros', signo: 'gasto', prioridad: 90 },
  { nombre: 'Bonificaciones del banco', patron: '\\b(bonificacion|abono bonificacion|cashback)\\b', ruta: 'Ingresos > Otros ingresos', signo: 'ingreso' },
  { nombre: 'Comisiones', patron: '\\b(com ret efec|comissio|comision traspaso|comision|comisiones|mantenimiento cuenta|cuota tarjeta|cuota anual)\\b', ruta: 'Comisiones e intereses > Comisiones bancarias', signo: 'gasto' },
  { nombre: 'Intereses de tarjeta', patron: '\\b(intereses)\\b', ruta: 'Comisiones e intereses > Intereses de tarjeta', signo: 'gasto' },
  { nombre: 'Impuestos', patron: '\\b(aeat|hacienda|irpf|agencia tributaria)\\b', ruta: 'Impuestos > IRPF', signo: 'gasto' },
  { nombre: 'Tasas y multas', patron: '\\b(servei catala de transit|sancions|dni pasaporte|administraciones publicas|embargos|ayuntamiento|ajuntament|dgt|multa|multas|generalitat|diputacion|tributs|notaria|registro de la propiedad)\\b', ruta: 'Impuestos > Otros', signo: 'gasto' },
]

/** Reglas de la app, con las categorías del catálogo de este dispositivo (se omiten las que no existan) */
export function reglasPredeterminadas(categorias: Categoria[], creada = new Date().toISOString()): Regla[] {
  const porRuta = new Map<string, string>()
  for (const c of categorias) {
    const p = c.padre_id ? categorias.find((x) => x.id === c.padre_id) : undefined
    porRuta.set((p ? `${p.nombre} > ${c.nombre}` : c.nombre).toLowerCase(), c.id)
  }
  return REGLAS_BASE.flatMap((r): Regla[] => {
    const categoria_id = r.ruta ? porRuta.get(r.ruta.toLowerCase()) ?? null : null
    if (r.ruta && !categoria_id && !r.tipo) return []
    return [
      {
        id: crypto.randomUUID(),
        nombre: r.nombre,
        patron: r.patron,
        tipo_patron: 'regex',
        cuenta_id: null,
        importe_min: r.signo === 'ingreso' ? 0.01 : null,
        importe_max: r.signo === 'gasto' ? -0.01 : null,
        categoria_id,
        tipo_movimiento: r.tipo ?? null,
        es_sugerencia: !!r.sugerencia,
        prioridad: r.prioridad ?? 100,
        origen: 'sistema',
        activa: true,
        confirmaciones: 0,
        descartes: 0,
        mes_siguiente: !!r.mesSiguiente,
        created_at: creada,
      },
    ]
  })
}

/** Lo que se compara con las reglas: el texto completo normalizado y la clave del comercio */
export interface TextoRegla {
  texto: string
  clave: string
  cuenta_id: string
  importe: number
}

/** Expresiones ya compiladas: se revisan cientos de movimientos contra decenas de reglas */
const EXPRESIONES = new Map<string, RegExp | null>()
function expresion(patron: string): RegExp | null {
  if (!EXPRESIONES.has(patron)) {
    try {
      EXPRESIONES.set(patron, new RegExp(patron, 'i'))
    } catch {
      EXPRESIONES.set(patron, null)
    }
  }
  return EXPRESIONES.get(patron)!
}

export function coincide(r: Regla, m: TextoRegla): boolean {
  if (!r.activa) return false
  if (r.cuenta_id && r.cuenta_id !== m.cuenta_id) return false
  if (r.importe_min !== null && m.importe < r.importe_min) return false
  if (r.importe_max !== null && m.importe > r.importe_max) return false
  switch (r.tipo_patron) {
    case 'regex': {
      const re = expresion(r.patron)
      return !!re && re.test(m.texto)
    }
    case 'exacto': {
      const p = normalizarConcepto(r.patron)
      return m.clave === p || m.texto === p
    }
    case 'empieza':
      return m.clave.startsWith(normalizarConcepto(r.patron)) || m.texto.startsWith(normalizarConcepto(r.patron))
    default:
      return m.texto.includes(normalizarConcepto(r.patron))
  }
}

export interface Aprendidas {
  /** Clave del comercio (en PayPal, con el importe) → categoría elegida a mano más recientemente */
  porClave: Map<string, string>
  /** Primera palabra del comercio → categoría, solo si todas sus claves coinciden */
  porPalabra: Map<string, string>
  /** Comercios que se han pasado a mano al mes siguiente */
  mesSiguiente: Set<string>
}

/** Lo aprendido de las correcciones a mano, en cualquier cuenta */
export function categoriasAprendidas(db: BaseDatos): Aprendidas {
  const m = new Map<string, { categoria: string; fecha: string }>()
  const mesSiguiente = new Set<string>()
  for (const mov of db.movimientos) {
    const base = claveComercio(mov.concepto_limpio)
    if (!base) continue
    if (mov.mes_imputacion && mov.mes_imputacion > mov.fecha_operacion.slice(0, 7)) mesSiguiente.add(base)
    if (!mov.categoria_id || (mov.origen_categoria !== 'manual' && mov.origen_categoria !== 'aprendida')) continue
    // En PayPal se aprende por importe: cada cargo puede ser de una cosa distinta
    const clave = claveConImporte(base, mov.importe)
    const prev = m.get(clave)
    if (!prev || mov.fecha_operacion >= prev.fecha) m.set(clave, { categoria: mov.categoria_id, fecha: mov.fecha_operacion })
  }
  const porClave = new Map([...m].map(([k, v]) => [k, v.categoria]))
  const palabras = new Map<string, Set<string>>()
  for (const [k, c] of porClave) {
    if (esPasarela(k)) continue
    const p = primeraPalabra(k)
    if (p) palabras.set(p, (palabras.get(p) ?? new Set()).add(c))
  }
  const porPalabra = new Map([...palabras].filter(([, cs]) => cs.size === 1).map(([p, cs]) => [p, [...cs][0]]))
  return { porClave, porPalabra, mesSiguiente }
}

export interface Sugerencia {
  tipo: TipoMovimiento
  motivo: string
  regla_id: string | null
  /** De 0 a 1. En la revisión, las de 0,75 o más vienen aceptadas y el resto sin aceptar */
  confianza: number
}

export interface Clasificacion {
  categoria_id: string | null
  tipo: TipoMovimiento
  regla_id: string | null
  origen_categoria: Movimiento['origen_categoria']
  sugerencia: Sugerencia | null
  /** La regla o lo aprendido dicen que, a fin de mes, cuenta en el mes siguiente */
  mes_siguiente: boolean
}

const VACIAS: Aprendidas = { porClave: new Map(), porPalabra: new Map(), mesSiguiente: new Set() }

/** Clasifica un movimiento nuevo con las reglas y lo aprendido */
export function clasificar(m: TextoRegla, reglas: Regla[], aprendidas: Aprendidas = VACIAS): Clasificacion {
  const ordenadas = [...reglas].filter((r) => r.activa).sort((a, b) => a.prioridad - b.prioridad)
  const res: Clasificacion = { categoria_id: null, tipo: 'normal', regla_id: null, origen_categoria: null, sugerencia: null, mes_siguiente: aprendidas.mesSiguiente.has(m.clave) }

  const aplicar = (r: Regla) => {
    if (r.tipo_movimiento && res.tipo === 'normal' && !res.categoria_id) res.tipo = r.tipo_movimiento
    if (r.categoria_id && !res.categoria_id) res.categoria_id = r.categoria_id
    res.regla_id ??= r.id
    if (res.categoria_id) res.origen_categoria = 'regla'
    if (r.mes_siguiente) res.mes_siguiente = true
  }

  // 1. Reglas manuales
  const manual = ordenadas.find((r) => !r.es_sugerencia && r.origen !== 'sistema' && coincide(r, m))
  if (manual) aplicar(manual)
  // 2. Reglas de la app que cambian el tipo (traspasos, liquidación de la tarjeta): mandan sobre lo aprendido
  if (!manual) {
    const tipo = ordenadas.find((r) => !r.es_sugerencia && r.origen === 'sistema' && r.tipo_movimiento && !r.categoria_id && coincide(r, m))
    if (tipo) aplicar(tipo)
  }
  // 3. Aprendidas: el mismo comercio o, si no, uno que empieza igual
  if (!res.categoria_id && res.tipo === 'normal') {
    const p = esPasarela(m.clave) ? null : primeraPalabra(m.clave)
    const aprendida = aprendidas.porClave.get(claveConImporte(m.clave, m.importe)) ?? (p ? aprendidas.porPalabra.get(p) : undefined)
    if (aprendida) {
      res.categoria_id = aprendida
      res.origen_categoria = 'aprendida'
    }
  }
  // 4. Reglas de la app
  if (!res.categoria_id && res.tipo === 'normal') {
    const sistema = ordenadas.find((r) => !r.es_sugerencia && r.origen === 'sistema' && coincide(r, m))
    if (sistema) aplicar(sistema)
  } else if (res.categoria_id && !res.mes_siguiente) {
    // Aunque la categoría venga de lo aprendido, la regla de la app puede decir que es de fin de mes (nómina)
    const sistema = ordenadas.find((r) => !r.es_sugerencia && r.origen === 'sistema' && r.mes_siguiente && coincide(r, m))
    if (sistema) res.mes_siguiente = true
  }
  // Sugerencias: solo si el movimiento sigue siendo normal
  if (res.tipo === 'normal') {
    const s = ordenadas.find((r) => r.es_sugerencia && coincide(r, m))
    if (s && s.tipo_movimiento) res.sugerencia = { tipo: s.tipo_movimiento, motivo: s.nombre ?? 'Regla', regla_id: s.id, confianza: 0.9 }
  }
  return res
}
