import { expect, test, type Page } from '@playwright/test'

import {
  admin,
  clienteAnonimo,
  criarUsuario,
  entrarComoAdminComMfa,
  entrarPelaTela,
  limparUsuariosDeTeste,
  semRolagemHorizontal,
  SENHA_TESTE,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

/**
 * Três apostas em meses diferentes; a da Mega 3069 (sorteado no seed) fez a quina
 * e ganhou R$ 1.000,00 líquidos. Gasto 600 + 600 (cota) + 350 = R$ 15,50.
 */
async function semearApostas(email: string, userId: string) {
  const cliente = clienteAnonimo()
  await cliente.auth.signInWithPassword({ email, password: SENHA_TESTE })
  const base = { qtd_concursos: 1, participantes: [] }
  const salvar = async (aposta: Record<string, unknown>) => {
    const { data, error } = await cliente.rpc('salvar_aposta', {
      p_aposta: { ...base, ...aposta } as never,
    })
    if (error) throw error
    return data as string
  }
  const premiada = await salvar({
    modalidade_slug: 'megasena',
    tipo: 'simples',
    concurso_inicial: 3069,
    data_aposta: '2026-10-10',
    valor_pago_centavos: 600,
    jogos: [[3, 17, 22, 31, 40, 50]],
  })
  await salvar({
    modalidade_slug: 'megasena',
    tipo: 'bolao',
    concurso_inicial: 3070,
    data_aposta: '2026-09-15',
    valor_pago_centavos: 600,
    bolao_total_cotas: 2,
    bolao_cotas_usuario: 1,
    valor_cota_centavos: 600,
    jogos: [[1, 2, 3, 4, 5, 6]],
  })
  await salvar({
    modalidade_slug: 'lotofacil',
    tipo: 'simples',
    concurso_inicial: 3521,
    data_aposta: '2026-11-05',
    valor_pago_centavos: 350,
    jogos: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]],
  })

  // O que a conferência grava (service role).
  const { data: concurso } = await admin
    .from('concursos')
    .select('id, modalidades!inner(slug)')
    .eq('numero', 3069)
    .eq('modalidades.slug', 'megasena')
    .single()
  const { data: jogo } = await admin
    .from('aposta_jogos')
    .select('id')
    .eq('aposta_id', premiada)
    .single()
  await admin.from('conferencias').insert({
    aposta_jogo_id: jogo!.id,
    concurso_id: concurso!.id,
    aposta_id: premiada,
    user_id: userId,
    acertos: 5,
    dezenas_acertadas: [3, 17, 22, 31, 40],
    premios_por_faixa: { '6': 0, '5': 1, '4': 0 },
  })
  await admin.from('premios').insert({
    aposta_id: premiada,
    user_id: userId,
    concurso_id: concurso!.id,
    bruto_aposta_centavos: 100000,
    bruto_usuario_centavos: 100000,
    ir_usuario_centavos: 0,
    liquido_usuario_centavos: 100000,
    regra_ir: {},
    prazo_resgate: '2027-01-09',
  })
  await admin.from('apostas').update({ status: 'premiada' }).eq('id', premiada)
  return { cliente, premiada }
}

const kpi = (page: Page, titulo: string) =>
  page
    .getByRole('region', { name: 'Indicadores do período' })
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: titulo, exact: true }) })

