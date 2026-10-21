import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Garante que os headers de segurança da seção 8.7 não se percam numa edição do vercel.json.
// A verificação na produção real fica em e2e/headers-producao.spec.ts (PRODUCAO_URL).
const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../vercel.json'), 'utf8'),
) as {
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const headers = Object.fromEntries(
  config.headers.flatMap((h) => h.headers.map((x) => [x.key, x.value])),
)

describe('vercel.json', () => {
  it('reescreve todas as rotas para a SPA', () => {
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' })
  })

  it('define a CSP exigida', () => {
    const csp = headers['Content-Security-Policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('connect-src')
  })

  it('define HSTS, nosniff, Referrer-Policy e Permissions-Policy', () => {
    expect(headers['Strict-Transport-Security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toBe('camera=(self), microphone=(), geolocation=()')
  })
})
