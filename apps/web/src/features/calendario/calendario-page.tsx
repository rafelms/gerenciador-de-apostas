import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Hourglass,
  RefreshCw,
  Ticket,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { EmptyState } from '@/components/empty-state'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { MoneyText } from '@/components/money-text'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { hojeIso } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import {
  agruparPorDia,
  carregarEventos,
  deslocarMes,
  DIAS_SEMANA,
  limitesDoMes,
  mesDaUrl,
  rotuloDia,
  rotuloMes,
  rotuloSemana,
  semanasDoMes,
  type Evento,
  type TipoEvento,
} from './calendario'

// Cada tipo tem ícone e nome próprios: a cor nunca é a única pista.
const TIPOS: Record<TipoEvento, { nome: string; plural: string; icone: LucideIcon; cor: string }> =
  {
    aposta: { nome: 'Aposta feita', plural: 'apostas', icone: Ticket, cor: 'var(--serie-1)' },
    sorteio: {
      nome: 'Sorteio',
      plural: 'sorteios',
      icone: CircleDot,
      cor: 'var(--serie-2)',
    },
    premio: { nome: 'Prêmio a resgatar', plural: 'prêmios', icone: Trophy, cor: 'var(--serie-3)' },
    prazo: {
      nome: 'Fim do prazo de resgate',
      plural: 'fins de prazo',
      icone: Hourglass,
      cor: 'var(--alerta)',
    },
  }
const ORDEM: TipoEvento[] = ['aposta', 'sorteio', 'premio', 'prazo']

function IconeTipo({ tipo, className }: { tipo: TipoEvento; className?: string }) {
  const { icone: Icone, cor } = TIPOS[tipo]
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-white',
        className,
      )}
      style={{ backgroundColor: cor }}
      aria-hidden="true"
    >
      <Icone className="size-3.5" />
    </span>
  )
}

function contagem(eventos: Evento[]) {
  const qtd = new Map<TipoEvento, number>()
  for (const e of eventos) qtd.set(e.tipo, (qtd.get(e.tipo) ?? 0) + 1)
  return ORDEM.filter((t) => qtd.has(t)).map((t) => ({ tipo: t, qtd: qtd.get(t)! }))
}

