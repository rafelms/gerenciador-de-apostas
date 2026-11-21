import { formatarBRL, tentarDeReais } from '@shared/dinheiro.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  ListChecks,
  PartyPopper,
  Plus,
  RefreshCw,
  Target,
  Ticket,
  Trash2,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { EmptyState } from '@/components/empty-state'
import { InputDinheiro } from '@/components/input-dinheiro'
import { KpiCard } from '@/components/kpi-card'
import { MoneyText } from '@/components/money-text'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApostaCard } from '@/features/apostas/aposta-card'
import { formatarData, hojeIso } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { apostasDaVirada, criarItem, excluirItem, listarItens, marcarItem } from './api'
import {
  chanceDeSena,
  ordenarItens,
  resumoItens,
  textoContagem,
  VIRADA,
  type ItemVirada,
} from './virada'

const linkLista = `/apostas?modalidade=${VIRADA.modalidadeSlug}&concurso=${VIRADA.concurso}`

function FormNovoItem() {
  const qc = useQueryClient()
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string>()

  const criar = useMutation({
    mutationFn: ({ d, v }: { d: string; v: number | null }) => criarItem(d, v),
    onSuccess: async () => {
      setDescricao('')
      setValor('')
      await qc.invalidateQueries({ queryKey: chaves.viradaItens })
    },
    onError: (e) => toast.error(e.message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    const d = descricao.trim()
    if (!d) return setErro('Descreva a aposta (ex.: Bolão do trabalho).')
    const v = valor.trim() === '' ? null : tentarDeReais(valor)
    if (valor.trim() !== '' && (v === null || v < 0)) return setErro('Valor inválido.')
    setErro(undefined)
    criar.mutate({ d, v })
  }

  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-start">
      <Campo label="Aposta a fazer" erro={erro}>
        <Input
          value={descricao}
          maxLength={120}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: Bolão do trabalho"
        />
      </Campo>
      <Campo label="Valor (opcional)">
        <InputDinheiro value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <Button type="submit" className="min-h-11 sm:mt-6" disabled={criar.isPending}>
        <Plus aria-hidden="true" /> Adicionar
      </Button>
    </form>
  )
}

function LinhaItem({ item }: { item: ItemVirada }) {
  const qc = useQueryClient()
  const atualizar = () => qc.invalidateQueries({ queryKey: chaves.viradaItens })
  const marcar = useMutation({
    mutationFn: (feito: boolean) => marcarItem(item.id, feito),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  })
  const excluir = useMutation({
    mutationFn: () => excluirItem(item.id),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  })

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <Checkbox
        checked={item.feito}
        onCheckedChange={(v) => marcar.mutate(v === true)}
        aria-label={`${item.descricao}: feita`}
        className="size-6"
      />
      <span className={item.feito ? 'min-w-0 flex-1 text-muted-foreground' : 'min-w-0 flex-1'}>
        <span className={item.feito ? 'block truncate line-through' : 'block truncate'}>
          {item.descricao}
        </span>
        {item.valor_previsto_centavos !== null && (
          <span className="block text-sm text-muted-foreground tabular-nums">
            {formatarBRL(item.valor_previsto_centavos)}
          </span>
        )}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        onClick={() => excluir.mutate()}
        disabled={excluir.isPending}
        aria-label={`Remover ${item.descricao}`}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  )
}

