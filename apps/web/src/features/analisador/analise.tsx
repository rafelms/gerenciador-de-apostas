import {
  analisarJogo,
  cobertura,
  contagemPorDezena,
  faixasPadrao,
  sobreposicao,
  validarFaixas,
  type FaixaDezenas,
} from '@shared/analisador.ts'
import type { RegraModalidade } from '@shared/regras/index.ts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CalendarCheck, Grid3x3, Layers, Pencil, Combine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Campo } from '@/components/campo'
import { KpiCard } from '@/components/kpi-card'
import { SelectNativo } from '@/components/select-nativo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-provider'
import type { Modalidade } from '@/features/modalidades/use-modalidades'
import { cn } from '@/lib/utils'
import {
  chavesAnalisador,
  historicoConcursos,
  lerPreferencias,
  salvarPreferencias,
  type PreferenciasAnalisador,
} from './api'
import { EditorFaixas } from './editor-faixas'
import { estiloCalor, passoCalor } from './calor'
import { GradeCalor, LegendaCalor } from './grade-calor'

const QTDS_HISTORICO = [10, 25, 50, 100, 300] as const
/** Acima disso a matriz não cabe na tela: fica só a lista dos pares acima do limite. */
const MATRIZ_MAXIMA = 20

const dz = (n: number) => String(n).padStart(2, '0')
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/**
 * Sobreposição esperada entre dois jogos ao acaso (k²/N, arredondada para cima). O padrão
 * destaca os pares que passam dela; o usuário pode mudar e o valor fica salvo.
 */
function limitePadrao(regra: RegraModalidade, jogos: number[][]) {
  const total = regra.universoMax - regra.universoMin + 1
  const k = jogos.length
    ? Math.round(jogos.reduce((s, j) => s + j.length, 0) / jogos.length)
    : regra.baseAposta
  return Math.ceil((k * k) / total)
}

interface AnaliseProps {
  modalidade: Modalidade
  jogos: number[][]
}

