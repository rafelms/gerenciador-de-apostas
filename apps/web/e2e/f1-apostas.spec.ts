import { expect, test, type Page } from '@playwright/test'

import {
  admin,
  criarUsuario,
  entrarPelaTela,
  limparUsuariosDeTeste,
  semRolagemHorizontal,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

/** No celular o formulário é em etapas; no desktop é uma página só. */
async function proximaEtapa(page: Page, ehMobile: boolean) {
  if (ehMobile) await page.getByRole('button', { name: 'Próximo' }).click()
}

async function marcar(page: Page, dezenas: number[]) {
  for (const d of dezenas) {
    await page
      .getByRole('button', { name: `Dezena ${String(d).padStart(2, '0')}`, exact: true })
      .first()
      .click()
  }
}

test.describe('Aceite F1', () => {
  test('aposta simples de Mega com 7 dezenas custa R$ 42,00 e aparece na lista e no detalhe', async ({
    page,
  }, info) => {
    const mobile = info.project.name === 'mobile'
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    await page.goto('/apostas/nova')
    await page.getByRole('button', { name: 'Mega-Sena' }).click()
    await proximaEtapa(page, mobile)

    // Concurso sugerido a partir do último concurso conhecido (seed: 3069 → 3070).
    await expect(page.getByLabel('Concurso', { exact: true })).toHaveValue('3070')
    await proximaEtapa(page, mobile)

    await marcar(page, [2, 9, 24, 28, 44, 48, 49])
    await expect(page.getByText('7/6–20')).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Volante do jogo 1' }).locator('..').getByText('R$ 42,00'),
    ).toBeVisible()
    await semRolagemHorizontal(page)
    await proximaEtapa(page, mobile)

    await expect(page.getByLabel('Valor pago')).toHaveValue('42,00')
    await proximaEtapa(page, mobile)

    await page.getByRole('button', { name: 'Registrar aposta' }).click()
    await expect(page).toHaveURL(/\/apostas\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'Mega-Sena 3070' })).toBeVisible()
    // O concurso 3070 não tem resultado no seed.
    await expect(page.getByText('Aguardando resultado oficial do concurso 3070.')).toBeVisible()

    await page.goto('/apostas')
    await expect(page.getByRole('link', { name: 'Mega-Sena 3070' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Mega-Sena 3070' }).getByText('R$ 42,00', { exact: true }),
    ).toBeVisible()
  })

  test('bolão do Apêndice A salva R$ 8,84 + R$ 3,09 = R$ 11,93', async ({ page }, info) => {
    const mobile = info.project.name === 'mobile'
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    await page.goto('/apostas/nova')
    await page.getByRole('button', { name: 'Mega-Sena' }).click()
    await proximaEtapa(page, mobile)
    await page.getByRole('radio', { name: /Bolão/ }).click()
    await page.getByLabel('Concurso', { exact: true }).fill('3070')
    await proximaEtapa(page, mobile)

    // Cola os 8 jogos de uma vez, no formato do comprovante.
    await page.getByRole('button', { name: 'Colar dezenas' }).click()
    await page
      .getByLabel('Jogos')
      .fill(
        [
          '02 | 09 | 24 | 28 | 44 | 48 | 49',
          '02 | 06 | 28 | 41 | 44 | 49 | 53',
          '02 | 15 | 19 | 28 | 44 | 49 | 50',
          '12 | 14 | 36 | 38 | 44 | 51 | 56',
          '04 | 06 | 08 | 18 | 25 | 30 | 41',
          '03 | 06 | 11 | 18 | 30 | 47 | 56',
          '06 | 13 | 16 | 25 | 26 | 28 | 49',
          '02 | 14 | 22 | 24 | 35 | 45 | 48',
        ].join('\n'),
      )
    await page.getByRole('button', { name: 'Adicionar jogos' }).click()
    await expect(page.getByText('Jogo 8', { exact: true })).toBeVisible()
    await proximaEtapa(page, mobile)

    await page.getByLabel('Total de cotas').fill('38')
    await page.getByLabel('Suas cotas').fill('1')
    await page.getByLabel('Valor da cota').fill('8,84')
    await page.getByLabel('Tarifa de serviço').fill('3,09')
    await page.getByLabel('Nº da cota (opcional)').fill('35')
    await expect(page.getByLabel('Valor pago')).toHaveValue('11,93')
    // 8 jogos × R$ 42,00 = R$ 336,00 ≈ 38 × R$ 8,84: sem aviso de divergência.
    await expect(page.getByText('O valor da cota não bate')).toHaveCount(0)
    await proximaEtapa(page, mobile)

    await page.getByRole('button', { name: 'Registrar aposta' }).click()
    await expect(page).toHaveURL(/\/apostas\/[0-9a-f-]{36}$/)
    await expect(page.getByText('1 de 38 cotas (cota 35/38)')).toBeVisible()

    const { data } = await admin
      .from('apostas')
      .select(
        'valor_cota_centavos, tarifa_centavos, valor_pago_centavos, bolao_total_cotas, bolao_numero_cota',
      )
      .eq('id', page.url().split('/').at(-1)!)
      .single()
    expect(data).toEqual({
      valor_cota_centavos: 884,
      tarifa_centavos: 309,
      valor_pago_centavos: 1193,
      bolao_total_cotas: 38,
      bolao_numero_cota: 35,
    })
  })

  test('teimosinha de 3 concursos cria 3 linhas em aposta_concursos', async ({ page }, info) => {
    const mobile = info.project.name === 'mobile'
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    await page.goto('/apostas/nova')
    await page.getByRole('button', { name: 'Lotofácil' }).click()
    await proximaEtapa(page, mobile)
    await page.getByRole('radio', { name: /Teimosinha/ }).click()
    await page.getByLabel('Quantidade de concursos').fill('3')
    await proximaEtapa(page, mobile)
    await marcar(page, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    await proximaEtapa(page, mobile)
    // Lotofácil 16 dezenas = R$ 56,00 × 3 concursos.
    await expect(page.getByLabel('Valor pago')).toHaveValue('168,00')
    await proximaEtapa(page, mobile)
    await page.getByRole('button', { name: 'Registrar aposta' }).click()
    await expect(page).toHaveURL(/\/apostas\/[0-9a-f-]{36}$/)

    const id = page.url().split('/').at(-1)!
    const { data } = await admin
      .from('aposta_concursos')
      .select('numero_concurso')
      .eq('aposta_id', id)
      .order('numero_concurso')
    expect(data?.map((d) => d.numero_concurso)).toEqual([3521, 3522, 3523])
  })

  test('validação: dezenas insuficientes bloqueiam o envio', async ({ page }, info) => {
    const mobile = info.project.name === 'mobile'
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    await page.goto('/apostas/nova')
    await page.getByRole('button', { name: 'Quina' }).click()
    await proximaEtapa(page, mobile)
    await proximaEtapa(page, mobile)
    await marcar(page, [1, 2, 3])
    if (mobile) {
      await page.getByRole('button', { name: 'Próximo' }).click()
      await expect(
        page.getByText('Jogo 1: Quina aceita de 5 a 15 dezenas; encontradas 3'),
      ).toBeVisible()
    } else {
      await page.getByRole('button', { name: 'Registrar aposta' }).click()
      await expect(
        page.getByText('Jogo 1: Quina aceita de 5 a 15 dezenas; encontradas 3'),
      ).toBeVisible()
    }
    await expect(page).toHaveURL('/apostas/nova')
  })

  test('filtros por modalidade/tipo/status persistem na URL', async ({ page }) => {
    const { id, email } = await criarUsuario('membro')
    // Duas apostas criadas direto pelo banco (rápido), em nome do usuário.
    for (const [slug, tipo, numero] of [
      ['megasena', 'simples', 3070],
      ['quina', 'simples', 6871],
    ] as const) {
      const { data: m } = await admin.from('modalidades').select('id').eq('slug', slug).single()
      const { data: a } = await admin
        .from('apostas')
        .insert({
          user_id: id,
          modalidade_id: m!.id,
          tipo,
          concurso_inicial: numero,
          data_aposta: '2026-10-14',
          valor_pago_centavos: 600,
        })
        .select('id')
        .single()
      await admin.from('aposta_jogos').insert({
        aposta_id: a!.id,
        user_id: id,
        ordem: 1,
        dezenas: slug === 'quina' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6],
      })
    }

    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.goto('/apostas')
    await expect(page.getByRole('link', { name: /Mega-Sena 3070/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Quina 6871/ })).toBeVisible()

    await page.getByRole('button', { name: /Filtros/ }).click()
    await page.getByLabel('Modalidade').selectOption('quina')
    await page.getByLabel('Tipo').selectOption('simples')
    await page.getByLabel('Status').selectOption('aguardando')
    await page.getByRole('button', { name: 'Aplicar filtros' }).click()

    await expect(page).toHaveURL(/modalidade=quina/)
    await expect(page).toHaveURL(/tipo=simples/)
    await expect(page).toHaveURL(/status=aguardando/)
    await expect(page.getByRole('link', { name: /Quina 6871/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Mega-Sena 3070/ })).toHaveCount(0)

    // Recarregar mantém os filtros (estão na URL).
    await page.reload()
    await expect(page.getByRole('link', { name: /Quina 6871/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Mega-Sena 3070/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remover filtro Quina' })).toBeVisible()

    // Busca por número do concurso.
    await page.goto('/apostas')
    await page.getByLabel('Buscar por número do concurso').fill('3070')
    await page.getByRole('button', { name: 'Buscar' }).click()
    await expect(page).toHaveURL(/concurso=3070/)
    await expect(page.getByRole('link', { name: /Mega-Sena 3070/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Quina 6871/ })).toHaveCount(0)
  })

  test('excluir aposta pede confirmação com modalidade e concurso', async ({ page }) => {
    const { id, email } = await criarUsuario('membro')
    const { data: a } = await admin
      .from('apostas')
      .insert({
        user_id: id,
        modalidade_id: 1,
        tipo: 'simples',
        concurso_inicial: 3069,
        data_aposta: '2026-10-10',
        valor_pago_centavos: 600,
      })
      .select('id')
      .single()
    await admin
      .from('aposta_jogos')
      .insert({ aposta_id: a!.id, user_id: id, ordem: 1, dezenas: [3, 17, 22, 31, 40, 59] })

    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.goto(`/apostas/${a!.id}`)

    // O seed tem o resultado do 3069: 5 acertos destacados.
    await expect(page.getByText('Resultado do concurso 3069')).toBeVisible()
    await expect(page.getByText('· 6 dezenas · 5 acertos')).toBeVisible()

    await page.getByRole('button', { name: 'Excluir' }).click()
    await expect(
      page.getByRole('alertdialog', { name: 'Excluir a aposta Mega-Sena 3069?' }),
    ).toBeVisible()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click()
    await expect(page).toHaveURL('/apostas')
    await expect(page.getByText('Nenhuma aposta ainda')).toBeVisible()
  })

  test('dashboard mostra o gasto do mês', async ({ page }) => {
    const { id, email } = await criarUsuario('membro')
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const { data: a } = await admin
      .from('apostas')
      .insert({
        user_id: id,
        modalidade_id: 1,
        tipo: 'simples',
        concurso_inicial: 3070,
        data_aposta: hoje,
        valor_pago_centavos: 4200,
      })
      .select('id')
      .single()
    await admin
      .from('aposta_jogos')
      .insert({ aposta_id: a!.id, user_id: id, ordem: 1, dezenas: [1, 2, 3, 4, 5, 6, 7] })

    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    const gasto = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Gasto' }) })
    await expect(gasto.getByText('R$ 42,00', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mega-Sena 3070' })).toBeVisible()
    await semRolagemHorizontal(page)
  })
})
