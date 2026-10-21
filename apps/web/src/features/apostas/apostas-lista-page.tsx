import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { BotaoCopiar } from '@/components/botao-copiar'
import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { FiltroSheet } from '@/components/filtro-sheet'
import { SelectNativo } from '@/components/select-nativo'
import { rotulosStatus } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalidades } from '@/features/modalidades/use-modalidades'
import { formatarData } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import {
  apostasParaCopiar,
  excluirApostas,
  idsDoDia,
  listarApostas,
  TAMANHO_PAGINA,
  type FiltrosApostas,
  type ResumoAposta,
} from './api'
import { ApostaCard } from './aposta-card'
import {
  filtrosDaUrl,
  filtrosParaUrl,
  ORIGENS,
  rotulosOrigem,
  rotulosTipo,
  STATUS,
  TIPOS,
} from './filtros'
import { textoDoLote } from './texto-copia'

/** Apostas seguidas do mesmo dia (a lista ordenada por data já as traz juntas). */
function agruparPorDia(apostas: ResumoAposta[]) {
  const grupos: { dia: string; apostas: ResumoAposta[] }[] = []
  for (const a of apostas) {
    const dia = a.data_aposta ?? ''
    const ultimo = grupos.at(-1)
    if (ultimo?.dia === dia) ultimo.apostas.push(a)
    else grupos.push({ dia, apostas: [a] })
  }
  return grupos
}

