import type { FiltrosApostas, OrigemAposta, StatusAposta, TipoAposta } from './api'

// Filtros da lista vivem na URL (?modalidade=megasena&tipo=bolao…): sobrevivem ao
// recarregar, ao "voltar" do navegador e podem ser compartilhados (aceite F1).

const TIPOS: TipoAposta[] = ['simples', 'bolao', 'teimosinha']
const STATUS: StatusAposta[] = ['aguardando', 'conferida', 'premiada', 'nao_premiada', 'cancelada']
const ORIGENS: OrigemAposta[] = ['manual', 'excel', 'pdf']
const DATA = /^\d{4}-\d{2}-\d{2}$/

function umDe<T extends string>(valor: string | null, opcoes: readonly T[]): T | undefined {
  return valor && (opcoes as readonly string[]).includes(valor) ? (valor as T) : undefined
}

export function filtrosDaUrl(p: URLSearchParams): FiltrosApostas {
  const concurso = Number(p.get('concurso'))
  return {
    modalidade: p.get('modalidade') || undefined,
    tipo: umDe(p.get('tipo'), TIPOS),
    status: umDe(p.get('status'), STATUS),
    origem: umDe(p.get('origem'), ORIGENS),
    de: DATA.test(p.get('de') ?? '') ? p.get('de')! : undefined,
    ate: DATA.test(p.get('ate') ?? '') ? p.get('ate')! : undefined,
    premiadas: p.get('premiadas') === '1' || undefined,
    concurso: Number.isInteger(concurso) && concurso > 0 ? concurso : undefined,
    ordem: umDe(p.get('ordem'), ['data', 'valor', 'saldo'] as const) ?? 'data',
    direcao: p.get('dir') === 'asc' ? 'asc' : 'desc',
  }
}

export function filtrosParaUrl(f: FiltrosApostas): URLSearchParams {
  const p = new URLSearchParams()
  if (f.modalidade) p.set('modalidade', f.modalidade)
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.status) p.set('status', f.status)
  if (f.origem) p.set('origem', f.origem)
  if (f.de) p.set('de', f.de)
  if (f.ate) p.set('ate', f.ate)
  if (f.premiadas) p.set('premiadas', '1')
  if (f.concurso) p.set('concurso', String(f.concurso))
  if (f.ordem !== 'data') p.set('ordem', f.ordem)
  if (f.direcao !== 'desc') p.set('dir', f.direcao)
  return p
}

export const rotulosTipo: Record<TipoAposta, string> = {
  simples: 'Simples',
  bolao: 'Bolão',
  teimosinha: 'Teimosinha',
}
export const rotulosOrigem: Record<OrigemAposta, string> = {
  manual: 'Manual',
  excel: 'Excel',
  pdf: 'PDF',
}
export { ORIGENS, STATUS, TIPOS }
