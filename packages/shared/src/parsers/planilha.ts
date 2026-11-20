// Importação e exportação de apostas por planilha (seção 11.3, F3.1).
// Puro: recebe as linhas já lidas do arquivo (o SheetJS fica no front) e devolve as
// apostas válidas e os erros por linha. Uma linha por jogo; o `grupo` junta os jogos
// da mesma aposta. O banco valida tudo de novo na RPC importar_apostas.

import { deReais } from '../dinheiro.ts'
import { ehSlugSuportado, normalizarSlug, parseDezenas } from '../regras/index.ts'
import { apostaSchema, type ApostaInput, type ParticipanteInput } from '../schemas/aposta.ts'
import {
  isoParaBr,
  lerData,
  lerInteiro,
  normalizarCabecalho,
  semAcento,
  texto,
  vazio,
} from './comum.ts'

/** Colunas do modelo, na ordem do arquivo. As duas últimas são extras (D24). */
export const COLUNAS_PLANILHA = [
  'grupo',
  'modalidade',
  'tipo',
  'concurso',
  'qtd_concursos',
  'data_aposta',
  'dezenas',
  'total_cotas',
  'cotas_usuario',
  'valor_cota',
  'tarifa',
  'valor_pago',
  'participantes',
  'observacao',
  'numero_cota',
  'local_compra',
] as const

export type ColunaPlanilha = (typeof COLUNAS_PLANILHA)[number]

const OBRIGATORIAS: ColunaPlanilha[] = [
  'grupo',
  'modalidade',
  'tipo',
  'concurso',
  'data_aposta',
  'dezenas',
  'valor_pago',
]

/** Limite da seção 11.3. */
export const LIMITE_LINHAS_PLANILHA = 2000

/** Linha como o leitor de planilha a entrega: { cabeçalho: valor }. */
export type LinhaPlanilha = Record<string, unknown>

export interface ApostaDaPlanilha {
  grupo: string
  /** Linhas do arquivo (numeração da planilha, 1 = cabeçalho). */
  linhas: number[]
  aposta: ApostaInput
}

export interface ErroDaPlanilha {
  linha: number
  grupo: string | null
  mensagem: string
}

export interface ResultadoPlanilha {
  apostas: ApostaDaPlanilha[]
  erros: ErroDaPlanilha[]
  /** Linhas com algum conteúdo (as vazias são ignoradas). */
  totalLinhas: number
}

/** "Linha 7: Mega-Sena aceita de 6 a 20 dezenas; encontradas 5" */
export function textoErroPlanilha(e: ErroDaPlanilha): string {
  return e.linha > 1 ? `Linha ${e.linha}: ${e.mensagem}` : e.mensagem
}

interface LinhaLida {
  numero: number
  celulas: Partial<Record<string, unknown>>
}

/** Primeiro valor não vazio da coluna no grupo (e a linha onde está). */
function primeiro(grupo: LinhaLida[], coluna: ColunaPlanilha): { valor: unknown; linha: number } {
  for (const l of grupo) {
    if (!vazio(l.celulas[coluna])) return { valor: l.celulas[coluna], linha: l.numero }
  }
  return { valor: null, linha: grupo[0]!.numero }
}

function dinheiro(valor: unknown): number | null {
  if (vazio(valor)) return null
  try {
    const c = deReais(typeof valor === 'number' ? valor : texto(valor))
    return c >= 0 ? c : null
  } catch {
    return null
  }
}

const TIPOS = new Map<string, ApostaInput['tipo']>([
  ['simples', 'simples'],
  ['bolao', 'bolao'],
  ['teimosinha', 'teimosinha'],
])

/**
 * "Eu:1; João:1; Ana:2" → participantes. Você é quem se chama "Eu" ou quem termina
 * com "*" ("Rafael*:1"). Peso vazio = 1; aceita "1,5".
 */
