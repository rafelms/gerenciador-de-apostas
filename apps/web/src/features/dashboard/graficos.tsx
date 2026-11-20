// Gráficos do dashboard (seção 11.7). Este módulo é carregado sob demanda (Recharts
// fica fora do bundle inicial). Cores: --serie-1/2/3, validadas para CVD nos dois temas;
// cada série também tem um traço próprio (contínuo, tracejado, pontilhado), e cada
// gráfico tem uma tabela com os números na página, então a cor nunca é a única pista.

import { formatarBRL } from '@shared/dinheiro.ts'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts'

import type { PontoSerie } from './periodo'
import { SERIES_BARRAS, SERIES_MENSAL } from './series'

const compacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const reaisCompactos = (centavos: number) => compacto.format(centavos / 100)

type PropsDica = TooltipContentProps<TooltipValueType, string | number>

const eixo = { fill: 'var(--muted-foreground)', fontSize: 12 }

function animar() {
  return typeof window === 'undefined'
    ? false
    : !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Dica({ active, payload, label }: PropsDica) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      <ul className="grid gap-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: p.color }}
                aria-hidden="true"
              />
              {p.name}
            </span>
            <span className="font-medium tabular-nums">{formatarBRL(Number(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Linha: gasto × recuperado por mês, mais o saldo acumulado (um eixo só, em R$). */
export function GraficoMensal({ serie }: { serie: PontoSerie[] }) {
  const comPontos = serie.length <= 12
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart
        accessibilityLayer={false}
        data={serie}
        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="rotulo"
          tick={eixo}
          tickLine={false}
          axisLine={false}
          minTickGap={12}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={reaisCompactos}
          tick={eixo}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
        <Tooltip
          content={Dica}
          cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
        />
        {SERIES_MENSAL.map((s) => (
          <Line
            key={s.chave}
            dataKey={s.chave}
            name={s.nome}
            type="linear"
            stroke={s.cor}
            strokeWidth={2}
            strokeDasharray={s.traco || undefined}
            dot={comPontos ? { r: 4, strokeWidth: 2, fill: 'var(--card)' } : false}
            activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
            isAnimationActive={animar()}
            animationDuration={300}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface ItemBarras {
  nome: string
  gasto: number
  recuperado: number
}

/** Barras horizontais de gasto e recuperado por categoria (nomes legíveis no celular). */
export function GraficoGastoRecuperado({ itens }: { itens: ItemBarras[] }) {
  const altura = Math.max(120, itens.length * 64 + 32)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        accessibilityLayer={false}
        data={itens}
        layout="vertical"
        margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
        barGap={2}
        barCategoryGap="20%"
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis
          type="number"
          tickFormatter={reaisCompactos}
          tick={eixo}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="nome"
          tick={eixo}
          tickLine={false}
          axisLine={false}
          width={92}
        />
        <Tooltip content={Dica} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        {SERIES_BARRAS.map((s) => (
          <Bar
            key={s.chave}
            dataKey={s.chave}
            name={s.nome}
            fill={s.cor}
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            isAnimationActive={animar()}
            animationDuration={300}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function DicaAcertos({ active, payload, label }: PropsDica) {
  if (!active || !payload?.length) return null
  const qtd = Number(payload[0]!.value)
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <span className="font-semibold tabular-nums">{qtd.toLocaleString('pt-BR')}</span>{' '}
      {qtd === 1 ? 'jogo' : 'jogos'} com {label} {Number(label) === 1 ? 'acerto' : 'acertos'}
    </div>
  )
}

/** Barras: quantos jogos fizeram cada número de acertos (uma série só, sem legenda). */
export function GraficoAcertos({ itens }: { itens: { acertos: number; qtd: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        accessibilityLayer={false}
        data={itens}
        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        barGap={2}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="acertos" tick={eixo} tickLine={false} axisLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={eixo} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={DicaAcertos} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        <Bar
          dataKey="qtd"
          name="Jogos"
          fill="var(--serie-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
          isAnimationActive={animar()}
          animationDuration={300}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
