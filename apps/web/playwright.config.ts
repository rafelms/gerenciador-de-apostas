import { defineConfig, devices } from '@playwright/test'

// E2E contra o Supabase LOCAL (`supabase start`). Viewports da seção 15: 360×800 e 1280×800.
//
// E2E_PREVIEW=1 (no CI) testa o build de produção (`vite preview` do dist/ já gerado), bem
// mais rápido que o `vite dev`, que compila cada módulo na hora, a cada página nova.
const preview = !!process.env.E2E_PREVIEW

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 1),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    // O service worker do build serviria arquivos do cache entre testes; o modo offline
    // é testado pelo cache do TanStack Query (f5-offline), que não depende dele.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: preview ? 'pnpm exec vite preview --port 5173 --strictPort' : 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
