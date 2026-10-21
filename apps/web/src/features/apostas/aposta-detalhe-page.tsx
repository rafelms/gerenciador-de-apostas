import { calcularGastoUsuario, ratearMaiorResto } from '@shared/dinheiro.ts'
import { dividirPremio } from '@shared/premio.ts'
import { obterRegra } from '@shared/regras/index.ts'
import type { RegraModalidade } from '@shared/regras/tipos.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Pencil,
  RefreshCw,
  SearchX,
  Trash2,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
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
import {
  carregarConferencia,
  carregarConfigPremio,
  type ConcursoDaAposta,
} from '@/features/conferencia/api'
import { formatarData, formatarDataHora } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { carregarAposta, excluirApostas, type ApostaCompleta } from './api'
import { PremioCard } from './detalhe/premio-card'
import { rotulosOrigem, rotulosTipo } from './filtros'

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

/** Teimosinha: um botão por concurso, com o estado de cada um (sorteado/premiado). */
function SeletorConcurso({
  concursos,
  selecionado,
  onSelecionar,
}: {
  concursos: ConcursoDaAposta[]
  selecionado: number
  onSelecionar: (numero: number) => void
}) {
  return (
    <div role="radiogroup" aria-label="Concurso" className="flex flex-wrap gap-2">
      {concursos.map((c) => {
        const ativo = c.numero === selecionado
        const Icone = c.premio ? Trophy : c.resultado ? CheckCircle2 : Clock
        const estado = c.premio ? 'premiado' : c.resultado ? 'conferido' : 'aguardando'
        return (
          <button
            key={c.numero}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={`Concurso ${c.numero}, ${estado}`}
            onClick={() => onSelecionar(c.numero)}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors duration-150',
              ativo
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:bg-accent',
            )}
          >
            <Icone
              className={cn('size-4', c.premio && !ativo && 'text-destaque-texto')}
              aria-hidden="true"
            />
            {c.numero}
          </button>
        )
      })}
    </div>
  )
}

