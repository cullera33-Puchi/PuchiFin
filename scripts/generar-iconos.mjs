// Genera los PNG de la PWA a partir de public/favicon.svg (requiere Playwright).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// Playwright no es dependencia del proyecto: se usa el instalado en el sistema
const { chromium } = createRequire(import.meta.url)('playwright')

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const navegador = await chromium.launch()
for (const [nombre, lado] of [['icono-192.png', 192], ['icono-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const pagina = await navegador.newPage({ viewport: { width: lado, height: lado } })
  // Fondo a sangre para que iOS no muestre esquinas transparentes
  await pagina.setContent(
    `<body style="margin:0;background:#0f766e">${svg.replace('<svg ', `<svg width="${lado}" height="${lado}" `).replace('rx="14"', 'rx="0"')}</body>`,
  )
  await pagina.screenshot({ path: new URL(`../public/${nombre}`, import.meta.url).pathname })
  await pagina.close()
}
await navegador.close()