/** Calendário (seção 11.8): grade do mês no desktop, lista por semana no celular. */
export function CalendarioPage() {
  const [params, setParams] = useSearchParams()
  const hoje = hojeIso()
  const mes = mesDaUrl(params.get('mes'), hoje)
  const { inicio, fim } = limitesDoMes(mes)
  const [diaEscolhido, setDiaEscolhido] = useState<string>()

  const eventos = useQuery({
    queryKey: chaves.calendario(mes),
    queryFn: () => carregarEventos(inicio, fim),
  })
  const porDia = agruparPorDia(eventos.data ?? [])
  const semanas = semanasDoMes(mes)
  // Dia aberto no painel: o escolhido, senão hoje (se for deste mês), senão o 1º com eventos.
  const dia =
    diaEscolhido?.startsWith(mes) && diaEscolhido
      ? diaEscolhido
      : hoje.startsWith(mes)
        ? hoje
        : ([...porDia.keys()][0] ?? inicio)

  function irPara(novo: string) {
    setDiaEscolhido(undefined)
    setParams(novo === hoje.slice(0, 7) ? {} : { mes: novo }, { replace: true })
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Calendário"
        descricao="Apostas feitas, sorteios com apostas suas, prêmios e prazos de resgate."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => irPara(deslocarMes(mes, -1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h2
            className="min-w-44 text-center text-lg font-semibold first-letter:uppercase"
            aria-live="polite"
          >
            {rotuloMes(mes)}
          </h2>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => irPara(deslocarMes(mes, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {!hoje.startsWith(mes) && (
          <Button variant="ghost" className="min-h-11" onClick={() => irPara(hoje.slice(0, 7))}>
            Hoje
          </Button>
        )}
      </div>

      <ul
        className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"
        aria-label="Legenda"
      >
        {ORDEM.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <IconeTipo tipo={t} className="size-5" />
            {TIPOS[t].nome}
          </li>
        ))}
      </ul>

      {eventos.isPending && <Skeleton className="h-96 w-full rounded-xl" />}
      {eventos.isError && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar o calendário"
          acao={
            <Button variant="outline" onClick={() => void eventos.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}

      {eventos.data && (
        <>
          {/* Desktop: grade do mês + painel do dia escolhido. */}
          <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card className="p-3">
              <table
                className="w-full table-fixed border-separate border-spacing-1"
                aria-label={`Dias de ${rotuloMes(mes)}`}
              >
                <thead>
                  <tr>
                    {DIAS_SEMANA.map((d) => (
                      <th
                        key={d}
                        scope="col"
                        className="pb-1 text-xs font-medium text-muted-foreground"
                      >
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {semanas.map((semana) => (
                    <tr key={semana[0]!.data}>
                      {semana.map(({ data, doMes }) => {
                        const doDia = porDia.get(data) ?? []
                        const resumo = contagem(doDia)
                        const selecionado = doMes && data === dia
                        return (
                          <td key={data} className="align-top">
                            {doMes ? (
                              <button
                                type="button"
                                onClick={() => setDiaEscolhido(data)}
                                aria-pressed={selecionado}
                                aria-label={`${rotuloDia(data)}: ${
                                  resumo.length
                                    ? resumo
                                        .map(
                                          (r) =>
                                            `${r.qtd} ${r.qtd === 1 ? TIPOS[r.tipo].nome.toLowerCase() : TIPOS[r.tipo].plural}`,
                                        )
                                        .join(', ')
                                    : 'nada'
                                }`}
                                className={cn(
                                  'flex h-24 w-full flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors duration-150 hover:bg-accent',
                                  selecionado && 'border-primary ring-2 ring-primary/30',
                                  data === hoje && 'bg-accent',
                                )}
                              >
                                <span
                                  className={cn(
                                    'text-sm tabular-nums',
                                    data === hoje && 'font-bold',
                                  )}
                                >
                                  {Number(data.slice(8))}
                                </span>
                                <span className="flex flex-wrap gap-1" aria-hidden="true">
                                  {resumo.map((r) => (
                                    <span
                                      key={r.tipo}
                                      className="flex items-center gap-0.5 text-xs tabular-nums"
                                    >
                                      <IconeTipo tipo={r.tipo} className="size-5" />
                                      {r.qtd > 1 && r.qtd}
                                    </span>
                                  ))}
                                </span>
                              </button>
                            ) : (
                              <span className="block h-24" aria-hidden="true" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="h-fit gap-3 p-4" role="region" aria-labelledby="titulo-dia">
              <h2 id="titulo-dia" className="font-semibold first-letter:uppercase">
                {rotuloDia(dia)}
              </h2>
              <ListaEventos eventos={porDia.get(dia) ?? []} hoje={hoje} />
            </Card>
          </div>

          {/* Celular: lista por semana. */}
          <ol className="grid gap-4 lg:hidden" aria-label={`Semanas de ${rotuloMes(mes)}`}>
            {semanas.map((semana) => {
              const dias = semana.filter((d) => d.doMes && porDia.has(d.data))
              return (
                <li key={semana[0]!.data}>
                  <Card
                    className="gap-3 p-4"
                    role="region"
                    aria-label={`Semana de ${rotuloSemana(semana)}`}
                  >
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      Semana de {rotuloSemana(semana)}
                    </h3>
                    {dias.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nada nesta semana.</p>
                    ) : (
                      dias.map(({ data }) => (
                        <div key={data} className="grid gap-1">
                          <h4
                            className={cn(
                              'font-medium first-letter:uppercase',
                              data === hoje && 'text-primary',
                            )}
                          >
                            {rotuloDia(data)}
                            {data === hoje && ' (hoje)'}
                          </h4>
                          <ListaEventos eventos={porDia.get(data)!} hoje={hoje} />
                        </div>
                      ))
                    )}
                  </Card>
                </li>
              )
            })}
          </ol>

          {eventos.data.length === 0 && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden="true" />
              Nenhum evento em {rotuloMes(mes)}.
            </p>
          )}
        </>
      )}
    </>
  )
}

function ListaEventos({ eventos, hoje }: { eventos: Evento[]; hoje: string }) {
  if (eventos.length === 0) return <p className="text-sm text-muted-foreground">Nada neste dia.</p>
  return (
    <ul className="-mx-2 grid">
      {eventos.map((e, i) => (
        <li key={`${e.tipo}-${e.apostaId ?? e.concurso}-${e.premioId ?? i}`}>
          <Link
            to={
              e.tipo === 'sorteio' || !e.apostaId
                ? `/apostas?modalidade=${e.modalidadeSlug}&concurso=${e.concurso}`
                : `/apostas/${e.apostaId}`
            }
            className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-accent"
          >
            <IconeTipo tipo={e.tipo} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{TIPOS[e.tipo].nome}</span>
              <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                <ModalidadeChip
                  nome={e.modalidadeNome}
                  cor={e.modalidadeCor ?? '#6A6F9E'}
                  className="font-normal"
                />
                <span className="tabular-nums">{e.concurso}</span>
                {e.tipo === 'sorteio' && <span>· {detalheSorteio(e, hoje)}</span>}
              </span>
            </span>
            {e.valorCentavos !== null && (
              <MoneyText centavos={e.valorCentavos} className="text-sm font-semibold" />
            )}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function detalheSorteio(e: Evento, hoje: string) {
  const apostas = `${e.qtd} ${e.qtd === 1 ? 'aposta' : 'apostas'}`
  if (e.sorteado) return `${apostas} · sorteado`
  if (e.data < hoje) return `${apostas} · aguardando resultado`
  return e.estimada ? `${apostas} · data prevista` : apostas
}