function PainelFiltros({
  filtros,
  aplicar,
}: {
  filtros: FiltrosApostas
  aplicar: (f: FiltrosApostas) => void
}) {
  const { data: modalidades } = useModalidades()
  const [rascunho, setRascunho] = useState(filtros)
  const set = <K extends keyof FiltrosApostas>(k: K, v: FiltrosApostas[K]) =>
    setRascunho((r) => ({ ...r, [k]: v }))

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        aplicar(rascunho)
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Modalidade">
          <SelectNativo
            value={rascunho.modalidade ?? ''}
            onChange={(e) => set('modalidade', e.target.value || undefined)}
          >
            <option value="">Todas</option>
            {modalidades?.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.nome}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo label="Tipo">
          <SelectNativo
            value={rascunho.tipo ?? ''}
            onChange={(e) => set('tipo', (e.target.value || undefined) as FiltrosApostas['tipo'])}
          >
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {rotulosTipo[t]}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo label="Status">
          <SelectNativo
            value={rascunho.status ?? ''}
            onChange={(e) =>
              set('status', (e.target.value || undefined) as FiltrosApostas['status'])
            }
          >
            <option value="">Todos</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {rotulosStatus[s]}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo label="Origem">
          <SelectNativo
            value={rascunho.origem ?? ''}
            onChange={(e) =>
              set('origem', (e.target.value || undefined) as FiltrosApostas['origem'])
            }
          >
            <option value="">Todas</option>
            {ORIGENS.map((o) => (
              <option key={o} value={o}>
                {rotulosOrigem[o]}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo label="De">
          <Input
            type="date"
            value={rascunho.de ?? ''}
            onChange={(e) => set('de', e.target.value || undefined)}
          />
        </Campo>
        <Campo label="Até">
          <Input
            type="date"
            value={rascunho.ate ?? ''}
            onChange={(e) => set('ate', e.target.value || undefined)}
          />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox
          id="so-premiadas"
          checked={!!rascunho.premiadas}
          onCheckedChange={(v) => set('premiadas', v === true || undefined)}
          className="size-5"
        />
        <Label htmlFor="so-premiadas">Só premiadas</Label>
      </div>
      <Campo label="Ordenar por">
        <SelectNativo
          value={`${rascunho.ordem}:${rascunho.direcao}`}
          onChange={(e) => {
            const [ordem, direcao] = e.target.value.split(':') as [
              FiltrosApostas['ordem'],
              FiltrosApostas['direcao'],
            ]
            setRascunho((r) => ({ ...r, ordem, direcao }))
          }}
        >
          <option value="data:desc">Data (mais recentes)</option>
          <option value="data:asc">Data (mais antigas)</option>
          <option value="valor:desc">Valor pago (maior)</option>
          <option value="valor:asc">Valor pago (menor)</option>
          <option value="saldo:desc">Saldo (melhor)</option>
          <option value="saldo:asc">Saldo (pior)</option>
        </SelectNativo>
      </Campo>
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => aplicar({ ordem: 'data', direcao: 'desc' })}
        >
          Limpar
        </Button>
        <Button type="submit">Aplicar filtros</Button>
      </div>
    </form>
  )
}

export function ApostasListaPage() {
  const [params, setParams] = useSearchParams()
  const filtros = filtrosDaUrl(params)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [selecionando, setSelecionando] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()
  const { data: modalidades } = useModalidades()

  const consulta = useInfiniteQuery({
    queryKey: chaves.listaApostas(filtros),
    queryFn: ({ pageParam }) => listarApostas(filtros, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) =>
      ultima.length === TAMANHO_PAGINA ? todas.length : undefined,
  })
  const apostas = consulta.data?.pages.flat() ?? []

  // Paginação infinita: carrega a próxima página quando o fim da lista aparece.
  const sentinela = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = consulta
  useEffect(() => {
    const el = sentinela.current
    if (!el || !hasNextPage) return
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const excluir = useMutation({
    mutationFn: () => excluirApostas([...selecionadas]),
    onSuccess: () => {
      toast.success(
        selecionadas.size === 1 ? 'Aposta excluída.' : `${selecionadas.size} apostas excluídas.`,
      )
      setSelecionadas(new Set())
      setSelecionando(false)
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
    },
    onError: (e) => toast.error(e.message),
  })

  function aplicar(novos: FiltrosApostas) {
    setParams(filtrosParaUrl(novos))
    setFiltrosAbertos(false)
  }

  function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = Number(new FormData(e.currentTarget).get('concurso'))
    aplicar({ ...filtros, concurso: Number.isInteger(n) && n > 0 ? n : undefined })
  }

  // Chips dos filtros ativos (cada um removível).
  const nomeModalidade = modalidades?.find((m) => m.slug === filtros.modalidade)?.nome
  const ativos: { rotulo: string; remover: Partial<FiltrosApostas> }[] = []
  if (filtros.modalidade)
    ativos.push({
      rotulo: nomeModalidade ?? filtros.modalidade,
      remover: { modalidade: undefined },
    })
  if (filtros.tipo) ativos.push({ rotulo: rotulosTipo[filtros.tipo], remover: { tipo: undefined } })
  if (filtros.status)
    ativos.push({ rotulo: rotulosStatus[filtros.status], remover: { status: undefined } })
  if (filtros.origem)
    ativos.push({
      rotulo: `Origem: ${rotulosOrigem[filtros.origem]}`,
      remover: { origem: undefined },
    })
  if (filtros.de)
    ativos.push({ rotulo: `De ${formatarData(filtros.de)}`, remover: { de: undefined } })
  if (filtros.ate)
    ativos.push({ rotulo: `Até ${formatarData(filtros.ate)}`, remover: { ate: undefined } })
  if (filtros.premiadas) ativos.push({ rotulo: 'Só premiadas', remover: { premiadas: undefined } })
  if (filtros.concurso)
    ativos.push({ rotulo: `Concurso ${filtros.concurso}`, remover: { concurso: undefined } })

  const cards = (itens: ResumoAposta[]) => (
    <ul className="grid gap-3 lg:grid-cols-2">
      {itens.map((a) => (
        <li key={a.id}>
          <ApostaCard
            aposta={a}
            selecionando={selecionando}
            selecionada={selecionadas.has(a.id!)}
            onSelecionar={(sel) =>
              setSelecionadas((s) => {
                const novo = new Set(s)
                if (sel) novo.add(a.id!)
                else novo.delete(a.id!)
                return novo
              })
            }
          />
        </li>
      ))}
    </ul>
  )

  return (
    <>
      <CabecalhoPagina
        titulo="Apostas"
        acoes={
          <Button asChild className="hidden lg:inline-flex">
            <Link to="/apostas/nova">
              <Plus aria-hidden="true" /> Nova aposta
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <form onSubmit={buscar} className="flex min-w-0 flex-1 basis-56 gap-2" role="search">
          <Label htmlFor="busca-concurso" className="sr-only">
            Buscar por número do concurso
          </Label>
          <Input
            id="busca-concurso"
            name="concurso"
            inputMode="numeric"
            placeholder="Nº do concurso"
            defaultValue={filtros.concurso ?? ''}
            key={filtros.concurso ?? 'vazio'}
            className="min-w-0"
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
            <Search aria-hidden="true" />
          </Button>
        </form>
        <FiltroSheet
          titulo="Filtros"
          aberto={filtrosAbertos}
          onAbertoChange={setFiltrosAbertos}
          gatilho={
            <Button variant="outline">
              <SlidersHorizontal aria-hidden="true" /> Filtros
              {ativos.length > 0 && ` (${ativos.length})`}
            </Button>
          }
        >
          <PainelFiltros key={params.toString()} filtros={filtros} aplicar={aplicar} />
        </FiltroSheet>
        <Button
          variant={selecionando ? 'secondary' : 'outline'}
          onClick={() => {
            setSelecionando((s) => !s)
            setSelecionadas(new Set())
          }}
          aria-pressed={selecionando}
        >
          <ListChecks aria-hidden="true" /> {selecionando ? 'Cancelar' : 'Selecionar'}
        </Button>
      </div>

      {ativos.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Filtros ativos">
          {ativos.map((f) => (
            <li key={f.rotulo}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => aplicar({ ...filtros, ...f.remover })}
                aria-label={`Remover filtro ${f.rotulo}`}
              >
                {f.rotulo} <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {selecionando && (
        <div
          className="sticky top-16 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2"
          role="toolbar"
          aria-label="Ações em massa"
        >
          <span className="px-2 text-sm font-medium" aria-live="polite">
            {selecionadas.size} selecionada{selecionadas.size === 1 ? '' : 's'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelecionadas(new Set(apostas.map((a) => a.id!)))}
          >
            Todas
          </Button>
          <span className="flex-1" />
          <ConfirmDialog
            titulo={`Excluir ${selecionadas.size} aposta${selecionadas.size === 1 ? '' : 's'}?`}
            descricao="Os jogos, a divisão e os anexos também serão excluídos. Não dá para desfazer."
            textoConfirmar="Excluir"
            destrutivo
            onConfirmar={() => excluir.mutateAsync()}
          >
            <Button variant="destructive" size="sm" disabled={selecionadas.size === 0}>
              <Trash2 aria-hidden="true" /> Excluir
            </Button>
          </ConfirmDialog>
        </div>
      )}

      {consulta.isPending && (
        <div className="grid gap-3 lg:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      )}

      {consulta.isError && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar as apostas"
          acao={
            <Button variant="outline" onClick={() => void consulta.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}

      {consulta.isSuccess && apostas.length === 0 && (
        <EmptyState
          icone={Ticket}
          titulo={ativos.length ? 'Nenhuma aposta com esses filtros' : 'Nenhuma aposta ainda'}
          descricao={
            ativos.length
              ? 'Tente remover algum filtro.'
              : 'Registre sua primeira aposta para acompanhar gastos e resultados.'
          }
          acao={
            ativos.length ? (
              <Button
                variant="outline"
                onClick={() => aplicar({ ordem: filtros.ordem, direcao: filtros.direcao })}
              >
                Limpar filtros
              </Button>
            ) : (
              <Button asChild>
                <Link to="/apostas/nova">
                  <Plus aria-hidden="true" /> Nova aposta
                </Link>
              </Button>
            )
          }
        />
      )}

      {apostas.length > 0 &&
        (filtros.ordem === 'data' ? (
          <div className="grid gap-6">
            {agruparPorDia(apostas).map((g) => (
              <section key={g.dia} aria-labelledby={`dia-${g.dia}`} className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id={`dia-${g.dia}`} className="text-sm font-semibold text-muted-foreground">
                    {g.dia ? formatarData(g.dia) : 'Sem data'}
                  </h2>
                  {g.dia && (
                    <BotaoCopiar
                      variant="outline"
                      texto="Copiar lote"
                      aria-label={`Copiar lote de ${formatarData(g.dia)}`}
                      mensagemSucesso="Apostas do dia copiadas."
                      obterTexto={async () =>
                        textoDoLote(g.dia, await apostasParaCopiar(await idsDoDia(filtros, g.dia)))
                      }
                    />
                  )}
                </div>
                {cards(g.apostas)}
              </section>
            ))}
          </div>
        ) : (
          cards(apostas)
        ))}

      <div ref={sentinela} className="flex justify-center py-6">
        {consulta.hasNextPage && (
          <Button
            variant="outline"
            onClick={() => void consulta.fetchNextPage()}
            disabled={consulta.isFetchingNextPage}
          >
            {consulta.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden="true" />}
            Carregar mais
          </Button>
        )}
      </div>
    </>
  )
}
