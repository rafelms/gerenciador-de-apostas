import { PaginaEmBreve } from '@/components/pagina-em-breve'

// Rotas da seção 12.6 cujas telas pertencem a fases futuras.
// Cada uma é substituída pela tela real na fase indicada.

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
export const OrcamentoPage = () => (
  <PaginaEmBreve
    titulo="Orçamento"
    fase={4}
    descricao="Limite mensal de gastos com alertas de 80% e 100%."
  />
)
