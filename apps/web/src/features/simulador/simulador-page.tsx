import { formatarBRL, tentarDeReais } from '@shared/dinheiro.ts'
import { simularDivisao } from '@shared/premio.ts'
import { useQuery } from '@tanstack/react-query'
import { Info, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { InputDinheiro } from '@/components/input-dinheiro'
import { MoneyText } from '@/components/money-text'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { carregarConfigPremio } from '@/features/conferencia/api'
import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

interface Pessoa {
  id: number
  nome: string
  peso: string
}

const inteiro = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : Number.NaN)
const peso = (t: string) => Number(t.trim().replace(',', '.'))

/** Simulação da divisão de um prêmio (seção 9.6), sem salvar nada. */
export function SimuladorPage() {
  const cfg = useQuery({
    queryKey: chaves.configPremio,
    queryFn: carregarConfigPremio,
    staleTime: 10 * 60 * 1000,
  })
  const [valor, setValor] = useState('')
  const [tipoValor, setTipoValor] = useState<'bruto' | 'liquido'>('bruto')
  const [totalCotas, setTotalCotas] = useState('1')
  const [cotasUsuario, setCotasUsuario] = useState('1')
  const [pessoas, setPessoas] = useState<Pessoa[]>([{ id: 0, nome: 'Eu', peso: '1' }])
  const [proximoId, setProximoId] = useState(1)

  const centavos = tentarDeReais(valor)
  const total = inteiro(totalCotas)
  const cotas = inteiro(cotasUsuario)
  const erroValor =
    valor && centavos === null
      ? 'Valor inválido.'
      : centavos !== null && centavos < 0
        ? 'O valor não pode ser negativo.'
        : undefined
  const erroTotal = Number.isNaN(total) || total < 1 ? 'Pelo menos 1 cota.' : undefined
  const erroCotas =
    Number.isNaN(cotas) || cotas < 1
      ? 'Pelo menos 1 cota.'
      : !erroTotal && cotas > total
        ? 'Não pode passar do total.'
        : undefined
  const errosPeso = pessoas.map((p) => (!(peso(p.peso) > 0) ? 'Peso maior que zero.' : undefined))
  const pronto =
    centavos !== null &&
    centavos >= 0 &&
    !erroTotal &&
    !erroCotas &&
    errosPeso.every((e) => !e) &&
    cfg.data

  const resultado = pronto
    ? simularDivisao(
        {
          valor: centavos,
          tipoValor,
          totalCotas: total,
          cotasUsuario: cotas,
          participantes: pessoas.map((p, i) => ({
            nome: p.nome.trim() || `Pessoa ${i + 1}`,
            peso: peso(p.peso),
            ehUsuario: i === 0,
          })),
        },
        cfg.data,
      )
    : null

  function alterar(id: number, campo: 'nome' | 'peso', texto: string) {
    setPessoas((ps) => ps.map((p) => (p.id === id ? { ...p, [campo]: texto } : p)))
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Simular divisão"
        descricao="Veja quanto cabe a cada pessoa antes de o prêmio sair. Nada é salvo."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Prêmio</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Campo
              label="Valor do prêmio da aposta"
              erro={erroValor}
              ajuda="Da aposta inteira (todas as cotas, no bolão)."
            >
              <InputDinheiro value={valor} onChange={(e) => setValor(e.target.value)} />
            </Campo>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">O valor é</legend>
              <div role="radiogroup" aria-label="O valor é" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['bruto', 'Bruto', 'Antes do IR'],
                    ['liquido', 'Líquido', 'Já sem o IR'],
                  ] as const
                ).map(([v, rotulo, descricao]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={tipoValor === v}
                    onClick={() => setTipoValor(v)}
                    className={cn(
                      'flex min-h-14 flex-col items-center justify-center rounded-lg border p-2 transition-colors duration-150',
                      tipoValor === v
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-card hover:bg-accent',
                    )}
                  >
                    <span className="text-sm font-semibold">{rotulo}</span>
                    <span
                      className={cn(
                        'text-xs',
                        tipoValor === v ? 'opacity-90' : 'text-muted-foreground',
                      )}
                    >
                      {descricao}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Total de cotas" erro={erroTotal} ajuda="1 = aposta simples">
                <Input
                  inputMode="numeric"
                  value={totalCotas}
                  onChange={(e) => setTotalCotas(e.target.value)}
                />
              </Campo>
              <Campo label="Suas cotas" erro={erroCotas}>
                <Input
                  inputMode="numeric"
                  value={cotasUsuario}
                  onChange={(e) => setCotasUsuario(e.target.value)}
                />
              </Campo>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Pessoas</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ul className="grid gap-3">
              {pessoas.map((p, i) => (
                <li key={p.id} className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`nome-${p.id}`}>{i === 0 ? 'Você' : `Pessoa ${i + 1}`}</Label>
                    <Input
                      id={`nome-${p.id}`}
                      value={p.nome}
                      onChange={(e) => alterar(p.id, 'nome', e.target.value)}
                      maxLength={60}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`peso-${p.id}`}>Peso</Label>
                    <Input
                      id={`peso-${p.id}`}
                      inputMode="decimal"
                      value={p.peso}
                      aria-invalid={errosPeso[i] ? true : undefined}
                      onChange={(e) => alterar(p.id, 'peso', e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={i === 0}
                    aria-label={`Remover ${p.nome || `pessoa ${i + 1}`}`}
                    onClick={() => setPessoas((ps) => ps.filter((x) => x.id !== p.id))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                  {errosPeso[i] && (
                    <p role="alert" className="col-span-3 text-sm font-medium text-destructive">
                      {errosPeso[i]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={pessoas.length >= 30}
              onClick={() => {
                setPessoas((ps) => [...ps, { id: proximoId, nome: '', peso: '1' }])
                setProximoId((n) => n + 1)
              }}
            >
              <Plus aria-hidden="true" /> Adicionar pessoa
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            <h2>Resultado</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4" aria-live="polite">
          {!resultado ? (
            <p className="text-sm text-muted-foreground">
              Informe o valor do prêmio para ver a divisão.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Bruto (suas cotas)</dt>
                  <dd className="text-lg font-semibold">
                    <MoneyText centavos={resultado.brutoUsuario} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">IR</dt>
                  <dd className="text-lg font-semibold">
                    <MoneyText centavos={resultado.irUsuario} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Líquido</dt>
                  <dd className="text-lg font-bold">
                    <MoneyText centavos={resultado.liquidoUsuario} />
                  </dd>
                </div>
              </dl>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Divisão do prêmio entre as pessoas</caption>
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th scope="col" className="py-2 font-medium">
                        Pessoa
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        %
                      </th>
                      <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">
                        Bruto
                      </th>
                      <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">
                        IR
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Líquido
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.divisao.map((l, i) => (
                      <tr key={pessoas[i]?.id ?? i} className="border-b last:border-0">
                        <td className="py-2">{l.nome}</td>
                        <td className="py-2 text-right tabular-nums">
                          {(l.fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                        </td>
                        <td className="hidden py-2 text-right sm:table-cell">
                          <MoneyText centavos={l.bruto} />
                        </td>
                        <td className="hidden py-2 text-right sm:table-cell">
                          <MoneyText centavos={l.ir} />
                        </td>
                        <td className="py-2 text-right font-semibold">
                          <MoneyText centavos={l.liquido} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cfg.data && (
                <p className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="size-4 shrink-0" aria-hidden="true" />
                  IR de {(cfg.data.aliquotaIrBps / 100).toLocaleString('pt-BR')}% acima de{' '}
                  {formatarBRL(cfg.data.limiteIsencaoIrCentavos)}, apurado{' '}
                  {cfg.data.baseCalculoIr === 'cota' ? 'por cota' : 'pela aposta inteira'}. Valores
                  arredondados ao centavo sem perder nenhum (método do maior resto).
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