export function lerParticipantes(valor: unknown): ParticipanteInput[] | string {
  const t = texto(valor)
  if (!t) return []
  const lista: ParticipanteInput[] = []
  for (const parte of t
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [nomeBruto = '', pesoBruto = ''] = parte.split(':').map((p) => p.trim())
    const marcado = nomeBruto.endsWith('*')
    const nome = marcado ? nomeBruto.slice(0, -1).trim() : nomeBruto
    const peso = pesoBruto ? Number(pesoBruto.replace(',', '.')) : 1
    if (!nome) return `participante sem nome em "${parte}"`
    if (!Number.isFinite(peso) || peso <= 0) return `peso inválido para ${nome} ("${pesoBruto}")`
    lista.push({ nome, peso, ehUsuario: marcado || semAcento(nome) === 'eu' })
  }
  return lista
}

function erro(linha: number, grupo: string | null, mensagem: string): ErroDaPlanilha {
  return { linha, grupo, mensagem }
}

/** Valor para comparar linhas do grupo: "Lotofácil" = "lotofacil", 46306 = "11/10/2026". */
function comparavel(coluna: ColunaPlanilha, valor: unknown): string {
  switch (coluna) {
    case 'modalidade':
      return normalizarSlug(texto(valor))
    case 'tipo':
      return semAcento(texto(valor))
    case 'concurso':
    case 'qtd_concursos':
      return String(lerInteiro(valor) ?? texto(valor))
    case 'data_aposta':
      return lerData(valor) ?? texto(valor)
    default:
      return texto(valor)
  }
}

