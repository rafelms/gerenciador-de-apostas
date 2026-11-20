import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'

import {
  admin,
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

/** Totais do usuário pela view de resumo (a mesma do dashboard), com a sessão dele. */
async function totais(email: string) {
  const cliente = clienteAnonimo()
  await cliente.auth.signInWithPassword({ email, password: SENHA_TESTE })
  const { data, error } = await cliente
    .from('vw_apostas_resumo')
    .select('valor_pago_centavos, gasto_usuario_centavos, qtd_jogos, qtd_participantes')
  if (error) throw error
  const soma = (campo: keyof NonNullable<typeof data>[number]) =>
    (data ?? []).reduce((s, l) => s + Number(l[campo] ?? 0), 0)
  return {
    apostas: data?.length ?? 0,
    pago: soma('valor_pago_centavos'),
    gasto: soma('gasto_usuario_centavos'),
    jogos: soma('qtd_jogos'),
    participantes: soma('qtd_participantes'),
  }
}

test.describe('Aceite F3 (exportação)', () => {
  test('exportar e reimportar em conta limpa dá os mesmos totais', async ({ page }, info) => {
    const a = await criarUsuario('membro')
    await entrarPelaTela(page, a.email)
    await expect(page).toHaveURL('/')
    await page.goto('/importar')
    await page.getByLabel(/Escolha a planilha/).setInputFiles(
      planilha([
        {
          grupo: 'B',
          modalidade: 'Mega-Sena',
          tipo: 'bolao',
          concurso: 3070,
          data_aposta: '14/10/2026',
          dezenas: '02 09 24 28 44 48 49',
          total_cotas: 38,
          cotas_usuario: 1,
          valor_cota: 8.84,
          tarifa: 3.09,
          valor_pago: 11.93,
          participantes: 'Eu:1:5,00; Ana:1:6,93',
          numero_cota: 35,
        },
        { grupo: 'B', dezenas: '02 06 28 41 44 49 53' },
        {
          grupo: 'T',
          modalidade: 'Quina',
          tipo: 'teimosinha',
          concurso: 6875,
          qtd_concursos: 3,
          data_aposta: '15/10/2026',
          dezenas: '08 19 33 57 71',
          valor_pago: 9,
        },
        {
          grupo: 'L',
          modalidade: 'Lotomania',
          tipo: 'simples',
          concurso: 2990,
          data_aposta: '16/10/2026',
          dezenas: Array.from({ length: 50 }, (_, i) => String(i * 2).padStart(2, '0')).join(' '),
          valor_pago: 3,
          participantes: 'Rafael*:2; Bia:1',
          observacao: 'diz "oi"; tchau',
        },
      ]),
    )
    await page.getByRole('button', { name: 'Importar 3 apostas' }).click()
    await expect(page).toHaveURL('/apostas?origem=excel')
    const esperado = await totais(a.email)
    expect(esperado).toEqual({ apostas: 3, pago: 2393, gasto: 1600, jogos: 4, participantes: 4 })

    // Da lista para a exportação, mantendo o filtro de origem.
    await page.getByRole('main').getByRole('link', { name: 'Exportar' }).click()
    await expect(page).toHaveURL('/exportar?origem=excel')
    await expect(page.getByRole('list', { name: 'Filtros da exportação' })).toContainText(
      'Origem: Excel',
    )

    const [xlsx] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar Excel (.xlsx)' }).click(),
    ])
    expect(xlsx.suggestedFilename()).toMatch(/^lotogestor-apostas-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const livro = XLSX.read(readFileSync((await xlsx.path())!))
    expect(livro.SheetNames).toEqual(['Apostas', 'Prêmios', 'Resumo'])
    expect(XLSX.utils.sheet_to_json(livro.Sheets.Resumo!)).toHaveLength(3)

    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar CSV' }).click(),
    ])
    const caminhoCsv = info.outputPath(csv.suggestedFilename())
    await csv.saveAs(caminhoCsv)

    // Conta limpa: importa o CSV exportado.
    const b = await criarUsuario('membro')
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    await entrarPelaTela(page, b.email)
    await expect(page).toHaveURL('/')
    await page.goto('/importar')
    await page.getByLabel(/Escolha a planilha/).setInputFiles(caminhoCsv)
    await expect(page.getByRole('list', { name: 'Resumo da planilha' })).toContainText(
      '3 apostas válidas',
    )
    await page.getByRole('button', { name: 'Importar 3 apostas' }).click()
    await expect(page).toHaveURL('/apostas?origem=excel')
    expect(await totais(b.email)).toEqual(esperado)
  })
})

/**
 * PDF mínimo com uma linha de texto por linha (Helvetica, WinAnsi), como o comprovante
 * do app Loterias CAIXA entrega ao pdf.js. Basta para testar a extração de verdade.
 */
