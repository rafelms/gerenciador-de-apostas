import { PaginaEmBreve } from '@/components/pagina-em-breve'

// Rotas da seção 12.6 cujas telas pertencem a fases futuras.
// Cada uma é substituída pela tela real na fase indicada.

export const AnalisadorPage = () => (
  <PaginaEmBreve
    titulo="Analisador"
    fase={5}
    descricao="Estatísticas descritivas dos seus jogos."
  />
)