/** Monta e valida a aposta de um grupo de linhas. */
function lerGrupo(nome: string, grupo: LinhaLida[]): ApostaDaPlanilha | ErroDaPlanilha[] {
  const erros: ErroDaPlanilha[] = []
  const linha1 = grupo[0]!.numero

  // Campos da aposta: o primeiro valor do grupo vale; um valor diferente adiante é erro.
  for (const coluna of [
    'modalidade',
    'tipo',
    'concurso',
    'qtd_concursos',
    'data_aposta',
  ] as const) {
    const base = primeiro(grupo, coluna)
    for (const l of grupo) {
      const v = l.celulas[coluna]
      if (!vazio(v) && comparavel(coluna, v) !== comparavel(coluna, base.valor)) {
        erros.push(
          erro(
            l.numero,
            nome,
            `o grupo ${nome} tem ${coluna.replace('_', ' ')} diferente da linha ${base.linha}`,
          ),
        )
      }
    }
  }

  const modalidadeTexto = texto(primeiro(grupo, 'modalidade').valor)
  const slug = normalizarSlug(modalidadeTexto)
  if (!modalidadeTexto) erros.push(erro(linha1, nome, 'informe a modalidade'))
  else if (!ehSlugSuportado(slug))
    erros.push(erro(linha1, nome, `modalidade não reconhecida: "${modalidadeTexto}"`))

  const tipoTexto = texto(primeiro(grupo, 'tipo').valor)
  const tipo = TIPOS.get(semAcento(tipoTexto))
  if (!tipo)
    erros.push(
      erro(linha1, nome, `tipo inválido: "${tipoTexto}" (use simples, bolao ou teimosinha)`),
    )

  const concursoBruto = primeiro(grupo, 'concurso').valor
  const concurso = lerInteiro(concursoBruto)
  if (!concurso) erros.push(erro(linha1, nome, `concurso inválido: "${texto(concursoBruto)}"`))

  const qtdBruto = primeiro(grupo, 'qtd_concursos').valor
  const qtdConcursos = vazio(qtdBruto) ? 1 : lerInteiro(qtdBruto)
  if (!qtdConcursos)
    erros.push(erro(linha1, nome, `quantidade de concursos inválida: "${texto(qtdBruto)}"`))

  const dataBruta = primeiro(grupo, 'data_aposta').valor
  const dataAposta = lerData(dataBruta)
  if (!dataAposta)
    erros.push(
      erro(linha1, nome, `data da aposta inválida: "${texto(dataBruta)}" (use dd/mm/aaaa)`),
    )

  const valorPago = primeiro(grupo, 'valor_pago')
  const valorPagoCentavos = dinheiro(valorPago.valor)
  if (vazio(valorPago.valor))
    erros.push(erro(linha1, nome, 'informe o valor pago na primeira linha do grupo'))
  else if (valorPagoCentavos === null)
    erros.push(erro(valorPago.linha, nome, `valor pago inválido: "${texto(valorPago.valor)}"`))

  const jogos: number[][] = []
  for (const l of grupo) {
    const t = texto(l.celulas.dezenas)
    if (!t) {
      erros.push(erro(l.numero, nome, 'informe as dezenas do jogo'))
      continue
    }
    const dezenas = parseDezenas(t)
    if (dezenas.some(Number.isNaN)) {
      erros.push(erro(l.numero, nome, `dezenas inválidas: "${t}"`))
      continue
    }
    jogos.push(dezenas)
  }

  let bolao: ApostaInput['bolao'] = null
  if (tipo === 'bolao') {
    const totalCotas = lerInteiro(primeiro(grupo, 'total_cotas').valor)
    const cotasUsuario = lerInteiro(primeiro(grupo, 'cotas_usuario').valor)
    const valorCota = dinheiro(primeiro(grupo, 'valor_cota').valor)
    const tarifaBruta = primeiro(grupo, 'tarifa').valor
    const tarifa = vazio(tarifaBruta) ? 0 : dinheiro(tarifaBruta)
    const numeroBruto = primeiro(grupo, 'numero_cota').valor
    const numeroCota = vazio(numeroBruto) ? null : lerInteiro(numeroBruto)
    if (!totalCotas) erros.push(erro(linha1, nome, 'bolão: informe o total de cotas'))
    if (!cotasUsuario) erros.push(erro(linha1, nome, 'bolão: informe as suas cotas'))
    if (!valorCota) erros.push(erro(linha1, nome, 'bolão: informe o valor da cota'))
    if (tarifa === null) erros.push(erro(linha1, nome, `tarifa inválida: "${texto(tarifaBruta)}"`))
    if (numeroCota === null && !vazio(numeroBruto))
      erros.push(erro(linha1, nome, `número da cota inválido: "${texto(numeroBruto)}"`))
    if (totalCotas && cotasUsuario && valorCota && tarifa !== null) {
      bolao = {
        totalCotas,
        cotasUsuario,
        numeroCota,
        valorCotaCentavos: valorCota,
        tarifaCentavos: tarifa,
      }
    }
  }

  const participantes = lerParticipantes(primeiro(grupo, 'participantes').valor)
  if (typeof participantes === 'string') erros.push(erro(linha1, nome, participantes))

  if (erros.length > 0) return erros

  const entrada = {
    modalidadeSlug: slug,
    tipo,
    concursoInicial: concurso,
    qtdConcursos,
    dataAposta,
    jogos,
    bolao,
    valorPagoCentavos,
    participantes,
    localCompra: texto(primeiro(grupo, 'local_compra').valor) || null,
    observacao: texto(primeiro(grupo, 'observacao').valor) || null,
  }
  const r = apostaSchema.safeParse(entrada)
  if (!r.success) {
    const vistos = new Set<string>()
    for (const issue of r.error.issues) {
      const indiceJogo =
        issue.path[0] === 'jogos' && typeof issue.path[1] === 'number' ? issue.path[1] : null
      const linha = indiceJogo !== null ? (grupo[indiceJogo]?.numero ?? linha1) : linha1
      // No arquivo, cada jogo é uma linha: o "Jogo n:" do formulário sobra.
      const mensagem = issue.message.replace(/^Jogo \d+: /, '')
      const chave = `${linha}|${mensagem}`
      if (!vistos.has(chave)) erros.push(erro(linha, nome, mensagem))
      vistos.add(chave)
    }
    return erros
  }
  return { grupo: nome, linhas: grupo.map((l) => l.numero), aposta: r.data }
}

