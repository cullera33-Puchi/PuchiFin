/**
 * Recorridos principales en un iPhone simulado: arranque, datos de prueba, Extracto, Informes,
 * gestos, PayPal, presupuesto y gastos fijos, sin errores de JavaScript.
 */
import { expect, test, type Page } from '@playwright/test'

// Sin la hoja de bienvenida de la primera vez
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puchifin-bienvenida', 'visto'))
})

const errores = (p: Page) => {
  const lista: string[] = []
  p.on('pageerror', (e) => lista.push(e.message))
  return lista
}

async function conDatosDePrueba(p: Page) {
  await p.goto('/ajustes/herramientas/prueba')
  await p.getByText('Generar datos de prueba').first().click()
  await p.getByRole('button', { name: 'Generar', exact: true }).last().click()
  await expect(p.getByText(/movimientos de prueba creados/)).toBeVisible()
}

/** Deslizamiento con el dedo (eventos táctiles reales) */
async function deslizar(p: Page, x0: number, y0: number, x1: number, y1 = y0, espera = 600) {
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 12, y: y0 + ((y1 - y0) * i) / 12 }] })
    await p.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  if (espera) await p.waitForTimeout(espera)
}

test('arranca, genera datos de prueba y muestra el Extracto', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  await page.goto('/')
  // Extracto: capital en una fila, tarjeta principal del mes y categorías
  await expect(page.getByRole('link', { name: /Capital/ })).toBeVisible()
  await expect(page.getByRole('region', { name: /^Resumen de / })).toBeVisible()
  await expect(page.getByText('gastado', { exact: true })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Mes del extracto' })).toBeVisible()
  await expect(page.getByText('Gasto por categoría')).toBeVisible()
  // Cómo se calcula: la comparación con la media
  await page.getByRole('button', { name: 'Cómo se calcula' }).tap()
  await expect(page.getByText('Frente a otros meses')).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).tap()
  // Los avisos, agrupados
  await page.getByText('Cosas pendientes').tap()
  const pendiente = page.getByRole('dialog', { name: 'Pendiente' })
  await expect(pendiente).toBeVisible()
  // Los gastos fuera de lo normal son una fila más, que abre su hoja (v0.37.0)
  await pendiente.getByRole('button', { name: /fuera de lo normal/ }).tap()
  const atipicos = page.getByRole('dialog', { name: 'Fuera de lo normal' })
  await expect(atipicos.getByText(/Lo habitual aquí|Primer gasto aquí/).first()).toBeVisible()
  await atipicos.getByRole('button', { name: 'Listo' }).tap()
  await expect(atipicos).toBeHidden()
  // Ya no hay una fila propia encima: el aviso va dentro de «Cosas pendientes»
  await expect(page.getByRole('button', { name: /^\d+ gastos? fuera de lo normal/ })).toHaveCount(0)
  // Modo discreto: el ojo de arriba oculta los importes en toda la app
  await page.getByRole('button', { name: 'Ocultar las cifras' }).first().tap()
  await expect(page.getByRole('region', { name: /^Resumen de / }).getByText('•••• €').first()).toBeVisible()
  await page.locator('nav[data-pestanas] a', { hasText: 'Movimientos' }).tap()
  await expect(page.getByText('•••• €').first()).toBeVisible()
  await page.locator('nav[data-pestanas] a', { hasText: 'Extracto' }).tap()
  await page.getByRole('button', { name: 'Mostrar las cifras' }).first().tap()
  await expect(page.getByRole('region', { name: /^Resumen de / }).getByText('•••• €')).toHaveCount(0)
  // Tu posición, en su pantalla
  await page.getByRole('link', { name: /Capital/ }).tap()
  await expect(page.getByRole('region', { name: 'Tu posición' })).toBeVisible()
  // Herramientas, por apartados
  await page.goto('/ajustes/herramientas')
  await page.getByRole('link', { name: /Registro/ }).tap()
  await expect(page).toHaveURL(/\/ajustes\/herramientas\/registro$/)
  await expect(page.getByRole('button', { name: 'Herramientas' })).toBeVisible()
  expect(e).toEqual([])
})