/** Aba temporária da Mega da Virada: o que falta fazer e o que já está registrado. */
export function ViradaPage() {
  const hoje = hojeIso()
  const itens = useQuery({ queryKey: chaves.viradaItens, queryFn: listarItens })
  const registradas = useQuery({ queryKey: chaves.viradaApostas, queryFn: apostasDaVirada })

  const resumo = resumoItens(itens.data ?? [])
  const apostas = registradas.data?.apostas ?? []
  const chance = chanceDeSena(registradas.data?.dezenasPorJogo ?? [])
  const gasto = apostas.reduce((s, a) => s + (a.gasto_usuario_centavos ?? 0), 0)
  const qtdJogos = apostas.reduce((s, a) => s + (a.qtd_jogos ?? 0), 0)

  return (
    <>
      <CabecalhoPagina
        titulo="Mega da Virada"
        descricao={`Mega-Sena, concurso ${VIRADA.concurso} · sorteio em ${formatarData(VIRADA.data)}`}
        acoes={
          <Button asChild className="min-h-11">
            <Link to="/apostas/nova">
              <Plus aria-hidden="true" /> Nova aposta
            </Link>
          </Button>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          titulo="Prêmio estimado"
          icone={PartyPopper}
          valor={<span className="text-3xl break-all">{formatarBRL(VIRADA.premioCentavos)}</span>}
          detalhe="Estimativa divulgada pela CAIXA"
          destaque
          className="col-span-2 justify-between lg:col-span-1"
        />
        <KpiCard
          titulo="Sorteio"
          icone={CalendarClock}
          valor={formatarData(VIRADA.data)}
          detalhe={textoContagem(hoje)}
        />
        <KpiCard
          titulo="Apostas feitas"
          icone={ListChecks}
          valor={itens.data ? `${resumo.feitos} de ${resumo.total}` : '—'}
          detalhe={
            resumo.total === 0
              ? 'Monte a lista abaixo'
              : resumo.faltam === 0
                ? 'Tudo feito'
                : `Faltam ${resumo.faltam}`
          }
        />
        <KpiCard
          titulo="Chance de sena"
          icone={Target}
          valor={
            chance.umEm ? (
              <span className="text-2xl">1 em {chance.umEm.toLocaleString('pt-BR')}</span>
            ) : (
              '—'
            )
          }
          detalhe="Somando os jogos registrados"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="titulo-a-fazer" className="grid gap-4">
          <div>
            <h2 id="titulo-a-fazer" className="text-xl font-medium">
              Apostas a fazer
            </h2>
            <p className="text-sm text-muted-foreground">
              Sua lista para a Virada: marque cada uma quando fizer.
              {resumo.valorFalta > 0 && (
                <>
                  {' '}
                  Falta pagar <MoneyText centavos={resumo.valorFalta} />.
                </>
              )}
            </p>
          </div>

          <Card className="p-4">
            <FormNovoItem />
          </Card>

          {itens.isPending && <Skeleton className="h-24 w-full rounded-xl" />}
          {itens.isError && (
            <EmptyState
              icone={RefreshCw}
              titulo="Não foi possível carregar a lista"
              acao={
                <Button variant="outline" onClick={() => void itens.refetch()}>
                  Tentar de novo
                </Button>
              }
            />
          )}
          {itens.data && itens.data.length === 0 && (
            <EmptyState
              icone={ListChecks}
              titulo="Nenhuma aposta na lista"
              descricao="Anote o que pretende apostar na Virada (bolões, jogos próprios, apostas de outras pessoas) e marque quando fizer."
            />
          )}
          {itens.data && itens.data.length > 0 && (
            <ul aria-labelledby="titulo-a-fazer" className="grid gap-2">
              {ordenarItens(itens.data).map((i) => (
                <LinhaItem key={i.id} item={i} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titulo-registradas" className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="titulo-registradas" className="text-xl font-medium">
                Registradas no app
              </h2>
              <p className="text-sm text-muted-foreground">
                {apostas.length === 0
                  ? `Apostas da Mega-Sena que valem para o concurso ${VIRADA.concurso}.`
                  : `${apostas.length} ${apostas.length === 1 ? 'aposta' : 'apostas'}, ${qtdJogos} ${qtdJogos === 1 ? 'jogo' : 'jogos'} · sua parte: ${formatarBRL(gasto)}`}
              </p>
            </div>
            {apostas.length > 0 && (
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link to={linkLista}>Ver na lista</Link>
              </Button>
            )}
          </div>

          {registradas.isPending && <Skeleton className="h-32 w-full rounded-2xl" />}
          {registradas.isError && (
            <EmptyState
              icone={RefreshCw}
              titulo="Não foi possível carregar as apostas"
              acao={
                <Button variant="outline" onClick={() => void registradas.refetch()}>
                  Tentar de novo
                </Button>
              }
            />
          )}
          {registradas.data && apostas.length === 0 && (
            <EmptyState
              icone={Ticket}
              titulo="Nenhuma aposta registrada ainda"
              descricao={`Ao registrar uma aposta da Mega-Sena no concurso ${VIRADA.concurso}, ela aparece aqui.`}
              acao={
                <Button asChild className="min-h-11">
                  <Link to="/apostas/nova">
                    <Plus aria-hidden="true" /> Registrar aposta
                  </Link>
                </Button>
              }
            />
          )}
          {apostas.length > 0 && (
            <div className="grid gap-3">
              {apostas.map((a) => (
                <ApostaCard key={a.id} aposta={a} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
