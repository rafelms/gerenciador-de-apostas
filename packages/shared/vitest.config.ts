import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/index.ts'],
      reporter: ['text', 'html'],
      // Aceite F1: cobertura ≥ 90% das linhas do pacote shared.
      thresholds: { lines: 90 },
    },
  },
})
