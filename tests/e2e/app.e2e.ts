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
  await p.goto('/ajustes/herramientas')
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
  await expect(page.getByRole('region', { name: 'Tu posición' })).toBeVisible()
  await expect(page.getByText(/gastados en|gastaste/).first()).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Mes del extracto' })).toBeVisible()
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
  await expect(page.getByText('Dónde más gastas')).toBeVisible()
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
  expect(e).toEqual([])
})

test('Informes, gastos fijos, PayPal y presupuesto se abren sin errores', async ({ page }) => {
  const e = errores(page)
  await conDatosDePrueba(page)
  await page.goto('/informes')
  await expect(page.getByText('Dónde más gastas')).toBeVisible()
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
  await expect(page.locator('#contenido').getByText('Deuda pendiente', { exact: true })).toBeVisible()
  await expect(page.getByText(/Pago previsto en julio/)).toBeVisible()
  await page.getByRole('radio', { name: '+200 €' }).tap()
  await expect(page.getByText(/Primer pago:/)).toBeVisible()
  await page.getByRole('button', { name: 'Analizar con Claude' }).tap()
  await expect(page.getByText(/Deuda pendiente: 30\.000,00 €/)).toBeVisible()
  // La tarjeta de la deuda en el Extracto
  await page.goto('/')
  await expect(page.getByText(/Deuda: 30\.000/)).toBeVisible()
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
  await expect(page.locator('#contenido').getByText('Deuda pendiente', { exact: true })).toBeVisible()
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
  await page.getByText('Ver el plan de pagos').tap()
  await page.getByRole('switch', { name: 'Simular con Nómina 2' }).tap()
  await expect(page.getByText('Con la simulación')).toBeVisible()
  expect(e).toEqual([])
})

for (const esquema of [3, 5, 7, 8, 9, 10, 11]) {
  test(`importa un archivo del esquema ${esquema} y lo enseña igual`, async ({ page }) => {
    const e = errores(page)
    await page.goto('/ajustes/herramientas')
    await page.locator('input[type="file"][accept*="json"]').setInputFiles(`tests/fixtures/archivos/esquema-${esquema}.json`)
    await page.getByRole('button', { name: 'Importar', exact: true }).last().click()
    await expect(page.getByText('Datos importados')).toBeVisible()
    await page.goto('/movimientos')
    await expect(page.getByText(/^\d{3} movimientos\./)).toBeVisible()
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Tu posición' })).toBeVisible()
    expect(e).toEqual([])
  })
}
