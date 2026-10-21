import { rateioDoBanco } from '@shared/resultados.ts'
import { resultadoManualSchema } from '@shared/schemas/resultados.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ClipboardPen, Loader2, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { EmptyState } from '@/components/empty-state'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { SelectNativo } from '@/components/select-nativo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalidades, type Modalidade } from '@/features/modalidades/use-modalidades'
import { CamposResultado } from '@/features/resultados/campos-resultado'
import {
  rateioDoFormulario,
  rateioParaFormulario,
  type RateioDoFormulario,
} from '@/features/resultados/rateio-formulario'
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

const rotulosFonte: Record<string, string> = {
  api_caixa: 'da API',
  manual: 'lançado à mão',
  usuario: 'informado por um usuário',
}

function LancarManual({ modalidades }: { modalidades: Modalidade[] }) {
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState(modalidades[0]?.slug ?? '')
  const modalidade = modalidades.find((m) => m.slug === slug)
  const [numero, setNumero] = useState('')
  const [data, setData] = useState(hojeIso())
  const [dezenas, setDezenas] = useState<number[]>([])
  const [acumulado, setAcumulado] = useState(false)
  const [rateio, setRateio] = useState<RateioDoFormulario>({})
  const [erros, setErros] = useState<string[]>([])

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
      setRateio(rateioParaFormulario(rateioDoBanco(c.rateio)))
      toast.success(`Concurso ${c.numero} carregado (${rotulosFonte[c.fonte] ?? c.fonte}).`)
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
    const entrada = resultadoManualSchema.safeParse({
      modalidadeSlug: modalidade.slug,
      numero: /^\d+$/.test(numero) ? Number(numero) : Number.NaN,
      dataSorteio: data,
      dezenas,
      rateio: rateioDoFormulario(modalidade.regra, rateio),
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

          {modalidade && (
            <CamposResultado
              regra={modalidade.regra}
              dezenas={dezenas}
              onDezenas={setDezenas}
              acumulado={acumulado}
              onAcumulado={setAcumulado}
              rateio={rateio}
              onRateio={setRateio}
            />
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
                      {
                        {
                          cron: 'Automática',
                          admin: 'Admin',
                          manual: 'Manual',
                          usuario: 'Usuário',
                        }[l.origem]
                      }
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
