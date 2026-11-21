import { faixasPadrao, validarFaixas, type FaixaDezenas } from '@shared/analisador.ts'
import type { RegraModalidade } from '@shared/regras/index.ts'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface EditorFaixasProps {
  regra: RegraModalidade
  faixas: FaixaDezenas[]
  salvando: boolean
  onSalvar: (faixas: FaixaDezenas[]) => void
  onCancelar: () => void
}

/** Edita as faixas da modalidade. Só salva quando cobrem o universo inteiro, sem buracos. */
export function EditorFaixas({ regra, faixas, salvando, onSalvar, onCancelar }: EditorFaixasProps) {
  const [rascunho, setRascunho] = useState(faixas)
  const [erros, setErros] = useState<string[]>([])

  function alterar(i: number, campo: keyof FaixaDezenas, valor: string) {
    setRascunho((r) =>
      r.map((f, j) =>
        j === i ? { ...f, [campo]: campo === 'nome' ? valor : Number.parseInt(valor, 10) } : f,
      ),
    )
  }

  function adicionar() {
    const ultima = rascunho.at(-1)
    const de = Math.min(regra.universoMax, (ultima?.ate ?? regra.universoMin - 1) + 1)
    setRascunho((r) => [...r, { nome: `Faixa ${r.length + 1}`, de, ate: regra.universoMax }])
  }

  function salvar() {
    const limpas = rascunho.map((f) => ({ ...f, nome: f.nome.trim() }))
    const problemas = validarFaixas(limpas, regra)
    setErros(problemas)
    if (problemas.length === 0) onSalvar(limpas)
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        As faixas cobrem de {regra.universoMin} a {regra.universoMax}, em ordem e sem buracos.
      </p>
      <ol className="grid gap-2">
        {rascunho.map((f, i) => (
          <li key={i} className="grid grid-cols-[1fr_4.5rem_4.5rem_auto] items-center gap-2">
            <Input
              aria-label={`Nome da faixa ${i + 1}`}
              value={f.nome}
              maxLength={20}
              onChange={(e) => alterar(i, 'nome', e.target.value)}
            />
            <Input
              aria-label={`Início da faixa ${i + 1}`}
              type="number"
              inputMode="numeric"
              min={regra.universoMin}
              max={regra.universoMax}
              value={Number.isNaN(f.de) ? '' : f.de}
              onChange={(e) => alterar(i, 'de', e.target.value)}
            />
            <Input
              aria-label={`Fim da faixa ${i + 1}`}
              type="number"
              inputMode="numeric"
              min={regra.universoMin}
              max={regra.universoMax}
              value={Number.isNaN(f.ate) ? '' : f.ate}
              onChange={(e) => alterar(i, 'ate', e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remover a faixa ${i + 1}`}
              disabled={rascunho.length <= 2}
              onClick={() => setRascunho((r) => r.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      {erros.length > 0 && (
        <ul className="grid gap-1 text-sm text-destructive" role="alert">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={adicionar} disabled={rascunho.length >= 6}>
          <Plus aria-hidden="true" />
          Adicionar faixa
        </Button>
        <Button variant="ghost" onClick={() => setRascunho(faixasPadrao(regra))}>
          Restaurar padrão
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="animate-spin" aria-hidden="true" />}
          Salvar faixas
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