function pdfDeTexto(texto: string, nome = 'comprovante.pdf') {
  const escapar = (l: string) => l.replace(/[\\()]/g, (c) => `\\${c}`)
  const linhas = texto.split('\n').filter((l) => l.trim())
  const conteudo = `BT /F1 9 Tf 12 TL 40 810 Td ${linhas.map((l) => `(${escapar(l)}) Tj T*`).join(' ')} ET`
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const posicoes: number[] = []
  objetos.forEach((o, i) => {
    posicoes.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  pdf += posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return { name: nome, mimeType: 'application/pdf', buffer: Buffer.from(pdf, 'latin1') }
}

const FIXTURE_PDF = readFileSync(
  new URL('../../../packages/shared/test/fixtures/bolao-megasena-01.txt', import.meta.url),
  'utf8',
)

test.describe('Aceite F3 (comprovante em PDF)', () => {
  test('importa o bolão do PDF sem nome nem CPF e bloqueia o mesmo PDF na 2ª vez', async ({
    page,
  }) => {
    const { id, email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.goto('/importar')
    await page.getByRole('tab', { name: 'Comprovante (PDF)' }).click()
    await expect(page).toHaveURL('/importar?aba=pdf')

    await page
      .getByLabel(/Escolha os comprovantes/)
      .setInputFiles([
        pdfDeTexto(FIXTURE_PDF, 'bolao-mega.pdf'),
        pdfDeTexto('Fatura do cartão\nTotal: R$ 10,00', 'fatura.pdf'),
      ])

    const bolao = page.getByRole('region', { name: 'Comprovante bolao-mega.pdf' })
    await expect(bolao.getByText('Concurso 3070')).toBeVisible()
    await expect(
      bolao.getByRole('list', { name: 'Jogos do comprovante' }).getByRole('listitem'),
    ).toHaveCount(8)
    await expect(bolao.getByLabel('Valor total')).toHaveValue('11,93')
    await expect(bolao.getByLabel('Nº da cota')).toHaveValue('35')
    await expect(page.getByRole('region', { name: 'Comprovante fatura.pdf' })).toContainText(
      'Não parece um comprovante de aposta das Loterias CAIXA.',
    )
    await semRolagemHorizontal(page)

    // A revisão revalida a cada correção.
    await bolao.getByLabel('Valor total').fill('12,00')
    await expect(bolao.getByRole('list', { name: 'Erros' })).toContainText(
      'O valor total (R$ 12,00) não é a soma da cota com a tarifa (R$ 11,93).',
    )
    await expect(page.getByRole('button', { name: 'Nada para importar' })).toBeDisabled()
    await bolao.getByLabel('Valor total').fill('11,93')
    await expect(bolao.getByLabel('Importar este comprovante')).toBeChecked()

    // O payload enviado ao banco não tem nome, CPF nem o código puro do recibo.
    const envio = page.waitForRequest((r) => r.url().includes('/rpc/importar_apostas'))
    await page.getByRole('button', { name: 'Importar 1 comprovante' }).click()
    const corpo = (await envio).postData() ?? ''
    for (const proibido of [
      'FULANO',
      'SILVA',
      '000.000.000-00',
      '0000AAAA1111BBBB2222CCCC3333DDDD4444',
    ]) {
      expect(corpo).not.toContain(proibido)
    }
    const hash = createHash('sha256').update('0000AAAA1111BBBB2222CCCC3333DDDD4444').digest('hex')
    expect(corpo).toContain(hash)
    await expect(page).toHaveURL('/apostas?origem=pdf')
    await expect(page.getByText('1 comprovante importado.')).toBeVisible()

    const { data: aposta } = await admin
      .from('apostas')
      .select(
        'origem, tipo, concurso_inicial, data_aposta, valor_pago_centavos, valor_cota_centavos, tarifa_centavos, bolao_total_cotas, bolao_cotas_usuario, bolao_numero_cota, comprovante_hash, observacao, aposta_jogos (id)',
      )
      .eq('user_id', id)
      .single()
    expect(aposta).toMatchObject({
      origem: 'pdf',
      tipo: 'bolao',
      concurso_inicial: 3070,
      data_aposta: '2026-10-14',
      valor_pago_centavos: 1193,
      valor_cota_centavos: 884,
      tarifa_centavos: 309,
      bolao_total_cotas: 38,
      bolao_cotas_usuario: 1,
      bolao_numero_cota: 35,
      comprovante_hash: hash,
      observacao: 'Bolão registrado pela lotérica em 11/10/2026.',
    })
    expect(aposta!.aposta_jogos).toHaveLength(8)

    // O mesmo PDF de novo: bloqueado como duplicata.
    await page.goto('/importar?aba=pdf')
    await page
      .getByLabel(/Escolha os comprovantes/)
      .setInputFiles(pdfDeTexto(FIXTURE_PDF, 'bolao-mega.pdf'))
    await expect(page.getByRole('region', { name: 'Comprovante bolao-mega.pdf' })).toContainText(
      /Este comprovante já foi importado em \d{2}\/\d{2}\/\d{4}\./,
    )
    await expect(page.getByRole('button', { name: 'Nada para importar' })).toBeDisabled()
  })
})