test.describe('Aceite F4 (dashboard)', () => {
  test('os totais do período batem com a soma da lista filtrada', async ({ page }, info) => {
    const { id, email } = await criarUsuario('membro')
    const { cliente, premiada } = await semearApostas(email, id)
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')

    await page.goto('/?periodo=personalizado&de=2026-09-01&ate=2026-11-30')
    await expect(page.getByText('Resumo de 01/09/2026 a 30/11/2026')).toBeVisible()

    // Soma "manual" das linhas da lista com o mesmo filtro.
    const { data: linhas } = await cliente
      .from('vw_apostas_resumo')
      .select('gasto_usuario_centavos, recuperado_usuario_centavos')
      .gte('data_aposta', '2026-09-01')
      .lte('data_aposta', '2026-11-30')
    const gasto = linhas!.reduce((s, l) => s + (l.gasto_usuario_centavos ?? 0), 0)
    const recuperado = linhas!.reduce((s, l) => s + (l.recuperado_usuario_centavos ?? 0), 0)
    expect([linhas!.length, gasto, recuperado]).toEqual([3, 1550, 100000])

    await expect(kpi(page, 'Gasto')).toContainText('R$ 15,50')
    await expect(kpi(page, 'Recuperado')).toContainText('R$ 1.000,00')
    await expect(kpi(page, 'Saldo')).toContainText('+R$ 984,50')
    await expect(kpi(page, 'Apostas')).toContainText('3')
    await expect(kpi(page, 'Premiadas')).toContainText('100%')

    // Gráfico mês a mês com a tabela equivalente.
    const evolucao = page.getByRole('region', { name: 'Evolução mês a mês' })
    await expect(evolucao.locator('.recharts-line')).toHaveCount(3)
    await evolucao.getByText('Ver os números').click()
    await expect(
      evolucao.getByRole('table', { name: 'Evolução mês a mês' }).getByRole('row'),
    ).toHaveCount(4)
    await expect(
      evolucao
        .getByRole('row', { name: /nov\.\/26/ })
        .getByRole('cell')
        .last(),
    ).toHaveText('+R$ 984,50')

    // ROI por modalidade e por tipo.
    const porModalidade = page.getByRole('table', { name: 'ROI por modalidade' })
    await expect(porModalidade.getByRole('row', { name: /Mega-Sena/ })).toContainText('R$ 12,00')
    await expect(porModalidade.getByRole('row', { name: /Lotofácil/ })).toContainText('−R$ 3,50')
    await expect(page.getByRole('table', { name: 'ROI por tipo' }).getByRole('row')).toHaveCount(3)

    // Destaques.
    await expect(
      page.getByRole('region', { name: 'Melhores saldos' }).getByRole('link').first(),
    ).toHaveAttribute('href', `/apostas/${premiada}`)
    await expect(page.getByRole('region', { name: 'Mais acertos' })).toContainText('5 de 6')
    await expect(page.getByRole('region', { name: 'Quase lá' })).toContainText('Concurso 3069')
    const proximos = page.getByRole('region', { name: 'Próximos sorteios com apostas suas' })
    await expect(proximos).toContainText('Concurso 3070 · 14/10/2026')
    await expect(proximos).toContainText('Concurso 3521')
    await semRolagemHorizontal(page)
    await page.screenshot({
      path: info.outputPath(`dashboard-${info.project.name}.png`),
      fullPage: true,
    })

    // O filtro de modalidade vai para a URL e muda os totais.
    await page.getByLabel('Modalidade', { exact: true }).selectOption('lotofacil')
    await expect(page).toHaveURL(/modalidade=lotofacil/)
    await expect(kpi(page, 'Gasto')).toContainText('R$ 3,50')
    await expect(kpi(page, 'Apostas')).toContainText('1')
    await page.getByLabel('Modalidade', { exact: true }).selectOption('')

    // "Ver as 3 apostas do período" abre a lista com o mesmo filtro.
    await page.getByRole('link', { name: 'Ver as 3 apostas do período' }).click()
    await expect(page).toHaveURL('/apostas?de=2026-09-01&ate=2026-11-30')
    await expect(
      page.getByRole('main').getByRole('link', { name: /^(Mega-Sena|Lotofácil) \d/ }),
    ).toHaveCount(3)
  })

  test('escolher mês: começa no atual e navega pelas setas', async ({ page }) => {
    const { id, email } = await criarUsuario('membro')
    await semearApostas(email, id)
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    const atual = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date())
    await page.getByLabel('Período', { exact: true }).selectOption('escolher')
    await expect(page).toHaveURL(`/?periodo=escolher&mes=${atual}`)
    await expect(page.getByRole('button', { name: 'Próximo mês' })).toBeDisabled()

    // Outubro de 2026: só a Mega premiada (R$ 6,00 gastos, R$ 1.000,00 de volta).
    await page.getByLabel('Mês', { exact: true }).selectOption('2026-10')
    await expect(page).toHaveURL('/?periodo=escolher&mes=2026-10')
    await expect(page.getByText('Resumo de outubro de 2026')).toBeVisible()
    await expect(kpi(page, 'Gasto')).toContainText('R$ 6,00')
    await expect(kpi(page, 'Recuperado')).toContainText('R$ 1.000,00')
    await expect(page.getByRole('heading', { name: 'Orçamento de outubro de 2026' })).toBeVisible()

    await page.getByRole('button', { name: 'Mês anterior' }).click()
    await expect(page).toHaveURL('/?periodo=escolher&mes=2026-09')
    await expect(kpi(page, 'Gasto')).toContainText('R$ 6,00')
    await expect(kpi(page, 'Recuperado')).toContainText('R$ 0,00')
    await semRolagemHorizontal(page)
  })

  test('período sem apostas mostra o estado vazio, sem gráficos', async ({ page }) => {
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.getByLabel('Período', { exact: true }).selectOption('ano')
    await expect(page).toHaveURL('/?periodo=ano')
    await expect(page.getByText('Nenhuma aposta neste período')).toBeVisible()
    await expect(page.locator('.recharts-surface')).toHaveCount(0)
  })
})