/**
 * Lê as linhas da aba `Apostas`. Cada linha pode trazer `__rowNum__` (índice 0 da
 * planilha, como o SheetJS entrega); sem ele, conta a partir de `primeiraLinha`.
 */
export function lerPlanilha(
  linhas: LinhaPlanilha[],
  opcoes: { primeiraLinha?: number } = {},
): ResultadoPlanilha {
  const primeiraLinha = opcoes.primeiraLinha ?? 2
  const lidas: LinhaLida[] = []
  const cabecalhos = new Set<string>()
  linhas.forEach((bruta, i) => {
    const celulas: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(bruta)) {
      if (k.startsWith('__')) continue
      const c = normalizarCabecalho(k)
      cabecalhos.add(c)
      celulas[c] = v
    }
    if (Object.values(celulas).every(vazio)) return
    const rowNum = (bruta as { __rowNum__?: unknown }).__rowNum__
    lidas.push({ numero: typeof rowNum === 'number' ? rowNum + 1 : primeiraLinha + i, celulas })
  })

  if (lidas.length === 0) {
    return {
      apostas: [],
      erros: [erro(1, null, 'A planilha não tem nenhuma aposta.')],
      totalLinhas: 0,
    }
  }
  if (lidas.length > LIMITE_LINHAS_PLANILHA) {
    return {
      apostas: [],
      erros: [
        erro(
          1,
          null,
          `A planilha tem ${lidas.length} linhas; o limite é ${LIMITE_LINHAS_PLANILHA.toLocaleString('pt-BR')} por arquivo.`,
        ),
      ],
      totalLinhas: lidas.length,
    }
  }
  const faltando = OBRIGATORIAS.filter((c) => !cabecalhos.has(c))
  if (faltando.length > 0) {
    return {
      apostas: [],
      erros: [erro(1, null, `Faltam colunas obrigatórias: ${faltando.join(', ')}. Use o modelo.`)],
      totalLinhas: lidas.length,
    }
  }

  // Agrupa na ordem em que cada grupo aparece pela primeira vez.
  const grupos = new Map<string, LinhaLida[]>()
  const erros: ErroDaPlanilha[] = []
  for (const l of lidas) {
    const nome = texto(l.celulas.grupo)
    if (!nome) {
      erros.push(erro(l.numero, null, 'informe o grupo (linhas do mesmo grupo formam uma aposta)'))
      continue
    }
    grupos.set(nome, [...(grupos.get(nome) ?? []), l])
  }

  const apostas: ApostaDaPlanilha[] = []
  for (const [nome, grupo] of grupos) {
    const r = lerGrupo(nome, grupo)
    if (Array.isArray(r)) erros.push(...r)
    else apostas.push(r)
  }
  erros.sort((a, b) => a.linha - b.linha)
  return { apostas, erros, totalLinhas: lidas.length }
}

/**
 * Identidade de uma aposta para achar duplicatas (seção 11.3): mesma modalidade,
 * mesmo concurso e mesmos jogos, em qualquer ordem.
 */
export function assinaturaAposta(a: {
  modalidadeSlug: string
  concursoInicial: number
  jogos: number[][]
}): string {
  const jogos = a.jogos.map((j) => [...j].sort((x, y) => x - y).join('-')).sort()
  return `${a.modalidadeSlug}|${a.concursoInicial}|${jogos.join('/')}`
}

// ---------------------------------------------------------------------------
// Exportação (F3.4): o mesmo formato do modelo, para o arquivo ser reimportável.
// ---------------------------------------------------------------------------

