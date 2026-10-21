import type { RegraModalidade } from '@shared/regras/tipos.ts'

import { InputDinheiro } from '@/components/input-dinheiro'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VolanteNumerico } from '@/components/volante-numerico'
import type { RateioDoFormulario } from './rateio-formulario'

interface CamposResultadoProps {
  regra: RegraModalidade
  /** Cor da modalidade (#rrggbb) para as dezenas marcadas. */
  cor?: string
  dezenas: number[]
  onDezenas: (dezenas: number[]) => void
  acumulado: boolean
  onAcumulado: (acumulado: boolean) => void
  rateio: RateioDoFormulario
  onRateio: (atualizar: (r: RateioDoFormulario) => RateioDoFormulario) => void
}

/** Dezenas sorteadas, "acumulou" e rateio opcional: usado pelo admin e pelo usuário. */
export function CamposResultado({
  regra,
  cor,
  dezenas,
  onDezenas,
  acumulado,
  onAcumulado,
  rateio,
  onRateio,
}: CamposResultadoProps) {
  // No volante, marca-se exatamente as dezenas sorteadas.
  const regraSorteio = {
    ...regra,
    minMarcadas: regra.qtdSorteadas,
    maxMarcadas: regra.qtdSorteadas,
  }
  return (
    <>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Dezenas sorteadas</legend>
        <VolanteNumerico
          regra={regraSorteio}
          selecionadas={dezenas}
          onChange={onDezenas}
          precoSimples={null}
          rotulo="Dezenas sorteadas"
          cor={cor}
        />
      </fieldset>

      <label className="flex min-h-11 w-fit items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={acumulado}
          onCheckedChange={(v) => onAcumulado(v === true)}
          className="size-5"
        />
        Acumulou
      </label>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Rateio (opcional)</legend>
        <div className="grid gap-3">
          {regra.faixas.map((f) => (
            <div
              key={f.acertos}
              className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(6rem,1fr)_6rem_minmax(8rem,1.5fr)]"
            >
              <span className="col-span-2 text-sm font-medium sm:col-span-1 sm:pb-3">{f.nome}</span>
              <div className="grid gap-1.5">
                <Label htmlFor={`gan-${f.acertos}`} className="text-xs">
                  Ganhadores
                </Label>
                <Input
                  id={`gan-${f.acertos}`}
                  inputMode="numeric"
                  value={rateio[f.acertos]?.ganhadores ?? ''}
                  onChange={(e) =>
                    onRateio((r) => ({
                      ...r,
                      [f.acertos]: { valor: r[f.acertos]?.valor ?? '', ganhadores: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`val-${f.acertos}`} className="text-xs">
                  Prêmio por aposta
                </Label>
                <InputDinheiro
                  id={`val-${f.acertos}`}
                  value={rateio[f.acertos]?.valor ?? ''}
                  onChange={(e) =>
                    onRateio((r) => ({
                      ...r,
                      [f.acertos]: {
                        ganhadores: r[f.acertos]?.ganhadores ?? '',
                        valor: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </>
  )
}