test('las cuatro pestañas responden; deslizar no cambia de pestaña y en Ajustes vuelve atrás', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  for (const [t, ruta] of [['Movimientos', '/movimientos'], ['Informes', '/informes'], ['Ajustes', '/ajustes'], ['Extracto', '/']] as const) {
    await page.locator('nav[data-pestanas] a', { hasText: t }).tap()
    await expect(page).toHaveURL(new RegExp(`${ruta}$`))
  }
  // Entre pestañas solo con la barra: deslizar sobre Informes no cambia de pestaña ni de mes
  await page.locator('nav[data-pestanas] a', { hasText: 'Informes' }).tap()
  await expect(page.getByRole('radio', { name: 'Categorías' })).toBeVisible()
  const mes = await page.locator('[role="radiogroup"][aria-label="Periodo del informe"] [aria-checked="true"]').textContent()
  await deslizar(page, 300, 500, 40)
  await deslizar(page, 60, 500, 330)
  await expect(page).toHaveURL(/\/informes$/)
  await expect(page.locator('[role="radiogroup"][aria-label="Periodo del informe"] [aria-checked="true"]')).toHaveText(mes!)
  // Ajustes en lista: cada apartado se abre y se vuelve deslizando
  await page.locator('nav[data-pestanas] a', { hasText: 'Ajustes' }).tap()
  await page.getByRole('link', { name: /Cuentas/ }).tap()
  await expect(page).toHaveURL(/\/ajustes\/cuentas$/)
  await expect(page.getByRole('button', { name: 'Ajustes' })).toBeVisible()
  await expect(page.getByText(/Cuenta principal/).first()).toBeVisible()
  await deslizar(page, 80, 420, 340)
  await expect(page).toHaveURL(/\/ajustes$/)
  // Volver deslizando y tocar otra pestaña mientras la pantalla sale: la nueva se ve en su sitio (v0.35.1,
  // antes se quedaba en negro, con la pantalla fuera, a la derecha)
  await page.getByRole('link', { name: /Cuentas/ }).tap()
  await expect(page).toHaveURL(/\/ajustes\/cuentas$/)
  await deslizar(page, 80, 420, 340, 420, 0)
  await page.locator('nav[data-pestanas] a', { hasText: 'Movimientos' }).tap()
  await expect(page).toHaveURL(/\/movimientos$/)
  await page.waitForTimeout(500)
  expect(await page.locator('main').evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  await expect(page.getByPlaceholder(/Buscar/).first()).toBeInViewport()
  await page.locator('nav[data-pestanas] a', { hasText: 'Ajustes' }).tap()
  // Una pantalla del Extracto abierta desde Ajustes vuelve a Ajustes
  await page.getByRole('link', { name: /Nóminas e ingresos/ }).tap()
  await page.getByRole('button', { name: 'Ajustes' }).tap()
  await expect(page).toHaveURL(/\/ajustes$/)
  expect(e).toEqual([])
})

test('deslizar una fila muestra sus acciones y mantenerla pulsada abre el menú', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  await page.goto('/movimientos')
  const fila = (await page.locator('[data-fila-deslizable]').first().boundingBox())!
  await deslizar(page, fila.x + 20, fila.y + fila.height / 2, fila.x + 170)
  await expect(page.getByText('No cuenta').first()).toBeVisible()
  await expect(page).toHaveURL(/\/movimientos$/)
  await page.reload()
  await expect(page.locator('[data-fila-deslizable]').first()).toBeVisible()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fila.x + 120, y: fila.y + fila.height / 2 }] })
  await page.waitForTimeout(700)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('button', { name: 'Ver los del mismo comercio' })).toBeVisible()
  // Desde la propia pestaña Movimientos: la búsqueda se aplica y encuentra el comercio
  await page.getByRole('button', { name: 'Ver los del mismo comercio' }).click()
  await expect(page.getByPlaceholder('Buscar concepto o nota')).not.toHaveValue('')
  await expect(page.getByText(/^[1-9]\d* movimientos?\./)).toBeVisible()
  // Al volver a la pestaña, Movimientos conserva la búsqueda
  const busqueda = await page.getByPlaceholder('Buscar concepto o nota').inputValue()
  await page.locator('nav[data-pestanas] a', { hasText: 'Informes' }).tap()
  await page.locator('nav[data-pestanas] a', { hasText: 'Movimientos' }).tap()
  await expect(page.getByPlaceholder('Buscar concepto o nota')).toHaveValue(busqueda)
  expect(e).toEqual([])
})

