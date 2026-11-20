import {
  apostasParaLinhas,
  COLUNAS_PLANILHA,
  resumoPorModalidadeMes,
  type ApostaParaExportar,
} from '@shared/parsers/planilha.ts'

import { apostasFiltradas, type FiltrosApostas } from '@/features/apostas/api'
import { formatarData } from '@/lib/formatadores'
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/database'
import type { AbaParaExportar } from '@/features/importacao/arquivo-planilha'

/** Linhas por página do PostgREST (max_rows padrão é 1.000). */
const PAGINA = 1000
/** Ids por consulta com `in` (mantém a URL curta). */
const LOTE_IDS = 100

export type AlvoExportacao = { filtros: FiltrosApostas } | { ids: string[] }

interface LinhaResumoBanco {
  id: string | null
  modalidade_nome: string | null
  data_aposta: string | null
  gasto_usuario_centavos: number | null
  recuperado_usuario_centavos: number | null
}

const CAMPOS_RESUMO =
  'id, modalidade_nome, data_aposta, gasto_usuario_centavos, recuperado_usuario_centavos'

async function resumos(alvo: AlvoExportacao): Promise<LinhaResumoBanco[]> {
  const linhas: LinhaResumoBanco[] = []
  if ('ids' in alvo) {
    for (let i = 0; i < alvo.ids.length; i += LOTE_IDS) {
      const { data, error } = await supabase
        .from('vw_apostas_resumo')
        .select(CAMPOS_RESUMO)
        .in('id', alvo.ids.slice(i, i + LOTE_IDS))
      if (error) throw error
      linhas.push(...data)
    }
  } else {
    for (let inicio = 0; ; inicio += PAGINA) {
      const { data, error } = await apostasFiltradas(alvo.filtros, CAMPOS_RESUMO)
        .order('data_aposta')
        .order('created_at')
        .order('id')
        .range(inicio, inicio + PAGINA - 1)
      if (error) throw error
      linhas.push(...data)
      if (data.length < PAGINA) break
    }
  }
  return linhas.filter((l) => l.id)
}

const CAMPOS_APOSTA = `id, tipo, concurso_inicial, qtd_concursos, data_aposta, bolao_total_cotas,
  bolao_cotas_usuario, bolao_numero_cota, valor_cota_centavos, tarifa_centavos,
  valor_pago_centavos, local_compra, observacao, modalidades (slug, nome),
  aposta_jogos (ordem, dezenas), participantes (ordem, nome, peso, eh_usuario, contribuicao_centavos)`

const CAMPOS_PREMIO = `aposta_id, bruto_usuario_centavos, ir_usuario_centavos, liquido_usuario_centavos,
  status, prazo_resgate, resgatado_em, valor_informado_manual, concursos (numero, data_sorteio)`

const rotulosPremio: Record<Enums<'status_premio'>, string> = {
  a_resgatar: 'A resgatar',
  resgatado: 'Resgatado',
  expirado: 'Expirado',
}

const reais = (centavos: number) => centavos / 100

export const COLUNAS_PREMIOS = [
  'modalidade',
  'concurso',
  'data_sorteio',
  'bruto',
  'ir',
  'liquido',
  'status',
  'prazo_resgate',
  'resgatado_em',
  'informado_a_mao',
] as const

export const COLUNAS_RESUMO = [
  'mes',
  'modalidade',
  'apostas',
  'gasto',
  'recuperado',
  'saldo',
] as const

export interface DadosExportacao {
  qtdApostas: number
  abas: AbaParaExportar[]
  /** Aba Apostas (também é o CSV). */
  linhasApostas: Record<string, string | number | null>[]
}

/**
 * Tudo o que vai para o arquivo, na ordem da data da aposta. Respeita a RLS: só as
 * apostas do usuário. A aba Apostas usa o formato do modelo (reimportável).
 */
