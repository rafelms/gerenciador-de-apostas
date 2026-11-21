import { AVISO_ANALISADOR, parseJogos } from '@shared/analisador.ts'
import { useQuery } from '@tanstack/react-query'
import { Info, Microscope } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { EmptyState } from '@/components/empty-state'
import { SelectNativo } from '@/components/select-nativo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useModalidades, type Modalidade } from '@/features/modalidades/use-modalidades'
import { formatarData } from '@/lib/formatadores'
import { Analise } from './analise'
import { apostasParaAnalisar, chavesAnalisador, jogosDaAposta } from './api'

type Fonte = 'aposta' | 'colar'

export function AnalisadorPage() {
  const modalidades = useModalidades()
  const [params, setParams] = useSearchParams()
  const [fonte, setFonte] = useState<Fonte>('aposta')

  return (
    <>
      <CabecalhoPagina
        titulo="Analisador"
        descricao="Estatísticas dos jogos de uma aposta ou de jogos que você colar."
      />
      <Tabs value={fonte} onValueChange={(v) => setFonte(v as Fonte)} className="gap-4">
        <TabsList>
          <TabsTrigger value="aposta">De uma aposta</TabsTrigger>
          <TabsTrigger value="colar">Colar jogos</TabsTrigger>
        </TabsList>
        {modalidades.isPending && <Skeleton className="h-40 w-full rounded-2xl" />}
        {modalidades.data && (
          <>
            <TabsContent value="aposta">
              <DeUmaAposta
                modalidades={modalidades.data}
                apostaId={params.get('aposta') ?? ''}
                onEscolher={(id) => setParams(id ? { aposta: id } : {}, { replace: true })}
                onColar={() => setFonte('colar')}
              />
            </TabsContent>
            <TabsContent value="colar">
              <Colados modalidades={modalidades.data} />
            </TabsContent>
          </>
        )}
      </Tabs>
      {/* Rodapé fixo (seção 11.10): acima da barra inferior no mobile. */}
      <p
        role="note"
        className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mx-auto mt-6 flex w-fit max-w-full items-start gap-2 rounded-2xl bg-tinta px-4 py-2.5 text-xs text-tinta-foreground shadow-lg lg:bottom-4"
      >
        <Info className="mt-px size-4 shrink-0" aria-hidden="true" />
        {AVISO_ANALISADOR}
      </p>
    </>
  )
}

function DeUmaAposta({
  modalidades,
  apostaId,
  onEscolher,
  onColar,
}: {
  modalidades: Modalidade[]
  apostaId: string
  onEscolher: (id: string) => void
  onColar: () => void
}) {
  const apostas = useQuery({ queryKey: chavesAnalisador.apostas, queryFn: apostasParaAnalisar })
  const jogos = useQuery({
    queryKey: chavesAnalisador.jogos(apostaId),
    queryFn: () => jogosDaAposta(apostaId),
    enabled: !!apostaId,
  })
  const aposta = apostas.data?.find((a) => a.id === apostaId)
  const modalidade = modalidades.find((m) => m.id === aposta?.modalidadeId)

  if (apostas.isPending) return <Skeleton className="h-24 w-full rounded-2xl" />
  if (apostas.isError)
    return (
      <EmptyState
        icone={Microscope}
        titulo="Não foi possível carregar as apostas"
        acao={
          <Button variant="outline" onClick={() => void apostas.refetch()}>
            Tentar de novo
          </Button>
        }
      />
    )
  if (apostas.data.length === 0)
    return (
      <EmptyState
        icone={Microscope}
        titulo="Nenhuma aposta para analisar"
        descricao="Cadastre uma aposta ou cole jogos para ver as estatísticas."
        acao={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/apostas/nova">Nova aposta</Link>
            </Button>
            <Button variant="outline" onClick={onColar}>
              Colar jogos
            </Button>
          </div>
        }
      />
    )

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-2">
          <Label htmlFor="analisador-aposta">Aposta</Label>
          <SelectNativo
            id="analisador-aposta"
            value={aposta ? apostaId : ''}
            onChange={(e) => onEscolher(e.target.value)}
          >
            <option value="">Escolha uma aposta</option>
            {apostas.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.modalidadeNome} · concurso {a.concursoInicial} · {formatarData(a.dataAposta)} ·{' '}
                {a.qtdJogos} {a.qtdJogos === 1 ? 'jogo' : 'jogos'}
              </option>
            ))}
          </SelectNativo>
          {apostaId && !aposta && (
            <p className="text-sm text-muted-foreground">
              Esta aposta não está entre as 100 mais recentes. Escolha outra na lista.
            </p>
          )}
        </CardContent>
      </Card>
      {aposta && jogos.isPending && <Skeleton className="h-64 w-full rounded-2xl" />}
      {aposta && jogos.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar os jogos.</p>
      )}
      {modalidade && jogos.data && (
        <Analise key={apostaId} modalidade={modalidade} jogos={jogos.data} />
      )}
    </div>
  )
}

function Colados({ modalidades }: { modalidades: Modalidade[] }) {
  const [slug, setSlug] = useState(
    () => modalidades.find((m) => m.slug === 'lotofacil')?.slug ?? modalidades[0]?.slug ?? '',
  )
  const [texto, setTexto] = useState('')
  const modalidade = modalidades.find((m) => m.slug === slug)
  const lido = useMemo(
    () => (modalidade ? parseJogos(texto, modalidade.regra) : { jogos: [], erros: [] }),
    [texto, modalidade],
  )
  const exemplo = modalidade
    ? Array.from({ length: modalidade.regra.baseAposta }, (_, i) =>
        String(modalidade.regra.universoMin + i * 2).padStart(2, '0'),
      ).join(' ')
    : ''

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="analisador-modalidade">Modalidade</Label>
            <SelectNativo
              id="analisador-modalidade"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            >
              {modalidades.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.nome}
                </option>
              ))}
            </SelectNativo>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="analisador-jogos">Jogos, um por linha</Label>
            <Textarea
              id="analisador-jogos"
              rows={6}
              className="font-mono text-sm"
              placeholder={exemplo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-describedby="analisador-jogos-ajuda"
            />
            <p id="analisador-jogos-ajuda" className="text-xs text-muted-foreground">
              Separe as dezenas por espaço, vírgula ou hífen.
            </p>
          </div>
          {lido.erros.length > 0 && (
            <ul className="grid gap-1 text-sm text-destructive" aria-live="polite">
              {lido.erros.slice(0, 10).map((e) => (
                <li key={e.linha}>
                  Linha {e.linha}: {e.mensagens.join(' ')}
                </li>
              ))}
              {lido.erros.length > 10 && <li>e mais {lido.erros.length - 10} linhas.</li>}
            </ul>
          )}
        </CardContent>
      </Card>
      {modalidade && lido.jogos.length > 0 && (
        <Analise key={slug} modalidade={modalidade} jogos={lido.jogos} />
      )}
    </div>
  )
}