test('Informes, gastos fijos y PayPal se abren sin errores', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  await page.goto('/informes')
  // Informes por vistas: Categorías, Comercios y Evolución
  await expect(page.getByText('29 movimientos').or(page.getByText(/\d+ movimientos/)).first()).toBeVisible()
  await page.getByRole('radio', { name: 'Evolución' }).tap()
  await expect(page.getByText(/Tu capital, mes a mes/i)).toBeVisible()
  await page.getByRole('radio', { name: 'Comercios' }).tap()
  await expect(page.getByText('Dónde más gastas')).toBeVisible()
  // Un toque en un comercio abre sus movimientos en una hoja, sin salir de Informes
  const comercio = page.locator('section', { hasText: 'Dónde más gastas' }).locator('ol button').first()
  const nombre = (await comercio.locator('span.truncate').first().textContent())!.trim()
  await comercio.tap()
  await expect(page.getByRole('dialog', { name: nombre })).toBeVisible()
  await expect(page.getByRole('dialog').locator('[data-fila-deslizable]').first()).toBeVisible()
  await expect(page).toHaveURL(/\/informes/)
  await page.getByRole('button', { name: 'Ver en Movimientos' }).tap()
  await expect(page).toHaveURL(/\/movimientos\?q=/)
  await page.goto('/informes/fijos')
  await expect(page.getByText(/al mes/).first()).toBeVisible()
  await page.goto('/movimientos/paypal')
  await expect(page.getByText(/agrupados por importe/)).toBeVisible()
  expect(e).toEqual([])
})

