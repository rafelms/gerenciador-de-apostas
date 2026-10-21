import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ChevronRight, Clock, RefreshCw, Ticket, Trophy } from 'lucide-react'
import { Link } from 'react-router'

import { BolaDezena } from '@/components/bola-dezena'
import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { EmptyState } from '@/components/empty-state'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { MoneyText } from '@/components/money-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalidades, type Modalidade } from '@/features/modalidades/use-modalidades'
import { formatarData } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { concursosDoUsuario, ultimosResultados, type UltimoResultado } from './api'

function CardUltimo({ modalidade, r }: { modalidade: Modalidade; r: UltimoResultado | undefined }) {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: modalidade.cor }}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ModalidadeChip nome={modalidade.nome} cor={modalidade.cor} className="text-base" />
          {r && (
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              concurso {r.numero}
            </span>
          )}
          {r?.acumulado && <Badge variant="secondary">Acumulou</Badge>}
          {r?.fonte === 'usuario' && <Badge variant="outline">Não oficial</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {r ? (
          <>
            <p className="text-sm text-muted-foreground">
              Sorteio em {formatarData(r.dataSorteio)}
            </p>
            <ul
              className="flex flex-wrap gap-1.5"
              aria-label={`Dezenas sorteadas no concurso ${r.numero}`}
            >
              {r.dezenas.map((d) => (
                <li key={d}>
                  <BolaDezena numero={d} estado="sorteada" tamanho="sm" />
                </li>
              ))}
            </ul>
            {(r.dataProximo || r.valorEstimadoProximoCentavos) && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm">
                <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
                Próximo{r.dataProximo && ` em ${formatarData(r.dataProximo)}`}
                {r.valorEstimadoProximoCentavos ? (
                  <>
                    {' · estimativa '}
                    <MoneyText
                      centavos={r.valorEstimadoProximoCentavos}
                      className="font-semibold"
                    />
                  </>
                ) : null}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum resultado sincronizado ainda.</p>
        )}
      </CardContent>
    </Card>
  )
}

/** Página "Resultados" (seção 11.5): último concurso de cada modalidade e concursos com apostas suas. */
export function ResultadosPage() {
  const modalidades = useModalidades()
  const ids = modalidades.data?.map((m) => m.id) ?? []
  const ultimos = useQuery({
    queryKey: [...chaves.resultados, ids],
    queryFn: () => ultimosResultados(ids),
    enabled: ids.length > 0,
  })
  const meus = useQuery({
    queryKey: chaves.concursosDoUsuario,
    queryFn: () => concursosDoUsuario(),
  })
  const porId = new Map(modalidades.data?.map((m) => [m.id, m]))

  const erro = modalidades.isError || ultimos.isError || meus.isError
  return (
    <>
      <CabecalhoPagina
        titulo="Resultados"
        descricao="Os resultados oficiais são sincronizados automaticamente duas vezes por dia."
      />

      {erro && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar os resultados"
          acao={
            <Button
              variant="outline"
              onClick={() =>
                void Promise.all([modalidades.refetch(), ultimos.refetch(), meus.refetch()])
              }
            >
              Tentar de novo
            </Button>
          }
        />
      )}

      <section aria-labelledby="titulo-ultimos" className="mb-8">
        <h2 id="titulo-ultimos" className="mb-3 text-lg font-semibold">
          Últimos sorteios
        </h2>
        {modalidades.isPending || ultimos.isPending ? (
          <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {modalidades.data?.map((m) => (
              <CardUltimo
                key={m.id}
                modalidade={m}
                r={ultimos.data?.find((r) => r.modalidadeId === m.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="titulo-meus">
        <h2 id="titulo-meus" className="mb-3 text-lg font-semibold">
          Concursos com apostas suas
        </h2>
        {meus.isPending && <Skeleton className="h-40 w-full rounded-xl" />}
        {meus.data?.length === 0 && (
          <EmptyState
            icone={Ticket}
            titulo="Nenhuma aposta ainda"
            descricao="Os concursos das suas apostas aparecem aqui, com o resultado assim que sair."
            acao={
              <Button asChild>
                <Link to="/apostas/nova">Nova aposta</Link>
              </Button>
            }
          />
        )}
        {!!meus.data?.length && (
          <ul className="divide-y rounded-xl border bg-card">
            {meus.data.map((c) => {
              const m = porId.get(c.modalidadeId)
              if (!m) return null
              return (
                <li key={`${c.modalidadeId}:${c.numero}`}>
                  <Link
                    to={`/apostas?modalidade=${m.slug}&concurso=${c.numero}`}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <ModalidadeChip nome={m.nome} cor={m.cor} />
                        <span className="font-semibold tabular-nums">{c.numero}</span>
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {c.qtdApostas} {c.qtdApostas === 1 ? 'aposta' : 'apostas'}
                        {c.dataSorteio && ` · sorteio ${formatarData(c.dataSorteio)}`}
                      </span>
                    </span>
                    {c.premiado ? (
                      <span className="flex items-center gap-1 text-sm font-semibold text-destaque-texto">
                        <Trophy className="size-4" aria-hidden="true" />
                        {c.liquidoCentavos > 0 ? (
                          <MoneyText centavos={c.liquidoCentavos} />
                        ) : (
                          'Premiado'
                        )}
                      </span>
                    ) : c.sorteado ? (
                      <span className="text-sm text-muted-foreground">Conferido</span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="size-4" aria-hidden="true" /> Aguardando
                      </span>
                    )}
                    <ChevronRight
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
