// Blocos do dashboard que não são gráficos: tabelas de ROI, destaques e próximos sorteios.

import { CalendarClock, ChevronRight, Sparkles, Target, Trophy } from 'lucide-react'
import { Suspense, type ReactNode } from 'react'
import { Link } from 'react-router'

import { MoneyText } from '@/components/money-text'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarData } from '@/lib/formatadores'
import { roi, type DadosDashboard, type ValoresGrupo } from './resumo'

import { COR_PADRAO, porcentagem } from './linhas'
import type { SerieInfo } from './series'

/** Cartão com título, legenda opcional, gráfico (carregado sob demanda) e a tabela com os números. */
export function CartaoGrafico({
  id,
  titulo,
  descricao,
  legenda,
  grafico,
  tabela,
  rotuloTabela = 'Ver os números',
  tabelaAberta = false,
}: {
  id: string
  titulo: string
  descricao?: string
  legenda?: ReactNode
  grafico: ReactNode
  tabela: ReactNode
  rotuloTabela?: string
  tabelaAberta?: boolean
}) {
  return (
    <Card className="min-w-0 gap-4 p-5 lg:p-6" role="region" aria-labelledby={id}>
      <div className="grid gap-1">
        <h2 id={id} className="text-lg font-medium">
          {titulo}
        </h2>
        {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {legenda}
      {/* O gráfico é a versão visual da tabela abaixo: leitores de tela usam a tabela. */}
      <div aria-hidden="true" className="-mx-1">
        <Suspense fallback={<Skeleton className="h-56 w-full rounded-lg" />}>{grafico}</Suspense>
      </div>
      {tabelaAberta ? (
        tabela
      ) : (
        <details className="group text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight
              className="size-4 transition-transform duration-150 group-open:rotate-90"
              aria-hidden="true"
            />
            {rotuloTabela}
          </summary>
          <div className="mt-2">{tabela}</div>
        </details>
      )}
    </Card>
  )
}

/** Tabela de gasto, recuperado, saldo e ROI por grupo (modalidade ou tipo). */
export function TabelaRoi({
  rotulo,
  coluna,
  linhas,
}: {
  rotulo: string
  coluna: string
  linhas: (ValoresGrupo & { chave: string; nome: ReactNode })[]
}) {
  return (
    <div
      className="-mx-4 overflow-x-auto px-4 focus-visible:outline-2 focus-visible:outline-ring"
      tabIndex={0}
      role="region"
      aria-label={`${rotulo}, role para os lados`}
    >
      <table className="w-full min-w-[30rem] text-sm" aria-label={rotulo}>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">
              {coluna}
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
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              ROI
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-b last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                {l.nome}
                <span className="block text-xs font-normal text-muted-foreground">
                  {l.qtd} {l.qtd === 1 ? 'aposta' : 'apostas'}
                </span>
              </th>
              <td className="px-3 py-2 text-right">
                <MoneyText centavos={l.gasto} />
              </td>
              <td className="px-3 py-2 text-right">
                <MoneyText centavos={l.recuperado} />
              </td>
              <td className="px-3 py-2 text-right">
                <MoneyText centavos={l.recuperado - l.gasto} comSinal />
              </td>
              <td className="py-2 pl-3 text-right tabular-nums">{porcentagem(roi(l), true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function concursos(inicial: number, final: number) {
  return inicial === final ? `Concurso ${inicial}` : `Concursos ${inicial} a ${final}`
}

function ItemAposta({
  id,
  nome,
  cor,
  detalhe,
  valor,
}: {
  id: string
  nome: string
  cor: string | null
  detalhe: string
  valor: ReactNode
}) {
  return (
    <li>
      <Link
        to={`/apostas/${id}`}
        className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-accent"
      >
        <span className="min-w-0 flex-1">
          <ModalidadeChip nome={nome} cor={cor ?? COR_PADRAO} />
          <span className="block truncate text-sm text-muted-foreground">{detalhe}</span>
        </span>
        <span className="text-right text-sm font-semibold">{valor}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  )
}

function Bloco({
  id,
  titulo,
  icone: Icone,
  vazio,
  children,
}: {
  id: string
  titulo: string
  icone: typeof Trophy
  vazio: string
  children: ReactNode[]
}) {
  return (
    <Card className="min-w-0 gap-2 p-5" role="region" aria-labelledby={id}>
      <h2 id={id} className="flex items-center gap-2 text-lg font-medium">
        <Icone className="size-4 text-muted-foreground" aria-hidden="true" />
        {titulo}
      </h2>
      {children.length > 0 ? (
        <ul className="-mx-2 grid">{children}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      )}
    </Card>
  )
}

export function ValeramAPena({ dados }: { dados: DadosDashboard }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco
        id="titulo-top-saldo"
        titulo="Melhores saldos"
        icone={Trophy}
        vazio="Nenhuma aposta premiada no período."
      >
        {dados.top_saldo.map((a) => (
          <ItemAposta
            key={a.id}
            id={a.id}
            nome={a.modalidade_nome}
            cor={a.modalidade_cor}
            detalhe={`${concursos(a.concurso_inicial, a.concurso_final)} · ${formatarData(a.data_aposta)}`}
            valor={<MoneyText centavos={a.saldo} comSinal />}
          />
        ))}
      </Bloco>
      <Bloco
        id="titulo-top-acertos"
        titulo="Mais acertos"
        icone={Target}
        vazio="Nenhuma aposta conferida no período."
      >
        {dados.top_acertos.map((a) => (
          <ItemAposta
            key={a.id}
            id={a.id}
            nome={a.modalidade_nome}
            cor={a.modalidade_cor}
            detalhe={`${concursos(a.concurso_inicial, a.concurso_final)} · ${formatarData(a.data_aposta)}`}
            valor={
              <span className="tabular-nums">
                {a.melhor_acerto} de {a.max_acertos}
              </span>
            }
          />
        ))}
      </Bloco>
    </div>
  )
}

export function QuaseLa({ dados }: { dados: DadosDashboard }) {
  return (
    <Bloco
      id="titulo-quase-la"
      titulo="Quase lá"
      icone={Sparkles}
      vazio="Nenhum jogo ficou a 1 acerto do prêmio máximo no período."
    >
      {dados.quase_la.map((q) => (
        <ItemAposta
          key={`${q.aposta_id}-${q.numero}`}
          id={q.aposta_id}
          nome={q.modalidade_nome}
          cor={q.modalidade_cor}
          detalhe={`Concurso ${q.numero} · ${formatarData(q.data_sorteio)}`}
          valor={
            <span className="tabular-nums">
              {q.acertos} de {q.max_acertos}
            </span>
          }
        />
      ))}
    </Bloco>
  )
}

export function ProximosSorteios({ dados, hoje }: { dados: DadosDashboard; hoje: string }) {
  return (
    <Bloco
      id="titulo-proximos"
      titulo="Próximos sorteios com apostas suas"
      icone={CalendarClock}
      vazio="Nenhuma aposta esperando sorteio."
    >
      {dados.proximos.map((p) => (
        <li key={`${p.slug}-${p.numero}`}>
          <Link
            to={`/apostas?modalidade=${p.slug}&concurso=${p.numero}`}
            className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-accent"
          >
            <span className="min-w-0 flex-1">
              <ModalidadeChip nome={p.nome} cor={p.cor ?? COR_PADRAO} />
              <span className="block text-sm text-muted-foreground">
                Concurso {p.numero}
                {p.data_sorteio ? ` · ${formatarData(p.data_sorteio)}` : ''}
                {p.data_sorteio && p.data_sorteio < hoje ? ' · aguardando resultado' : ''}
              </span>
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {p.qtd_apostas} {p.qtd_apostas === 1 ? 'aposta' : 'apostas'}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </Bloco>
  )
}

/** Legenda em HTML: amostra do traço (ou do bloco) + nome em cor de texto. */
export function Legenda({ series, barras = false }: { series: SerieInfo[]; barras?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {series.map((s) => (
        <li key={s.chave} className="flex items-center gap-1.5">
          <svg width="20" height="10" aria-hidden="true" className="shrink-0">
            {barras ? (
              <rect x="2" y="1" width="16" height="8" rx="2" fill={s.cor} />
            ) : (
              <line
                x1="0"
                y1="5"
                x2="20"
                y2="5"
                stroke={s.cor}
                strokeWidth="2"
                strokeDasharray={s.traco || undefined}
              />
            )}
          </svg>
          {s.nome}
        </li>
      ))}
    </ul>
  )
}
