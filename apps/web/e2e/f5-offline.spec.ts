import { expect, test, type Page } from '@playwright/test'

import {
  clienteAnonimo,
  criarUsuario,
  entrarPelaTela,
  limparUsuariosDeTeste,
  SENHA_TESTE,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

async function apostaDeTeste(email: string, concurso: number) {
  const cliente = clienteAnonimo()
  await cliente.auth.signInWithPassword({ email, password: SENHA_TESTE })
  const { error } = await cliente.rpc('salvar_aposta', {
    p_aposta: {
      modalidade_slug: 'megasena',
      tipo: 'simples',
      concurso_inicial: concurso,
      qtd_concursos: 1,
      data_aposta: '2026-10-10',
      valor_pago_centavos: 600,
      jogos: [[3, 17, 22, 31, 40, 50]],
      participantes: [],
    } as never,
  })
  if (error) throw error
}

const lerArmazenamento = (page: Page) =>
  page.evaluate(() => ({
    cache: localStorage.getItem('lotogestor-cache'),
    sessao: localStorage.getItem('lotogestor-sessao-offline'),
    dono: localStorage.getItem('lotogestor-cache-dono'),
  }))

test.describe('Modo offline (F5.4)', () => {
  test('salva só dados de leitura, avisa sem conexão e não grava', async ({ page, context }) => {
    const u = await criarUsuario()
    await apostaDeTeste(u.email, 3069)
    await entrarPelaTela(page, u.email)
    await expect(page).toHaveURL('/')
    await page.goto('/apostas')
    await expect(page.getByRole('link', { name: /Mega-Sena/ }).first()).toBeVisible()

    // O cache salvo tem a aposta, mas nenhum token.
    await expect.poll(async () => (await lerArmazenamento(page)).cache ?? '').toContain('megasena')
    const salvo = await lerArmazenamento(page)
    expect(salvo.dono).toBe(u.id)
    for (const valor of [salvo.cache, salvo.sessao]) {
      expect(valor).not.toContain('access_token')
      expect(valor).not.toContain('refresh_token')
    }

    // Abre o detalhe com rede, volta e fica offline: o que já foi visto continua navegável.
    await page
      .getByRole('link', { name: /Mega-Sena/ })
      .first()
      .click()
    const titulo = page.getByRole('heading', { level: 1 })
    await expect(titulo).toContainText('Mega-Sena')
    await page.goBack()
    await context.setOffline(true)
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão.' })).toBeVisible()
    await page
      .getByRole('link', { name: /Mega-Sena/ })
      .first()
      .click()
    await expect(titulo).toContainText('Mega-Sena')

    await context.setOffline(false)
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão.' })).toHaveCount(0)
  })

  test('modalidades restauradas do cache continuam com as regras (nova aposta não quebra)', async ({
    page,
  }, info) => {
    const mobile = info.project.name === 'mobile'
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.goto('/apostas/nova')
    await expect(page.getByRole('button', { name: 'Mega-Sena' })).toBeVisible()
    // Espera o cache (com as modalidades) ser salvo e recarrega: os dados voltam do JSON.
    await expect
      .poll(async () => (await lerArmazenamento(page)).cache ?? '', { timeout: 10_000 })
      .toContain('modalidades')
    await page.reload()

    await page.getByRole('button', { name: 'Mega-Sena' }).click()
    if (mobile) await page.getByRole('button', { name: 'Próximo' }).click()
    await expect(page.getByText('Algo deu errado nesta tela')).toHaveCount(0)
    await expect(page.getByLabel('Concurso', { exact: true })).toBeVisible()
    if (mobile) await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByRole('button', { name: 'Dezena 01', exact: true }).first().click()
    await expect(page.getByText('1/6–20')).toBeVisible()
    await expect(page.getByText('Algo deu errado nesta tela')).toHaveCount(0)
  })

  test('logout apaga o cache; outro usuário no aparelho não vê os dados do anterior', async ({
    page,
  }) => {
    const a = await criarUsuario()
    await apostaDeTeste(a.email, 3069)
    await entrarPelaTela(page, a.email)
    await expect(page).toHaveURL('/')
    await page.goto('/apostas')
    await expect(page.getByRole('link', { name: /Mega-Sena/ }).first()).toBeVisible()
    await expect.poll(async () => (await lerArmazenamento(page)).cache ?? '').toContain('3069')

    // Sair pelo menu do avatar.
    await page.getByRole('button', { name: 'Menu da conta' }).click()
    await page.getByRole('menuitem', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect
      .poll(async () => await lerArmazenamento(page))
      .toEqual({
        cache: expect.not.stringContaining('3069') as unknown as string,
        sessao: null,
        dono: null,
      })

    // Cópia "esquecida" (sessão expirada sem logout): o próximo usuário não a vê.
    await page.evaluate((id) => {
      localStorage.setItem('lotogestor-cache-dono', id)
    }, a.id)
    const b = await criarUsuario()
    await entrarPelaTela(page, b.email)
    await expect(page).toHaveURL('/')
    await page.goto('/apostas')
    await expect(page.getByText(/Nenhuma aposta/).first()).toBeVisible()
    expect((await lerArmazenamento(page)).dono).toBe(b.id)
  })
})
