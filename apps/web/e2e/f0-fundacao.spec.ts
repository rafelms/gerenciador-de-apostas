import { expect, test } from '@playwright/test'

import {
  admin,
  clienteAnonimo,
  criarUsuario,
  entrarPelaTela,
  gerarTotp,
  limparUsuariosDeTeste,
  MAILPIT_URL,
  semRolagemHorizontal,
  SENHA_TESTE,
  sessaoAal2,
  SUPABASE_URL,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

test.describe('Aceite F0', () => {
  test('não é possível criar conta pela API pública', async () => {
    const { data, error } = await clienteAnonimo().auth.signUp({
      email: 'intruso@teste.local',
      password: 'Intruso12345',
    })
    expect(error).not.toBeNull()
    expect(data.user).toBeNull()
  })

  test('login com senha errada mostra mensagem genérica', async ({ page }) => {
    await entrarPelaTela(page, 'nao-existe@teste.local', 'qualquer1234')
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha inválidos.')
  })

  test('usuário convidado define a senha e entra', async ({ page }) => {
    const sessao = await criarUsuario('admin').then((u) => sessaoAal2(u.email))
    const email = `convidado-${Date.now()}@teste.local`

    const { error } = await sessao.cliente.functions.invoke('admin-usuarios/convidar', {
      body: { email, nome: 'Pessoa Convidada' },
    })
    expect(error).toBeNull()

    // Pega o link do convite no Mailpit (servidor de e-mail local).
    let link: string | undefined
    await expect
      .poll(async () => {
        const busca = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        )
        const { messages } = (await busca.json()) as { messages: { ID: string }[] }
        if (!messages[0]) return undefined
        const msg = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)
        ).json()) as { HTML: string }
        link = msg.HTML.match(/href="([^"]*\/convite\?[^"]*)"/)?.[1]?.replaceAll('&amp;', '&')
        return link
      })
      .toBeTruthy()

    const caminho = new URL(link!).pathname + new URL(link!).search
    await page.goto(caminho)
    await expect(page.getByRole('heading', { name: 'Aceitar convite' })).toBeVisible()
    await expect(page.getByLabel('Seu nome')).toHaveValue('Pessoa Convidada')
    await page.getByLabel('Senha', { exact: true }).fill('NovaSenha2026')
    await page.getByLabel('Confirme a senha').fill('NovaSenha2026')
    await page.getByRole('button', { name: 'Começar a usar' }).click()
    await expect(page).toHaveURL('/')

    // E consegue entrar de novo com a senha nova.
    const { error: erroLogin } = await clienteAnonimo().auth.signInWithPassword({
      email,
      password: 'NovaSenha2026',
    })
    expect(erroLogin).toBeNull()
  })

  test('admin só acessa /admin com MFA', async ({ page }) => {
    const { email } = await criarUsuario('admin')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    // Sem MFA: é mandado para ativar.
    await page.goto('/admin/usuarios')
    await expect(page).toHaveURL(/\/configuracoes\?secao=seguranca&motivo=admin-mfa/)
    await expect(page.getByRole('alert')).toContainText('exige a verificação em duas etapas')

    // Ativa o TOTP pela tela, como o usuário faria com o app autenticador.
    await page.getByRole('button', { name: 'Ativar' }).click()
    const segredo = (await page.locator('code').innerText()).trim()
    await page.getByLabel('Código de verificação').fill(gerarTotp(segredo))
    await page.getByRole('button', { name: 'Confirmar e ativar' }).click()
    await expect(page.getByText('Ativa', { exact: true })).toBeVisible()

    await page.goto('/admin/usuarios')
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible()

    // Novo login: pede o código antes de liberar o app.
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/mfa')
    await page.getByLabel('Código de verificação').fill(gerarTotp(segredo))
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page).toHaveURL('/')
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Administração' })).toBeVisible()
  })

  test('membro não acessa /admin', async ({ page }) => {
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.goto('/admin')
    await expect(page).toHaveURL('/')
  })

  test('usuário desativado perde a sessão e não lê nada', async ({ page }) => {
    const membro = await criarUsuario('membro')
    const { cliente: clienteAdmin } = await criarUsuario('admin').then((u) => sessaoAal2(u.email))

    // O membro está logado no navegador e também numa sessão de API.
    await entrarPelaTela(page, membro.email)
    await expect(page).toHaveURL('/')
    const clienteMembro = clienteAnonimo()
    await clienteMembro.auth.signInWithPassword({ email: membro.email, password: SENHA_TESTE })
    expect((await clienteMembro.from('configuracoes').select('id')).data).toHaveLength(1)

    const { error } = await clienteAdmin.functions.invoke('admin-usuarios/desativar', {
      body: { user_id: membro.id },
    })
    expect(error).toBeNull()

    // RLS: o token ainda não expirou, mas nenhum dado volta.
    expect((await clienteMembro.from('configuracoes').select('id')).data).toHaveLength(0)
    expect((await clienteMembro.from('profiles').select('id')).data).toHaveLength(0)
    // Sessão revogada: o refresh token não funciona mais.
    expect((await clienteMembro.auth.refreshSession()).error).not.toBeNull()
    // E não consegue entrar de novo.
    expect(
      (
        await clienteAnonimo().auth.signInWithPassword({
          email: membro.email,
          password: SENHA_TESTE,
        })
      ).error,
    ).not.toBeNull()

    // No navegador, ao recarregar, é deslogado.
    await page.reload()
    await expect(page).toHaveURL('/login')
  })

  test('admin não desativa a si mesmo e respeita o limite de 5 ativos', async () => {
    const adminUser = await criarUsuario('admin')
    const { cliente } = await sessaoAal2(adminUser.email)

    const proprio = await cliente.functions.invoke('admin-usuarios/desativar', {
      body: { user_id: adminUser.id },
    })
    expect(proprio.error).not.toBeNull()

    // Preenche até o limite e tenta convidar mais um.
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true)
    for (let i = count ?? 0; i < 5; i++) await criarUsuario('membro')
    const excesso = await cliente.functions.invoke('admin-usuarios/convidar', {
      body: { email: `excesso-${Date.now()}@teste.local`, nome: 'Excesso' },
    })
    expect(excesso.error).not.toBeNull()
    expect(excesso.response?.status).toBe(409)
  })

  test('Edge Function recusa chamada sem MFA', async () => {
    const { email } = await criarUsuario('admin')
    const cliente = clienteAnonimo()
    await cliente.auth.signInWithPassword({ email, password: SENHA_TESTE })
    const { error, response } = await cliente.functions.invoke('admin-usuarios/convidar', {
      body: { email: 'x@teste.local', nome: 'X' },
    })
    expect(error).not.toBeNull()
    expect(response?.status).toBe(403)
    expect(SUPABASE_URL).toContain('127.0.0.1')
  })
})

test.describe('Layout responsivo', () => {
  const rotas = [
    '/',
    '/apostas',
    '/apostas/nova',
    '/calendario',
    '/resultados',
    '/configuracoes',
    '/importar',
  ]

  test('navegável sem rolagem horizontal', async ({ page }, info) => {
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    for (const rota of rotas) {
      await page.goto(rota)
      await expect(page.locator('main h1')).toBeVisible()
      await semRolagemHorizontal(page)
    }

    if (info.project.name === 'mobile') {
      await expect(
        page.getByRole('navigation', { name: 'Navegação principal' }).getByText('Mais'),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Mais' }).click()
      await expect(page.getByRole('dialog', { name: 'Mais opções' })).toBeVisible()
      await page.getByRole('link', { name: 'Resultados' }).click()
      await expect(page).toHaveURL('/resultados')
    } else {
      await expect(page.locator('aside').getByRole('link', { name: 'Resultados' })).toBeVisible()
    }
  })
})
