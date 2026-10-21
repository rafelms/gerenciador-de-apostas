// Chaves do TanStack Query num lugar só (invalidação previsível após mutações).
export const chaves = {
  modalidades: ['modalidades'] as const,
  ultimoConcurso: (modalidadeId: number) => ['concursos', 'ultimo', modalidadeId] as const,
  concurso: (modalidadeId: number, numero: number) => ['concursos', modalidadeId, numero] as const,
  apostas: ['apostas'] as const,
  listaApostas: (filtros: object) => ['apostas', 'lista', filtros] as const,
  aposta: (id: string) => ['apostas', 'detalhe', id] as const,
  resumoPeriodo: (inicio: string, fim: string) => ['apostas', 'resumo', inicio, fim] as const,
  // Sob 'apostas': invalidar as apostas também refaz a conferência exibida.
  conferencia: (apostaId: string) => ['apostas', 'conferencia', apostaId] as const,
  configPremio: ['configuracoes', 'premio'] as const,
  notificacoes: ['notificacoes'] as const,
  resultados: ['concursos', 'resultados'] as const,
  concursosDoUsuario: ['apostas', 'concursos-do-usuario'] as const,
}
