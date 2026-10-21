import { Link } from 'react-router'

import { BotaoCopiar } from '@/components/botao-copiar'
import { ModalidadeChip } from '@/components/modalidade-chip'
import { MoneyText } from '@/components/money-text'
import { StatusBadge } from '@/components/status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatarData } from '@/lib/formatadores'
import { cn } from '@/lib/utils'
import { apostasParaCopiar, type ResumoAposta } from './api'
import { rotulosTipo } from './filtros'
import { textoDaAposta } from './texto-copia'

interface ApostaCardProps {
  aposta: ResumoAposta
  selecionando?: boolean
  selecionada?: boolean
  onSelecionar?: (selecionada: boolean) => void
}

function textoConcursos(a: ResumoAposta) {
  return a.qtd_concursos && a.qtd_concursos > 1
    ? `${a.concurso_inicial}–${a.concurso_final}`
    : String(a.concurso_inicial)
}

/** Card da lista (seção 11.2): cor da modalidade só na borda esquerda. */
export function ApostaCard({
  aposta: a,
  selecionando,
  selecionada,
  onSelecionar,
}: ApostaCardProps) {
  const titulo = `${a.modalidade_nome} ${textoConcursos(a)}`
  // Fora da seleção, o botão de copiar fica no canto: o topo reserva o espaço dele.
  const reserva = !selecionando && 'pr-12'
  const conteudo = (
    <>
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', reserva)}>
        <ModalidadeChip nome={a.modalidade_nome ?? ''} cor={a.modalidade_cor ?? '#6A6F9E'} />
        <span className="text-sm font-semibold tabular-nums">{textoConcursos(a)}</span>
        <span className="flex-1" />
        {a.status && <StatusBadge status={a.status} />}
      </div>
      <p className={cn('text-sm text-muted-foreground', reserva)}>
        {a.tipo && rotulosTipo[a.tipo]}
        {a.tipo === 'bolao' &&
          a.bolao_cotas_usuario &&
          ` (${a.bolao_cotas_usuario}/${a.bolao_total_cotas} cotas)`}
        {' · '}
        {a.qtd_jogos} {a.qtd_jogos === 1 ? 'jogo' : 'jogos'}
        {a.max_dezenas ? ` de ${a.max_dezenas}` : ''}
        {a.data_aposta && ` · ${formatarData(a.data_aposta)}`}
      </p>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Pago</dt>
          <dd className="font-medium">
            <MoneyText centavos={a.valor_pago_centavos ?? 0} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Prêmio</dt>
          <dd className="font-medium">
            <MoneyText centavos={a.recuperado_usuario_centavos ?? 0} />
            {a.premio_valor_pendente && (
              <span className="block text-xs font-normal text-alerta">a confirmar</span>
            )}
            {!a.premio_valor_pendente && a.premio_a_resgatar && (
              <span className="block text-xs font-normal text-destaque-texto">a resgatar</span>
            )}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-xs text-muted-foreground">
            {a.melhor_acerto !== null ? 'Melhor acerto' : 'Saldo'}
          </dt>
          <dd className="font-medium">
            {a.melhor_acerto !== null ? (
              <span className="tabular-nums">
                {a.melhor_acerto} {a.melhor_acerto === 1 ? 'acerto' : 'acertos'}
              </span>
            ) : (
              <MoneyText centavos={a.saldo_centavos ?? 0} comSinal />
            )}
          </dd>
        </div>
      </dl>
    </>
  )

  const classe = cn(
    'grid gap-2 rounded-xl border border-l-4 bg-card p-4 transition-colors duration-150',
    selecionada && 'ring-2 ring-ring',
  )

  if (selecionando) {
    return (
      <label
        className={cn(classe, 'cursor-pointer hover:bg-accent')}
        style={{ borderLeftColor: a.modalidade_cor ?? undefined }}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={selecionada}
            onCheckedChange={(v) => onSelecionar?.(v === true)}
            aria-label={`Selecionar ${titulo}`}
            className="size-5"
          />
          Selecionar
        </span>
        {conteudo}
      </label>
    )
  }

  // O botão fica ao lado do link (não dentro dele: botão dentro de link é HTML inválido).
  return (
    <div className="relative">
      <Link
        to={`/apostas/${a.id}`}
        aria-label={titulo}
        className={cn(classe, 'hover:bg-accent')}
        style={{ borderLeftColor: a.modalidade_cor ?? undefined }}
      >
        {conteudo}
      </Link>
      <BotaoCopiar
        className="absolute top-1.5 right-1.5"
        aria-label={`Copiar jogos de ${titulo}`}
        mensagemSucesso="Jogos copiados."
        obterTexto={async () => {
          const [aposta] = await apostasParaCopiar([a.id!])
          if (!aposta) throw new Error('Aposta não encontrada.')
          return textoDaAposta(aposta)
        }}
      />
    </div>
  )
}
