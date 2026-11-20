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

// Bottom nav do mobile (seção 12.5): exatamente 5 itens, "Nova" no centro. O Calendário
// (seção 12.5) volta para cá quando a F4 entregar a tela; até lá, Resultados ocupa o lugar.
export const navPrincipal: ItemNav[] = [
  { rota: '/', rotulo: 'Início', icone: Home },
  { rota: '/apostas', rotulo: 'Apostas', icone: Ticket },
  { rota: '/apostas/nova', rotulo: 'Nova', icone: Plus },
  { rota: '/resultados', rotulo: 'Resultados', icone: Trophy },
]

// Itens do menu "Mais" (mobile) — também listados na sidebar do desktop.
const todosMais: ItemNav[] = [
  { rota: '/calendario', rotulo: 'Calendário', icone: CalendarDays, emBreve: 4 },
  { rota: '/analisador', rotulo: 'Analisador', icone: Microscope, emBreve: 5 },
  { rota: '/importar', rotulo: 'Importar', icone: FileUp },
  { rota: '/exportar', rotulo: 'Exportar', icone: FileDown, emBreve: 3 },
  { rota: '/simulador-rateio', rotulo: 'Simular divisão', icone: Scale },
  { rota: '/orcamento', rotulo: 'Orçamento', icone: PiggyBank, emBreve: 4 },
  { rota: '/notificacoes', rotulo: 'Notificações', icone: Bell },
  { rota: '/configuracoes', rotulo: 'Configurações', icone: Settings },
  { rota: '/admin', rotulo: 'Admin', icone: ShieldCheck, admin: true },
]

export const navMais: ItemNav[] = todosMais.filter((i) => !i.emBreve)