export interface ApostaParaExportar {
  modalidadeSlug: string
  modalidadeNome: string
  tipo: ApostaInput['tipo']
  concursoInicial: number
  qtdConcursos: number
  /** aaaa-mm-dd */
  dataAposta: string
  jogos: number[][]
  bolao: ApostaInput['bolao']
  valorPagoCentavos: number
  participantes: { nome: string; peso: number; ehUsuario: boolean }[]
  localCompra: string | null
  observacao: string | null
}

export type CelulaExportada = string | number | null

const reais = (centavos: number) => centavos / 100

function formatarPeso(peso: number) {
  return String(peso).replace('.', ',')
}

/** Duas casas sempre, como no volante (a Lotomania vai de 00 a 99). */
function formatarDezenas(dezenas: number[]) {
  return [...dezenas]
    .sort((a, b) => a - b)
    .map((d) => String(d).padStart(2, '0'))
    .join(' ')
}

/**
 * Apostas → linhas da aba `Apostas` (uma por jogo). Os campos da aposta vão em todas
 * as linhas do grupo; valor pago, valores do bolão, participantes e observação só na 1ª.
 */
export function apostasParaLinhas(
  apostas: ApostaParaExportar[],
): Record<ColunaPlanilha, CelulaExportada>[] {
  const linhas: Record<ColunaPlanilha, CelulaExportada>[] = []
  apostas.forEach((a, i) => {
    const grupo = `A${i + 1}`
    a.jogos.forEach((jogo, j) => {
      const primeira = j === 0
      linhas.push({
        grupo,
        modalidade: a.modalidadeNome,
        tipo: a.tipo,
        concurso: a.concursoInicial,
        qtd_concursos: a.qtdConcursos,
        data_aposta: isoParaBr(a.dataAposta),
        dezenas: formatarDezenas(jogo),
        total_cotas: a.bolao?.totalCotas ?? null,
        cotas_usuario: a.bolao?.cotasUsuario ?? null,
        valor_cota: primeira && a.bolao ? reais(a.bolao.valorCotaCentavos) : null,
        tarifa: primeira && a.bolao ? reais(a.bolao.tarifaCentavos) : null,
        valor_pago: primeira ? reais(a.valorPagoCentavos) : null,
        participantes:
          primeira && a.participantes.length > 0
            ? a.participantes
                .map((p) => {
                  const nome = p.ehUsuario && semAcento(p.nome) !== 'eu' ? `${p.nome}*` : p.nome
                  return `${nome}:${formatarPeso(p.peso)}`
                })
                .join('; ')
            : null,
        observacao: primeira ? a.observacao : null,
        numero_cota: a.bolao?.numeroCota ?? null,
        local_compra: primeira ? a.localCompra : null,
      })
    })
  })
  return linhas
}

export interface LinhaResumo {
  modalidadeNome: string
  /** aaaa-mm-dd */
  dataAposta: string
  gastoCentavos: number
  recuperadoCentavos: number
}

/** Aba `Resumo`: totais por modalidade e mês (aaaa-mm), mais recente primeiro. */
export function resumoPorModalidadeMes(linhas: LinhaResumo[]) {
  const mapa = new Map<
    string,
    { mes: string; modalidade: string; apostas: number; gasto: number; recuperado: number }
  >()
  for (const l of linhas) {
    const mes = l.dataAposta.slice(0, 7)
    const chave = `${mes}|${l.modalidadeNome}`
    const atual = mapa.get(chave) ?? {
      mes,
      modalidade: l.modalidadeNome,
      apostas: 0,
      gasto: 0,
      recuperado: 0,
    }
    atual.apostas++
    atual.gasto += l.gastoCentavos
    atual.recuperado += l.recuperadoCentavos
    mapa.set(chave, atual)
  }
  return [...mapa.values()]
    .sort((a, b) => b.mes.localeCompare(a.mes) || a.modalidade.localeCompare(b.modalidade, 'pt-BR'))
    .map((r) => ({ ...r, saldo: r.recuperado - r.gasto }))
}
