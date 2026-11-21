import { expect, test, type Page } from '@playwright/test'

import {
  criarUsuario,
  entrarPelaTela,
  limparUsuariosDeTeste,
  semRolagemHorizontal,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

async function proximaEtapa(page: Page, ehMobile: boolean) {
  if (ehMobile) await page.getByRole('button', { name: 'Próximo' }).click()
}

test('divisão só pela quantidade: R$ 10,00 entre 3 pessoas grava a sua parte de R$ 3,34', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile'
  const { email } = await criarUsuario('membro')
  await entrarPelaTela(page, email)
  await expect(page).toHaveURL('/')

  await page.goto('/apostas/nova')
  await page.getByRole('button', { name: 'Mega-Sena' }).click()
  await proximaEtapa(page, mobile)
  await expect(page.getByLabel('Concurso', { exact: true })).toHaveValue('3070')
  await proximaEtapa(page, mobile)
  for (const d of [1, 2, 3, 4, 5, 6]) {
    await page
      .getByRole('button', { name: `Dezena ${String(d).padStart(2, '0')}`, exact: true })
      .first()
      .click()
  }
  await proximaEtapa(page, mobile)
  // Valor que não divide exato por 3: o 1º centavo da sobra fica com o usuário.
  await page.getByLabel('Valor pago').fill('10,00')
  await proximaEtapa(page, mobile)

  await page.getByRole('checkbox', { name: 'Dividir com outras pessoas' }).check()
  const modos = page.getByRole('radiogroup', { name: 'Como dividir?' })
  await expect(modos.getByRole('radio', { name: /Informar as pessoas/ })).toBeChecked()
  await modos.getByRole('radio', { name: /Só a quantidade/ }).click()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveCount(0)

  const qtd = page.getByLabel('Quantas pessoas dividem?')
  await expect(qtd).toHaveValue('2')
  await expect(page.getByText('Sua parte no gasto: R$ 5,00')).toBeVisible()

  // Mínimo de 2 pessoas.
  await qtd.fill('1')
  await page.getByRole('button', { name: 'Registrar aposta' }).click()
  await expect(page.getByText('Informe de 2 a 30 pessoas (você incluído).')).toBeVisible()

  await qtd.fill('2')
  await page.getByRole('button', { name: 'Uma pessoa a mais' }).click()
  await expect(qtd).toHaveValue('3')
  await expect(page.getByText('Sua parte no gasto: R$ 3,34')).toBeVisible()
  await expect(page.getByText(/as outras 2 pessoas: R\$ 3,33 cada/)).toBeVisible()
  await semRolagemHorizontal(page)

  await page.getByRole('button', { name: 'Registrar aposta' }).click()
  await expect(page).toHaveURL(/\/apostas\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').at(-1)!

  // O valor salvo bate com o resumo.
  await expect(
    page.locator('dt', { hasText: /^Sua parte$/ }).locator('xpath=following-sibling::dd'),
  ).toHaveText('R$ 3,34')
  const divisao = page.getByRole('table', { name: /Divisão do valor pago/ })
  await expect(divisao.getByRole('row')).toHaveCount(4)
  await expect(divisao.getByRole('row', { name: /Pessoa 3/ })).toContainText('R$ 3,33')

  // Na edição, reabre no modo "só a quantidade".
  await page.goto(`/apostas/${id}/editar`)
  if (mobile) {
    for (let i = 0; i < 4; i++) await proximaEtapa(page, mobile)
  }
  await expect(
    page
      .getByRole('radiogroup', { name: 'Como dividir?' })
      .getByRole('radio', { name: /Só a quantidade/ }),
  ).toBeChecked()
  await expect(page.getByLabel('Quantas pessoas dividem?')).toHaveValue('3')
})
