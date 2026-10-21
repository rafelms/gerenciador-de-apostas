import { calcularGastoUsuario, ratearMaiorResto } from '@shared/dinheiro.ts'
import { obterRegra } from '@shared/regras/index.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, CheckCircle2, Circle, Pencil, RefreshCw, SearchX, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { BolaDezena, ListaDezenas } from '@/components/bola-dezena'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { MoneyText } from '@/components/money-text'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarData, formatarDataHora } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { buscarConcurso, carregarAposta, excluirApostas, type ApostaCompleta } from './api'
import { rotulosOrigem, rotulosTipo } from './filtros'

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

function Jogos({ aposta }: { aposta: ApostaCompleta }) {
  const slug = aposta.modalidades?.slug ?? ''
  // Resultado do 1º concurso (teimosinha: a conferência por concurso chega na fase 2).
  const concurso = useQuery({
    queryKey: chaves.concurso(aposta.modalidade_id, aposta.concurso_inicial),
    queryFn: () => buscarConcurso(aposta.modalidade_id, aposta.concurso_inicial),
  })
  const sorteadas = concurso.data?.dezenas ?? null
  const regra = obterRegra(slug)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Jogos</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {sorteadas ? (
          <div className="grid gap-2 rounded-lg bg-muted/60 p-3">
            <p className="text-sm font-medium">
              Resultado do concurso {aposta.concurso_inicial}
              {concurso.data?.data_sorteio && ` (${formatarData(concurso.data.data_sorteio)})`}
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Dezenas sorteadas">
              {sorteadas.map((d) => (
                <li key={d}>
                  <BolaDezena numero={d} estado="sorteada" tamanho="sm" />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          !concurso.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden="true" /> Aguardando resultado oficial do concurso {aposta.concurso_inicial}.
            </p>
          )
        )}
        <ol className="grid gap-3">
          {aposta.aposta_jogos.map((j) => {
            const acertos = sorteadas ? regra.conferir(j.dezenas, { dezenas: sorteadas }).acertos : null
            return (
              <li key={j.ordem} className="grid gap-2">
                <p className="text-sm font-medium">
                  Jogo {j.ordem}{' '}
                  <span className="text-muted-foreground">
                    · {j.dezenas.length} dezenas{acertos !== null && ` · ${acertos} ${acertos === 1 ? 'acerto' : 'acertos'}`}
                  </span>
                </p>
                <ListaDezenas dezenas={j.dezenas} sorteadas={sorteadas} />
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

function Divisao({ aposta }: { aposta: ApostaCompleta }) {
  const participantes = aposta.participantes.map((p) => ({
    nome: p.nome,
    peso: Number(p.peso),
    ehUsuario: p.eh_usuario,
    contribuicaoCentavos: p.contribuicao_centavos,
  }))
  const soma = participantes.reduce((a, p) => a + p.peso, 0)
  const temContribuicoes = participantes.every((p) => p.contribuicaoCentavos !== null)
  const partes = temContribuicoes
    ? participantes.map((p) => p.contribuicaoCentavos!)
    : ratearMaiorResto(aposta.valor_pago_centavos, participantes.map((p) => p.peso))

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Divisão</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Divisão do valor pago entre os participantes</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 font-medium">Participante</th>
              <th scope="col" className="py-2 text-right font-medium">Peso</th>
              <th scope="col" className="py-2 text-right font-medium">%</th>
              <th scope="col" className="py-2 text-right font-medium">Parte do gasto</th>
            </tr>
          </thead>
          <tbody>
            {participantes.map((p, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">
                  {p.nome}
                  {p.ehUsuario && <span className="text-muted-foreground"> (você)</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{p.peso.toLocaleString('pt-BR')}</td>
                <td className="py-2 text-right tabular-nums">
                  {((p.peso / soma) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                </td>
                <td className="py-2 text-right">
                  <MoneyText centavos={partes[i] ?? 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">A divisão do prêmio (bruto, IR e líquido) aparece aqui quando a aposta for premiada.</p>
      </CardContent>
    </Card>
  )
}

function LinhaDoTempo({ aposta }: { aposta: ApostaCompleta }) {
  const conferida = aposta.status !== 'aguardando'
  const passos = [
    { rotulo: 'Registrada', detalhe: formatarDataHora(aposta.created_at), feito: true },
    { rotulo: 'Sorteio', detalhe: `Concurso ${aposta.concurso_inicial}`, feito: conferida },
    { rotulo: 'Conferida', detalhe: conferida ? 'Concluída' : 'Na fase 2 (conferência automática)', feito: conferida },
    { rotulo: 'Resgatada', detalhe: aposta.status === 'premiada' ? 'Pendente' : '—', feito: false },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Linha do tempo</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {passos.map((p) => (
            <li key={p.rotulo} className="flex items-start gap-3">
              {p.feito ? (
                <CheckCircle2 className="mt-0.5 size-5 text-lucro" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
              )}
              <div>
                <p className="font-medium">
                  {p.rotulo}
                  <span className="sr-only">{p.feito ? ' (concluído)' : ' (pendente)'}</span>
                </p>
                <p className="text-sm text-muted-foreground">{p.detalhe}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function ApostaDetalhePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: chaves.aposta(id), queryFn: () => carregarAposta(id) })

  const excluir = useMutation({
    mutationFn: () => excluirApostas([id]),
    onSuccess: () => {
      toast.success('Aposta excluída.')
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
      navigate('/apostas', { replace: true })
    },
    onError: (e) => toast.error(e.message),
  })

  if (consulta.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <EmptyState
        icone={RefreshCw}
        titulo="Não foi possível carregar a aposta"
        acao={
          <Button variant="outline" onClick={() => void consulta.refetch()}>
            Tentar de novo
          </Button>
        }
      />
    )
  }
  const a = consulta.data
  if (!a) {
    return (
      <EmptyState
        icone={SearchX}
        titulo="Aposta não encontrada"
        acao={
          <Button asChild variant="outline">
            <Link to="/apostas">Ver apostas</Link>
          </Button>
        }
      />
    )
  }

  const nome = a.modalidades?.nome ?? ''
  const concursos = a.qtd_concursos > 1 ? `${a.concurso_inicial}–${a.concurso_inicial + a.qtd_concursos - 1}` : String(a.concurso_inicial)
  const gastoUsuario = calcularGastoUsuario(
    a.valor_pago_centavos,
    a.participantes.map((p) => ({ peso: Number(p.peso), ehUsuario: p.eh_usuario, contribuicaoCentavos: p.contribuicao_centavos })),
  )

  return (
    <>
      <div className="mb-6 grid gap-3">
        <Link to="/apostas" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Apostas
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {nome} {concursos}
          </h1>
          <StatusBadge status={a.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ModalidadeChip nome={nome} cor={a.modalidades?.cor_hex ?? '#6A6F9E'} className="text-foreground" />
          <span>· {rotulosTipo[a.tipo]}</span>
          {a.tipo === 'bolao' && (
            <span>
              · {a.bolao_cotas_usuario} de {a.bolao_total_cotas} cotas
              {a.bolao_numero_cota && ` (cota ${a.bolao_numero_cota}/${a.bolao_total_cotas})`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={`/apostas/${a.id}/editar`}>
              <Pencil aria-hidden="true" /> Editar
            </Link>
          </Button>
          <ConfirmDialog
            titulo={`Excluir a aposta ${nome} ${concursos}?`}
            descricao="Os jogos, a divisão e os anexos também serão excluídos. Não dá para desfazer."
            textoConfirmar="Excluir"
            destrutivo
            onConfirmar={() => excluir.mutateAsync()}
          >
            <Button variant="outline" className="text-destructive">
              <Trash2 aria-hidden="true" /> Excluir
            </Button>
          </ConfirmDialog>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-4">
          <Jogos aposta={a} />
          {a.participantes.length > 0 && <Divisao aposta={a} />}
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Valores</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                {a.tipo === 'bolao' && (
                  <>
                    <Linha rotulo="Valor da cota">
                      <MoneyText centavos={a.valor_cota_centavos ?? 0} />
                    </Linha>
                    <Linha rotulo="Tarifa de serviço">
                      <MoneyText centavos={a.tarifa_centavos} />
                    </Linha>
                  </>
                )}
                <Linha rotulo="Total pago">
                  <MoneyText centavos={a.valor_pago_centavos} />
                </Linha>
                {a.participantes.length > 0 && (
                  <Linha rotulo="Sua parte">
                    <MoneyText centavos={gastoUsuario} />
                  </Linha>
                )}
                <Linha rotulo="Prêmio">
                  <span className="text-muted-foreground">{a.status === 'aguardando' ? 'Aguardando sorteio' : '—'}</span>
                </Linha>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Dados</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                <Linha rotulo="Data da aposta">{formatarData(a.data_aposta)}</Linha>
                {a.local_compra && <Linha rotulo="Local">{a.local_compra}</Linha>}
                <Linha rotulo="Origem">{rotulosOrigem[a.origem]}</Linha>
              </dl>
              {a.observacao && (
                <div className="mt-3 grid gap-1">
                  <p className="text-sm text-muted-foreground">Observação</p>
                  <p className="text-sm wrap-break-word whitespace-pre-wrap">{a.observacao}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <LinhaDoTempo aposta={a} />
        </div>
      </div>
    </>
  )
}
