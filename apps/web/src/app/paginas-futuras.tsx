import { PaginaEmBreve } from '@/components/pagina-em-breve'

// Rotas da seção 12.6 cujas telas pertencem a fases futuras.
// Cada uma é substituída pela tela real na fase indicada.

export const ResultadosPage = () => (
  <PaginaEmBreve
    titulo="Resultados"
    fase={2}
    descricao="Último concurso de cada modalidade e conferência das suas apostas."
  />
)
export const CalendarioPage = () => (
  <PaginaEmBreve
    titulo="Calendário"
    fase={4}
    descricao="Apostas, sorteios e prazos de resgate em um calendário."
  />
)
export const AnalisadorPage = () => (
  <PaginaEmBreve
    titulo="Analisador"
    fase={5}
    descricao="Estatísticas descritivas dos seus jogos."
  />
)
export const ImportarPage = () => (
  <PaginaEmBreve
    titulo="Importar"
    fase={3}
    descricao="Importação de apostas por planilha Excel ou PDF do comprovante."
  />
)
export const ExportarPage = () => (
  <PaginaEmBreve
    titulo="Exportar"
    fase={3}
    descricao="Exportação das suas apostas para Excel ou CSV."
  />
)
export const SimuladorRateioPage = () => (
  <PaginaEmBreve
    titulo="Simular divisão"
    fase={2}
    descricao="Simule a divisão de um prêmio entre pessoas."
  />
)
export const OrcamentoPage = () => (
  <PaginaEmBreve
    titulo="Orçamento"
    fase={4}
    descricao="Limite mensal de gastos com alertas de 80% e 100%."
  />
)
export const NotificacoesPage = () => (
  <PaginaEmBreve
    titulo="Notificações"
    fase={2}
    descricao="Avisos de resultado, prêmio, prazo e orçamento."
  />
)
export const AdminResultadosPage = () => (
  <PaginaEmBreve
    titulo="Resultados (admin)"
    fase={2}
    descricao="Sincronizar agora, log e lançamento manual de resultado."
  />
)
export const AdminConfiguracoesPage = () => (
  <PaginaEmBreve
    titulo="Configurações do sistema"
    fase={2}
    descricao="IR, limite de isenção, prazo de resgate e preços com vigência."
  />
)
