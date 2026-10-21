import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'
import {
  ArrowDownRight,
  ArrowUpRight,
  Hash,
  Percent,
  Plus,
  RefreshCw,
  Ticket,
  Trophy,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { MoneyText } from '@/components/money-text'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-provider'
import { ApostaCard } from '@/features/apostas/aposta-card'
import { FUSO } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { carregarTotais, ultimasApostas } from './resumo'

const porcentagem = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

/** Dashboard v1 (F1.7): indicadores do mês atual + últimas apostas. Gráficos e seletor de período na fase 4. */
export function DashboardPage() {
  const { perfil } = useAuth()
  const agora = toZonedTime(new Date(), FUSO)
  const inicio = format(startOfMonth(agora), 'yyyy-MM-dd')
  const fim = format(endOfMonth(agora), 'yyyy-MM-dd')
  const nomeMes = format(agora, "MMMM 'de' yyyy", { locale: ptBR })

  const totais = useQuery({
    queryKey: chaves.resumoPeriodo(inicio, fim),
    queryFn: () => carregarTotais(inicio, fim),
  })
  const ultimas = useQuery({
    queryKey: [...chaves.apostas, 'ultimas'],
    queryFn: () => ultimasApostas(5),
  })
  const primeiroNome = perfil?.nome.split(' ')[0]

  return (
    <>
      <CabecalhoPagina
        titulo={primeiroNome ? `Olá, ${primeiroNome}` : 'Início'}
        descricao={`Resumo de ${nomeMes}`}
        acoes={
          <Button asChild className="hidden lg:inline-flex">
            <Link to="/apostas/nova">
              <Plus aria-hidden="true" /> Nova aposta
            </Link>
          </Button>
        }
      />

      <section aria-labelledby="titulo-indicadores" className="mb-8">
        <h2 id="titulo-indicadores" className="sr-only">
          Indicadores do mês
        </h2>
        {totais.isPending && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        )}
        {totais.isError && (
          <EmptyState
            icone={RefreshCw}
            titulo="Não foi possível carregar os indicadores"
            acao={
              <Button variant="outline" onClick={() => void totais.refetch()}>
                Tentar de novo
              </Button>
            }
          />
        )}
        {totais.data && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard
              titulo="Gasto"
              icone={Wallet}
              valor={<MoneyText centavos={totais.data.gasto} />}
              detalhe="Sua parte nas apostas"
            />
            <KpiCard
              titulo="Recuperado"
              icone={Trophy}
              valor={<MoneyText centavos={totais.data.recuperado} />}
              detalhe="Prêmios líquidos (fase 2)"
            />
            <KpiCard
              titulo="Saldo"
              icone={totais.data.saldo >= 0 ? ArrowUpRight : ArrowDownRight}
              valor={<MoneyText centavos={totais.data.saldo} comSinal />}
            />
            <KpiCard
              titulo="ROI"
              icone={Percent}
              valor={porcentagem(totais.data.roi)}
              detalhe="Saldo ÷ gasto"
            />
            <KpiCard
              titulo="Apostas"
              icone={Hash}
              valor={totais.data.qtdApostas.toLocaleString('pt-BR')}
            />
            <KpiCard
              titulo="Premiadas"
              icone={Trophy}
              valor={porcentagem(totais.data.taxaPremiadas)}
              detalhe="Entre as já conferidas"
            />
          </div>
        )}
      </section>

      <section aria-labelledby="titulo-ultimas">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="titulo-ultimas" className="text-lg font-semibold">
            Últimas apostas
          </h2>
          {!!ultimas.data?.length && (
            <Button asChild variant="link" className="px-0">
              <Link to="/apostas">Ver todas</Link>
            </Button>
          )}
        </div>
        {ultimas.isPending && <Skeleton className="h-36 w-full rounded-xl" />}
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
