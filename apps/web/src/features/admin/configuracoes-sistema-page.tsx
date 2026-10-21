import { formatarBRL, tentarDeReais } from '@shared/dinheiro.ts'
import { configuracoesSchema, type ConfiguracoesInput } from '@shared/schemas/resultados.ts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { InputDinheiro } from '@/components/input-dinheiro'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { MoneyText } from '@/components/money-text'
import { SelectNativo } from '@/components/select-nativo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalidades, type Modalidade } from '@/features/modalidades/use-modalidades'
import { formatarData, formatarDataHora, hojeIso } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { adicionarPreco, carregarConfiguracoesAdmin, chavesAdmin, salvarConfiguracoes } from './api'

type Linha = Awaited<ReturnType<typeof carregarConfiguracoesAdmin>>

function Opcoes<T extends string>({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string
  valor: T
  opcoes: { valor: T; titulo: string; descricao: string }[]
  onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{rotulo}</legend>
      <div role="radiogroup" aria-label={rotulo} className="grid gap-2 sm:grid-cols-2">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            onClick={() => onChange(o.valor)}
            className={cn(
              'flex min-h-14 flex-col items-start justify-center rounded-lg border p-3 text-left transition-colors duration-150',
              valor === o.valor
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:bg-accent',
            )}
          >
            <span className="text-sm font-semibold">{o.titulo}</span>
            <span
              className={cn('text-xs', valor === o.valor ? 'opacity-90' : 'text-muted-foreground')}
            >
              {o.descricao}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function FormConfiguracoes({ atual }: { atual: Linha }) {
  const queryClient = useQueryClient()
  const [aliquota, setAliquota] = useState((atual.aliquota_ir_bps / 100).toLocaleString('pt-BR'))
  const [limite, setLimite] = useState(
    formatarBRL(atual.limite_isencao_ir_centavos).replace('R$ ', ''),
  )
  const [base, setBase] = useState(atual.base_calculo_ir as 'cota' | 'aposta')
  const [valorApi, setValorApi] = useState(atual.valor_rateio_api_eh as 'bruto' | 'liquido')
  const [prazo, setPrazo] = useState(String(atual.prazo_resgate_dias))

  const percentual = Number(aliquota.trim().replace(',', '.'))
  const entrada = configuracoesSchema.safeParse({
    aliquotaIrBps:
      Number.isFinite(percentual) && aliquota.trim() ? Math.round(percentual * 100) : Number.NaN,
    limiteIsencaoIrCentavos: tentarDeReais(limite) ?? Number.NaN,
    baseCalculoIr: base,
    valorRateioApiEh: valorApi,
    prazoResgateDias: /^\d+$/.test(prazo) ? Number(prazo) : Number.NaN,
  })
  const erro = (campo: keyof ConfiguracoesInput) =>
    entrada.success
      ? undefined
      : entrada.error.issues.find((i) => i.path[0] === campo) && 'Valor inválido.'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Imposto de Renda e prazos</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Alíquota do IR (%)" erro={erro('aliquotaIrBps')}>
            <Input
              inputMode="decimal"
              value={aliquota}
              onChange={(e) => setAliquota(e.target.value)}
            />
          </Campo>
          <Campo
            label="Limite de isenção"
            erro={erro('limiteIsencaoIrCentavos')}
            ajuda="Prêmios até este valor são isentos."
          >
            <InputDinheiro value={limite} onChange={(e) => setLimite(e.target.value)} />
          </Campo>
          <Campo label="Prazo de resgate (dias)" erro={erro('prazoResgateDias')}>
            <Input inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
        </div>
        <Opcoes
          rotulo="Base do IR no bolão"
          valor={base}
          onChange={setBase}
          opcoes={[
            {
              valor: 'cota',
              titulo: 'Por cota',
              descricao: 'O limite de isenção vale para cada cota.',
            },
            {
              valor: 'aposta',
              titulo: 'Pela aposta inteira',
              descricao: 'O limite vale para o prêmio do bolão todo.',
            },
          ]}
        />
        <Opcoes
          rotulo="O valor do rateio da API é"
          valor={valorApi}
          onChange={setValorApi}
          opcoes={[
            { valor: 'bruto', titulo: 'Bruto', descricao: 'O sistema desconta o IR.' },
            {
              valor: 'liquido',
              titulo: 'Líquido',
              descricao: 'O IR já foi descontado; o bruto é estimado.',
            },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Alterações valem para as próximas conferências; prêmios já calculados guardam a regra
          usada. Última alteração em {formatarDataHora(atual.updated_at)}.
        </p>
        <ConfirmDialog
          titulo="Salvar as configurações?"
          descricao="As novas regras de IR e prazo valem para as próximas conferências."
          textoConfirmar="Salvar"
          onConfirmar={async () => {
            if (!entrada.success) return
            try {
              await salvarConfiguracoes(entrada.data)
              toast.success('Configurações salvas.')
              void queryClient.invalidateQueries({ queryKey: chavesAdmin.configuracoes })
              void queryClient.invalidateQueries({ queryKey: chaves.configPremio })
            } catch (e) {
              toast.error((e as Error).message)
            }
          }}
        >
          <Button className="w-fit" disabled={!entrada.success}>
            <Save aria-hidden="true" /> Salvar configurações
          </Button>
        </ConfirmDialog>
      </CardContent>
    </Card>
  )
}

function Precos({ modalidades }: { modalidades: Modalidade[] }) {
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState(modalidades[0]?.slug ?? '')
  const [preco, setPreco] = useState('')
  const [vigencia, setVigencia] = useState(hojeIso())
  const centavos = tentarDeReais(preco)
  const modalidade = modalidades.find((m) => m.slug === slug)
  const valido =
    !!modalidade && centavos !== null && centavos > 0 && /^\d{4}-\d{2}-\d{2}$/.test(vigencia)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Preços da aposta simples</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ul className="grid gap-3">
          {modalidades.map((m) => (
            <li key={m.slug} className="grid gap-1">
              <ModalidadeChip nome={m.nome} cor={m.cor} />
              <ul className="grid gap-0.5 pl-4 text-sm">
                {m.precos.map((p, i) => (
                  <li
                    key={p.vigenteDesde}
                    className={cn('flex justify-between gap-2', i > 0 && 'text-muted-foreground')}
                  >
                    <span>
                      desde {formatarData(p.vigenteDesde)}
                      {i === 0 && ' (vigente)'}
                    </span>
                    <MoneyText centavos={p.centavos} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="preco-modalidade">Modalidade</Label>
            <SelectNativo
              id="preco-modalidade"
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
          <Campo
            label="Novo preço"
            erro={preco && (centavos === null || centavos <= 0) ? 'Valor inválido.' : undefined}
          >
            <InputDinheiro value={preco} onChange={(e) => setPreco(e.target.value)} />
          </Campo>
          <Campo label="Vigente desde">
            <Input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
          </Campo>
        </div>
        <ConfirmDialog
          titulo={`Novo preço da ${modalidade?.nome ?? ''}?`}
          descricao={
            centavos
              ? `${formatarBRL(centavos)} por aposta simples a partir de ${formatarData(vigencia)}. Apostas anteriores mantêm o preço da época.`
              : undefined
          }
          textoConfirmar="Adicionar"
          onConfirmar={async () => {
            if (!valido) return
            try {
              await adicionarPreco(modalidade.id, centavos, vigencia)
              toast.success('Preço adicionado.')
              setPreco('')
              void queryClient.invalidateQueries({ queryKey: chaves.modalidades })
            } catch (e) {
              toast.error((e as Error).message)
            }
          }}
        >
          <Button variant="outline" className="w-fit" disabled={!valido}>
            <Plus aria-hidden="true" /> Adicionar preço
          </Button>
        </ConfirmDialog>
      </CardContent>
    </Card>
  )
}

/** Admin → Configurações do sistema (seção 11.6). */
export function AdminConfiguracoesPage() {
  const config = useQuery({
    queryKey: chavesAdmin.configuracoes,
    queryFn: carregarConfiguracoesAdmin,
  })
  const modalidades = useModalidades()

  return (
    <>
      <CabecalhoPagina
        titulo="Configurações do sistema"
        descricao="Regras globais de cálculo, válidas para todos os usuários."
      />
      {(config.isPending || modalidades.isPending) && (
        <Skeleton className="h-64 w-full rounded-xl" />
      )}
      {(config.isError || modalidades.isError) && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar"
          acao={
            <Button
              variant="outline"
              onClick={() => void Promise.all([config.refetch(), modalidades.refetch()])}
            >
              Tentar de novo
            </Button>
          }
        />
      )}
      {config.data && modalidades.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* key: remonta o formulário com os valores salvos depois de gravar */}
          <FormConfiguracoes key={config.data.updated_at} atual={config.data} />
          <Precos modalidades={modalidades.data} />
        </div>
      )}
    </>
  )
}