test.describe('Calendário (F4.3)', () => {
  test('apostas, sorteios, prêmio e prazo no mês certo, sem rolagem lateral', async ({
    page,
  }, info) => {
    const { id, email } = await criarUsuario('membro')
    await semearApostas(email, id)
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    await page.goto('/calendario?mes=2026-10')
    await expect(page.getByRole('heading', { name: 'outubro de 2026' })).toBeVisible()

    if (info.project.name === 'desktop') {
      // Grade: o dia 11 tem prêmio e sorteio; tocar abre a lista do dia.
      await page.getByRole('button', { name: /^domingo, 11 de outubro: / }).click()
      const painel = page.getByRole('region', { name: 'domingo, 11 de outubro' })
      await expect(painel.getByRole('link', { name: /Prêmio a resgatar/ })).toContainText(
        'R$ 1.000,00',
      )
      await expect(painel.getByRole('link', { name: /Sorteio/ })).toContainText(
        '1 aposta · sorteado',
      )
      await expect(
        page.getByRole('button', { name: /^sábado, 10 de outubro: 1 aposta feita$/ }),
      ).toBeVisible()
    } else {
      const semana = page.getByRole('region', { name: 'Semana de 11 a 17 de out.' })
      await expect(semana.getByRole('link', { name: /Prêmio a resgatar/ })).toContainText(
        'R$ 1.000,00',
      )
      await expect(semana.getByRole('link', { name: /Sorteio.*3070/ })).toContainText(
        // Data prevista (data_proximo do 3069) já passou e o resultado não saiu.
        'aguardando resultado',
      )
      await expect(page.getByRole('region', { name: 'Semana de 4 a 10 de out.' })).toContainText(
        'Aposta feita',
      )
    }
    await semRolagemHorizontal(page)
    await page.screenshot({
      path: info.outputPath(`calendario-${info.project.name}.png`),
      fullPage: true,
    })

    // Navegação de mês pela URL; o fim do prazo de resgate cai em janeiro.
    await page.getByRole('button', { name: 'Mês anterior' }).click()
    await expect(page).toHaveURL('/calendario?mes=2026-09')
    await expect(page.getByRole('heading', { name: 'setembro de 2026' })).toBeVisible()
    await page.goto('/calendario?mes=2027-01')
    await expect(
      page.getByRole('link', { name: /Fim do prazo de resgate/ }).filter({ visible: true }),
    ).toContainText('R$ 1.000,00')
  })
})

/** Hoje no fuso de São Paulo (yyyy-mm-dd): o orçamento é do mês corrente. */
function hojeSp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