export async function dadosParaExportar(alvo: AlvoExportacao): Promise<DadosExportacao> {
  const lista = await resumos(alvo)
  const ordem = new Map(lista.map((l, i) => [l.id!, i]))
  const ids = [...ordem.keys()]

  const apostas: (ApostaParaExportar & { id: string })[] = []
  const premios: Record<string, string | number | null>[] = []
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS)
    const [a, p] = await Promise.all([
      supabase.from('apostas').select(CAMPOS_APOSTA).in('id', lote),
      supabase.from('premios').select(CAMPOS_PREMIO).in('aposta_id', lote),
    ])
    if (a.error) throw a.error
    if (p.error) throw p.error
    for (const x of a.data) {
      apostas.push({
        id: x.id,
        modalidadeSlug: x.modalidades?.slug ?? '',
        modalidadeNome: x.modalidades?.nome ?? '',
        tipo: x.tipo,
        concursoInicial: x.concurso_inicial,
        qtdConcursos: x.qtd_concursos,
        dataAposta: x.data_aposta,
        jogos: [...x.aposta_jogos].sort((m, n) => m.ordem - n.ordem).map((j) => j.dezenas),
        bolao:
          x.tipo === 'bolao' && x.bolao_total_cotas && x.bolao_cotas_usuario
            ? {
                totalCotas: x.bolao_total_cotas,
                cotasUsuario: x.bolao_cotas_usuario,
                numeroCota: x.bolao_numero_cota,
                valorCotaCentavos: x.valor_cota_centavos ?? 0,
                tarifaCentavos: x.tarifa_centavos,
              }
            : null,
        valorPagoCentavos: x.valor_pago_centavos,
        participantes: [...x.participantes]
          .sort((m, n) => m.ordem - n.ordem)
          .map((q) => ({
            nome: q.nome,
            peso: Number(q.peso),
            ehUsuario: q.eh_usuario,
            contribuicaoCentavos: q.contribuicao_centavos,
          })),
        localCompra: x.local_compra,
        observacao: x.observacao,
      })
    }
    const nomePorAposta = new Map(a.data.map((x) => [x.id, x.modalidades?.nome ?? '']))
    for (const x of p.data) {
      premios.push({
        modalidade: nomePorAposta.get(x.aposta_id) ?? '',
        concurso: x.concursos?.numero ?? null,
        data_sorteio: x.concursos?.data_sorteio ? formatarData(x.concursos.data_sorteio) : null,
        bruto: reais(x.bruto_usuario_centavos),
        ir: reais(x.ir_usuario_centavos),
        liquido: reais(x.liquido_usuario_centavos),
        status: rotulosPremio[x.status],
        prazo_resgate: formatarData(x.prazo_resgate),
        resgatado_em: x.resgatado_em ? formatarData(x.resgatado_em) : null,
        informado_a_mao: x.valor_informado_manual ? 'sim' : 'não',
      })
    }
  }
  apostas.sort((m, n) => ordem.get(m.id)! - ordem.get(n.id)!)

  const linhasApostas = apostasParaLinhas(apostas)
  const resumo = resumoPorModalidadeMes(
    lista.map((l) => ({
      modalidadeNome: l.modalidade_nome ?? '',
      dataAposta: l.data_aposta ?? '',
      gastoCentavos: l.gasto_usuario_centavos ?? 0,
      recuperadoCentavos: l.recuperado_usuario_centavos ?? 0,
    })),
  ).map((r) => ({
    mes: `${r.mes.slice(5, 7)}/${r.mes.slice(0, 4)}`,
    modalidade: r.modalidade,
    apostas: r.apostas,
    gasto: reais(r.gasto),
    recuperado: reais(r.recuperado),
    saldo: reais(r.saldo),
  }))

  return {
    qtdApostas: apostas.length,
    linhasApostas,
    abas: [
      {
        nome: 'Apostas',
        linhas: linhasApostas,
        colunas: COLUNAS_PLANILHA,
        larguras: [7, 12, 11, 9, 13, 12, 30, 11, 13, 10, 8, 10, 24, 24, 11, 16],
      },
      {
        nome: 'Prêmios',
        linhas: premios,
        colunas: COLUNAS_PREMIOS,
        larguras: [12, 9, 12, 12, 10, 12, 11, 13, 12, 15],
      },
      {
        nome: 'Resumo',
        linhas: resumo,
        colunas: COLUNAS_RESUMO,
        larguras: [9, 12, 8, 12, 12, 12],
      },
    ],
  }
}