function Jogos({
  aposta,
  concurso,
  regra,
}: {
  aposta: ApostaCompleta
  concurso: ConcursoDaAposta | undefined
  regra: RegraModalidade
}) {
  const sorteadas = concurso?.resultado?.dezenas ?? null
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Jogos</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {concurso?.resultado ? (
          <div className="grid gap-2 rounded-lg bg-muted/60 p-3">
            <p className="text-sm font-medium">
              Resultado do concurso {concurso.numero} (
              {formatarData(concurso.resultado.dataSorteio)})
              {concurso.resultado.fonte === 'manual' && (
                <span className="text-muted-foreground"> · lançado manualmente</span>
              )}
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Dezenas sorteadas">
              {concurso.resultado.dezenas.map((d) => (
                <li key={d}>
                  <BolaDezena numero={d} estado="sorteada" tamanho="sm" />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          concurso && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden="true" /> Aguardando resultado oficial
              do concurso {concurso.numero}.
            </p>
          )
        )}
        <ol className="grid gap-3">
          {aposta.aposta_jogos.map((j) => {
            // A conferência gravada é a oficial; sem ela (ainda pendente), calcula no navegador.
            const gravada = concurso?.conferencias.get(j.id)
            const acertos =
              gravada?.acertos ??
              (sorteadas ? regra.conferir(j.dezenas, { dezenas: sorteadas }).acertos : null)
            const premiado = gravada
              ? Object.values(gravada.premiosPorFaixa).some((q) => q > 0)
              : false
            return (
              <li key={j.ordem} className="grid gap-2">
                <p className="text-sm font-medium">
                  Jogo {j.ordem}{' '}
                  <span className="text-muted-foreground">
                    · {j.dezenas.length} dezenas
                    {acertos !== null && ` · ${acertos} ${acertos === 1 ? 'acerto' : 'acertos'}`}
                  </span>
                  {premiado && (
                    <span className="ml-2 inline-flex items-center gap-1 text-destaque-texto">
                      <Trophy className="size-3.5" aria-hidden="true" /> premiado
                    </span>
                  )}
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

function Divisao({
  aposta,
  concurso,
}: {
  aposta: ApostaCompleta
  concurso: ConcursoDaAposta | undefined
}) {
  const participantes = aposta.participantes.map((p) => ({
    id: p.id,
    nome: p.nome,
    peso: Number(p.peso),
    ehUsuario: p.eh_usuario,
    contribuicaoCentavos: p.contribuicao_centavos,
  }))
  const soma = participantes.reduce((a, p) => a + p.peso, 0)
  const temContribuicoes = participantes.every((p) => p.contribuicaoCentavos !== null)
  const partes = temContribuicoes
    ? participantes.map((p) => p.contribuicaoCentavos!)
    : ratearMaiorResto(
        aposta.valor_pago_centavos,
        participantes.map((p) => p.peso),
      )

  // Prêmio do concurso selecionado, dividido pelos pesos (seção 9.6). O líquido gravado
  // (premio_divisoes) é o oficial; bruto e IR proporcionais são calculados para exibir.
  const premio = concurso?.premio ?? null
  const linhasPremio = premio
    ? dividirPremio(
        { bruto: premio.bruto_usuario_centavos, liquido: premio.liquido_usuario_centavos },
        participantes,
      )
    : []
  const liquidoGravado = (id: string) =>
    premio?.premio_divisoes.find((d) => d.participante_id === id)?.liquido_centavos

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Divisão{premio ? ` · prêmio do concurso ${concurso!.numero}` : ''}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Divisão do valor pago{premio ? ' e do prêmio' : ''} entre os participantes
          </caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 font-medium">
                Participante
              </th>
              <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">
                Peso
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                %
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Gasto
              </th>
              {premio && (
                <>
                  <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">
                    Bruto
                  </th>
                  <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">
                    IR
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Líquido
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {participantes.map((p, i) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2">
                  {p.nome}
                  {p.ehUsuario && <span className="text-muted-foreground"> (você)</span>}
                </td>
                <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                  {p.peso.toLocaleString('pt-BR')}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {((p.peso / soma) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                </td>
                <td className="py-2 text-right">
                  <MoneyText centavos={partes[i] ?? 0} />
                </td>
                {premio && (
                  <>
                    <td className="hidden py-2 text-right sm:table-cell">
                      <MoneyText centavos={linhasPremio[i]?.bruto ?? 0} />
                    </td>
                    <td className="hidden py-2 text-right sm:table-cell">
                      <MoneyText centavos={linhasPremio[i]?.ir ?? 0} />
                    </td>
                    <td className="py-2 text-right font-semibold">
                      <MoneyText centavos={liquidoGravado(p.id) ?? linhasPremio[i]?.liquido ?? 0} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!premio && (
          <p className="mt-3 text-xs text-muted-foreground">
            A divisão do prêmio (bruto, IR e líquido) aparece aqui quando a aposta for premiada.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function LinhaDoTempo({
  aposta,
  concursos,
}: {
  aposta: ApostaCompleta
  concursos: ConcursoDaAposta[]
}) {
  const sorteados = concursos.filter((c) => c.resultado)
  const premios = concursos.flatMap((c) => (c.premio ? [c.premio] : []))
  const comValor = premios.filter((p) => p.liquido_usuario_centavos > 0)
  const resgatados = comValor.filter((p) => p.status === 'resgatado')
  const todos = sorteados.length === concursos.length && concursos.length > 0
  const ultimoSorteio = sorteados.at(-1)?.resultado?.dataSorteio
  const passos = [
    { rotulo: 'Registrada', detalhe: formatarDataHora(aposta.created_at), feito: true },
    {
      rotulo: 'Sorteio',
      detalhe:
        sorteados.length === 0
          ? `Concurso ${aposta.concurso_inicial}`
          : `${sorteados.length} de ${concursos.length} ${concursos.length === 1 ? 'concurso' : 'concursos'}${ultimoSorteio ? ` · ${formatarData(ultimoSorteio)}` : ''}`,
      feito: sorteados.length > 0,
    },
    {
      rotulo: 'Conferida',
      detalhe:
        sorteados.length === 0 ? 'Automática após o sorteio' : todos ? 'Concluída' : 'Em andamento',
      feito: todos,
    },
    {
      rotulo: 'Resgatada',
      detalhe:
        comValor.length === 0
          ? '—'
          : resgatados.length === comValor.length
            ? 'Concluído'
            : `${resgatados.length} de ${comValor.length} prêmios`,
      feito: comValor.length > 0 && resgatados.length === comValor.length,
    },
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

/** Concurso mostrado ao abrir: o premiado, senão o último já sorteado, senão o primeiro. */
function concursoInicial(concursos: ConcursoDaAposta[]) {
  return (
    (concursos.find((c) => c.premio) ?? concursos.filter((c) => c.resultado).at(-1) ?? concursos[0])
      ?.numero ?? 0
  )
}

export function ApostaDetalhePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: chaves.aposta(id), queryFn: () => carregarAposta(id) })
  const a0 = consulta.data
  const conferencia = useQuery({
    queryKey: chaves.conferencia(id),
    queryFn: () => carregarConferencia(a0!),
    enabled: !!a0,
  })
  const cfg = useQuery({
    queryKey: chaves.configPremio,
    queryFn: carregarConfigPremio,
    staleTime: 10 * 60 * 1000,
  })
  const [escolhido, setEscolhido] = useState<number | null>(null)

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
  const faixaConcursos =
    a.qtd_concursos > 1
      ? `${a.concurso_inicial}–${a.concurso_inicial + a.qtd_concursos - 1}`
      : String(a.concurso_inicial)
  const concursos = conferencia.data ?? []
  const numeroSelecionado = escolhido ?? concursoInicial(concursos)
  const concurso = concursos.find((c) => c.numero === numeroSelecionado)
  const regra = obterRegra(a.modalidades?.slug ?? '')
  const liquidoTotal = concursos.reduce((s, c) => s + (c.premio?.liquido_usuario_centavos ?? 0), 0)
  const premiosPendentes = concursos.some(
    (c) => c.premio && c.premio.faixas_sem_valor.length > 0 && !c.premio.valor_informado_manual,
  )
  const gastoUsuario = calcularGastoUsuario(
    a.valor_pago_centavos,
    a.participantes.map((p) => ({
      peso: Number(p.peso),
      ehUsuario: p.eh_usuario,
      contribuicaoCentavos: p.contribuicao_centavos,
    })),
  )

  return (
    <>
      <div className="mb-6 grid gap-3">
        <Link
          to="/apostas"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Apostas
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {nome} {faixaConcursos}
          </h1>
          <StatusBadge status={a.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ModalidadeChip
            nome={nome}
            cor={a.modalidades?.cor_hex ?? '#6A6F9E'}
            className="text-foreground"
          />
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
            titulo={`Excluir a aposta ${nome} ${faixaConcursos}?`}
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
          {concursos.length > 1 && (
            <SeletorConcurso
              concursos={concursos}
              selecionado={numeroSelecionado}
              onSelecionar={setEscolhido}
            />
          )}
          {conferencia.isError && (
            <p className="text-sm text-destructive" role="alert">
              Não foi possível carregar o resultado.{' '}
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() => void conferencia.refetch()}
              >
                Tentar de novo
              </Button>
            </p>
          )}
          {conferencia.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Jogos aposta={a} concurso={concurso} regra={regra} />
          )}
          {a.participantes.length > 0 && <Divisao aposta={a} concurso={concurso} />}
        </div>
        <div className="grid content-start gap-4">
          {concurso && (
            <PremioCard
              apostaId={a.id}
              concurso={concurso}
              regra={regra}
              cfg={cfg.data}
              bolao={
                a.tipo === 'bolao' && a.bolao_total_cotas && a.bolao_cotas_usuario
                  ? { totalCotas: a.bolao_total_cotas, cotasUsuario: a.bolao_cotas_usuario }
                  : null
              }
            />
          )}
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
                <Linha rotulo={concursos.length > 1 ? 'Prêmios líquidos' : 'Prêmio líquido'}>
                  {a.status === 'aguardando' ? (
                    <span className="text-muted-foreground">Aguardando sorteio</span>
                  ) : (
                    <>
                      <MoneyText centavos={liquidoTotal} />
                      {premiosPendentes && (
                        <span className="block text-xs text-alerta">valor a confirmar</span>
                      )}
                    </>
                  )}
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
          <LinhaDoTempo aposta={a} concursos={concursos} />
        </div>
      </div>
    </>
  )
}
