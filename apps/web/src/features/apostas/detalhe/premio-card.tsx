import { zodResolver } from '@hookform/resolvers/zod'
import { formatarBRL, tentarDeReais } from '@shared/dinheiro.ts'
import { calcularPremio, type ConfigPremio } from '@shared/premio.ts'
import type { RegraModalidade } from '@shared/regras/tipos.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  HandCoins,
  Loader2,
  PencilLine,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Campo } from '@/components/campo'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { InputDinheiro } from '@/components/input-dinheiro'
import { MoneyText } from '@/components/money-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  informarPremioManual,
  marcarResgatado,
  usarPremioCalculado,
  type ConcursoDaAposta,
  type Premio,
} from '@/features/conferencia/api'
import { formatarData, hojeIso } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'

interface PremioCardProps {
  apostaId: string
  concurso: ConcursoDaAposta
  regra: RegraModalidade
  cfg: ConfigPremio | undefined
  bolao: { totalCotas: number; cotasUsuario: number } | null
}

function Linha({
  rotulo,
  children,
  destaque,
}: {
  rotulo: string
  children: React.ReactNode
  destaque?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className={destaque ? 'font-medium' : 'text-muted-foreground'}>{rotulo}</dt>
      <dd className={destaque ? 'text-right text-base font-bold' : 'text-right font-medium'}>
        {children}
      </dd>
    </div>
  )
}

