import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarBRL, tentarDeReais } from '@shared/dinheiro.ts'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Info,
  PiggyBank,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { InputDinheiro } from '@/components/input-dinheiro'
import { SelectNativo } from '@/components/select-nativo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { deslocarMes, mesDaUrl, rotuloMes } from '@/features/calendario/calendario'
import { useModalidades } from '@/features/modalidades/use-modalidades'
import { hojeIso } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import {
  alterarLimite,
  copiarLimites,
  criarOrcamento,
  excluirOrcamento,
  nomeOrcamento,
  orcamentosDoMes,
  type Orcamento,
} from './api'
import { BarraOrcamento } from './barra-orcamento'

/** Orçamento mensal (seção 11.9): limite geral e por modalidade, só com avisos. */
export function OrcamentoPage() {
  const [params, setParams] = useSearchParams()
  const hoje = hojeIso()
  const mes = mesDaUrl(params.get('mes'), hoje)
  const mesAnterior = deslocarMes(mes, -1)
  const qc = useQueryClient()
  const { data: modalidades } = useModalidades()

  const atual = useQuery({ queryKey: chaves.orcamento(mes), queryFn: () => orcamentosDoMes(mes) })
  const anterior = useQuery({
    queryKey: chaves.orcamento(mesAnterior),
    queryFn: () => orcamentosDoMes(mesAnterior),
    enabled: atual.data?.length === 0,
  })
  const atualizar = () => qc.invalidateQueries({ queryKey: chaves.orcamento(mes) })

  const copiar = useMutation({
    mutationFn: () => copiarLimites(anterior.data ?? [], mes, atual.data ?? []),
    onSuccess: async (n) => {
      await atualizar()
      toast.success(n === 1 ? '1 limite copiado.' : `${n} limites copiados.`)
    },
    onError: (e) => toast.error(e.message),
  })

  function irPara(novo: string) {
    setParams(novo === hoje.slice(0, 7) ? {} : { mes: novo }, { replace: true })
  }

  const usados = new Set(atual.data?.map((o) => o.modalidadeId))
  const opcoes = [
    ...(usados.has(null) ? [] : [{ valor: '', nome: 'Geral (todas as modalidades)' }]),
    ...(modalidades ?? [])
      .filter((m) => !usados.has(m.id))
      .map((m) => ({ valor: String(m.id), nome: m.nome })),
  ]

  return (
    <>
      <CabecalhoPagina
        titulo="Orçamento"
        descricao="Um limite mensal para acompanhar quanto você gasta com apostas."
      />

      <p className="mb-6 flex gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />O orçamento só avisa: nenhuma
        aposta é bloqueada. Você recebe uma notificação ao chegar a 80% e a 100% do limite.
      </p>

      <div className="mb-4 flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => irPara(mesAnterior)}
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

      {atual.isPending && <Skeleton className="h-40 w-full rounded-xl" />}
      {atual.isError && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar o orçamento"
          acao={
            <Button variant="outline" onClick={() => void atual.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}

      {atual.data && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section aria-labelledby="titulo-limites" className="grid gap-3">
            <h2 id="titulo-limites" className="sr-only">
              Limites de {rotuloMes(mes)}
            </h2>
            {atual.data.length === 0 ? (
              <EmptyState
                icone={PiggyBank}
                titulo="Nenhum limite neste mês"
                descricao="Defina um limite geral ou por modalidade."
                acao={
                  anterior.data && anterior.data.length > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() => copiar.mutate()}
                      disabled={copiar.isPending}
                    >
                      <Copy aria-hidden="true" />
                      Usar os limites de {rotuloMes(mesAnterior).split(' de ')[0]}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              atual.data.map((o) => <LinhaOrcamento key={o.id} orcamento={o} aoMudar={atualizar} />)
            )}
          </section>

          {opcoes.length > 0 && <NovoLimite mes={mes} opcoes={opcoes} aoCriar={atualizar} />}
        </div>
      )}
    </>
  )
}

function LinhaOrcamento({
  orcamento,
  aoMudar,
}: {
  orcamento: Orcamento
  aoMudar: () => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string>()
  const nome = nomeOrcamento(orcamento)

  const salvar = useMutation({
    mutationFn: (limite: number) => alterarLimite(orcamento.id, limite),
    onSuccess: async () => {
      await aoMudar()
      setEditando(false)
      toast.success('Limite atualizado.')
    },
    onError: (e) => setErro(e.message),
  })
  const excluir = useMutation({
    mutationFn: () => excluirOrcamento(orcamento.id),
    onSuccess: async () => {
      toast.success('Limite excluído.')
      await aoMudar()
    },
    onError: (e) => toast.error(e.message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    const limite = tentarDeReais(valor)
    if (!limite || limite <= 0) return setErro('Informe um valor maior que zero.')
    salvar.mutate(limite)
  }

  return (
    <Card className="gap-3 p-4" role="region" aria-label={`Orçamento ${nome}`}>
      <BarraOrcamento orcamento={orcamento} />
      {editando ? (
        <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
          <Campo label={`Novo limite (${nome})`} erro={erro} className="w-44">
            <InputDinheiro value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
          </Campo>
          <Button type="submit" disabled={salvar.isPending}>
            Salvar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => {
              setValor(formatarBRL(orcamento.limite).replace('R$ ', ''))
              setErro(undefined)
              setEditando(true)
            }}
          >
            Alterar limite
          </Button>
          <ConfirmDialog
            titulo={`Excluir o limite ${nome}?`}
            descricao="As apostas não mudam; só o acompanhamento deste limite deixa de existir."
            textoConfirmar="Excluir"
            destrutivo
            onConfirmar={() => excluir.mutateAsync()}
          >
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 text-prejuizo"
              aria-label={`Excluir o limite ${nome}`}
            >
              <Trash2 aria-hidden="true" />
              Excluir
            </Button>
          </ConfirmDialog>
        </div>
      )}
    </Card>
  )
}

function NovoLimite({
  mes,
  opcoes,
  aoCriar,
}: {
  mes: string
  opcoes: { valor: string; nome: string }[]
  aoCriar: () => Promise<void>
}) {
  const [modalidade, setModalidade] = useState(opcoes[0]!.valor)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string>()
  const escolhida = opcoes.some((o) => o.valor === modalidade) ? modalidade : opcoes[0]!.valor

  const criar = useMutation({
    mutationFn: (limite: number) =>
      criarOrcamento(mes, limite, escolhida === '' ? null : Number(escolhida)),
    onSuccess: async () => {
      await aoCriar()
      setValor('')
      toast.success('Limite criado.')
    },
    onError: (e) => setErro(e.message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    const limite = tentarDeReais(valor)
    if (!limite || limite <= 0) return setErro('Informe um valor maior que zero.')
    setErro(undefined)
    criar.mutate(limite)
  }

  return (
    <Card className="gap-4 p-4" role="region" aria-labelledby="titulo-novo-limite">
      <h2 id="titulo-novo-limite" className="font-semibold">
        Novo limite
      </h2>
      <form onSubmit={enviar} className="grid gap-4">
        <Campo label="Para">
          <SelectNativo value={escolhida} onChange={(e) => setModalidade(e.target.value)}>
            {opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.nome}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo label="Limite do mês" erro={erro}>
          <InputDinheiro value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Button type="submit" disabled={criar.isPending}>
          <Plus aria-hidden="true" />
          Adicionar limite
        </Button>
      </form>
    </Card>
  )
}
