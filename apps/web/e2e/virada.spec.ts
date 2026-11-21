import { expect, test } from '@playwright/test'

import {
  clienteAnonimo,
  criarUsuario,
  entrarPelaTela,
  limparUsuariosDeTeste,
  SENHA_TESTE,
  semRolagemHorizontal,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

test('Mega da Virada: lista a fazer com marcas e apostas registradas do concurso 3100', async ({
  page,
}) => {
  const { email } = await criarUsuario('membro')

  // Uma aposta da Mega-Sena no concurso 3100 e outra em outro concurso (esta não entra).
  const api = clienteAnonimo()
  await api.auth.signInWithPassword({ email, password: SENHA_TESTE })
  for (const concurso of [3100, 3090]) {
    const { error } = await api.rpc('salvar_aposta', {
      p_aposta: {
        modalidade_slug: 'megasena',
        tipo: 'simples',
        concurso_inicial: concurso,
        qtd_concursos: 1,
        data_aposta: '2026-11-21',
        valor_pago_centavos: 600,
        jogos: [[1, 2, 3, 4, 5, 6]],
        participantes: [],
      },
    })
    expect(error).toBeNull()
  }

  await entrarPelaTela(page, email)
  await expect(page).toHaveURL('/')
  await page.goto('/virada')

  await expect(page.getByRole('heading', { name: 'Mega da Virada', level: 1 })).toBeVisible()
  await expect(page.getByText('R$ 1.000.000.000,00')).toBeVisible()
  await expect(page.getByText('1 em 50.063.860')).toBeVisible()
  await expect(page.getByText('1 aposta, 1 jogo')).toBeVisible()

  // Lista a fazer: valida a descrição, adiciona, marca e remove.
  await expect(page.getByText('Nenhuma aposta na lista')).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Descreva a aposta')).toBeVisible()

  await page.getByLabel('Aposta a fazer').fill('Bolão do trabalho')
  await page.getByLabel('Valor (opcional)').fill('30,00')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await page.getByLabel('Aposta a fazer').fill('Jogos da família')
  await page.getByRole('button', { name: 'Adicionar' }).click()

  await expect(page.getByText('0 de 2')).toBeVisible()
  await expect(page.getByText('Falta pagar R$ 30,00.')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Bolão do trabalho: feita' }).click()
  await expect(page.getByText('1 de 2')).toBeVisible()
  await expect(page.getByText('Faltam 1')).toBeVisible()
  // A pendente sobe; a feita desce.
  await expect(
    page.getByRole('list', { name: 'Apostas a fazer' }).getByRole('listitem').first(),
  ).toContainText('Jogos da família')

  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Bolão do trabalho: feita' })).toBeChecked()

  await page.getByRole('button', { name: 'Remover Jogos da família' }).click()
  await expect(page.getByText('1 de 1')).toBeVisible()
  await expect(page.getByText('Tudo feito')).toBeVisible()

  await semRolagemHorizontal(page)
})

test('Mega da Virada: cada usuário vê só a própria lista', async ({ page }) => {
  const a = await criarUsuario('membro')
  const b = await criarUsuario('membro')
  const clienteA = clienteAnonimo()
  await clienteA.auth.signInWithPassword({ email: a.email, password: SENHA_TESTE })
  await clienteA
    .from('virada_itens')
    .insert({ concurso: 3100, descricao: 'Item secreto da A' })
    .throwOnError()

  await entrarPelaTela(page, b.email)
  await expect(page).toHaveURL('/')
  await page.goto('/virada')
  await expect(page.getByText('Nenhuma aposta na lista')).toBeVisible()
  await expect(page.getByText('Item secreto da A')).toHaveCount(0)
})
