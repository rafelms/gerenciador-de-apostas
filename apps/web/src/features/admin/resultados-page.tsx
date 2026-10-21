import { tentarDeReais, formatarBRL } from '@shared/dinheiro.ts'
import { rateioDoBanco } from '@shared/resultados.ts'
import { resultadoManualSchema } from '@shared/schemas/resultados.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ClipboardPen, Loader2, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { EmptyState } from '@/components/empty-state'
import { InputDinheiro } from '@/components/input-dinheiro'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { SelectNativo } from '@/components/select-nativo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { VolanteNumerico } from '@/components/volante-numerico'
import { useModalidades, type Modalidade } from '@/features/modalidades/use-modalidades'
import { formatarDataHora, hojeIso } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import {
  buscarConcursoAdmin,
  chavesAdmin,
  lancarResultadoManual,
  listarSyncLogs,
  sincronizarAgora,
  type ResumoSync,
} from './api'

function Sincronizar() {
  const queryClient = useQueryClient()
  const [resumo, setResumo] = useState<ResumoSync | null>(null)
  const sync = useMutation({
    mutationFn: sincronizarAgora,
    onSuccess: (r) => {
      setResumo(r)
      const erros = r.modalidades.filter((m) => m.erro).length
      if (erros)
        toast.warning(
          `Sincronização concluída com ${erros} ${erros === 1 ? 'falha' : 'falhas'}. Veja o log.`,
        )
      else toast.success('Resultados sincronizados.')
      void queryClient.invalidateQueries({ queryKey: chavesAdmin.syncLogs })
      void queryClient.invalidateQueries({ queryKey: ['concursos'] })
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Sincronizar agora</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Busca na API da CAIXA o último concurso de cada modalidade e os que as apostas precisam, e
          confere as apostas. Roda sozinho às 22h30 e às 9h.
        </p>
        <Button className="w-fit" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          {sync.isPending ? 'Sincronizando…' : 'Sincronizar agora'}
        </Button>
        {resumo && (
          <ul className="grid gap-2 text-sm" aria-label="Resumo da sincronização">
            {resumo.modalidades.map((m) => (
              <li key={m.slug} className="flex flex-wrap items-center gap-x-2">
                {m.erro ? (
                  <AlertTriangle className="size-4 text-alerta" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-4 text-lucro" aria-hidden="true" />
                )}
                <span className="font-medium">{m.slug}</span>
                {m.ultimo && <span className="text-muted-foreground">último {m.ultimo}</span>}
                <span className="text-muted-foreground">
                  · {m.inseridos} novos · {m.conferidos} apostas conferidas
                </span>
                {m.erro && <span className="basis-full text-alerta">{m.erro}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

interface LinhaRateio {
  ganhadores: string
  valor: string
}

function LancarManual({ modalidades }: { modalidades: Modalidade[] }) {
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState(modalidades[0]?.slug ?? '')
  const modalidade = modalidades.find((m) => m.slug === slug)
  const [numero, setNumero] = useState('')
  const [data, setData] = useState(hojeIso())
  const [dezenas, setDezenas] = useState<number[]>([])
  const [acumulado, setAcumulado] = useState(false)
  const [rateio, setRateio] = useState<Record<number, LinhaRateio>>({})
  const [erros, setErros] = useState<string[]>([])

  // No volante, o admin marca exatamente as dezenas sorteadas.
  const regraSorteio = modalidade && {
    ...modalidade.regra,
    minMarcadas: modalidade.regra.qtdSorteadas,
    maxMarcadas: modalidade.regra.qtdSorteadas,
  }

  function trocarModalidade(novo: string) {
    setSlug(novo)
    setDezenas([])
    setRateio({})
    setErros([])
  }

  const carregar = useMutation({
    mutationFn: () => buscarConcursoAdmin(modalidade!.id, Number(numero)),
    onSuccess: (c) => {
      if (!c) return toast.info('Concurso ainda não cadastrado: preencha o resultado.')
      setData(c.data_sorteio)
      setDezenas(c.dezenas ?? [])
      setAcumulado(!!c.acumulado)
      setRateio(
        Object.fromEntries(
          rateioDoBanco(c.rateio).map((f) => [
            f.acertos,
            {
              ganhadores: String(f.ganhadores),
              valor: formatarBRL(f.valorCentavos).replace('R$ ', ''),
            },
          ]),
        ),
      )
      toast.success(
        `Concurso ${c.numero} carregado (${c.fonte === 'manual' ? 'lançado à mão' : 'da API'}).`,
      )
    },
    onError: () => toast.error('Não foi possível buscar o concurso.'),
  })

  const lancar = useMutation({
    mutationFn: lancarResultadoManual,
    onSuccess: (r) => {
      toast.success(
        r.apostasConferidas === 0
          ? 'Resultado salvo. Nenhuma aposta neste concurso.'
          : `Resultado salvo. ${r.apostasConferidas} ${r.apostasConferidas === 1 ? 'aposta conferida' : 'apostas conferidas'}, ${r.premiadas} premiada(s).`,
      )
      void queryClient.invalidateQueries({ queryKey: chavesAdmin.syncLogs })
      void queryClient.invalidateQueries({ queryKey: ['concursos'] })
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
    },
    onError: (e) => toast.error(e.message),
  })

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!modalidade) return
    const linhas = modalidade.regra.faixas.flatMap((f) => {
      const l = rateio[f.acertos]
      if (!l || (!l.valor.trim() && !l.ganhadores.trim())) return []
      return [
        {
          acertos: f.acertos,
          ganhadores: Number(l.ganhadores || 0),
          valorCentavos: tentarDeReais(l.valor) ?? Number.NaN,
        },
      ]
    })
    const entrada = resultadoManualSchema.safeParse({
      modalidadeSlug: modalidade.slug,
      numero: /^\d+$/.test(numero) ? Number(numero) : Number.NaN,
      dataSorteio: data,
      dezenas,
      rateio: linhas,
      acumulado,
    })
    if (!entrada.success) {
      setErros(
        entrada.error.issues.map((i) =>
          i.path[0] === 'numero'
            ? 'Informe o número do concurso.'
            : i.path[0] === 'rateio'
              ? 'Confira os valores do rateio.'
              : i.message,
        ),
      )
      return
    }
    setErros([])
    lancar.mutate(entrada.data)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Lançar ou corrigir resultado</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} noValidate className="grid gap-5">
          <p className="text-sm text-muted-foreground">
            Use quando a API da CAIXA não responder. Ao salvar, as apostas do concurso são
            conferidas. Sem o rateio, as apostas premiadas ficam com o valor a confirmar.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="manual-modalidade">Modalidade</Label>
              <SelectNativo
                id="manual-modalidade"
                value={slug}
                onChange={(e) => trocarModalidade(e.target.value)}
              >
                {modalidades.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.nome}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <Campo label="Concurso">
              <Input
                inputMode="numeric"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </Campo>
            <Campo label="Data do sorteio">
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </Campo>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={!/^\d+$/.test(numero) || carregar.isPending}
            onClick={() => carregar.mutate()}
          >
            <Search aria-hidden="true" /> Carregar resultado existente
          </Button>

          {regraSorteio && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Dezenas sorteadas</legend>
              <VolanteNumerico
                regra={regraSorteio}
                selecionadas={dezenas}
                onChange={setDezenas}
                precoSimples={null}
                rotulo="Dezenas sorteadas"
              />
            </fieldset>
          )}

          <label className="flex min-h-11 w-fit items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={acumulado}
              onCheckedChange={(v) => setAcumulado(v === true)}
              className="size-5"
            />
            Acumulou
          </label>

          {modalidade && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Rateio (opcional)</legend>
              <div className="grid gap-3">
                {modalidade.regra.faixas.map((f) => (
                  <div
                    key={f.acertos}
                    className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(6rem,1fr)_6rem_minmax(8rem,1.5fr)]"
                  >
                    <span className="col-span-2 text-sm font-medium sm:col-span-1 sm:pb-3">
                      {f.nome}
                    </span>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`gan-${f.acertos}`} className="text-xs">
                        Ganhadores
                      </Label>
                      <Input
                        id={`gan-${f.acertos}`}
                        inputMode="numeric"
                        value={rateio[f.acertos]?.ganhadores ?? ''}
                        onChange={(e) =>
                          setRateio((r) => ({
                            ...r,
                            [f.acertos]: {
                              valor: r[f.acertos]?.valor ?? '',
                              ganhadores: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`val-${f.acertos}`} className="text-xs">
                        Prêmio por aposta
                      </Label>
                      <InputDinheiro
                        id={`val-${f.acertos}`}
                        value={rateio[f.acertos]?.valor ?? ''}
                        onChange={(e) =>
                          setRateio((r) => ({
                            ...r,
                            [f.acertos]: {
                              ganhadores: r[f.acertos]?.ganhadores ?? '',
                              valor: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {erros.length > 0 && (
            <ul role="alert" className="grid gap-1 text-sm font-medium text-destructive">
              {[...new Set(erros)].map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <Button type="submit" className="w-fit" disabled={lancar.isPending}>
            {lancar.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <ClipboardPen aria-hidden="true" />
            )}
            Salvar e conferir
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Log({ modalidades }: { modalidades: Modalidade[] }) {
  const logs = useQuery({ queryKey: chavesAdmin.syncLogs, queryFn: listarSyncLogs })
  const porId = new Map(modalidades.map((m) => [m.id, m]))
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Log da sincronização</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {logs.isPending && <Skeleton className="h-32 w-full" />}
        {logs.isError && (
          <Button variant="outline" onClick={() => void logs.refetch()}>
            Tentar de novo
          </Button>
        )}
        {logs.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma sincronização registrada ainda.</p>
        )}
        {!!logs.data?.length && (
          <table className="w-full text-sm">
            <caption className="sr-only">Últimas 50 execuções</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 font-medium">
                  Quando
                </th>
                <th scope="col" className="py-2 font-medium">
                  Modalidade
                </th>
                <th scope="col" className="hidden py-2 font-medium sm:table-cell">
                  Origem
                </th>
                <th scope="col" className="py-2 font-medium">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((l) => {
                const m = l.modalidade_id ? porId.get(l.modalidade_id) : undefined
                return (
                  <tr key={l.id} className="border-b align-top last:border-0">
                    <td className="py-2 whitespace-nowrap tabular-nums">
                      {formatarDataHora(l.executado_em)}
                    </td>
                    <td className="py-2">
                      {m ? <ModalidadeChip nome={m.nome} cor={m.cor} /> : '—'}
                    </td>
                    <td className="hidden py-2 sm:table-cell">
                      {{ cron: 'Automática', admin: 'Admin', manual: 'Manual' }[l.origem]}
                    </td>
                    <td className="py-2">
                      {l.status === 'ok' ? (
                        <Badge variant="secondary">OK</Badge>
                      ) : (
                        <Badge variant="destructive">Erro</Badge>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {l.ultimo_concurso && `concurso ${l.ultimo_concurso} · `}
                        {l.inseridos} novos · {l.conferidos} conferidas
                      </span>
                      {l.mensagem && (
                        <span className="block text-xs wrap-break-word">{l.mensagem}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

/** Admin → Resultados (seção 11.13): sincronizar agora, log e resultado manual. */
export function AdminResultadosPage() {
  const modalidades = useModalidades()
  return (
    <>
      <CabecalhoPagina
        titulo="Resultados"
        descricao="Sincronização com a API da CAIXA e lançamento manual."
      />
      {modalidades.isPending && <Skeleton className="h-64 w-full rounded-xl" />}
      {modalidades.isError && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar"
          acao={
            <Button variant="outline" onClick={() => void modalidades.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {modalidades.data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="grid content-start gap-4">
            <Sincronizar />
            <Log modalidades={modalidades.data} />
          </div>
          <LancarManual modalidades={modalidades.data} />
        </div>
      )}
    </>
  )
}
