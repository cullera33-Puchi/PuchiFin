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
async function deslizar(p: Page, x0: number, y0: number, x1: number, y1 = y0) {
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 12, y: y0 + ((y1 - y0) * i) / 12 }] })
    await p.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await p.waitForTimeout(600)
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
  await expect(page.getByRole('dialog', { name: 'Pendiente' })).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).tap()
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

test('Informes, gastos fijos, PayPal y presupuesto se abren sin errores', async ({ page }) => {
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
  await page.goto('/extracto/presupuesto')
  await page.getByRole('button', { name: /Usar las medias/ }).tap()
  await expect(page.getByText(/con la media/)).toBeVisible()
  await page.locator('nav[data-pestanas] a', { hasText: 'Extracto' }).tap()
  await expect(page.getByText('Presupuesto', { exact: true })).toBeVisible()
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
  await expect(page.getByText(/Pago previsto en julio/)).toBeVisible()
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
  await page.getByPlaceholder('0,00 €').first().fill('2800')
  await page.getByRole('button', { name: 'Añadir paga extra' }).tap()
  await page.getByRole('button', { name: 'Añadir paga extra' }).tap()
  // Bonus de julio, aparte
  await page.getByRole('switch', { name: 'Bonus anual' }).tap()
  await page.getByLabel('Importe neto del bonus').fill('9000')
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByText(/2\.800\s€ al mes, pagas en junio y diciembre, bonus de 9\.000\s€ en julio/).first()).toBeVisible()
  // Sin el bonus, el capital dentro de un año baja (el pago de julio puede ser 0 con los datos de prueba)
  await page.getByRole('switch', { name: 'Simular con el bonus de Mi nómina' }).tap()
  await expect(page.getByText(/Capital dentro de un año: .*\(-9\.000\s€\)/)).toBeVisible()
  await expect(page.getByText(/Pago de julio de 2027:/)).toBeVisible()
  await page.getByRole('switch', { name: 'Simular con el bonus de Mi nómina' }).tap()
  // Segunda nómina, fuera de la previsión
  await page.getByRole('button', { name: 'Añadir una nómina' }).tap()
  await page.getByPlaceholder('0,00 €').first().fill('1200')
  await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
  await expect(page.getByRole('switch', { name: 'Simular con Nómina 2' })).toBeVisible()
  // Simularla: cambian el capital y el pago
  await page.getByRole('switch', { name: 'Simular con Nómina 2' }).tap()
  await expect(page.getByText(/Capital dentro de un año: .*\(\+/)).toBeVisible()
  await expect(page.getByText(/Pago de julio de 2027:/)).toBeVisible()
  // También en el plan de pagos
  // La simulación es la misma en el plan: la segunda nómina llega ya activada
  await page.getByText('Ver el plan de pagos').tap()
  await expect(page.getByRole('switch', { name: 'Simular con Nómina 2' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Con la simulación')).toBeVisible()
  await page.getByRole('button', { name: 'Restablecer' }).tap()
  await expect(page.getByRole('switch', { name: 'Simular con Nómina 2' })).toHaveAttribute('aria-checked', 'false')
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

for (const esquema of [3, 5, 7, 8, 9, 10, 11, 12, 13]) {
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