export function Analise({ modalidade, jogos }: AnaliseProps) {
  const { perfil, recarregar } = useAuth()
  const regra = modalidade.regra
  const slug = modalidade.slug
  const prefs = lerPreferencias(perfil?.preferencias)
  const salvas = prefs.faixas?.[slug]
  const faixas: FaixaDezenas[] =
    salvas && validarFaixas(salvas, regra).length === 0 ? salvas : faixasPadrao(regra)
  const limiteSalvo = prefs.limite?.[slug] ?? limitePadrao(regra, jogos)

  const [editando, setEditando] = useState(false)
  const [limiteTexto, setLimiteTexto] = useState(String(limiteSalvo))
  const limiteDigitado = Number.parseInt(limiteTexto, 10)
  const limite =
    Number.isInteger(limiteDigitado) && limiteDigitado >= 0 ? limiteDigitado : limiteSalvo
  const [qtdHistorico, setQtdHistorico] = useState<number>(50)

  const historico = useQuery({
    queryKey: chavesAnalisador.historico(modalidade.id, qtdHistorico),
    queryFn: () => historicoConcursos(modalidade.id, qtdHistorico),
    staleTime: 5 * 60 * 1000,
  })
  const ultimo = historico.data?.concursos[0] ?? null

  const salvar = useMutation({
    mutationFn: (p: PreferenciasAnalisador) =>
      salvarPreferencias(perfil!.id, perfil!.preferencias, p),
    onSuccess: () => recarregar(),
    onError: (e) => toast.error(e.message),
  })

  const resumos = useMemo(
    () => jogos.map((j) => analisarJogo(j, regra, faixas, ultimo?.dezenas)),
    [jogos, regra, faixas, ultimo],
  )
  const sobre = useMemo(() => sobreposicao(jogos, limite), [jogos, limite])
  const cob = useMemo(() => cobertura(jogos, regra), [jogos, regra])
  const frequencia = useMemo(
    () =>
      historico.data
        ? contagemPorDezena(
            historico.data.concursos.map((c) => c.dezenas),
            regra,
          )
        : null,
    [historico.data, regra],
  )
  const dezenasDosJogos = useMemo(() => new Set(jogos.flat()), [jogos])
  const colunas = slug === 'lotofacil' ? 5 : 10
  const ehLotofacil = slug === 'lotofacil'

  function salvarLimite() {
    if (!perfil || limite === limiteSalvo) return
    setLimiteTexto(String(limite))
    salvar.mutate({ limite: { ...prefs.limite, [slug]: limite } })
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard titulo="Jogos" valor={jogos.length} icone={Layers} />
        <KpiCard
          titulo="Dezenas usadas"
          valor={`${cob.usadas}/${cob.total}`}
          icone={Grid3x3}
          detalhe={`${Math.round((cob.usadas / cob.total) * 100)}% do volante`}
        />
        <KpiCard
          titulo="Sobreposição média"
          valor={sobre.media === null ? '—' : decimal.format(sobre.media)}
          icone={Combine}
          detalhe={sobre.media === null ? 'Precisa de 2 jogos' : 'dezenas em comum por par'}
        />
        <KpiCard
          titulo="Último concurso"
          valor={ultimo ? ultimo.numero : '—'}
          icone={CalendarCheck}
          detalhe={ultimo ? ultimo.dezenas.map(dz).join(' ') : 'Sem resultado sincronizado'}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <h2>Jogo a jogo</h2>
          </CardTitle>
          {!editando && (
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              <Pencil aria-hidden="true" />
              Editar faixas
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          {editando ? (
            <EditorFaixas
              regra={regra}
              faixas={faixas}
              salvando={salvar.isPending}
              onCancelar={() => setEditando(false)}
              onSalvar={(novas) =>
                salvar.mutate(
                  { faixas: { ...prefs.faixas, [slug]: novas } },
                  {
                    onSuccess: () => {
                      setEditando(false)
                      toast.success('Faixas salvas.')
                    },
                  },
                )
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Faixas:{' '}
              {faixas.map((f, i) => (
                <span key={f.nome}>
                  {i > 0 && ' · '}
                  {f.nome} {dz(f.de)}–{dz(f.ate)}
                </span>
              ))}
            </p>
          )}
          <div
            className="-mx-4 overflow-x-auto px-4 focus-visible:outline-2 focus-visible:outline-ring sm:-mx-6 sm:px-6"
            tabIndex={0}
            role="region"
            aria-label="Tabela de jogos, role para os lados"
          >
            <table className="w-full min-w-max text-sm tabular-nums">
              <caption className="sr-only">Estatísticas de cada jogo</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Jogo
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Dezenas
                  </th>
                  {faixas.map((f) => (
                    <th key={f.nome} scope="col" className="py-2 pr-3 text-right font-medium">
                      {f.nome}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Pares/Ímpares
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Primos
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Soma
                  </th>
                  {ehLotofacil && (
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Moldura/Miolo
                    </th>
                  )}
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Maior sequência
                  </th>
                  {ultimo && (
                    <th scope="col" className="py-2 text-right font-medium">
                      Repetidas do {ultimo.numero}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {resumos.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                      J{i + 1}
                    </th>
                    <td className="max-w-[18rem] py-2.5 pr-3 font-mono text-xs leading-relaxed whitespace-normal text-muted-foreground">
                      {[...jogos[i]!]
                        .sort((a, b) => a - b)
                        .map(dz)
                        .join(' ')}
                    </td>
                    {r.faixas.map((q, j) => (
                      <td key={j} className="py-2.5 pr-3 text-right">
                        {q}
                      </td>
                    ))}
                    <td className="py-2.5 pr-3 text-right">
                      {r.pares}/{r.impares}
                    </td>
                    <td className="py-2.5 pr-3 text-right">{r.primos}</td>
                    <td className="py-2.5 pr-3 text-right">{r.soma}</td>
                    {ehLotofacil && (
                      <td className="py-2.5 pr-3 text-right">
                        {r.moldura}/{r.miolo}
                      </td>
                    )}
                    <td className="py-2.5 pr-3 text-right">{r.sequencias.maior}</td>
                    {ultimo && <td className="py-2.5 text-right">{r.repetidas}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Sobreposição entre jogos</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Campo label="Destacar pares com mais de" ajuda="dezenas em comum" className="w-48">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={regra.maxMarcadas}
                value={limiteTexto}
                onChange={(e) => setLimiteTexto(e.target.value)}
                onBlur={salvarLimite}
              />
            </Campo>
            {sobre.media !== null && (
              <p className="pb-6 text-sm text-muted-foreground">
                Média: <strong className="text-foreground">{decimal.format(sobre.media)}</strong>{' '}
                dezenas em comum por par
              </p>
            )}
          </div>
          {jogos.length < 2 ? (
            <p className="text-sm text-muted-foreground">Com um jogo só não há sobreposição.</p>
          ) : jogos.length <= MATRIZ_MAXIMA ? (
            <MatrizSobreposicao matriz={sobre.matriz} limite={limite} />
          ) : (
            <p className="text-sm text-muted-foreground">
              A matriz aparece com até {MATRIZ_MAXIMA} jogos; abaixo, os pares acima do limite.
            </p>
          )}
          {jogos.length >= 2 && (
            <div className="grid gap-1 text-sm">
              <h3 className="font-sans font-medium">
                {sobre.acimaDoLimite.length === 0
                  ? `Nenhum par com mais de ${limite} dezenas em comum.`
                  : `${sobre.acimaDoLimite.length} ${sobre.acimaDoLimite.length === 1 ? 'par' : 'pares'} com mais de ${limite} em comum`}
              </h3>
              {sobre.acimaDoLimite.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {sobre.acimaDoLimite.slice(0, 60).map((p) => (
                    <li key={`${p.i}-${p.j}`}>
                      J{p.i + 1} × J{p.j + 1}:{' '}
                      <strong className="text-foreground">{p.comuns}</strong>
                    </li>
                  ))}
                  {sobre.acimaDoLimite.length > 60 && (
                    <li>e mais {sobre.acimaDoLimite.length - 60}</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Cobertura</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Em quantos dos seus jogos cada dezena aparece. {cob.usadas} de {cob.total} dezenas
              usadas.
            </p>
            <GradeCalor
              contagens={cob.porDezena}
              colunas={colunas}
              unidade={cob.porDezena.length === 1 ? 'jogo' : 'jogos'}
              rotulo="Cobertura das dezenas nos seus jogos"
            />
            <LegendaCalor maximo={Math.max(...cob.porDezena.map((d) => d.qtd))} unidade="jogos" />
            {cob.ausentes.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Fora dos jogos: {cob.ausentes.map(dz).join(' ')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <h2>Frequência histórica</h2>
            </CardTitle>
            <SelectNativo
              aria-label="Quantidade de concursos"
              className="w-auto"
              value={qtdHistorico}
              onChange={(e) => setQtdHistorico(Number(e.target.value))}
            >
              {QTDS_HISTORICO.map((q) => (
                <option key={q} value={q}>
                  Últimos {q}
                </option>
              ))}
            </SelectNativo>
          </CardHeader>
          <CardContent className="grid gap-4">
            {historico.isPending && <Skeleton className="h-64 w-full rounded-xl" />}
            {historico.isError && (
              <p className="text-sm text-destructive">
                Não foi possível carregar os concursos.{' '}
                <button className="underline" onClick={() => void historico.refetch()}>
                  Tentar de novo
                </button>
              </p>
            )}
            {historico.data && frequencia && (
              <>
                {historico.data.concursos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ainda não há concursos sorteados desta modalidade.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Quantas vezes cada dezena saiu em {historico.data.concursos.length}{' '}
                      {historico.data.concursos.length === 1
                        ? `concurso (${ultimo!.numero}). `
                        : `concursos (${historico.data.concursos.at(-1)!.numero} a ${ultimo!.numero}). `}
                      O contorno dourado marca as dezenas dos seus jogos.
                    </p>
                    {historico.data.concursos.length < qtdHistorico && (
                      <p className="text-sm text-muted-foreground">
                        Só há {historico.data.concursos.length} sincronizados. O administrador pode
                        buscar mais em Admin › Resultados › Histórico de concursos.
                      </p>
                    )}
                    <GradeCalor
                      contagens={frequencia}
                      colunas={colunas}
                      unidade="sorteios"
                      marcadas={dezenasDosJogos}
                      rotulo="Frequência das dezenas nos concursos"
                    />
                    <LegendaCalor
                      maximo={Math.max(...frequencia.map((d) => d.qtd))}
                      unidade="sorteios"
                    />
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MatrizSobreposicao({ matriz, limite }: { matriz: number[][]; limite: number }) {
  const foraDaDiagonal = matriz.flatMap((linha, i) => linha.filter((_, j) => j !== i))
  const maximo = Math.max(0, ...foraDaDiagonal)
  return (
    <div
      className="-mx-4 overflow-x-auto px-4 focus-visible:outline-2 focus-visible:outline-ring sm:-mx-6 sm:px-6"
      tabIndex={0}
      role="region"
      aria-label="Matriz de sobreposição, role para os lados"
    >
      <table className="border-separate border-spacing-1 text-sm tabular-nums">
        <caption className="sr-only">
          Dezenas em comum entre cada par de jogos; com contorno dourado, os pares acima de {limite}
        </caption>
        <thead>
          <tr>
            <td />
            {matriz.map((_, j) => (
              <th
                key={j}
                scope="col"
                className="size-9 text-center text-xs font-medium text-muted-foreground"
              >
                J{j + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matriz.map((linha, i) => (
            <tr key={i}>
              <th scope="row" className="pr-1 text-right text-xs font-medium text-muted-foreground">
                J{i + 1}
              </th>
              {linha.map((v, j) => {
                if (i === j)
                  return (
                    <td
                      key={j}
                      className="size-9 rounded-lg text-center text-xs text-muted-foreground"
                    >
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">mesmo jogo</span>
                    </td>
                  )
                const e = estiloCalor(passoCalor(v, maximo))
                const acima = v > limite
                return (
                  <td
                    key={j}
                    className={cn(
                      'size-9 rounded-lg text-center',
                      e.className,
                      acima && 'font-bold ring-2 ring-destaque ring-offset-1 ring-offset-card',
                    )}
                    style={e.style}
                  >
                    {v}
                    {acima && <span className="sr-only"> (acima do limite)</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
