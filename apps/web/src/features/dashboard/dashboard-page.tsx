import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowUpRight,
  Hash,
  ListFilter,
  Percent,
  Plus,
  RefreshCw,
  Ticket,
  Trophy,
  Wallet,
} from 'lucide-react'
import { lazy, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { MoneyText } from '@/components/money-text'
import { SelectNativo } from '@/components/select-nativo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-provider'
import { ApostaCard } from '@/features/apostas/aposta-card'
import { rotuloMes } from '@/features/calendario/calendario'
import { useModalidades } from '@/features/modalidades/use-modalidades'
import { ResumoOrcamento } from '@/features/orcamento/barra-orcamento'
import { hojeIso } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import {
  filtrosDashboardDaUrl,
  filtrosDashboardParaUrl,
  intervaloDoPeriodo,
  PERIODOS,
  rotulosPeriodo,
  serieMensal,
  type FiltrosDashboard,
} from './periodo'
import { calcularTotais, carregarDashboard, ultimasApostas, type DadosDashboard } from './resumo'
import { linhasPorModalidade, linhasPorTipo, porcentagem } from './linhas'
import {
  CartaoGrafico,
  Legenda,
  ProximosSorteios,
  QuaseLa,
  TabelaRoi,
  ValeramAPena,
} from './secoes'
import { SERIES_BARRAS, SERIES_MENSAL } from './series'

const graficos = () => import('./graficos')
const GraficoMensal = lazy(async () => ({ default: (await graficos()).GraficoMensal }))
const GraficoGastoRecuperado = lazy(async () => ({
  default: (await graficos()).GraficoGastoRecuperado,
}))
const GraficoAcertos = lazy(async () => ({ default: (await graficos()).GraficoAcertos }))

/** Dashboard (seção 11.7): indicadores, gráficos e destaques do período escolhido. */
export function DashboardPage() {
  const { perfil } = useAuth()
  const [params, setParams] = useSearchParams()
  const filtros = filtrosDashboardDaUrl(params)
  const hoje = hojeIso()
  const intervalo = intervaloDoPeriodo(filtros, hoje)
  const { data: modalidades } = useModalidades()
  const modalidade = modalidades?.find((m) => m.slug === filtros.modalidade)

  const dados = useQuery({
    queryKey: chaves.dashboard(intervalo.inicio, intervalo.fim, modalidade?.id ?? null),
    queryFn: () => carregarDashboard(intervalo.inicio, intervalo.fim, modalidade?.id),
    // Com filtro de modalidade, espera o catálogo para saber o id.
    enabled: !filtros.modalidade || !!modalidades,
    placeholderData: keepPreviousData,
  })
  const ultimas = useQuery({
    queryKey: [...chaves.apostas, 'ultimas'],
    queryFn: () => ultimasApostas(5),
  })

  function mudar(f: Partial<FiltrosDashboard>) {
    setParams(filtrosDashboardParaUrl({ ...filtros, ...f }), { replace: true })
  }

  const primeiroNome = perfil?.nome.split(' ')[0]
  const totais = dados.data && calcularTotais(dados.data.totais)
  const linkLista = `/apostas?${new URLSearchParams({
    ...(intervalo.inicio && { de: intervalo.inicio }),
    ...(intervalo.fim && { ate: intervalo.fim }),
    ...(filtros.modalidade && { modalidade: filtros.modalidade }),
  })}`

  return (
    <>
      <CabecalhoPagina
        titulo={primeiroNome ? `Olá, ${primeiroNome}` : 'Início'}
        descricao={`Resumo de ${intervalo.rotulo}${modalidade ? ` · ${modalidade.nome}` : ''}`}
        acoes={
          <Button asChild className="hidden lg:inline-flex">
            <Link to="/apostas/nova">
              <Plus aria-hidden="true" /> Nova aposta
            </Link>
          </Button>
        }
      />

      <div
        className="mb-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end lg:mb-8"
        role="group"
        aria-label="Filtros do resumo"
      >
        <Campo label="Período" className="sm:w-48">
          <SelectNativo
            value={filtros.periodo}
            onChange={(e) => mudar({ periodo: e.target.value as FiltrosDashboard['periodo'] })}
          >
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                {rotulosPeriodo[p]}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo label="Modalidade" className="sm:w-48">
          <SelectNativo
            value={filtros.modalidade ?? ''}
            onChange={(e) => mudar({ modalidade: e.target.value || undefined })}
          >
            <option value="">Todas</option>
            {modalidades?.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.nome}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        {filtros.periodo === 'personalizado' && (
          <>
            <Campo label="De" className="sm:w-44">
              <Input
                type="date"
                value={filtros.de ?? ''}
                onChange={(e) => mudar({ de: e.target.value || undefined })}
              />
            </Campo>
            <Campo label="Até" className="sm:w-44">
              <Input
                type="date"
                value={filtros.ate ?? ''}
                onChange={(e) => mudar({ ate: e.target.value || undefined })}
              />
            </Campo>
          </>
        )}
      </div>

      <section aria-labelledby="titulo-indicadores" className="mb-8" aria-busy={dados.isFetching}>
        <h2 id="titulo-indicadores" className="sr-only">
          Indicadores do período
        </h2>
        {dados.isPending && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="col-span-2 h-48 rounded-2xl lg:col-span-3" />
            <Skeleton className="col-span-2 h-48 rounded-2xl lg:col-span-1" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        )}
        {dados.isError && (
          <EmptyState
            icone={RefreshCw}
            titulo="Não foi possível carregar o resumo"
            acao={
              <Button variant="outline" onClick={() => void dados.refetch()}>
                Tentar de novo
              </Button>
            }
          />
        )}
        {totais && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* Número principal em destaque, como num extrato: o saldo do período. */}
            <Card className="col-span-2 justify-between gap-6 p-6 lg:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-sans text-sm font-medium text-muted-foreground">Saldo</h3>
                  <p className="text-xs text-muted-foreground first-letter:uppercase">
                    {intervalo.rotulo}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {totais.saldo >= 0 ? (
                    <ArrowUpRight className="size-5" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="size-5" aria-hidden="true" />
                  )}
                </span>
              </div>
              <p className="font-display text-5xl font-light tracking-tight sm:text-6xl">
                <MoneyText centavos={totais.saldo} comSinal centavosSuaves />
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Recuperado menos gasto, sua parte.</p>
                {totais.qtdApostas > 0 && (
                  <Button asChild size="sm" className="min-h-11">
                    <Link to={linkLista}>
                      <ListFilter aria-hidden="true" />
                      Ver {totais.qtdApostas === 1
                        ? 'a aposta'
                        : `as ${totais.qtdApostas} apostas`}{' '}
                      do período
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
            <KpiCard
              titulo="ROI"
              icone={Percent}
              valor={<span className="text-4xl break-all">{porcentagem(totais.roi, true)}</span>}
              detalhe="Saldo ÷ gasto: quanto voltou de cada real apostado."
              destaque
              className="col-span-2 justify-between lg:col-span-1"
            />
            <KpiCard
              titulo="Gasto"
              icone={Wallet}
              valor={<MoneyText centavos={totais.gasto} centavosSuaves />}
              detalhe="Sua parte nas apostas"
            />
            <KpiCard
              titulo="Recuperado"
              icone={Trophy}
              valor={<MoneyText centavos={totais.recuperado} centavosSuaves />}
              detalhe="Prêmios líquidos (sua parte)"
            />
            <KpiCard
              titulo="Apostas"
              icone={Hash}
              valor={totais.qtdApostas.toLocaleString('pt-BR')}
            />
            <KpiCard
              titulo="Premiadas"
              icone={Trophy}
              valor={porcentagem(totais.taxaPremiadas)}
              detalhe="Entre as já conferidas"
            />
          </div>
        )}
      </section>

      <Card className="mb-8 gap-3 p-5" role="region" aria-labelledby="titulo-orcamento">
        <div className="flex items-center justify-between gap-2">
          <h2 id="titulo-orcamento" className="text-lg font-medium first-letter:uppercase">
            Orçamento de {rotuloMes(hoje.slice(0, 7))}
          </h2>
          <Button asChild variant="link" className="h-auto px-0">
            <Link to="/orcamento">Ajustar</Link>
          </Button>
        </div>
        <ResumoOrcamento mes={hoje.slice(0, 7)} convite />
      </Card>

      {dados.data && totais && totais.qtdApostas > 0 && (
        <Graficos dados={dados.data} intervalo={intervalo} hoje={hoje} />
      )}
      {dados.data && totais?.qtdApostas === 0 && (
        <div className="mb-8">
          <EmptyState
            icone={Ticket}
            titulo="Nenhuma aposta neste período"
            descricao="Escolha outro período ou registre uma aposta."
          />
        </div>
      )}
      {dados.data && (
        <div className="mb-8">
          <ProximosSorteios dados={dados.data} hoje={hoje} />
        </div>
      )}

      <section aria-labelledby="titulo-ultimas">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="titulo-ultimas" className="text-xl font-medium">
            Últimas apostas
          </h2>
          {!!ultimas.data?.length && (
            <Button asChild variant="link" className="px-0">
              <Link to="/apostas">Ver todas</Link>
            </Button>
          )}
        </div>
        {ultimas.isPending && <Skeleton className="h-36 w-full rounded-2xl" />}
        {ultimas.isError && (
          <EmptyState
            icone={RefreshCw}
            titulo="Não foi possível carregar as apostas"
            acao={
              <Button variant="outline" onClick={() => void ultimas.refetch()}>
                Tentar de novo
              </Button>
            }
          />
        )}
        {ultimas.data?.length === 0 && (
          <EmptyState
            icone={Ticket}
            titulo="Nenhuma aposta ainda"
            descricao="Registre sua primeira aposta para acompanhar gastos e resultados."
            acao={
              <Button asChild>
                <Link to="/apostas/nova">
                  <Plus aria-hidden="true" /> Nova aposta
                </Link>
              </Button>
            }
          />
        )}
        {!!ultimas.data?.length && (
          <ul className="grid gap-3 lg:grid-cols-2">
            {ultimas.data.map((a) => (
              <li key={a.id}>
                <ApostaCard aposta={a} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Graficos({
  dados,
  intervalo,
  hoje,
}: {
  dados: DadosDashboard
  intervalo: { inicio: string | null; fim: string | null }
  hoje: string
}) {
  const serie = useMemo(() => serieMensal(dados.mensal, intervalo, hoje), [dados, intervalo, hoje])
  const modalidades = useMemo(() => linhasPorModalidade(dados), [dados])
  const tipos = useMemo(() => linhasPorTipo(dados), [dados])

  return (
    <div className="mb-8 grid gap-4">
      {serie.length >= 2 ? (
        <CartaoGrafico
          id="titulo-evolucao"
          titulo="Evolução mês a mês"
          descricao="Gasto e recuperado em cada mês, e o saldo somado desde o início do período."
          legenda={<Legenda series={SERIES_MENSAL} />}
          grafico={<GraficoMensal serie={serie} />}
          tabela={
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[26rem] text-sm" aria-label="Evolução mês a mês">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Mês
                    </th>
                    {SERIES_MENSAL.map((s) => (
                      <th key={s.chave} scope="col" className="px-3 py-2 text-right font-medium">
                        {s.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {serie.map((p) => (
                    <tr key={p.mes} className="border-b last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-medium">
                        {p.rotulo}
                      </th>
                      <td className="px-3 py-2 text-right">
                        <MoneyText centavos={p.gasto} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText centavos={p.recuperado} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText centavos={p.saldoAcumulado} comSinal />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          O gráfico mês a mês aparece quando o período tem dois meses ou mais.
        </p>
      )}

      {/* Um embaixo do outro: a tabela de ROI precisa da largura toda. */}
      <div className="grid gap-4">
        <CartaoGrafico
          id="titulo-por-modalidade"
          titulo="Por modalidade"
          legenda={<Legenda series={SERIES_BARRAS} barras />}
          grafico={
            <GraficoGastoRecuperado
              itens={dados.por_modalidade.map((m) => ({
                nome: m.nome,
                gasto: m.gasto,
                recuperado: m.recuperado,
              }))}
            />
          }
          tabelaAberta
          tabela={
            <TabelaRoi rotulo="ROI por modalidade" coluna="Modalidade" linhas={modalidades} />
          }
        />
        <CartaoGrafico
          id="titulo-por-tipo"
          titulo="Por tipo de aposta"
          legenda={<Legenda series={SERIES_BARRAS} barras />}
          grafico={
            <GraficoGastoRecuperado
              itens={tipos.map((t) => ({
                nome: t.nome,
                gasto: t.gasto,
                recuperado: t.recuperado,
              }))}
            />
          }
          tabelaAberta
          tabela={<TabelaRoi rotulo="ROI por tipo" coluna="Tipo" linhas={tipos} />}
        />
      </div>

      <DistribuicaoAcertos dados={dados} />
      <ValeramAPena dados={dados} />
      <QuaseLa dados={dados} />
    </div>
  )
}

/** Quantos jogos fizeram cada número de acertos, uma modalidade por vez. */
function DistribuicaoAcertos({ dados }: { dados: DadosDashboard }) {
  const grupos = useMemo(() => {
    const porSlug = new Map<
      string,
      { nome: string; cor: string | null; max: number; qtd: Map<number, number> }
    >()
    for (const a of dados.acertos) {
      const g = porSlug.get(a.slug) ?? {
        nome: a.nome,
        cor: a.cor,
        max: a.max_acertos,
        qtd: new Map(),
      }
      g.qtd.set(a.acertos, a.qtd)
      porSlug.set(a.slug, g)
    }
    return [...porSlug.entries()].map(([slug, g]) => {
      // Do menor número de acertos visto até a faixa máxima, com zero onde não houve jogo.
      const menor = Math.min(...g.qtd.keys())
      const itens = Array.from({ length: g.max - menor + 1 }, (_, i) => ({
        acertos: menor + i,
        qtd: g.qtd.get(menor + i) ?? 0,
      }))
      return { slug, nome: g.nome, cor: g.cor, itens }
    })
  }, [dados])
  const [escolhida, setEscolhida] = useState<string>()
  const atual = grupos.find((g) => g.slug === escolhida) ?? grupos[0]
  if (!atual) return null

  return (
    <CartaoGrafico
      id="titulo-acertos"
      titulo="Distribuição de acertos"
      descricao={`Quantos jogos conferidos fizeram cada número de acertos na ${atual.nome}.`}
      legenda={
        grupos.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Modalidade do gráfico">
            {grupos.map((g) => (
              <ModalidadeChip
                key={g.slug}
                nome={g.nome}
                cor={g.cor ?? '#6A6F9E'}
                selecionado={g.slug === atual.slug}
                onClick={() => setEscolhida(g.slug)}
              />
            ))}
          </div>
        )
      }
      grafico={<GraficoAcertos itens={atual.itens} />}
      tabela={
        <table className="w-full text-sm" aria-label={`Acertos na ${atual.nome}`}>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Acertos
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Jogos
              </th>
            </tr>
          </thead>
          <tbody>
            {atual.itens.map((i) => (
              <tr key={i.acertos} className="border-b last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-medium tabular-nums">
                  {i.acertos}
                </th>
                <td className="py-2 pl-3 text-right tabular-nums">{i.qtd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