test('importar varios Excel a la vez: se revisan seguidos, se puede saltar uno y el aviso de atípicos va en pendientes', async ({ page }) => {
  const e = errores(page)
  await page.goto('/movimientos/importar')
  await page.locator('input[type="file"][accept*="xlsx"]').setInputFiles([
    'tests/fixtures/BBVA cuenta principal (prueba).xlsx',
    'tests/fixtures/BBVA cuenta 2 (prueba).xlsx',
    'tests/fixtures/BBVA tarjeta (prueba).xlsx',
  ])
  await expect(page.getByText(/Fichero 1 de 3/)).toBeVisible()
  await page.getByRole('button', { name: /^Importar \d+ movimientos$/ }).tap()
  await expect(page.getByText(/movimientos importados/)).toBeVisible()
  // Con ficheros por delante, lo primero es seguir; «Importar otro» no sale todavía
  await expect(page.getByRole('button', { name: 'Importar otro' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Seguir con el siguiente (2 de 3)' }).tap()
  await expect(page.getByText(/Fichero 2 de 3/)).toBeVisible()
  // Se puede saltar uno
  await page.getByRole('button', { name: 'Saltar', exact: true }).tap()
  await expect(page.getByText(/Fichero 3 de 3/)).toBeVisible()
  await expect(page.getByText('BBVA tarjeta de crédito')).toBeVisible()
  await page.getByRole('button', { name: /^Importar \d+ movimientos$/ }).tap()
  await expect(page.getByText(/movimientos importados/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Seguir con el siguiente/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Importar otro' })).toBeVisible()
  // Resumen de la tanda: dos de los tres ficheros (uno se saltó) y lo que queda sin categoría
  await expect(page.getByRole('status').filter({ hasText: 'Tanda terminada' })).toContainText(/2 de 3 ficheros importados: \d+ movimientos nuevos/)
  expect(e).toEqual([])
})

test('presupuesto: empezar con las medias, ver cómo va, cambiar un importe y verlo en el Extracto', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  await page.goto('/extracto/presupuesto')
  await expect(page.getByText('Aún no hay presupuesto')).toBeVisible()
  await page.getByRole('button', { name: /Empezar con mis medias/ }).tap()
  await expect(page.getByText(/con tu media/)).toBeVisible()
  // El mes: total con su barra y cada categoría con cómo va
  const resumen = page.getByRole('region', { name: 'Presupuesto del mes' })
  await expect(resumen.getByText(/de \d[\d.]*\s€/)).toBeVisible()
  await expect(resumen.getByText(/Cerrarás en unos|Superado en/)).toBeVisible()
  await expect(page.getByText(/^(Quedan|Justo|Cerrarás|Superado)/).first()).toBeVisible()
  // Tocar una categoría abre su importe y sus meses especiales
  await page.getByRole('button', { name: 'Presupuesto de Restaurantes' }).tap()
  const hoja = page.getByRole('dialog', { name: 'Restaurantes' })
  await hoja.getByLabel('Importe mensual de Restaurantes').fill('5000')
  await hoja.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByText(/Restaurantes: 5\.000\s€ al mes/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Presupuesto de Restaurantes' }).getByText(/de 5\.000\s€/)).toBeVisible()
  // Añadir una categoría que no tenía
  await page.getByRole('button', { name: 'Añadir un presupuesto' }).tap()
  await page.getByRole('dialog', { name: 'Añadir presupuesto' }).getByRole('button', { name: /Viajes/ }).tap()
  const viajes = page.getByRole('dialog', { name: 'Viajes' })
  await viajes.getByLabel('Importe mensual de Viajes').fill('200')
  await viajes.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByRole('button', { name: 'Presupuesto de Viajes' })).toBeVisible()
  // Un mes anterior: cómo cerró frente al presupuesto
  await page.getByRole('radiogroup', { name: 'Mes del presupuesto' }).getByRole('radio').first().tap()
  await expect(page.getByRole('region', { name: 'Presupuesto del mes' }).getByText(/mes cerrado/i)).toBeVisible()
  await expect(page.getByText(/^(Sobraron|Justo|Superado)/).first()).toBeVisible()
  // El año, en su vista
  await page.getByRole('radio', { name: /^Año/ }).tap()
  await expect(page.getByText(/en lo que va de año/)).toBeVisible()
  // En el Extracto, una sola lista: la categoría con su presupuesto, sin sección aparte
  await page.locator('nav[data-pestanas] a', { hasText: 'Extracto' }).tap()
  await expect(page.getByRole('link', { name: 'Presupuesto', exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Presupuesto de Vivienda' })).toBeVisible()
  // La tarjeta del mes compara todo el gasto con el presupuesto más lo habitual del resto
  await expect(page.getByRole('region', { name: /^Resumen de / }).getByText(/Presupuesto( y resto)?: \d/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Restaurantes.*de 5\.000\s€/ })).toBeVisible()
  await expect(page.getByText('Editar', { exact: true })).toHaveCount(0)
  expect(e).toEqual([])
})

test('gastos previstos, plan de pagos y Analizar con Claude', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  // Un gasto previsto
  await page.goto('/extracto/previstos')
  await page.getByRole('button', { name: 'Añadir el primero' }).tap()
  await page.getByPlaceholder('IBI, seguro del coche…').fill('Seguro anual')
  await page.getByPlaceholder('0,00 €').fill('350')
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByText('Seguro anual').first()).toBeVisible()
  // Plan de pagos: configurar la deuda y el colchón
  await page.goto('/extracto/plan')
  await page.getByRole('button', { name: 'Configurar' }).tap()
  const importes = page.getByPlaceholder('0,00 €')
  await importes.nth(0).fill('30000')
  await importes.nth(1).fill('2000')
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.locator('#contenido').getByText('Deuda pendiente', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Pago previsto en agosto/)).toBeVisible()
  await page.getByRole('radio', { name: '+200 €' }).tap()
  await expect(page.getByText(/Primer pago:/)).toBeVisible()
  // Otro colchón para simular y guardarlo en el plan
  await page.getByLabel('Colchón para simular').fill('1000')
  await expect(page.getByText(/En el plan: .* de colchón/)).toBeVisible()
  await page.getByRole('button', { name: 'Guardar estos importes' }).tap()
  await expect(page.getByText(/Deuda y colchón guardados/)).toBeVisible()
  await expect(page.getByText(/todo lo que supere el colchón de 1\.000\s€/)).toBeVisible()
  await page.getByRole('button', { name: 'Analizar con Claude' }).tap()
  await expect(page.getByText(/Deuda pendiente: 30\.000,00 €/)).toBeVisible()
  // La tarjeta de la deuda en el Extracto
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Deuda.*30\.000/ })).toBeVisible()
  await page.getByRole('button', { name: 'Más opciones del extracto' }).tap()
  await page.getByRole('button', { name: 'Analizar con Claude' }).tap()
  await expect(page.getByText(/Gasto por categoría \(importe/)).toBeVisible()
  expect(e).toEqual([])
})

test('ingresos previstos: mi nómina con pagas extra y una segunda nómina simulada', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  // La deuda, para ver el efecto en el plan
  await page.goto('/extracto/plan')
  await page.getByRole('button', { name: 'Configurar' }).tap()
  await page.getByPlaceholder('0,00 €').nth(0).fill('30000')
  await page.getByPlaceholder('0,00 €').nth(1).fill('2000')
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.locator('#contenido').getByText('Deuda pendiente', { exact: true }).first()).toBeVisible()
  // Mi nómina con dos pagas extra
  await page.goto('/extracto/ingresos')
  await page.getByRole('button', { name: 'Añadir mi nómina' }).tap()
  await page.getByRole('radio', { name: 'En neto' }).tap()
  await page.getByPlaceholder('0,00 €').first().fill('2800')
  await page.getByRole('button', { name: 'Añadir paga extra' }).tap()
  await page.getByRole('button', { name: 'Añadir paga extra' }).tap()
  // Bonus de agosto, aparte
  await page.getByRole('switch', { name: 'Bonus anual' }).tap()
  await page.getByLabel('Importe neto del bonus').fill('9000')
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByText(/2\.800\s€ al mes, pagas en junio y diciembre, bonus de 9\.000\s€ en agosto/).first()).toBeVisible()
  // Sin el bonus, el capital dentro de un año baja (el pago de agosto puede ser 0 con los datos de prueba)
  await page.getByRole('switch', { name: 'Simular con el bonus de Mi nómina' }).tap()
  await expect(page.getByText(/Capital dentro de un año: .*\(-9\.000\s€\)/)).toBeVisible()
  await expect(page.getByText(/Pago de agosto de 2027:/)).toBeVisible()
  await page.getByRole('switch', { name: 'Simular con el bonus de Mi nómina' }).tap()
  // Segunda nómina, fuera de la previsión
  await page.getByRole('button', { name: 'Añadir una nómina' }).tap()
  await page.getByPlaceholder('0,00 €').first().fill('1200')
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByRole('switch', { name: 'Simular con Nómina 2' })).toBeVisible()
  // Simularla: cambian el capital y el pago
  await page.getByRole('switch', { name: 'Simular con Nómina 2' }).tap()
  await expect(page.getByText(/Capital dentro de un año: .*\(\+/)).toBeVisible()
  await expect(page.getByText(/Pago de agosto de 2027:/)).toBeVisible()
  // También en el plan de pagos
  // La simulación es la misma en el plan: la segunda nómina llega ya activada
  await page.getByText('Ver el plan de pagos').tap()
  await expect(page.getByRole('switch', { name: 'Simular con Nómina 2' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Con la simulación')).toBeVisible()
  await page.getByRole('button', { name: 'Restablecer' }).tap()
  await expect(page.getByRole('switch', { name: 'Simular con Nómina 2' })).toHaveAttribute('aria-checked', 'false')
  expect(e).toEqual([])
})

test('nómina en bruto: neto calculado, subidas, bonus cobrado e inflación del gasto', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  await page.goto('/extracto/plan')
  await page.getByRole('button', { name: 'Configurar' }).tap()
  await page.getByPlaceholder('0,00 €').nth(0).fill('30000')
  await page.getByPlaceholder('0,00 €').nth(1).fill('2000')
  // La inflación viene al 3 % y la hipoteca, fuera
  await expect(page.getByLabel('Inflación del gasto al año')).toHaveValue('3')
  await expect(page.getByRole('button', { name: 'Quitar Vivienda, Hipoteca' })).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.locator('#contenido').getByText('Deuda pendiente', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/El gasto sube un 3 % al año, salvo Vivienda, Hipoteca/)).toBeVisible()
  // La nómina, en bruto: el neto sale calculado
  await page.goto('/extracto/ingresos')
  await page.getByRole('button', { name: 'Añadir mi nómina' }).tap()
  await expect(page.getByRole('radio', { name: 'En bruto' })).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('Bruto fijo al año').fill('60000')
  await page.getByLabel('Objetivo bruto').fill('10000')
  await page.getByLabel('Cobras (%)').fill('80')
  await page.getByLabel('Subida (%)').fill('10')
  await page.getByLabel('Hijos, año de nacimiento').fill('2020, 2024')
  const calculado = page.getByLabel('Neto calculado')
  await expect(calculado.getByText('Neto de un mes normal')).toBeVisible()
  await expect(calculado.getByText(/8\.000\s€ brutos/)).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByText(/60\.000\s€ brutos en 12 pagas, unos 3\.\d{3}\s€ netos al mes, bonus de 10\.000\s€ al 80 % en agosto, subida del 10 % cada septiembre/).first()).toBeVisible()
  // Con subidas, y debajo, sin ellas
  await expect(page.getByText(/Sin subidas ni inflación: /)).toBeVisible()
  // Otro porcentaje de bonus cobrado sube el capital
  await page.getByLabel('Bonus que cobras').selectOption('95')
  await expect(page.getByText(/Capital dentro de un año: .*\(\+/)).toBeVisible()
  // Todo plano: sin subidas ni inflación
  await page.getByRole('switch', { name: 'Subidas e inflación' }).tap()
  await expect(page.getByLabel('Subida anual del sueldo')).toBeHidden()
  await page.getByRole('button', { name: 'Restablecer' }).tap()
  // En el plan, lo mismo, y Claude recibe los supuestos
  await page.getByText('Ver el plan de pagos').tap()
  await expect(page.getByText(/Sin subidas ni inflación: /)).toBeVisible()
  await expect(page.getByText(/El sueldo sube un 10 % cada septiembre/)).toBeVisible()
  await page.getByRole('button', { name: 'Analizar con Claude' }).tap()
  await expect(page.getByText(/60\.000,00 € brutos al año en 12 pagas/)).toBeVisible()
  expect(e).toEqual([])
})

