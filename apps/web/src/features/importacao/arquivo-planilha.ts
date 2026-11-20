// Leitura e geração de planilhas no navegador (seção 11.3). O SheetJS é pesado:
// só é baixado quando o usuário escolhe um arquivo ou pede um download (import()).
// O arquivo nunca sai do aparelho; só as apostas revisadas vão ao banco.

import { normalizarCabecalho } from '@shared/parsers/comum.ts'
import { COLUNAS_PLANILHA, type LinhaPlanilha } from '@shared/parsers/planilha.ts'

import { paraCsv } from './csv'

const carregarXlsx = () => import('xlsx')

export const TIPOS_ACEITOS = '.xlsx,.xls,.csv'
/** 5 MB cobrem com folga 2.000 linhas; acima disso é outro arquivo. */
export const TAMANHO_MAXIMO = 5 * 1024 * 1024

/** CSV salvo pelo Excel em português costuma vir em Windows-1252, não em UTF-8. */
function decodificarTexto(bytes: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/**
 * Linhas da aba `Apostas` (ou da primeira aba). Valores crus: datas do Excel chegam
 * como número de série e textos ficam como estão; quem interpreta é o parser.
 */
export async function lerArquivoPlanilha(arquivo: File): Promise<LinhaPlanilha[]> {
  if (arquivo.size > TAMANHO_MAXIMO) throw new Error('O arquivo passa de 5 MB.')
  const XLSX = await carregarXlsx()
  const bytes = await arquivo.arrayBuffer()
  const ehCsv = /\.csv$/i.test(arquivo.name) || arquivo.type === 'text/csv'
  let livro
  try {
    livro = ehCsv
      ? // raw: sem isso o SheetJS lê "11/10/2026" como 10 de novembro (formato americano).
        XLSX.read(decodificarTexto(bytes), { type: 'string', raw: true })
      : XLSX.read(bytes, { type: 'array' })
  } catch {
    throw new Error('Não foi possível ler o arquivo. Use .xlsx ou .csv no formato do modelo.')
  }
  const aba =
    livro.SheetNames.find((n) => normalizarCabecalho(n) === 'apostas') ?? livro.SheetNames[0]
  const planilha = aba ? livro.Sheets[aba] : undefined
  if (!planilha) return []
  return XLSX.utils.sheet_to_json<LinhaPlanilha>(planilha, { defval: null, raw: true })
}

export interface AbaParaExportar {
  nome: string
  linhas: Record<string, string | number | null>[]
  /** Ordem das colunas (o padrão é a ordem das chaves da 1ª linha). */
  colunas?: readonly string[]
  /** Largura das colunas em caracteres. */
  larguras?: number[]
}

/** Gera e baixa um .xlsx com as abas informadas. */
export async function baixarXlsx(nomeArquivo: string, abas: AbaParaExportar[]) {
  const XLSX = await carregarXlsx()
  const livro = XLSX.utils.book_new()
  for (const aba of abas) {
    const planilha = XLSX.utils.json_to_sheet(aba.linhas, {
      header: aba.colunas ? [...aba.colunas] : undefined,
    })
    // Aba vazia ainda mostra o cabeçalho (o modelo e exportações sem prêmios).
    if (aba.linhas.length === 0 && aba.colunas) {
      XLSX.utils.sheet_add_aoa(planilha, [[...aba.colunas]])
    }
    if (aba.larguras) planilha['!cols'] = aba.larguras.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(livro, planilha, aba.nome)
  }
  XLSX.writeFile(livro, nomeArquivo, { compression: true })
}

const BOM = String.fromCharCode(0xfeff)

/** Baixa um CSV separado por ";" e com BOM, como o Excel em português espera. */
export function baixarCsv(
  nomeArquivo: string,
  linhas: Record<string, string | number | null>[],
  colunas: readonly string[],
) {
  const blob = new Blob([BOM, paraCsv(linhas, colunas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const LARGURAS_MODELO = [7, 12, 11, 9, 13, 12, 30, 11, 13, 10, 8, 10, 24, 24, 11, 16]

/** Linhas de exemplo do modelo: um bolão com 2 jogos e uma aposta simples. */
const EXEMPLOS: Record<string, string | number | null>[] = [
  {
    grupo: 'A1',
    modalidade: 'Mega-Sena',
    tipo: 'bolao',
    concurso: 3070,
    qtd_concursos: 1,
    data_aposta: '11/10/2026',
    dezenas: '02 09 24 28 44 48 49',
    total_cotas: 38,
    cotas_usuario: 1,
    valor_cota: 8.84,
    tarifa: 3.09,
    valor_pago: 11.93,
    participantes: 'Eu:1; João:1',
    observacao: 'Bolão da lotérica',
    numero_cota: 35,
    local_compra: 'Lotérica Centro',
  },
  { grupo: 'A1', dezenas: '02 06 28 41 44 49 53' },
  {
    grupo: 'A2',
    modalidade: 'Lotofácil',
    tipo: 'simples',
    concurso: 3500,
    data_aposta: '12/10/2026',
    dezenas: '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15',
    valor_pago: 3.5,
  },
]

const INSTRUCOES = [
  ['Como preencher (uma linha por jogo)'],
  ['grupo', 'Obrigatório. Linhas com o mesmo grupo formam uma aposta (ex.: os jogos de um bolão).'],
  [
    'modalidade',
    'Obrigatório. Mega-Sena, Lotofácil, Quina ou Lotomania (acento e maiúscula não importam).',
  ],
  ['tipo', 'Obrigatório. simples, bolao ou teimosinha.'],
  ['concurso', 'Obrigatório. Número do concurso (o primeiro, na teimosinha).'],
  ['qtd_concursos', 'Opcional. Só para a teimosinha; o padrão é 1.'],
  ['data_aposta', 'Obrigatório. dd/mm/aaaa ou data do Excel.'],
  ['dezenas', 'Obrigatório. Separadas por espaço, vírgula, ponto e vírgula, hífen ou |.'],
  ['total_cotas, cotas_usuario, valor_cota', 'Obrigatórios no bolão.'],
  ['tarifa', 'Opcional (bolão). Tarifa de serviço da cota.'],
  ['valor_pago', 'Obrigatório na 1ª linha do grupo; nas outras pode ficar vazio.'],
  [
    'participantes',
    'Opcional. nome:peso separados por ";". Você é "Eu" ou o nome com * (ex.: Rafael*:1).',
  ],
  ['observacao, numero_cota, local_compra', 'Opcionais.'],
  [''],
  ['Valores em reais: 11,93 ou 11.93. Até 2.000 linhas por arquivo. A aba lida é "Apostas".'],
]

/** modelo-apostas.xlsx: aba Apostas (com exemplos) e aba Instruções. */
export async function baixarModelo() {
  const XLSX = await carregarXlsx()
  const livro = XLSX.utils.book_new()
  const apostas = XLSX.utils.json_to_sheet(EXEMPLOS, { header: [...COLUNAS_PLANILHA] })
  apostas['!cols'] = LARGURAS_MODELO.map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(livro, apostas, 'Apostas')
  const instrucoes = XLSX.utils.aoa_to_sheet(INSTRUCOES)
  instrucoes['!cols'] = [{ wch: 38 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(livro, instrucoes, 'Instruções')
  XLSX.writeFile(livro, 'modelo-apostas.xlsx', { compression: true })
}
