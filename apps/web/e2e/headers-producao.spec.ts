import { expect, test } from '@playwright/test'

// Aceite F0: headers de segurança presentes NA PRODUÇÃO.
// Só roda com PRODUCAO_URL definida (ex.: no workflow após o deploy da Vercel).
const PRODUCAO_URL = process.env.PRODUCAO_URL

test.describe('Headers de segurança em produção', () => {
  test.skip(!PRODUCAO_URL, 'PRODUCAO_URL não definida')

  test('resposta da produção traz CSP, HSTS e afins', async ({ request }) => {
    for (const rota of ['/', '/login', '/apostas']) {
      const resposta = await request.get(new URL(rota, PRODUCAO_URL).toString())
      expect(resposta.status()).toBe(200)
      const h = resposta.headers()
      expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
      expect(h['strict-transport-security']).toContain('max-age=63072000')
      expect(h['x-content-type-options']).toBe('nosniff')
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(h['permissions-policy']).toContain('microphone=()')
    }
  })
})
