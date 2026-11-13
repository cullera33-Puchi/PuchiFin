/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // La nueva versión espera a que se toque «Actualizar» (aviso con novedades)
      registerType: 'prompt',
      manifest: {
        name: 'PuchiFin',
        short_name: 'PuchiFin',
        description: 'Finanzas personales: extracto mensual, gastos de empleado y presupuesto',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#0f766e',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo se cachea el frontal. Los datos de Supabase y novedades.json siempre van a la red.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['**/novedades.json'],
        navigateFallbackDenylist: [/^\/auth/, /novedades\.json$/],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
