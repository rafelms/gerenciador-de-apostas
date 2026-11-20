import {
  assinaturaAposta,
  lerPlanilha,
  textoErroPlanilha,
  type ApostaDaPlanilha,
  type ResultadoPlanilha,
} from '@shared/parsers/planilha.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react'
import { useId, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { ModalidadeChip } from '@/components/modalidade-chip'
import { MoneyText } from '@/components/money-text'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { rotulosTipo } from '@/features/apostas/filtros'
import { useModalidades } from '@/features/modalidades/use-modalidades'
import { formatarData } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { assinaturasExistentes, conferirImportacao, ErroImportacao, importarApostas } from './api'
import { baixarModelo, lerArquivoPlanilha, TIPOS_ACEITOS } from './arquivo-planilha'

/** Itens mostrados de cada lista; o resto vira "e mais N". */
const VISIVEIS = 100

type Duplicata = 'banco' | 'arquivo' | null

interface Previa {
  nomeArquivo: string
  resultado: ResultadoPlanilha
  /** Por aposta: já existe no banco, repetida no próprio arquivo ou não. */
  duplicatas: Duplicata[]
}

async function montarPrevia(arquivo: File): Promise<Previa> {
  const resultado = lerPlanilha(await lerArquivoPlanilha(arquivo))
  const existentes =
    resultado.apostas.length > 0
      ? await assinaturasExistentes(resultado.apostas.map((a) => a.aposta))
      : new Set<string>()
  const vistas = new Set<string>()
  const duplicatas = resultado.apostas.map((a): Duplicata => {
    const assinatura = assinaturaAposta(a.aposta)
    const tipo = existentes.has(assinatura) ? 'banco' : vistas.has(assinatura) ? 'arquivo' : null
    vistas.add(assinatura)
    return tipo
  })
  return { nomeArquivo: arquivo.name, resultado, duplicatas }
}

function textoLinhas(linhas: number[]) {
  return linhas.length === 1
    ? `Linha ${linhas[0]}`
    : `Linhas ${linhas[0]}–${linhas[linhas.length - 1]}`
}

export function ImportarExcel() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: modalidades } = useModalidades()
  const idArquivo = useId()
  const idPular = useId()
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [pularDuplicatas, setPularDuplicatas] = useState(true)

  const ler = useMutation({
    mutationFn: montarPrevia,
    onSuccess: (p) => {
      setPrevia(p)
      setPularDuplicatas(true)
    },
    onError: (e) => toast.error(e.message),
  })

  const selecionadas: ApostaDaPlanilha[] = previa
    ? previa.resultado.apostas.filter((_, i) => !(pularDuplicatas && previa.duplicatas[i]))
    : []
  const qtdDuplicatas = previa?.duplicatas.filter(Boolean).length ?? 0
  const linhasComErro = new Set(previa?.resultado.erros.map((e) => e.linha)).size

  const importar = useMutation({
    mutationFn: () =>
      importarApostas(
        selecionadas.map((a) => a.aposta),
        { origem: 'excel', nomeArquivo: previa?.nomeArquivo, qtdErros: linhasComErro },
      ),
    onSuccess: ({ importacaoId, ids }) => {
      toast.success(ids.length === 1 ? '1 aposta importada.' : `${ids.length} apostas importadas.`)
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
      // Concursos já sorteados são conferidos agora; os outros, pela sincronização.
      void conferirImportacao(importacaoId)
        .then(() => queryClient.invalidateQueries({ queryKey: chaves.apostas }))
        .catch(() => undefined)
      navigate('/apostas?origem=excel')
    },
    onError: (e) => {
      const aposta =
        e instanceof ErroImportacao && e.indice !== null ? selecionadas[e.indice] : null
      toast.error(
        aposta
          ? `Grupo ${aposta.grupo} (${textoLinhas(aposta.linhas).toLowerCase()}): ${e.message}`
          : e.message,
        { duration: 10_000 },
      )
    },
  })

  function escolher(arquivo: File | undefined) {
    if (arquivo) ler.mutate(arquivo)
  }

  function soltar(e: DragEvent) {
    e.preventDefault()
    setArrastando(false)
    escolher(e.dataTransfer.files[0])
  }

  if (!previa) {
    return (
      <div className="grid gap-4">
        <label
          htmlFor={idArquivo}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastando(true)
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={soltar}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-within:ring-2 focus-within:ring-ring',
            arrastando ? 'border-primary bg-accent' : 'hover:bg-accent/50',
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            {ler.isPending ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <FileSpreadsheet className="size-6 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <span className="text-lg font-semibold">
            {ler.isPending ? 'Lendo a planilha…' : 'Escolha a planilha (.xlsx ou .csv)'}
          </span>
          <span className="max-w-sm text-sm text-muted-foreground">
            Uma linha por jogo, até 2.000 linhas. O arquivo é lido no seu aparelho e não é enviado;
            só as apostas que você confirmar são gravadas.
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4">
            <Upload className="size-4" aria-hidden="true" />
            Selecionar arquivo
          </span>
          <input
            id={idArquivo}
            type="file"
            accept={TIPOS_ACEITOS}
            className="sr-only"
            disabled={ler.isPending}
            onChange={(e) => {
              escolher(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Button variant="outline" onClick={() => void baixarModelo()}>
            <Download aria-hidden="true" />
            Baixar modelo
          </Button>
          Não tem a planilha? Comece pelo modelo, que já traz exemplos e instruções.
        </div>
      </div>
    )
  }

  const { resultado } = previa
  const nomeDe = (slug: string) => modalidades?.find((m) => m.slug === slug)

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2 break-all">
              <FileSpreadsheet className="size-5 shrink-0" aria-hidden="true" />
              {previa.nomeArquivo}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-2 text-sm sm:grid-cols-3" aria-label="Resumo da planilha">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-lucro" aria-hidden="true" />
              <span>
                <strong className="tabular-nums">{resultado.apostas.length}</strong>{' '}
                {resultado.apostas.length === 1 ? 'aposta válida' : 'apostas válidas'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <XCircle
                className={cn('size-5', linhasComErro ? 'text-prejuizo' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span>
                <strong className="tabular-nums">{linhasComErro}</strong>{' '}
                {linhasComErro === 1 ? 'linha com erro' : 'linhas com erro'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Copy
                className={cn('size-5', qtdDuplicatas ? 'text-alerta' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span>
                <strong className="tabular-nums">{qtdDuplicatas}</strong>{' '}
                {qtdDuplicatas === 1 ? 'possível duplicata' : 'possíveis duplicatas'}
              </span>
            </li>
          </ul>

          {qtdDuplicatas > 0 && (
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id={idPular}
                checked={pularDuplicatas}
                onCheckedChange={(v) => setPularDuplicatas(v === true)}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <Label htmlFor={idPular}>Pular as possíveis duplicatas</Label>
                <p className="text-sm text-muted-foreground">
                  Mesma modalidade, concurso e dezenas de uma aposta que você já tem ou que se
                  repete no arquivo.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => importar.mutate()}
              disabled={selecionadas.length === 0 || importar.isPending}
            >
              {importar.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              {selecionadas.length === 0
                ? 'Nada para importar'
                : `Importar ${selecionadas.length} ${linhasComErro ? 'válidas' : selecionadas.length === 1 ? 'aposta' : 'apostas'}`}
            </Button>
            <Button variant="outline" onClick={() => setPrevia(null)} disabled={importar.isPending}>
              Escolher outro arquivo
            </Button>
          </div>
        </CardContent>
      </Card>

      {resultado.erros.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-prejuizo" aria-hidden="true" />
                Linhas com erro (não serão importadas)
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm">
              {resultado.erros.slice(0, VISIVEIS).map((e, i) => (
                <li key={i}>{textoErroPlanilha(e)}</li>
              ))}
            </ul>
            {resultado.erros.length > VISIVEIS && (
              <p className="mt-2 text-sm text-muted-foreground">
                E mais {resultado.erros.length - VISIVEIS} erros. Corrija os primeiros e envie o
                arquivo de novo.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {resultado.apostas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Apostas encontradas</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y" aria-label="Apostas encontradas">
              {resultado.apostas.slice(0, VISIVEIS).map((a, i) => {
                const m = nomeDe(a.aposta.modalidadeSlug)
                const dup = previa.duplicatas[i]
                const pulada = !!dup && pularDuplicatas
                const { aposta } = a
                return (
                  <li
                    key={a.grupo}
                    className={cn('grid gap-1 py-3 text-sm', pulada && 'opacity-60')}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <ModalidadeChip
                        nome={m?.nome ?? aposta.modalidadeSlug}
                        cor={m?.cor ?? '#6A6F9E'}
                      />
                      <span className="font-semibold tabular-nums">
                        {aposta.qtdConcursos > 1
                          ? `${aposta.concursoInicial}–${aposta.concursoInicial + aposta.qtdConcursos - 1}`
                          : aposta.concursoInicial}
                      </span>
                      <span className="flex-1" />
                      <MoneyText centavos={aposta.valorPagoCentavos} className="font-medium" />
                    </div>
                    <p className="text-muted-foreground">
                      {rotulosTipo[aposta.tipo]} · {aposta.jogos.length}{' '}
                      {aposta.jogos.length === 1 ? 'jogo' : 'jogos'} ·{' '}
                      {formatarData(aposta.dataAposta)} · grupo {a.grupo},{' '}
                      {textoLinhas(a.linhas).toLowerCase()}
                    </p>
                    {dup && (
                      <p className="flex items-center gap-1.5 font-medium text-alerta">
                        <Copy className="size-3.5" aria-hidden="true" />
                        {dup === 'banco'
                          ? 'Possível duplicata: você já tem esta aposta'
                          : 'Possível duplicata: repetida no arquivo'}
                        {pulada && ' (será pulada)'}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            {resultado.apostas.length > VISIVEIS && (
              <p className="mt-2 text-sm text-muted-foreground">
                E mais {resultado.apostas.length - VISIVEIS} apostas.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
