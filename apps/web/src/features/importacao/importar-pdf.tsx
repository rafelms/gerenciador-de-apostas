import { formatarBRL, tentarDeReais } from '@shared/dinheiro.ts'
import {
  comprovanteParaAposta,
  parseComprovante,
  validarComprovante,
  type DadosComprovante,
  type OpcoesComprovante,
} from '@shared/parsers/comprovante-pdf.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { useId, useState, type ChangeEvent, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { BolaDezena } from '@/components/bola-dezena'
import { Campo } from '@/components/campo'
import { InputDinheiro } from '@/components/input-dinheiro'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { precoVigente, useModalidades } from '@/features/modalidades/use-modalidades'
import { formatarData } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import {
  comprovantesJaImportados,
  conferirImportacao,
  ErroImportacao,
  importarApostas,
} from './api'
import { ErroPdf, textoDoPdf } from './texto-pdf'

interface Item {
  id: number
  nomeArquivo: string
  /** Falha ao ler o arquivo ou formato não reconhecido: não dá para revisar. */
  falha: string | null
  /** Campos lidos (e corrigidos na revisão). Nunca têm nome, CPF nem o código do recibo. */
  dados: DadosComprovante | null
  /** Data em que este comprovante já foi importado (duplicata). */
  importadoEm: string | null
  incluir: boolean
}

type Situacao =
  | { tipo: 'falha'; texto: string }
  | { tipo: 'duplicata'; texto: string }
  | { tipo: 'erros'; erros: string[]; avisos: string[] }
  | { tipo: 'pronto'; avisos: string[] }

let proximoId = 0

/** Lê um PDF: texto pelo pdf.js, campos pelo parser. O texto é descartado aqui. */
async function lerComprovante(arquivo: File, opcoes: OpcoesComprovante): Promise<Item> {
  const base = { id: ++proximoId, nomeArquivo: arquivo.name, importadoEm: null, incluir: true }
  try {
    const c = await parseComprovante(await textoDoPdf(arquivo), opcoes)
    // Formato não reconhecido (não é comprovante ou não é bolão): não há o que revisar.
    if (c.erros[0] && (!c.modalidadeSlug || c.tipo !== 'bolao')) {
      return { ...base, falha: c.erros[0], dados: null }
    }
    const { avisos: _avisos, erros: _erros, ...dados } = c
    return { ...base, falha: null, dados }
  } catch (e) {
    return {
      ...base,
      falha: e instanceof ErroPdf ? e.message : 'Não foi possível ler este PDF.',
      dados: null,
    }
  }
}

function inteiroOuNull(texto: string) {
  return /^\d+$/.test(texto.trim()) ? Number(texto.trim()) : null
}

/** Campos editáveis do comprovante. Valores inválidos viram null e a validação acusa. */
function Revisao({
  dados,
  onChange,
}: {
  dados: DadosComprovante
  onChange: (d: DadosComprovante) => void
}) {
  const [textos, setTextos] = useState(() => ({
    total: dados.valorTotalCentavos === null ? '' : formatarBRL(dados.valorTotalCentavos).slice(3),
    cota: dados.valorCotaCentavos === null ? '' : formatarBRL(dados.valorCotaCentavos).slice(3),
    tarifa: dados.tarifaCentavos === null ? '' : formatarBRL(dados.tarifaCentavos).slice(3),
  }))
  const dinheiro = (campo: keyof typeof textos, chave: keyof DadosComprovante) => ({
    value: textos[campo],
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setTextos((t) => ({ ...t, [campo]: e.target.value }))
      onChange({ ...dados, [chave]: tentarDeReais(e.target.value) })
    },
  })
  const numero = (chave: keyof DadosComprovante) => ({
    inputMode: 'numeric' as const,
    defaultValue: (dados[chave] as number | null) ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      onChange({ ...dados, [chave]: inteiroOuNull(e.target.value) }),
  })

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Campo label="Concurso">
        <Input {...numero('concurso')} />
      </Campo>
      <Campo label="Data da compra">
        <Input
          type="date"
          defaultValue={dados.dataCompra ?? ''}
          onChange={(e) => onChange({ ...dados, dataCompra: e.target.value || null })}
        />
      </Campo>
      <Campo label="Valor da cota">
        <InputDinheiro {...dinheiro('cota', 'valorCotaCentavos')} />
      </Campo>
      <Campo label="Tarifa">
        <InputDinheiro {...dinheiro('tarifa', 'tarifaCentavos')} />
      </Campo>
      <Campo label="Valor total">
        <InputDinheiro {...dinheiro('total', 'valorTotalCentavos')} />
      </Campo>
      <Campo label="Total de cotas">
        <Input {...numero('bolaoTotalCotas')} />
      </Campo>
      <Campo label="Suas cotas">
        <Input {...numero('bolaoCotasUsuario')} />
      </Campo>
      <Campo label="Nº da cota">
        <Input {...numero('bolaoNumeroCota')} />
      </Campo>
    </div>
  )
}

