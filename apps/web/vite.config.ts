import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA (seção 11.14): instalável e com o shell em cache. Os dados offline vêm do cache
    // do TanStack Query salvo no aparelho (src/app/cache-offline.ts), não do service worker:
    // nenhuma resposta da API fica no Cache Storage.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icones/apple-touch-icon.png', 'tema-inicial.js'],
      manifest: {
        name: 'LotoGestor',
        short_name: 'LotoGestor',
        description: 'Gasto, prêmios, bolões e orçamento das suas loterias.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2F2F4',
        theme_color: '#282B4A',
        icons: [
          { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icones/icone-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Fora do precache: leitores de planilha e PDF (só servem para importar, o que
        // precisa de rede de qualquer jeito) e as fontes de alfabetos que o app não usa.
        globIgnores: ['**/xlsx-*.js', '**/pdf-*.js', '**/*-{cyrillic,greek,vietnamese}*.woff2'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Com injectRegister: false o plugin não liga estes dois sozinho: sem eles a versão
        // nova ficava "esperando" até fechar todas as abas. A recarga da página é decidida
        // em src/lib/atualizacao.ts (não recarrega no meio de um formulário).
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(import.meta.dirname, '../../packages/shared/src'),
    },
  },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Testes unitários não falam com o Supabase, mas importam o cliente (src/lib/env.ts
    // exige as variáveis). Valores fictícios: o CI não tem .env.local.
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'chave-publica-ficticia-para-testes',
    },
  },
})
