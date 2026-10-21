import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Bell,
  CheckCheck,
  Hourglass,
  Info,
  PiggyBank,
  RefreshCw,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { EmptyState } from '@/components/empty-state'
import { SelectNativo } from '@/components/select-nativo'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import type { Enums } from '@/types/database'
import { marcarComoLidas, type Notificacao } from './api'
import { useNotificacoes } from './use-notificacoes'

type Tipo = Enums<'tipo_notificacao'>

const tipos: Record<Tipo, { rotulo: string; icone: LucideIcon }> = {
  resultado: { rotulo: 'Resultado', icone: Bell },
  premio: { rotulo: 'Prêmio', icone: Trophy },
  premio_expirando: { rotulo: 'Prazo de resgate', icone: Hourglass },
  orcamento: { rotulo: 'Orçamento', icone: PiggyBank },
  sistema: { rotulo: 'Sistema', icone: Info },
}

/** Notificações internas (seção 11.11): filtro, "marcar todas como lidas" e link para a aposta. */
export function NotificacoesPage() {
  const consulta = useNotificacoes()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [somenteNaoLidas, setSomenteNaoLidas] = useState(false)
  const [tipo, setTipo] = useState<Tipo | ''>('')

  const marcar = useMutation({
    mutationFn: (ids?: string[]) => marcarComoLidas(ids),
    onSuccess: (_, ids) => {
      if (!ids) toast.success('Todas marcadas como lidas.')
      void queryClient.invalidateQueries({ queryKey: chaves.notificacoes })
    },
    onError: (e) => toast.error(e.message),
  })

  function abrir(n: Notificacao) {
    if (!n.lida_em) marcar.mutate([n.id])
    if (n.link) navigate(n.link)
  }

  const lista = (consulta.data ?? []).filter(
    (n) => (!somenteNaoLidas || !n.lida_em) && (!tipo || n.tipo === tipo),
  )

  return (
    <>
      <CabecalhoPagina
        titulo="Notificações"
        descricao={
          consulta.naoLidas > 0
            ? `${consulta.naoLidas} não ${consulta.naoLidas === 1 ? 'lida' : 'lidas'}`
            : 'Tudo em dia.'
        }
        acoes={
          <Button
            variant="outline"
            disabled={consulta.naoLidas === 0 || marcar.isPending}
            onClick={() => marcar.mutate(undefined)}
          >
            <CheckCheck aria-hidden="true" /> Marcar todas como lidas
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Mostrar" className="flex gap-2">
          {[
            [false, 'Todas'],
            [true, 'Não lidas'],
          ].map(([valor, rotulo]) => (
            <button
              key={String(valor)}
              type="button"
              role="radio"
              aria-checked={somenteNaoLidas === valor}
              onClick={() => setSomenteNaoLidas(valor as boolean)}
              className={cn(
                'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
                somenteNaoLidas === valor
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {rotulo as string}
            </button>
          ))}
        </div>
        <div className="grid min-w-44 gap-1.5">
          <Label htmlFor="filtro-tipo">Tipo</Label>
          <SelectNativo
            id="filtro-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Tipo | '')}
          >
            <option value="">Todos</option>
            {Object.entries(tipos).map(([valor, { rotulo }]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </SelectNativo>
        </div>
      </div>

      {consulta.isPending && (
        <div className="grid gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}
      {consulta.isError && (
        <EmptyState
          icone={RefreshCw}
          titulo="Não foi possível carregar as notificações"
          acao={
            <Button variant="outline" onClick={() => void consulta.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {consulta.isSuccess && lista.length === 0 && (
        <EmptyState
          icone={Bell}
          titulo={
            consulta.data.length === 0 ? 'Nenhuma notificação ainda' : 'Nada com estes filtros'
          }
          descricao="Você é avisado aqui quando sai o resultado das suas apostas, quando há prêmio e quando o prazo de resgate está acabando."
          acao={
            consulta.data.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSomenteNaoLidas(false)
                  setTipo('')
                }}
              >
                Limpar filtros
              </Button>
            ) : undefined
          }
        />
      )}
      {lista.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {lista.map((n) => {
            const { icone: Icone, rotulo } = tipos[n.tipo]
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => abrir(n)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-accent"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                      n.tipo === 'premio'
                        ? 'bg-destaque text-marinho-900'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icone className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block', !n.lida_em && 'font-semibold')}>{n.titulo}</span>
                    {n.corpo && (
                      <span className="block text-sm text-muted-foreground">{n.corpo}</span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {rotulo} ·{' '}
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </span>
                  {!n.lida_em && (
                    <span
                      className="mt-2 size-2.5 shrink-0 rounded-full bg-primary"
                      aria-label="Não lida"
                      role="img"
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