export function ImportarPdf() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: modalidades } = useModalidades()
  const idArquivo = useId()
  const [itens, setItens] = useState<Item[]>([])
  const [arrastando, setArrastando] = useState(false)

  const opcoes: OpcoesComprovante = {
    precoSimples: (slug, data) => {
      const m = modalidades?.find((x) => x.slug === slug)
      return m ? precoVigente(m, data) : null
    },
  }

  const ler = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const lidos: Item[] = []
      for (const arquivo of arquivos) lidos.push(await lerComprovante(arquivo, opcoes))
      const hashes = lidos.flatMap((i) =>
        i.dados?.codigoReciboHash ? [i.dados.codigoReciboHash] : [],
      )
      const existentes = await comprovantesJaImportados(hashes)
      return lidos.map((i) => {
        const em = i.dados?.codigoReciboHash ? existentes.get(i.dados.codigoReciboHash) : undefined
        return em ? { ...i, importadoEm: em, incluir: false } : i
      })
    },
    onSuccess: (novos) => setItens((atuais) => [...atuais, ...novos]),
    onError: (e) => toast.error(e.message),
  })

  // Situação de cada item, com a validação refeita a cada correção.
  const vistos = new Set<string>()
  const situacoes = new Map<number, Situacao>()
  for (const item of itens) {
    if (item.falha || !item.dados) {
      situacoes.set(item.id, { tipo: 'falha', texto: item.falha ?? 'Não foi possível ler.' })
      continue
    }
    const hash = item.dados.codigoReciboHash
    if (item.importadoEm) {
      situacoes.set(item.id, {
        tipo: 'duplicata',
        texto: `Este comprovante já foi importado em ${formatarData(item.importadoEm)}.`,
      })
      continue
    }
    if (hash && vistos.has(hash)) {
      situacoes.set(item.id, {
        tipo: 'duplicata',
        texto: 'Este comprovante está repetido na seleção.',
      })
      continue
    }
    if (hash) vistos.add(hash)
    const v = validarComprovante(item.dados, opcoes)
    situacoes.set(
      item.id,
      v.erros.length > 0
        ? { tipo: 'erros', erros: v.erros, avisos: v.avisos }
        : { tipo: 'pronto', avisos: v.avisos },
    )
  }
  const selecionados = itens.filter((i) => i.incluir && situacoes.get(i.id)?.tipo === 'pronto')

  const importar = useMutation({
    mutationFn: () =>
      importarApostas(
        selecionados.map((i) => comprovanteParaAposta(i.dados!)),
        {
          origem: 'pdf',
          nomeArquivo:
            selecionados.length === 1
              ? selecionados[0]!.nomeArquivo
              : `${selecionados.length} comprovantes`,
          qtdErros: itens.length - selecionados.length,
          hashes: selecionados.map((i) => i.dados!.codigoReciboHash),
        },
      ),
    onSuccess: ({ importacaoId, ids }) => {
      toast.success(
        ids.length === 1 ? '1 comprovante importado.' : `${ids.length} comprovantes importados.`,
      )
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
      void conferirImportacao(importacaoId)
        .then(() => queryClient.invalidateQueries({ queryKey: chaves.apostas }))
        .catch(() => undefined)
      navigate('/apostas?origem=pdf')
    },
    onError: (e) => {
      const item = e instanceof ErroImportacao && e.indice !== null ? selecionados[e.indice] : null
      toast.error(item ? `${item.nomeArquivo}: ${e.message}` : e.message, { duration: 10_000 })
    },
  })

  function escolher(lista: FileList | null | undefined) {
    const arquivos = [...(lista ?? [])]
    if (arquivos.length > 0) ler.mutate(arquivos)
  }

  function soltar(e: DragEvent) {
    e.preventDefault()
    setArrastando(false)
    escolher(e.dataTransfer.files)
  }

  function atualizar(id: number, mudanca: Partial<Item>) {
    setItens((lista) => lista.map((i) => (i.id === id ? { ...i, ...mudanca } : i)))
  }

  const nomeDe = (slug: string) => modalidades?.find((m) => m.slug === slug)

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
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring',
          itens.length > 0 ? 'py-6' : 'py-12',
          arrastando ? 'border-primary bg-accent' : 'hover:bg-accent/50',
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          {ler.isPending ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <span className="text-lg font-semibold">
          {ler.isPending
            ? 'Lendo os comprovantes…'
            : itens.length > 0
              ? 'Adicionar mais comprovantes (PDF)'
              : 'Escolha os comprovantes de bolão (PDF)'}
        </span>
        <span className="max-w-sm text-sm text-muted-foreground">
          O PDF do app Loterias CAIXA é lido no seu aparelho e não é enviado. Nome e CPF são
          descartados; do código do recibo só fica uma impressão digital, para evitar duplicatas.
        </span>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
          <Upload className="size-4" aria-hidden="true" />
          Selecionar arquivos
        </span>
        <input
          id={idArquivo}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          disabled={ler.isPending}
          onChange={(e) => {
            escolher(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      {itens.map((item) => {
        const s = situacoes.get(item.id)!
        const d = item.dados
        const m = d ? nomeDe(d.modalidadeSlug) : undefined
        const idIncluir = `incluir-${item.id}`
        return (
          <Card key={item.id} aria-label={`Comprovante ${item.nomeArquivo}`} role="region">
            <CardHeader>
              <CardTitle>
                <h2 className="flex items-start gap-2 text-base break-all">
                  <FileText className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{item.nomeArquivo}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${item.nomeArquivo}`}
                    onClick={() => setItens((l) => l.filter((i) => i.id !== item.id))}
                    className="-mt-2 -mr-2"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {s.tipo === 'falha' || s.tipo === 'duplicata' ? (
                <p
                  className={cn(
                    'flex items-start gap-2 font-medium',
                    s.tipo === 'falha' ? 'text-prejuizo' : 'text-alerta',
                  )}
                >
                  {s.tipo === 'falha' ? (
                    <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  )}
                  {s.texto}
                </p>
              ) : null}

              {d && (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ModalidadeChip nome={m?.nome ?? d.modalidadeSlug} cor={m?.cor ?? '#6A6F9E'} />
                    <span className="font-semibold tabular-nums">Concurso {d.concurso ?? '?'}</span>
                    <span className="text-muted-foreground">
                      Bolão · {d.jogos.length} {d.jogos.length === 1 ? 'jogo' : 'jogos'}
                      {d.dataSorteio && ` · sorteio em ${formatarData(d.dataSorteio)}`}
                    </span>
                  </div>

                  {s.tipo !== 'duplicata' && (
                    <Revisao dados={d} onChange={(dados) => atualizar(item.id, { dados })} />
                  )}

                  <ul className="grid gap-2" aria-label="Jogos do comprovante">
                    {d.jogos.map((jogo, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-1">
                        <span className="w-14 text-xs text-muted-foreground">Jogo {i + 1}</span>
                        {jogo.map((n) => (
                          <BolaDezena
                            key={n}
                            numero={n}
                            tamanho="sm"
                            estado="marcada"
                            cor={m?.cor}
                          />
                        ))}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {(s.tipo === 'erros' || s.tipo === 'pronto') && s.avisos.length > 0 && (
                <ul className="grid gap-1 text-alerta" aria-label="Avisos">
                  {s.avisos.map((a) => (
                    <li key={a} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {a}
                    </li>
                  ))}
                </ul>
              )}
              {s.tipo === 'erros' && (
                <ul className="grid gap-1 text-prejuizo" aria-label="Erros">
                  {s.erros.map((e) => (
                    <li key={e} className="flex items-start gap-2">
                      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              {s.tipo === 'pronto' && (
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={idIncluir}
                    checked={item.incluir}
                    onCheckedChange={(v) => atualizar(item.id, { incluir: v === true })}
                  />
                  <Label htmlFor={idIncluir} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-lucro" aria-hidden="true" />
                    Importar este comprovante
                  </Label>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {itens.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => importar.mutate()}
            disabled={selecionados.length === 0 || importar.isPending}
          >
            {importar.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {selecionados.length === 0
              ? 'Nada para importar'
              : selecionados.length === 1
                ? 'Importar 1 comprovante'
                : `Importar ${selecionados.length} comprovantes`}
          </Button>
          <Button variant="outline" onClick={() => setItens([])} disabled={importar.isPending}>
            Limpar
          </Button>
        </div>
      )}
    </div>
  )
}
