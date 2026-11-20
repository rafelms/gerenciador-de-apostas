import {
  Bell,
  CalendarDays,
  FileDown,
  FileUp,
  Home,
  type LucideIcon,
  Microscope,
  PiggyBank,
  Plus,
  Scale,
  Settings,
  ShieldCheck,
  Ticket,
  Trophy,
} from 'lucide-react'

export interface ItemNav {
  rota: string
  rotulo: string
  icone: LucideIcon
  /** Só aparece para admin. */
  admin?: boolean
  /**
   * Tela de fase futura (app/paginas-futuras.tsx): a rota existe, mas o item fica fora
   * do menu até a tela real entrar. Ao implementar, tire a marca.
   */
  emBreve?: number
}

// Bottom nav do mobile (seção 12.5): exatamente 5 itens, "Nova" no centro.
export const navPrincipal: ItemNav[] = [
  { rota: '/', rotulo: 'Início', icone: Home },
  { rota: '/apostas', rotulo: 'Apostas', icone: Ticket },
  { rota: '/apostas/nova', rotulo: 'Nova', icone: Plus },
  { rota: '/calendario', rotulo: 'Calendário', icone: CalendarDays },
]

// Itens do menu "Mais" (mobile) — também listados na sidebar do desktop.
const todosMais: ItemNav[] = [
  { rota: '/resultados', rotulo: 'Resultados', icone: Trophy },
  { rota: '/analisador', rotulo: 'Analisador', icone: Microscope, emBreve: 5 },
  { rota: '/importar', rotulo: 'Importar', icone: FileUp },
  { rota: '/exportar', rotulo: 'Exportar', icone: FileDown },
  { rota: '/simulador-rateio', rotulo: 'Simular divisão', icone: Scale },
  { rota: '/orcamento', rotulo: 'Orçamento', icone: PiggyBank },
  { rota: '/notificacoes', rotulo: 'Notificações', icone: Bell },
  { rota: '/configuracoes', rotulo: 'Configurações', icone: Settings },
  { rota: '/admin', rotulo: 'Admin', icone: ShieldCheck, admin: true },
]

export const navMais: ItemNav[] = todosMais.filter((i) => !i.emBreve)
