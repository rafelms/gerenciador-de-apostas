import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import {
  clienteAnonimo,
  criarUsuario,
  entrarPelaTela,
  limparUsuariosDeTeste,
  semRolagemHorizontal,
  SENHA_TESTE,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

// Os três jogos de Lotofácil do aceite da F5.
const J1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const J2 = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
const J3 = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 2, 4]

/** Linha da tabela "Jogo a jogo" → [Baixos, Médios, Altos]. */
async function faixasDoJogo(page: import('@playwright/test').Page, jogo: string) {
  const linha = page
    .getByRole('table', { name: 'Estatísticas de cada jogo' })
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: jogo, exact: true }) })
  const celulas = await linha.getByRole('cell').allInnerTexts()
  // Coluna 0 = dezenas; as três seguintes são as faixas.
  return celulas.slice(1, 4)
}

test.describe('Analisador (F5.1)', () => {
  test('aceite: 3 jogos de Lotofácil → faixas e matriz 3×3', async ({ page }) => {
    const u = await criarUsuario()
    await entrarPelaTela(page, u.email)
    await expect(page).toHaveURL('/')
    await page.goto('/analisador')
    await page.getByRole('tab', { name: 'Colar jogos' }).click()
    await page.getByLabel('Modalidade').selectOption('lotofacil')
    await page
      .getByLabel('Jogos, um por linha')
      .fill([J1, J2, J3].map((j) => j.join(' ')).join('\n'))

    expect(await faixasDoJogo(page, 'J1')).toEqual(['8', '7', '0'])
    expect(await faixasDoJogo(page, 'J2')).toEqual(['0', '7', '8'])
    expect(await faixasDoJogo(page, 'J3')).toEqual(['6', '5', '4'])

    const matriz = page.getByRole('table', { name: /Dezenas em comum/ })
    const linhas = matriz.getByRole('row')
    await expect(linhas).toHaveCount(4)
    await expect(linhas.nth(1).getByRole('cell')).toHaveText([
      '—mesmo jogo',
      '5',
      '10 (acima do limite)',
    ])
    await expect(linhas.nth(2).getByRole('cell')).toHaveText(['5', '—mesmo jogo', '8'])
    await expect(linhas.nth(3).getByRole('cell')).toHaveText([
      '10 (acima do limite)',
      '8',
      '—mesmo jogo',
    ])
    // Limite padrão para 15 de 25: k²/N = 9 → só J1 × J3 passa.
    await expect(page.getByText('1 par com mais de 9 em comum')).toBeVisible()

    await expect(page.getByRole('note')).toHaveText(
      'Estatísticas descritivas; todos os jogos têm a mesma probabilidade de sair.',
    )
    await semRolagemHorizontal(page)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(
      axe.violations.map(
        (v) =>
          `${v.id}: ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`,
      ),
    ).toEqual([])
  })

  test('faixas editadas ficam salvas no perfil', async ({ page }) => {
    const u = await criarUsuario()
    await entrarPelaTela(page, u.email)
    await expect(page).toHaveURL('/')
    await page.goto('/analisador')
    await page.getByRole('tab', { name: 'Colar jogos' }).click()
    await page.getByLabel('Modalidade').selectOption('lotofacil')
    await page.getByLabel('Jogos, um por linha').fill(J1.join(' '))

    await page.getByRole('button', { name: 'Editar faixas' }).click()
    // Buraco entre 8 e 10: não salva e explica.
    await page.getByLabel('Início da faixa 2').fill('10')
    await page.getByRole('button', { name: 'Salvar faixas' }).click()
    await expect(page.getByRole('alert')).toContainText('faltam as dezenas de 9 a 9')

    // Duas faixas: 1–12 e 13–25.
    await page.getByRole('button', { name: 'Remover a faixa 3' }).click()
    await page.getByLabel('Nome da faixa 1').fill('Até 12')
    await page.getByLabel('Fim da faixa 1').fill('12')
    await page.getByLabel('Nome da faixa 2').fill('Acima')
    await page.getByLabel('Início da faixa 2').fill('13')
    await page.getByLabel('Fim da faixa 2').fill('25')
    await page.getByRole('button', { name: 'Salvar faixas' }).click()
    await expect(page.getByText('Faixas salvas.')).toBeVisible()

    await page.reload()
    await page.getByRole('tab', { name: 'Colar jogos' }).click()
    await page.getByLabel('Modalidade').selectOption('lotofacil')
    await page.getByLabel('Jogos, um por linha').fill(J1.join(' '))
    await expect(page.getByText('Faixas: Até 12 01–12 · Acima 13–25')).toBeVisible()
    expect((await faixasDoJogo(page, 'J1')).slice(0, 2)).toEqual(['12', '3'])
  })

  test('analisa os jogos de uma aposta pelo link', async ({ page }) => {
    const u = await criarUsuario()
    const cliente = clienteAnonimo()
    await cliente.auth.signInWithPassword({ email: u.email, password: SENHA_TESTE })
    const { data: id, error } = await cliente.rpc('salvar_aposta', {
      p_aposta: {
        modalidade_slug: 'megasena',
        tipo: 'simples',
        concurso_inicial: 3069,
        qtd_concursos: 1,
        data_aposta: '2026-10-10',
        valor_pago_centavos: 1200,
        jogos: [
          [3, 17, 22, 31, 40, 50],
          [3, 17, 22, 41, 42, 43],
        ],
        participantes: [],
      } as never,
    })
    if (error) throw error

    await entrarPelaTela(page, u.email)
    await expect(page).toHaveURL('/')
    await page.goto(`/analisador?aposta=${id as string}`)
    await expect(page.getByLabel('Aposta', { exact: true })).toHaveValue(id as string)
    await expect(page.getByText(/Média: 3 dezenas/)).toBeVisible()
    await expect(
      page
        .getByRole('table', { name: 'Estatísticas de cada jogo' })
        .getByRole('rowheader', { name: 'J2', exact: true }),
    ).toBeVisible()
    await semRolagemHorizontal(page)
  })
})
