import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Save, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm, type FieldPath } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalidades } from '@/features/modalidades/use-modalidades'
import { chaves } from '@/lib/query-keys'
import { useDesktop } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { conferirApostaAgora } from '@/features/conferencia/api'
import { carregarAposta, salvarAposta } from './api'
import {
  apostaParaForm,
  criarResolver,
  paraApostaInput,
  valoresIniciais,
  type FormAposta,
} from './form/estado'
import { SecaoDetalhes } from './form/secao-detalhes'
import { SecaoJogos } from './form/secao-jogos'
import { SecaoModalidade } from './form/secao-modalidade'
import { SecaoTipoConcurso } from './form/secao-tipo-concurso'
import { SecaoValores } from './form/secao-valores'

const etapas: { titulo: string; campos: FieldPath<FormAposta>[] }[] = [
  { titulo: 'Modalidade', campos: ['modalidadeSlug'] },
  { titulo: 'Tipo e concurso', campos: ['tipo', 'concursoInicial', 'qtdConcursos'] },
  { titulo: 'Jogos', campos: ['jogos'] },
  {
    titulo: 'Valores',
    campos: ['totalCotas', 'cotasUsuario', 'numeroCota', 'valorCota', 'tarifa', 'valorPago'],
  },
  {
    titulo: 'Divisão e detalhes',
    campos: ['participantes', 'dataAposta', 'localCompra', 'observacao'],
  },
]

function Formulario({ id, inicial }: { id?: string | undefined; inicial: FormAposta }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const desktop = useDesktop()
  const { data: modalidades } = useModalidades()
  const [etapa, setEtapa] = useState(0)

  const obterModalidade = useMemo(
    () => (slug: string) => modalidades?.find((m) => m.slug === slug),
    [modalidades],
  )
  const form = useForm<FormAposta>({
    defaultValues: inicial,
    resolver: criarResolver(obterModalidade),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const modalidade = obterModalidade(form.watch('modalidadeSlug'))
  const edicao = !!id

  const salvar = useMutation({
    mutationFn: async (valores: FormAposta) => {
      const salvo = await salvarAposta(paraApostaInput(valores, modalidade), id)
      // Se o concurso já foi sorteado, a aposta sai conferida (editar refaz a conferência).
      // Falhar aqui não perde a aposta: a próxima sincronização confere as pendentes.
      await conferirApostaAgora(salvo).catch(() => undefined)
      return salvo
    },
    onSuccess: (novoId) => {
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
      toast.success(edicao ? 'Aposta atualizada.' : 'Aposta registrada.')
      navigate(`/apostas/${novoId}`, { replace: edicao })
    },
    onError: (e) => toast.error(e.message),
  })

  async function avancar() {
    const ok = await form.trigger(etapas[etapa]!.campos)
    if (ok) {
      setEtapa((e) => e + 1)
      window.scrollTo({ top: 0 })
    }
  }

  // Ao falhar a validação no envio (mobile), volta para a 1ª etapa com erro.
  function aoErrar(erros: object) {
    if (desktop) return
    const comErro = etapas.findIndex((e) => e.campos.some((c) => c.split('.')[0]! in erros))
    if (comErro >= 0) setEtapa(comErro)
  }

  const secoes = [
    <SecaoModalidade key="m" bloqueada={edicao} />,
    <SecaoTipoConcurso key="t" modalidade={modalidade} edicao={edicao} />,
    <SecaoJogos key="j" modalidade={modalidade} />,
    <SecaoValores key="v" modalidade={modalidade} />,
    <SecaoDetalhes key="d" modalidade={modalidade} />,
  ]
  const ultima = etapa === etapas.length - 1

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit((v) => salvar.mutate(v), aoErrar)}
        noValidate
        className="grid gap-4"
      >
        {desktop ? (
          etapas.map((e, i) => (
            <Card key={e.titulo}>
              <CardHeader>
                <CardTitle>
                  <h2>{e.titulo}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>{secoes[i]}</CardContent>
            </Card>
          ))
        ) : (
          <>
            {/* Progresso das etapas (mobile) */}
            <div className="grid gap-2">
              <p className="text-sm font-medium" aria-live="polite">
                Etapa {etapa + 1} de {etapas.length}: {etapas[etapa]!.titulo}
              </p>
              <div className="flex gap-1" aria-hidden="true">
                {etapas.map((e, i) => (
                  <span
                    key={e.titulo}
                    className={cn(
                      'h-1.5 flex-1 rounded-full',
                      i <= etapa ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                ))}
              </div>
            </div>
            <Card>
              <CardContent className="pt-6">{secoes[etapa]}</CardContent>
            </Card>
          </>
        )}

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2 rounded-xl border bg-background/95 p-2 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
          {!desktop && etapa > 0 && (
            <Button type="button" variant="outline" onClick={() => setEtapa((e) => e - 1)}>
              <ArrowLeft aria-hidden="true" /> Voltar
            </Button>
          )}
          <span className="flex-1" />
          {/* Keys distintas: se o React reaproveitar o <button> e trocar o type para "submit"
              durante o clique em "Próximo", o navegador envia o formulário na última etapa. */}
          {!desktop && !ultima ? (
            <Button key="proximo" type="button" onClick={() => void avancar()}>
              Próximo <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button key="enviar" type="submit" disabled={salvar.isPending} size="lg">
              {salvar.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {edicao ? 'Salvar alterações' : 'Registrar aposta'}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  )
}

export function ApostaFormPage() {
  const { id } = useParams()
  const modalidades = useModalidades()
  const aposta = useQuery({
    queryKey: chaves.aposta(id ?? ''),
    queryFn: () => carregarAposta(id!),
    enabled: !!id,
  })

  const titulo = id ? 'Editar aposta' : 'Nova aposta'
  const carregando = modalidades.isPending || (!!id && aposta.isPending)
  const erro = modalidades.isError || aposta.isError

  return (
    <>
      <CabecalhoPagina
        titulo={titulo}
        acoes={
          id ? (
            <Button asChild variant="ghost">
              <Link to={`/apostas/${id}`}>Cancelar</Link>
            </Button>
          ) : undefined
        }
      />
      {carregando && (
        <div className="grid gap-4" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {erro && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar"
          acao={
            <Button
              variant="outline"
              onClick={() => void Promise.all([modalidades.refetch(), aposta.refetch()])}
            >
              Tentar de novo
            </Button>
          }
        />
      )}
      {!carregando && !erro && id && !aposta.data && (
        <EmptyState
          icone={SearchX}
          titulo="Aposta não encontrada"
          acao={
            <Button asChild variant="outline">
              <Link to="/apostas">Ver apostas</Link>
            </Button>
          }
        />
      )}
      {!carregando && !erro && (!id || aposta.data) && (
        <Formulario
          key={id ?? 'nova'}
          id={id}
          inicial={aposta.data ? apostaParaForm(aposta.data) : valoresIniciais()}
        />
      )}
    </>
  )
}
