import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import {
  clienteAnonimo,
  criarUsuario,
  entrarComoAdminComMfa,
  entrarPelaTela,
  limparUsuariosDeTeste,
  SENHA_TESTE,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

// F5.5: axe (WCAG 2.1 A/AA) em todas as telas, nos dois temas.
const TELAS = [
  '/',
  '/?periodo=escolher&mes=2026-10',
  '/apostas',
  '/apostas/nova',
  '/calendario?mes=2026-10',
  '/resultados',
  '/analisador',
  '/importar',
  '/exportar',
  '/simulador-rateio',
  '/orcamento',
  '/virada',
  '/notificacoes',
  '/configuracoes',
]
const TELAS_ADMIN = [
  '/admin',
  '/admin/usuarios',
  '/admin/resultados',
  '/admin/configuracoes',
  '/admin/metricas',
]

async function violacoes(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return r.violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  )
}

async function varrer(page: Page, telas: string[]) {
  const achados: string[] = []
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema })
    for (const tela of telas) {
      await page.goto(tela)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      // Espera os esqueletos de carregamento sumirem.
      await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 10_000 })
      for (const v of await violacoes(page)) achados.push(`[${tema}] ${tela} → ${v}`)
    }
  }
  return achados
}

test.describe('Acessibilidade (F5.5)', () => {
  test('telas do usuário sem violações do axe', async ({ page }) => {
    test.setTimeout(180_000)
    const u = await criarUsuario()
    const cliente = clienteAnonimo()
    await cliente.auth.signInWithPassword({ email: u.email, password: SENHA_TESTE })
    const { data: id } = await cliente.rpc('salvar_aposta', {
      p_aposta: {
        modalidade_slug: 'megasena',
        tipo: 'simples',
        concurso_inicial: 3069,
        qtd_concursos: 1,
        data_aposta: '2026-10-10',
        valor_pago_centavos: 600,
        jogos: [[3, 17, 22, 31, 40, 50]],
        participantes: [],
      } as never,
    })
    await entrarPelaTela(page, u.email)
    await expect(page).toHaveURL('/')
    const achados = await varrer(page, [...TELAS, `/apostas/${id as string}`])
    expect(achados).toEqual([])
  })

  test('telas do admin sem violações do axe', async ({ page }) => {
    test.setTimeout(180_000)
    await entrarComoAdminComMfa(page)
    expect(await varrer(page, TELAS_ADMIN)).toEqual([])
  })

  test('login sem violações do axe', async ({ page }) => {
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema })
      await page.goto('/login')
      expect(await violacoes(page)).toEqual([])
    }
  })
})