/** Faixas premiadas no concurso: "1 Quina × R$ 41.234,56". */
function FaixasPremiadas({
  concurso,
  regra,
}: {
  concurso: ConcursoDaAposta
  regra: RegraModalidade
}) {
  const totais = new Map<number, number>()
  for (const c of concurso.conferencias.values()) {
    for (const [acertos, qtd] of Object.entries(c.premiosPorFaixa)) {
      totais.set(Number(acertos), (totais.get(Number(acertos)) ?? 0) + qtd)
    }
  }
  const linhas = regra.faixas.filter((f) => (totais.get(f.acertos) ?? 0) > 0)
  if (linhas.length === 0) return null
  return (
    <ul className="grid gap-1 rounded-lg bg-muted/60 p-3 text-sm" aria-label="Faixas premiadas">
      {linhas.map((f) => {
        const valor = concurso.resultado?.rateio.find((r) => r.acertos === f.acertos)?.valorCentavos
        return (
          <li key={f.acertos} className="flex justify-between gap-2">
            <span>
              {totais.get(f.acertos)} × {f.nome}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {valor ? formatarBRL(valor) : 'valor não publicado'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const formSchema = z.object({ bruto: z.string(), ir: z.string() })

function DialogPremioManual({
  apostaId,
  concurso,
  premio,
  cfg,
  bolao,
}: Omit<PremioCardProps, 'regra'> & { premio: Premio | null }) {
  const [aberto, setAberto] = useState(false)
  const queryClient = useQueryClient()
  const inicial = premio?.bruto_usuario_centavos ?? 0
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { bruto: inicial ? formatarBRL(inicial).replace('R$ ', '') : '', ir: '' },
  })
  const bruto = tentarDeReais(form.watch('bruto'))
  // IR sugerido pela regra configurada; o usuário corrige se o comprovante disser outro valor.
  const sugerido =
    bruto !== null && cfg
      ? calcularPremio(
          {
            brutoAposta: bolao
              ? Math.round((bruto * bolao.totalCotas) / bolao.cotasUsuario)
              : bruto,
            ...bolao,
          },
          cfg,
        )
      : null
  const ir = form.watch('ir') === '' ? (sugerido?.irUsuario ?? 0) : tentarDeReais(form.watch('ir'))
  const erroIr =
    ir === null
      ? 'Valor inválido.'
      : bruto !== null && ir > bruto
        ? 'O IR não pode passar do valor bruto.'
        : undefined

  const salvar = useMutation({
    mutationFn: () =>
      informarPremioManual({
        premioId: premio?.id ?? null,
        apostaId,
        concursoId: concurso.resultado!.id,
        brutoUsuario: bruto!,
        irUsuario: ir!,
        totalCotas: bolao?.totalCotas ?? null,
        cotasUsuario: bolao?.cotasUsuario ?? null,
        regraIr: sugerido?.regraIr ?? {},
      }),
    onSuccess: () => {
      toast.success('Prêmio informado.')
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
      setAberto(false)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilLine aria-hidden="true" /> Informar valor recebido
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Informar prêmio</DialogTitle>
          <DialogDescription>
            Use o valor do comprovante de pagamento.{' '}
            {bolao ? 'Informe só a sua parte (suas cotas).' : ''}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit(() => {
            if (bruto === null) return form.setError('bruto', { message: 'Informe o valor bruto.' })
            if (!erroIr) salvar.mutate()
          })}
        >
          <Campo label="Prêmio bruto (sua parte)" erro={form.formState.errors.bruto?.message}>
            <InputDinheiro {...form.register('bruto')} />
          </Campo>
          <Campo
            label="IR retido"
            erro={erroIr}
            ajuda={
              sugerido
                ? `Pela regra atual: ${formatarBRL(sugerido.irUsuario)}. Deixe vazio para usar.`
                : undefined
            }
          >
            <InputDinheiro
              {...form.register('ir')}
              placeholder={sugerido ? formatarBRL(sugerido.irUsuario).replace('R$ ', '') : '0,00'}
            />
          </Campo>
          {bruto !== null && ir !== null && !erroIr && (
            <p className="text-sm">
              Líquido: <MoneyText centavos={bruto - ir} className="font-semibold" />
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Prêmio do concurso selecionado: bruto, IR, líquido, prazo e resgate (seção 11.2). */
export function PremioCard(props: PremioCardProps) {
  const { apostaId, concurso, regra } = props
  const queryClient = useQueryClient()
  const premio = concurso.premio
  const invalidar = () => void queryClient.invalidateQueries({ queryKey: chaves.apostas })

  const resgate = useMutation({
    mutationFn: (resgatado: boolean) => marcarResgatado(premio!.id, resgatado),
    onSuccess: (_, resgatado) => {
      toast.success(resgatado ? 'Prêmio marcado como resgatado.' : 'Resgate desfeito.')
      invalidar()
    },
    onError: (e) => toast.error(e.message),
  })

  if (!concurso.resultado) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Prêmio</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="size-4" aria-hidden="true" /> Aguardando o sorteio do concurso{' '}
            {concurso.numero}.
          </p>
        </CardContent>
      </Card>
    )
  }

  const pendente = !!premio && premio.faixas_sem_valor.length > 0 && !premio.valor_informado_manual
  const vencido = premio?.status === 'expirado'
  const diasParaVencer = premio
    ? Math.round((Date.parse(premio.prazo_resgate) - Date.parse(hojeIso())) / 86_400_000)
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <h2>Prêmio do concurso {concurso.numero}</h2>
          {premio?.status === 'resgatado' && (
            <Badge variant="secondary">
              <BadgeCheck aria-hidden="true" /> Resgatado
            </Badge>
          )}
          {vencido && <Badge variant="destructive">Prazo vencido</Badge>}
          {premio?.valor_informado_manual && <Badge variant="outline">Informado por você</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!premio ? (
          <p className="text-sm text-muted-foreground">Nenhum jogo premiado neste concurso.</p>
        ) : (
          <>
            <FaixasPremiadas concurso={concurso} regra={regra} />
            {pendente && (
              <p
                className="flex gap-2 rounded-lg border border-alerta/40 bg-alerta/10 p-3 text-sm"
                role="status"
              >
                <CircleAlert className="size-4 shrink-0 text-alerta" aria-hidden="true" />
                Parte do prêmio ainda não tem valor no rateio oficial. Ele é atualizado na próxima
                sincronização, ou você pode informar o valor recebido.
              </p>
            )}
            <dl className="divide-y text-sm">
              <Linha rotulo="Bruto (sua parte)">
                <MoneyText centavos={premio.bruto_usuario_centavos} />
              </Linha>
              <Linha rotulo="IR retido">
                <MoneyText centavos={premio.ir_usuario_centavos} />
              </Linha>
              <Linha rotulo="Líquido" destaque>
                <MoneyText centavos={premio.liquido_usuario_centavos} />
              </Linha>
              <Linha rotulo="Resgatar até">
                {formatarData(premio.prazo_resgate)}
                {premio.status === 'a_resgatar' &&
                  diasParaVencer !== null &&
                  diasParaVencer <= 7 &&
                  diasParaVencer >= 0 && (
                    <span className="block text-xs text-alerta">
                      {diasParaVencer === 0
                        ? 'vence hoje'
                        : diasParaVencer === 1
                          ? 'vence amanhã'
                          : `faltam ${diasParaVencer} dias`}
                    </span>
                  )}
              </Linha>
              {premio.resgatado_em && (
                <Linha rotulo="Resgatado em">{formatarData(premio.resgatado_em)}</Linha>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              {premio.status === 'resgatado' ? (
                <Button
                  variant="outline"
                  onClick={() => resgate.mutate(false)}
                  disabled={resgate.isPending}
                >
                  <Undo2 aria-hidden="true" /> Desfazer resgate
                </Button>
              ) : (
                premio.liquido_usuario_centavos > 0 && (
                  <Button onClick={() => resgate.mutate(true)} disabled={resgate.isPending}>
                    <HandCoins aria-hidden="true" /> Marcar como resgatado
                  </Button>
                )
              )}
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <DialogPremioManual {...props} premio={premio} />
          {premio?.valor_informado_manual && (
            <ConfirmDialog
              titulo="Usar o valor calculado?"
              descricao="O valor que você informou será descartado e o prêmio volta a ser calculado pelo rateio oficial."
              textoConfirmar="Usar calculado"
              onConfirmar={async () => {
                try {
                  await usarPremioCalculado(premio.id, apostaId)
                  toast.success('Prêmio recalculado.')
                  invalidar()
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            >
              <Button variant="ghost">Usar valor calculado</Button>
            </ConfirmDialog>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
