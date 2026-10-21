import { expect, test } from '@playwright/test'

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

test('Lotomania: 50 números + Aposta-Espelho em teimosinha de 4 concursos', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile'
  const proxima = async () => {
    if (mobile) await page.getByRole('button', { name: 'Próximo' }).click()
  }
  const { email } = await criarUsuario('membro')
  await entrarPelaTela(page, email)
  await expect(page).toHaveURL('/')

  await page.goto('/apostas/nova')
  await page.getByRole('button', { name: 'Lotomania' }).click()
  await proxima()

  await page.getByRole('radio', { name: /Teimosinha/ }).click()
  // Só as quantidades da CAIXA: 2, 3, 4, 6, 8, 9 ou 12 (e começa na menor).
  const qtds = page.getByRole('radiogroup', { name: 'Quantidade de concursos' }).getByRole('radio')
  await expect(qtds).toHaveText(['2', '3', '4', '6', '8', '9', '12'])
  await expect(page.getByRole('radio', { name: '2', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByRole('radio', { name: '4', exact: true }).click()
  // Seed: último concurso 2989 → sugere 2990.
  await expect(page.getByLabel('Concurso inicial')).toHaveValue('2990')
  await proxima()

  // Volante da CAIXA: 01…99 e o 00 por último.
  const volante = page.getByRole('group', { name: 'Volante do jogo 1' })
  await expect(volante.getByRole('button').first()).toHaveAccessibleName('Dezena 01')
  await expect(volante.getByRole('button').last()).toHaveAccessibleName('Dezena 00')

  // Espelho só fica disponível com os 50 números marcados.
  await expect(page.getByRole('button', { name: 'Aposta-Espelho do jogo 1' })).toBeDisabled()
  for (let d = 0; d < 50; d++) {
    await volante
      .getByRole('button', { name: `Dezena ${String(d).padStart(2, '0')}`, exact: true })
      .click()
  }
  await expect(page.getByText('50/50')).toBeVisible()
  await semRolagemHorizontal(page)
  await page.getByRole('button', { name: 'Aposta-Espelho do jogo 1' }).click()
  await expect(page.getByText('Jogo 2', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('group', { name: 'Volante do jogo 2' }).getByRole('button', { pressed: true }),
  ).toHaveCount(50)
  await proxima()

  // 2 jogos × R$ 3,00 × 4 concursos.
  await expect(page.getByLabel('Valor pago')).toHaveValue('24,00')
  await proxima()
  await page.getByRole('button', { name: 'Registrar aposta' }).click()
  await expect(page).toHaveURL(/\/apostas\/[0-9a-f-]{36}$/)

  const id = page.url().split('/').at(-1)!
  const { data: jogos } = await admin
    .from('aposta_jogos')
    .select('ordem, dezenas')
    .eq('aposta_id', id)
    .order('ordem')
  expect(jogos?.[0]?.dezenas).toEqual(Array.from({ length: 50 }, (_, i) => i))
  expect(jogos?.[1]?.dezenas).toEqual(Array.from({ length: 50 }, (_, i) => i + 50))
  const { data: concursos } = await admin
    .from('aposta_concursos')
    .select('numero_concurso')
    .eq('aposta_id', id)
    .order('numero_concurso')
  expect(concursos?.map((c) => c.numero_concurso)).toEqual([2990, 2991, 2992, 2993])
})
