import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'

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

/** .xlsx em memória com a aba Apostas. */
function planilha(linhas: Record<string, unknown>[]) {
  const livro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(linhas), 'Apostas')
  return {
    name: 'minhas-apostas.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
  }
}

/**
 * 50 linhas de Mega-Sena, uma aposta por linha. A 1ª é do concurso 3069 (sorteado no
 * seed: 03 17 22 31 40 58); a 21ª (linha 22 do arquivo) tem só 5 dezenas.
 */
const LINHAS = Array.from({ length: 50 }, (_, i) => ({
  grupo: `G${i + 1}`,
  modalidade: 'Mega-Sena',
  tipo: 'simples',
  concurso: i === 0 ? 3069 : 3100 + i,
  data_aposta: '11/10/2026',
  dezenas: i === 0 ? '03 17 22 31 40 58' : i === 20 ? '01 02 03 04 05' : '01 02 03 04 05 06',
  valor_pago: 6,
}))

test.describe('Aceite F3 (planilha)', () => {
  test('50 linhas com 1 inválida: importa as 49 válidas, confere o lote e acusa duplicatas', async ({
    page,
  }) => {
    const { id, email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    await page.goto('/importar')
    await expect(page.getByRole('heading', { name: 'Importar apostas' })).toBeVisible()
    await page.getByLabel(/Escolha a planilha/).setInputFiles(planilha(LINHAS))

    const resumo = page.getByRole('list', { name: 'Resumo da planilha' })
    await expect(resumo).toContainText('49 apostas válidas')
    await expect(resumo).toContainText('1 linha com erro')
    await expect(resumo).toContainText('0 possíveis duplicatas')
    await expect(
      page.getByText('Linha 22: Mega-Sena aceita de 6 a 20 dezenas; encontradas 5'),
    ).toBeVisible()
    await semRolagemHorizontal(page)

    await page.getByRole('button', { name: 'Importar 49 válidas' }).click()
    await expect(page).toHaveURL('/apostas?origem=excel')
    await expect(page.getByText('49 apostas importadas.')).toBeVisible()

    const { count } = await admin
      .from('apostas')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', id)
      .eq('origem', 'excel')
    expect(count).toBe(49)
    const { data: log } = await admin
      .from('importacoes')
      .select('origem, nome_arquivo, qtd_apostas, qtd_erros')
      .eq('user_id', id)
    expect(log).toEqual([
      { origem: 'excel', nome_arquivo: 'minhas-apostas.xlsx', qtd_apostas: 49, qtd_erros: 1 },
    ])

    // A aposta do concurso já sorteado é conferida logo após a importação (sena).
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('apostas')
          .select('status')
          .eq('user_id', id)
          .eq('concurso_inicial', 3069)
          .single()
        return data?.status
      })
      .toBe('premiada')

    // O mesmo arquivo de novo: tudo é possível duplicata e é pulado por padrão.
    await page.goto('/importar')
    await page.getByLabel(/Escolha a planilha/).setInputFiles(planilha(LINHAS))
    await expect(resumo).toContainText('49 possíveis duplicatas')
    await expect(page.getByRole('button', { name: 'Nada para importar' })).toBeDisabled()
    await page.getByLabel('Pular as possíveis duplicatas').click()
    await expect(page.getByRole('button', { name: 'Importar 49 válidas' })).toBeEnabled()
  })

  test('arquivo sem as colunas do modelo mostra o que falta', async ({ page }) => {
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.goto('/importar')
    await page
      .getByLabel(/Escolha a planilha/)
      .setInputFiles(planilha([{ grupo: 'A1', dezenas: '01 02 03 04 05 06' }]))
    await expect(page.getByText(/Faltam colunas obrigatórias: modalidade, tipo/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nada para importar' })).toBeDisabled()
  })
})
