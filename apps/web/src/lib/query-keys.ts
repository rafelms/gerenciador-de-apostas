// Chaves do TanStack Query num lugar só (invalidação previsível após mutações).
export const chaves = {
  modalidades: ['modalidades'] as const,
  ultimoConcurso: (modalidadeId: number) => ['concursos', 'ultimo', modalidadeId] as const,
  concurso: (modalidadeId: number, numero: number) => ['concursos', modalidadeId, numero] as const,
  apostas: ['apostas'] as const,
  listaApostas: (filtros: object) => ['apostas', 'lista', filtros] as const,
  aposta: (id: string) => ['apostas', 'detalhe', id] as const,
  resumoPeriodo: (inicio: string, fim: string) => ['apostas', 'resumo', inicio, fim] as const,
}
