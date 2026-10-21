import { expect, test, type Page } from '@playwright/test'

import {
  admin,
  criarUsuario,
  entrarComoAdminComMfa,
  entrarPelaTela,
  limparUsuariosDeTeste,
  semRolagemHorizontal,
} from './helpers'

// Concurso da Quina sem resultado no seed, lançado à mão pelo admin no teste.
const QUINA_MANUAL = 6899

test.afterAll(async () => {
  await limparUsuariosDeTeste()
  const { data: quina } = await admin.from('modalidades').select('id').eq('slug', 'quina').single()
  await admin.from('concursos').delete().eq('modalidade_id', quina!.id).eq('numero', QUINA_MANUAL)
})

async function proxima(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Próximo' }).click()
}

test.describe('Aceite F2', () => {
  test('aposta de concurso já sorteado sai conferida; prêmio informado à mão e resgatado', async ({
    page,
  }, info) => {
    const mobile = info.project.name === 'mobile'
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    // Seed: Mega 3069 = 03 17 22 31 40 58, sem rateio publicado.
    await page.goto('/apostas/nova')
    await page.getByRole('button', { name: 'Mega-Sena' }).click()
    await proxima(page, mobile)
    await page.getByLabel('Concurso', { exact: true }).fill('3069')
    await proxima(page, mobile)
    for (const d of [3, 17, 22, 31, 40, 59]) {
      await page
        .getByRole('button', { name: `Dezena ${String(d).padStart(2, '0')}`, exact: true })
        .click()
    }
    await proxima(page, mobile)
    await proxima(page, mobile)
    await page.getByRole('button', { name: 'Registrar aposta' }).click()
    await expect(page).toHaveURL(/\/apostas\/[0-9a-f-]{36}$/)

    // Conferência gravada logo ao salvar: quina, valor ainda não publicado.
    await expect(page.getByText('· 6 dezenas · 5 acertos')).toBeVisible()
    await expect(page.getByText('Premiada', { exact: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Faixas premiadas' })).toContainText('1 × Quina')
    await expect(
      page.getByText(/Parte do prêmio ainda não tem valor no rateio oficial/),
    ).toBeVisible()
    await semRolagemHorizontal(page)

    // A notificação de prêmio já chegou (sino com contador).
    await expect(page.getByRole('link', { name: 'Notificações, 1 não lida' })).toBeVisible()

    // O usuário informa o valor recebido: R$ 1.000,00 é isento de IR.
    await page.getByRole('button', { name: 'Informar valor recebido' }).click()
    await page.getByLabel('Prêmio bruto (sua parte)').fill('1.000,00')
    await expect(page.getByRole('dialog').getByText('Líquido: R$ 1.000,00')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Informado por você')).toBeVisible()
    await expect(page.getByText(/Parte do prêmio ainda não tem valor/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Marcar como resgatado' }).click()
    await expect(page.getByText('Resgatado', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Desfazer resgate' })).toBeVisible()

    // Resultados: o concurso aparece entre os do usuário, premiado.
    await page.goto('/resultados')
    await expect(page.getByRole('heading', { name: 'Últimos sorteios' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Mega-Sena\s*3069.*R\$ 1\.000,00/ })).toBeVisible()
    await semRolagemHorizontal(page)
  })

  test('admin lança resultado à mão e o membro recebe a notificação em até 5 s (Realtime)', async ({
    page,
    browser,
  }) => {
    // Membro com uma aposta na Quina, sem resultado ainda.
    const membro = await criarUsuario('membro')
    const { data: quina } = await admin
      .from('modalidades')
      .select('id')
      .eq('slug', 'quina')
      .single()
    const { data: aposta } = await admin
      .from('apostas')
      .insert({
        user_id: membro.id,
        modalidade_id: quina!.id,
        tipo: 'simples',
        concurso_inicial: QUINA_MANUAL,
        data_aposta: '2026-10-20',
        valor_pago_centavos: 300,
      })
      .select('id')
      .single()
    await admin
      .from('aposta_jogos')
      .insert({ aposta_id: aposta!.id, user_id: membro.id, ordem: 1, dezenas: [8, 19, 33, 57, 71] })

    await entrarPelaTela(page, membro.email)
    await expect(page).toHaveURL('/')
    // Sino da barra superior, ainda sem notificações.
    const sino = page.getByRole('banner').getByRole('link', { name: /^Notificações/ })
    await expect(sino).toHaveAccessibleName('Notificações')

    // O admin, em outro navegador, lança o resultado com o rateio da quina.
    const contextoAdmin = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'pt-BR',
    })
    const telaAdmin = await contextoAdmin.newPage()
    await entrarComoAdminComMfa(telaAdmin)
    await telaAdmin.goto('/admin/resultados')
    await telaAdmin.getByLabel('Modalidade').selectOption('quina')
    await telaAdmin.getByLabel('Concurso').fill(String(QUINA_MANUAL))
    await telaAdmin.getByLabel('Data do sorteio').fill('2026-10-20')
    const volante = telaAdmin.getByRole('group', { name: 'Dezenas sorteadas' })
    for (const d of [8, 19, 33, 57, 71]) {
      await volante
        .getByRole('button', { name: `Dezena ${String(d).padStart(2, '0')}`, exact: true })
        .click()
    }
    await telaAdmin.locator('#gan-5').fill('1')
    await telaAdmin.locator('#val-5').fill('100.000,00')
    await telaAdmin.getByRole('button', { name: 'Salvar e conferir' }).click()
    await expect(
      telaAdmin.getByText(/Resultado salvo\. 1 aposta conferida, 1 premiada/),
    ).toBeVisible()

    // Realtime: o membro, com a tela aberta, é avisado em até 5 s.
    await expect(sino).toHaveAccessibleName('Notificações, 1 não lida', { timeout: 5000 })

    // A notificação leva à aposta: R$ 100.000,00 brutos → 30% de IR → R$ 70.000,00.
    await page.goto('/notificacoes')
    await expect(page.getByRole('main')).toContainText(
      `Sua aposta na Quina ${QUINA_MANUAL} foi premiada: R$ 70.000,00 líquidos`,
    )
    await page
      .getByRole('button', { name: new RegExp(`Quina ${QUINA_MANUAL} foi premiada`) })
      .click()
    await expect(page).toHaveURL(`/apostas/${aposta!.id}`)
    await expect(page.getByText('R$ 30.000,00')).toBeVisible()
    await expect(page.getByText('R$ 70.000,00').first()).toBeVisible()
    // Abrir pela lista marcou como lida.
    await expect(sino).toHaveAccessibleName('Notificações')

    // O log registra o lançamento manual; configurações salvam (RLS admin + aal2).
    await telaAdmin.reload()
    await expect(
      telaAdmin.getByText(`Resultado do concurso ${QUINA_MANUAL} lançado à mão.`).first(),
    ).toBeVisible()
    await telaAdmin.goto('/admin/configuracoes')
    await telaAdmin.getByRole('button', { name: 'Salvar configurações' }).click()
    await telaAdmin.getByRole('alertdialog').getByRole('button', { name: 'Salvar' }).click()
    await expect(telaAdmin.getByText('Configurações salvas.')).toBeVisible()
    await contextoAdmin.close()
  })

  test('simulador divide R$ 100,00 por 1/1/1 em 33,34 + 33,33 + 33,33', async ({ page }) => {
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.goto('/simulador-rateio')
    await page.getByLabel('Valor do prêmio da aposta').fill('100,00')
    await page.getByRole('button', { name: 'Adicionar pessoa' }).click()
    await page.getByRole('button', { name: 'Adicionar pessoa' }).click()
    await page.getByRole('textbox', { name: 'Pessoa 2' }).fill('João')
    await page.getByRole('textbox', { name: 'Pessoa 3' }).fill('Ana')
    const linhas = page
      .getByRole('table', { name: 'Divisão do prêmio entre as pessoas' })
      .getByRole('row')
    await expect(linhas.nth(1)).toContainText('R$ 33,34')
    await expect(linhas.nth(2)).toContainText('João')
    await expect(linhas.nth(2)).toContainText('R$ 33,33')
    await expect(linhas.nth(3)).toContainText('R$ 33,33')
    await semRolagemHorizontal(page)
  })
})
