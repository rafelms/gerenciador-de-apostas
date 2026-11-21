import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Hash,
  RefreshCw,
  Trophy,
  Wallet,
} from 'lucide-react'
import { lazy } from 'react'
import { useSearchParams } from 'react-router'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { MoneyText } from '@/components/money-text'
import { SelectNativo } from '@/components/select-nativo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { COR_PADRAO, porcentagem } from '@/features/dashboard/linhas'
import {
  filtrosDashboardDaUrl,
  filtrosDashboardParaUrl,
  intervaloDoPeriodo,
  PERIODOS,
  rotulosPeriodo,
  type FiltrosDashboard,
} from '@/features/dashboard/periodo'
import { CartaoGrafico, Legenda } from '@/features/dashboard/secoes'
import { SERIES_BARRAS } from '@/features/dashboard/series'
import { formatarData, hojeIso } from '@/lib/formatadores'
import { carregarMetricas, chavesAdmin, type MetricaUsuario } from './api'

const GraficoGastoRecuperado = lazy(async () => ({
  default: (await import('@/features/dashboard/graficos')).GraficoGastoRecuperado,
}))

/** Métricas do admin (seção 11.13): somente agregados por usuário e totais gerais. */
export function AdminMetricasPage() {
  const [params, setParams] = useSearchParams()
  const filtros = filtrosDashboardDaUrl(params)
  const intervalo = intervaloDoPeriodo(filtros, hojeIso())

  const dados = useQuery({
    queryKey: chavesAdmin.metricas(intervalo.inicio, intervalo.fim),
    queryFn: () => carregarMetricas(intervalo.inicio, intervalo.fim),
  })

  function mudar(f: Partial<FiltrosDashboard>) {
    setParams(filtrosDashboardParaUrl({ ...filtros, ...f, modalidade: undefined }), {
      replace: true,
    })
  }

  const usuarios = dados.data ?? []
  const comApostas = usuarios.filter((u) => u.qtd > 0)
  const total = usuarios.reduce(
    (t, u) => ({
      gasto: t.gasto + u.gasto,
      recuperado: t.recuperado + u.recuperado,
      qtd: t.qtd + u.qtd,
    }),
    { gasto: 0, recuperado: 0, qtd: 0 },
  )
  const saldo = total.recuperado - total.gasto

  return (
    <>
      <CabecalhoPagina
        titulo="Métricas"
        descricao={`Agregados por usuário · ${intervalo.rotulo}. Dezenas, observações e participantes de outros usuários não aparecem aqui.`}
      />

      <div
        className="mb-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end"
        role="group"
        aria-label="Filtros das métricas"
      >
        <Campo label="Período" className="col-span-2 sm:w-48">
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

      {dados.isPending && (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}
      {dados.isError && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar as métricas"
          acao={
            <Button variant="outline" onClick={() => void dados.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}

      {dados.data && (
        <div className="grid gap-6">
          <section aria-labelledby="titulo-totais">
            <h2 id="titulo-totais" className="sr-only">
              Totais gerais
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                titulo="Gasto total"
                icone={Wallet}
                valor={<MoneyText centavos={total.gasto} />}
                detalhe={`${comApostas.length} de ${usuarios.length} usuários apostaram`}
              />
              <KpiCard
                titulo="Recuperado"
                icone={Trophy}
                valor={<MoneyText centavos={total.recuperado} />}
              />
              <KpiCard
                titulo="Saldo"
                icone={saldo >= 0 ? ArrowUpRight : ArrowDownRight}
                valor={<MoneyText centavos={saldo} comSinal />}
                detalhe={`ROI ${porcentagem(total.gasto > 0 ? saldo / total.gasto : null, true)}`}
              />
              <KpiCard titulo="Apostas" icone={Hash} valor={total.qtd.toLocaleString('pt-BR')} />
            </div>
          </section>

          {comApostas.length === 0 ? (
            <EmptyState
              icone={BarChart3}
              titulo="Nenhuma aposta no período"
              descricao="Escolha outro período para ver as métricas."
            />
          ) : (
            <CartaoGrafico
              id="titulo-por-usuario"
              titulo="Gasto e recuperado por usuário"
              legenda={<Legenda series={SERIES_BARRAS} barras />}
              grafico={
                <GraficoGastoRecuperado
                  itens={comApostas.map((u) => ({
                    nome: u.nome.split(' ')[0] ?? u.nome,
                    gasto: u.gasto,
                    recuperado: u.recuperado,
                  }))}
                />
              }
              tabela={<TabelaMetricas usuarios={usuarios} />}
              tabelaAberta
            />
          )}
        </div>
      )}
    </>
  )
}

function TabelaMetricas({ usuarios }: { usuarios: MetricaUsuario[] }) {
  return (
    <div
      className="-mx-4 overflow-x-auto px-4 focus-visible:outline-2 focus-visible:outline-ring"
      tabIndex={0}
      role="region"
      aria-label="Métricas por usuário, role para os lados"
    >
      <table className="w-full min-w-[44rem] text-sm" aria-label="Métricas por usuário">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">
              Usuário
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Gasto
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Recuperado
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Saldo
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              ROI
            </th>
            <th scope="col" className="py-2 pl-3 font-medium">
              Modalidades
            </th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.userId} className="border-b align-top last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                {u.nome}
                <span className="block text-xs font-normal text-muted-foreground">
                  {u.qtd} {u.qtd === 1 ? 'aposta' : 'apostas'}
                  {u.ultimaAposta && ` · última em ${formatarData(u.ultimaAposta)}`}
                </span>
              </th>
              <td className="px-3 py-2 text-right">
                <MoneyText centavos={u.gasto} />
              </td>
              <td className="px-3 py-2 text-right">
                <MoneyText centavos={u.recuperado} />
              </td>
              <td className="px-3 py-2 text-right">
                <MoneyText centavos={u.saldo} comSinal />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{porcentagem(u.roi, true)}</td>
              <td className="py-2 pl-3">
                {u.porModalidade.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {u.porModalidade.map((m) => (
                      <li key={m.slug} className="flex items-center gap-1">
                        <ModalidadeChip nome={m.nome} cor={m.cor ?? COR_PADRAO} />
                        <span className="text-xs text-muted-foreground tabular-nums">{m.qtd}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
