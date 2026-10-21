import { formatarBRL } from '@shared/dinheiro.ts'
import { jogoEspelho, parseDezenas } from '@shared/regras/index.ts'
import { ClipboardPaste, Copy, FlipHorizontal2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { toast } from 'sonner'

import { ListaDezenas } from '@/components/bola-dezena'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { VolanteNumerico } from '@/components/volante-numerico'
import { precoVigente, type Modalidade } from '@/features/modalidades/use-modalidades'
import { cn } from '@/lib/utils'
import type { FormAposta } from './estado'

function DialogColar({
  modalidade,
  onColar,
}: {
  modalidade: Modalidade
  onColar: (jogos: number[][]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [erros, setErros] = useState<string[]>([])

  function confirmar() {
    const linhas = texto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const jogos: number[][] = []
    const problemas: string[] = []
    linhas.forEach((linha, i) => {
      const dezenas = parseDezenas(linha)
      const errosJogo = dezenas.some(Number.isNaN)
        ? ['contém algo que não é dezena']
        : modalidade.regra.validarJogo(dezenas)
      if (errosJogo.length) problemas.push(`Linha ${i + 1}: ${errosJogo[0]}`)
      else jogos.push(dezenas)
    })
    if (problemas.length) return setErros(problemas)
    if (!jogos.length) return setErros(['Cole pelo menos uma linha com dezenas.'])
    onColar(jogos)
    toast.success(jogos.length === 1 ? '1 jogo adicionado.' : `${jogos.length} jogos adicionados.`)
    setTexto('')
    setErros([])
    setAberto(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ClipboardPaste aria-hidden="true" /> Colar dezenas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Colar dezenas</DialogTitle>
          <DialogDescription>
            Um jogo por linha. Separe as dezenas com espaço, vírgula, hífen ou |.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="colar-dezenas">Jogos</Label>
          <Textarea
            id="colar-dezenas"
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'02 09 24 28 44 48 49\n02 | 06 | 28 | 41 | 44 | 49'}
            className="font-mono"
            aria-describedby={erros.length ? 'colar-erros' : undefined}
          />
          {erros.length > 0 && (
            <ul
              id="colar-erros"
              role="alert"
              className="grid gap-1 text-sm font-medium text-destructive"
            >
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={confirmar}>
            Adicionar jogos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SecaoJogos({ modalidade }: { modalidade: Modalidade | undefined }) {
  const { control, watch, setValue, formState } = useFormContext<FormAposta>()
  const { fields, append, remove, insert, replace } = useFieldArray({ control, name: 'jogos' })
  const jogos = watch('jogos')
  const dataAposta = watch('dataAposta')
  const [ativo, setAtivo] = useState(0)

  if (!modalidade) {
    return (
      <p className="text-sm text-muted-foreground">Escolha a modalidade para marcar os jogos.</p>
    )
  }

  const preco = precoVigente(modalidade, dataAposta)
  const erroGeral = formState.errors.jogos?.root?.message
  const indiceAtivo = Math.min(ativo, fields.length - 1)

  function adicionar() {
    append({ dezenas: [] })
    setAtivo(fields.length)
  }

  function colar(novos: number[][]) {
    const atuais = jogos.filter((j) => j.dezenas.length > 0)
    replace([...atuais, ...novos.map((dezenas) => ({ dezenas }))])
    setAtivo(atuais.length + novos.length - 1)
  }

  return (
    <div className="grid gap-4">
      <ol className="grid gap-3">
        {fields.map((field, i) => {
          const dezenas = jogos[i]?.dezenas ?? []
          const erro = formState.errors.jogos?.[i]?.message
          const editando = i === indiceAtivo
          const custo =
            preco &&
            dezenas.length >= modalidade.regra.minMarcadas &&
            dezenas.length <= modalidade.regra.maxMarcadas
              ? modalidade.regra.custoJogo(dezenas.length, preco)
              : null
          return (
            <li
              key={field.id}
              className={cn('rounded-xl border bg-card p-3', editando && 'border-primary')}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold">Jogo {i + 1}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {dezenas.length} dezenas{custo !== null && ` · ${formatarBRL(custo)}`}
                </span>
                <span className="flex-1" />
                {!editando && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setAtivo(i)}
                    aria-label={`Editar jogo ${i + 1}`}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    insert(i + 1, { dezenas: [...dezenas] })
                    setAtivo(i + 1)
                  }}
                  aria-label={`Duplicar jogo ${i + 1}`}
                >
                  <Copy aria-hidden="true" />
                </Button>
                {modalidade.regra.espelho && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={dezenas.length !== modalidade.regra.minMarcadas}
                    onClick={() => {
                      insert(i + 1, { dezenas: jogoEspelho(modalidade.regra, dezenas)! })
                      setAtivo(i + 1)
                      toast.success(`Aposta-Espelho do jogo ${i + 1} adicionada.`)
                    }}
                    aria-label={`Aposta-Espelho do jogo ${i + 1}`}
                    title="Aposta-Espelho: os outros números do volante"
                  >
                    <FlipHorizontal2 aria-hidden="true" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={fields.length === 1}
                  onClick={() => {
                    remove(i)
                    setAtivo(Math.max(0, i - 1))
                  }}
                  aria-label={`Remover jogo ${i + 1}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {editando ? (
                <VolanteNumerico
                  regra={modalidade.regra}
                  selecionadas={dezenas}
                  onChange={(novas) =>
                    setValue(`jogos.${i}.dezenas`, novas, { shouldValidate: formState.isSubmitted })
                  }
                  precoSimples={preco}
                  rotulo={`Volante do jogo ${i + 1}`}
                  cor={modalidade.cor}
                />
              ) : dezenas.length > 0 ? (
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setAtivo(i)}
                  aria-label={`Editar jogo ${i + 1}`}
                >
                  <ListaDezenas dezenas={dezenas} cor={modalidade.cor} />
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma dezena marcada.</p>
              )}
              {erro && (
                <p role="alert" className="mt-2 text-sm font-medium text-destructive">
                  {erro}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erroGeral}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={adicionar}>
          <Plus aria-hidden="true" /> Adicionar jogo
        </Button>
        <DialogColar modalidade={modalidade} onColar={colar} />
      </div>
    </div>
  )
}