test.describe('Orçamento (F4.4)', () => {
  test('R$ 100: aposta que leva a R$ 85 avisa 80% uma vez; até R$ 90 não avisa de novo', async ({
    page,
  }, info) => {
    const { email } = await criarUsuario('membro')
    await entrarPelaTela(page, email)
    await expect(page).toHaveURL('/')
    const cliente = clienteAnonimo()
    await cliente.auth.signInWithPassword({ email, password: SENHA_TESTE })
    const apostar = async (valor: number, concurso: number) => {
      const { error } = await cliente.rpc('salvar_aposta', {
        p_aposta: {
          modalidade_slug: 'megasena',
          tipo: 'simples',
          concurso_inicial: concurso,
          qtd_concursos: 1,
          data_aposta: hojeSp(),
          valor_pago_centavos: valor,
          jogos: [[1, 2, 3, 4, 5, 6]],
          participantes: [],
        } as never,
      })
      if (error) throw error
    }

    // Sem orçamento: o dashboard só convida.
    await expect(page.getByRole('link', { name: 'Defina um orçamento' })).toBeVisible()

    await page.goto('/orcamento')
    await expect(page.getByText('Nenhum limite neste mês')).toBeVisible()
    await page
      .getByLabel('Para', { exact: true })
      .selectOption({ label: 'Geral (todas as modalidades)' })
    await page.getByLabel('Limite do mês').fill('100,00')
    await page.getByRole('button', { name: 'Adicionar limite' }).click()
    await expect(page.getByText('Limite criado.')).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Orçamento geral' })).toHaveAttribute(
      'aria-valuetext',
      'R$ 0,00 de R$ 100,00 (0%)',
    )

    await apostar(8500, 4001)
    const sino = page.getByRole('banner').getByRole('link', { name: /^Notificações/ })
    await expect(sino).toHaveAccessibleName('Notificações, 1 não lida', { timeout: 5000 })
    await apostar(500, 4002)

    await page.goto('/')
    const barra = page.getByRole('progressbar', { name: 'Orçamento geral' })
    await expect(barra).toHaveAttribute('aria-valuetext', 'R$ 90,00 de R$ 100,00 (90%)')
    await expect(page.getByRole('region', { name: /^Orçamento de / })).toContainText(
      'Restam R$ 10,00',
    )

    await page.goto('/notificacoes')
    await expect(page.getByText('Você usou 80% do orçamento geral de')).toHaveCount(1)
    await expect(
      page.getByText('Você usou R$ 85,00 de R$ 100,00 este mês.', { exact: false }),
    ).toBeVisible()
    await expect(sino).toHaveAccessibleName('Notificações, 1 não lida')

    // No formulário (desktop, tudo numa página; no celular é a etapa de valores),
    // o orçamento do mês da aposta aparece junto do valor.
    if (info.project.name === 'desktop') {
      await page.goto('/apostas/nova')
      await expect(page.getByRole('progressbar', { name: 'Orçamento geral' })).toHaveAttribute(
        'aria-valuetext',
        'R$ 90,00 de R$ 100,00 (90%)',
      )
    }

    // Alterar e excluir o limite.
    await page.goto('/orcamento')
    await page.getByRole('button', { name: 'Alterar limite' }).click()
    await page.getByLabel('Novo limite (Geral)').fill('200,00')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByRole('progressbar', { name: 'Orçamento geral' })).toHaveAttribute(
      'aria-valuetext',
      'R$ 90,00 de R$ 200,00 (45%)',
    )
    await semRolagemHorizontal(page)
    await page.getByRole('button', { name: 'Excluir o limite Geral' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click()
    await expect(page.getByText('Nenhum limite neste mês')).toBeVisible()
  })
})

test.describe('Métricas do admin (F4.5)', () => {
  test('admin vê só os agregados de cada usuário, com totais gerais', async ({ page }) => {
    const { id, email } = await criarUsuario('membro')
    const nome = `Membro Métricas ${id.slice(0, 6)}`
    await admin.from('profiles').update({ nome }).eq('id', id)
    await semearApostas(email, id)

    await entrarComoAdminComMfa(page)
    await page.goto('/admin')
    await page.getByRole('link', { name: /Métricas/ }).click()
    await expect(page).toHaveURL('/admin/metricas')
    await expect(page.getByRole('heading', { name: 'Métricas', level: 1 })).toBeVisible()

    await page.getByLabel('Período', { exact: true }).selectOption('tudo')
    await expect(page).toHaveURL('/admin/metricas?periodo=tudo')

    const linha = page
      .getByRole('table', { name: 'Métricas por usuário' })
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: new RegExp(nome) }) })
    await expect(linha).toContainText('3 apostas')
    await expect(linha).toContainText('última em 05/11/2026')
    await expect(linha.getByRole('cell').nth(0)).toHaveText('R$ 15,50')
    await expect(linha.getByRole('cell').nth(1)).toHaveText('R$ 1.000,00')
    await expect(linha).toContainText('Mega-Sena')
    await expect(linha).toContainText('Lotofácil')
    await expect(page.getByRole('region', { name: 'Gasto e recuperado por usuário' })).toBeVisible()
    await semRolagemHorizontal(page)
  })
})