test('reporting: fuera de lo normal, comparar periodos y resumen del año', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  // Comparar periodos: por defecto, el más reciente frente al anterior
  await page.goto('/informes')
  await page.getByRole('link', { name: 'Comparar periodos' }).tap()
  await expect(page.getByRole('combobox', { name: 'Primer periodo' })).toBeVisible()
  await expect(page.getByText('Gasto por categoría, de más a menos cambio')).toBeVisible()
  await page.getByRole('radio', { name: 'Trimestre' }).tap()
  await expect(page.getByRole('combobox', { name: 'Segundo periodo' })).toHaveValue(/T\d$/)
  // Resumen del año, desde Informes en la escala de año
  await page.goto('/informes?escala=anio')
  await page.getByRole('link', { name: /Resumen del año/ }).tap()
  await expect(page.getByText('El año en cifras')).toBeVisible()
  await expect(page.getByRole('button', { name: /Compartir el resumen de \d{4} en PDF/ })).toBeVisible()
  // Evolución: ahorro y gasto fijo mes a mes
  await page.goto('/informes?ver=evolucion')
  await expect(page.getByText(/Ahorro y gasto fijo, mes a mes/i)).toBeVisible()
  expect(e).toEqual([])
})

test('Analizar con Claude: plantilla propia, envío sin comercios y detalle en CSV', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  await page.goto('/ajustes')
  await page.getByRole('link', { name: /Analizar con Claude/ }).tap()
  await page.getByRole('button', { name: /Análisis del mes/ }).tap()
  const campo = page.getByLabel('Plantilla: Análisis del mes')
  await campo.fill('1. Dime solo en qué categoría gasto más de la cuenta.')
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByText('Análisis del mes: guardada')).toBeVisible()
  await expect(page.getByText('Cambiada')).toBeVisible()
  await page.getByRole('switch', { name: 'Enviar sin comercios' }).tap()
  await expect(page.getByRole('switch', { name: 'Enviar sin comercios' })).toHaveAttribute('aria-checked', 'true')
  // El aviso sale cuando ya está guardado en el dispositivo
  await expect(page.getByText('Se enviará sin comercios')).toBeVisible()
  // El Extracto usa la plantilla propia y ofrece el detalle en CSV
  await page.goto('/')
  await page.getByRole('button', { name: 'Más opciones del extracto' }).tap()
  await page.getByRole('button', { name: 'Analizar con Claude' }).tap()
  await expect(page.getByText(/Dime solo en qué categoría gasto más/)).toBeVisible()
  await expect(page.getByText(/Solo salen categorías e importes, sin comercios/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar con el detalle' })).toBeVisible()
  await expect(page.getByText(/Añade un CSV con \d+ movimientos \(fecha, cuenta, categoría/)).toBeVisible()
  expect(e).toEqual([])
})

for (const esquema of [3, 5, 7, 8, 9, 10, 11, 12, 13, 14]) {
  test(`importa un archivo del esquema ${esquema} y lo enseña igual`, async ({ page }) => {
    const e = errores(page)
    await page.goto('/ajustes/herramientas/archivo')
    await page.locator('input[type="file"][accept*="json"]').setInputFiles(`tests/fixtures/archivos/esquema-${esquema}.json`)
    await page.getByRole('button', { name: 'Importar', exact: true }).last().click()
    await expect(page.getByText('Datos importados')).toBeVisible()
    await page.goto('/movimientos')
    await expect(page.getByText(/^\d{3} movimientos/).first()).toBeVisible()
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Capital/ })).toBeVisible()
    expect(e).toEqual([])
  })
}
