import { BarChart3, ChevronRight, Settings, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Card } from '@/components/ui/card'

const areas = [
  {
    rota: '/admin/usuarios',
    titulo: 'Usuários',
    descricao: 'Convidar, desativar e reativar (máx. 5).',
    icone: Users,
  },
  {
    rota: '/admin/resultados',
    titulo: 'Resultados',
    descricao: 'Sincronizar e lançar resultado manual.',
    icone: Trophy,
  },
  {
    rota: '/admin/configuracoes',
    titulo: 'Configurações do sistema',
    descricao: 'IR, prazos e preços.',
    icone: Settings,
  },
  {
    rota: '/admin',
    titulo: 'Métricas',
    descricao: 'Agregados por usuário (fase 4).',
    icone: BarChart3,
    emBreve: true,
  },
]

export function AdminPage() {
  return (
    <>
      <CabecalhoPagina
        titulo="Administração"
        descricao="Você vê apenas dados cadastrais e métricas agregadas de outros usuários."
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {areas.map(({ rota, titulo, descricao, icone: Icone, emBreve }) => (
          <li key={titulo}>
            <Card className="p-0 transition-colors duration-150 hover:bg-accent">
              <Link
                to={rota}
                aria-disabled={emBreve}
                className="flex min-h-20 items-center gap-4 p-4 aria-disabled:pointer-events-none aria-disabled:opacity-60"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icone className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{titulo}</span>
                  <span className="block text-sm text-muted-foreground">{descricao}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
