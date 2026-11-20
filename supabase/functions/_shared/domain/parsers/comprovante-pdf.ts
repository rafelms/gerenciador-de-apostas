// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
// Comprovante de Aposta Bolão do app Loterias CAIXA (seção 11.4 e Apêndice A, F3.5).
// Entrada: o texto que o pdf.js extrai. Saída: só os dados da aposta. Nome, CPF,
// código do lotérico e terminal nunca são lidos; o código do recibo sai apenas como
// SHA-256 (para achar duplicatas), nunca puro.

import { tarifaDentroDoLimite, totalBolao, valorCotaConfere } from '../aposta.ts'
import { deReais } from '../dinheiro.ts'
import { ehSlugSuportado, normalizarSlug, obterRegra } from '../regras/index.ts'
import type { ApostaInput } from '../schemas/aposta.ts'
import { isoParaBr, lerData } from './comum.ts'

export interface Comprovante {
  tipo: 'bolao' | 'simples'
  modalidadeSlug: string
  concurso: number | null
  dataSorteio: string | null
  /** Data em que o usuário pagou: vira a data da aposta. */
  dataCompra: string | null
  horaCompra: string | null
  /** "Data da aposta" do recibo: quando a lotérica registrou o bolão. */
  dataApostaRecibo: string | null
  canal: string | null
  valorTotalCentavos: number | null
  valorCotaCentavos: number | null
  tarifaCentavos: number | null
  bolaoNumeroCota: number | null
  bolaoTotalCotas: number | null
  bolaoCotasUsuario: number | null
  jogos: number[][]
  /** SHA-256 (hex minúsculo) do código do recibo; null se o código não foi achado. */
  codigoReciboHash: string | null
  /** Não impedem salvar; o usuário revisa. */
  avisos: string[]
  /** Impedem salvar até o usuário corrigir na revisão. */
  erros: string[]
}

export interface OpcoesComprovante {
  /** Preço da aposta simples vigente na data (para conferir o valor da cota). */
  precoSimples?: (slug: string, dataIso: string) => number | null
}

/** Rótulos que o pdf.js costuma quebrar em duas linhas. */
const ROTULOS_QUEBRADOS: [RegExp, string][] = [
  [/Valor total da\s*\n\s*aposta:/gi, 'Valor total da aposta:'],
  [/Valor tarifa de\s*\n\s*servi([cç])o:/gi, 'Valor tarifa de servi$1o:'],
  [/Valor da\s*\n\s*cota:/gi, 'Valor da cota:'],
  [/Data do\s*\n\s*sorteio:/gi, 'Data do sorteio:'],
  [/Data da\s*\n\s*compra:/gi, 'Data da compra:'],
]

/** NFC, espaço comum no lugar do não separável, espaços colapsados por linha, rótulos inteiros. */
export function normalizarTextoComprovante(texto: string): string {
  let t = texto
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  for (const [de, para] of ROTULOS_QUEBRADOS) t = t.replace(de, para)
  return t
}

const DATA = String.raw`(\d{2}\/\d{2}\/\d{4})`
const VALOR = String.raw`R\$\s*([\d.]+,\d{2})`

function capturar(texto: string, regex: RegExp): string | null {
  return regex.exec(texto)?.[1]?.trim() ?? null
}

function centavos(valor: string | null): number | null {
  if (!valor) return null
  try {
    return deReais(valor)
  } catch {
    return null
  }
}

function inteiro(valor: string | undefined | null): number | null {
  return valor && /^\d+$/.test(valor) ? Number(valor) : null
}

async function sha256(texto: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const reais = (c: number) =>
  `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Lê o comprovante (Apêndice A.2) e aplica as validações do Apêndice A.3. */
export async function parseComprovante(
  textoBruto: string,
  opcoes: OpcoesComprovante = {},
): Promise<Comprovante> {
  const texto = normalizarTextoComprovante(textoBruto)
  const avisos: string[] = []
  const erros: string[] = []

  // Título: "Comprovante de Aposta Bolão Mega-Sena". Em texto de uma linha só, o nome
  // da modalidade termina onde começa o próximo rótulo.
  const titulo = /Comprovante de Aposta\s+(Bol[aã]o\s+)?(.+?)(?=\s+Nome:|\s*$)/imu.exec(texto)
  const tipo = titulo?.[1] ? 'bolao' : 'simples'
  const modalidadeCampo = capturar(
    texto,
    /Modalidade:\s*(.+?)(?=\s+Terminal aposta:|\s+Cota:|\s*$)/imu,
  )
  const modalidadeNome = modalidadeCampo ?? titulo?.[2]?.trim() ?? ''
  const modalidadeSlug = normalizarSlug(modalidadeNome)

  const concurso = inteiro(capturar(texto, /Concurso:\s*(\d+)/i))
  const cota = /Cota:\s*(\d+)\s*\/\s*(\d+)/i.exec(texto)
  const recibo = /PARTICIPA COM\s+(\d+)\s+COTAS?\s+DO TOTAL DE\s+(\d+)\s+COTAS/i.exec(texto)
  const bolaoNumeroCota = inteiro(cota?.[1])
  const bolaoTotalCotas = inteiro(recibo?.[2]) ?? inteiro(cota?.[2])
  const bolaoCotasUsuario = inteiro(recibo?.[1])

  const valorTotalCentavos = centavos(
    capturar(texto, new RegExp(`Valor total da aposta:\\s*${VALOR}`, 'i')),
  )
  const valorCotaCentavos = centavos(capturar(texto, new RegExp(`Valor da cota:\\s*${VALOR}`, 'i')))
  const tarifaCentavos = centavos(
    capturar(texto, new RegExp(`Valor tarifa de servi[cç]o:\\s*${VALOR}`, 'iu')),
  )
  const dataApostaRecibo = lerData(capturar(texto, new RegExp(`Data da aposta:\\s*${DATA}`, 'i')))
  const dataCompra = lerData(capturar(texto, new RegExp(`Data da compra:\\s*${DATA}`, 'i')))
  const dataSorteio = lerData(capturar(texto, new RegExp(`Data do sorteio:\\s*${DATA}`, 'i')))
  const horaCompra = capturar(texto, /Hora da compra:\s*(\d{2}:\d{2}:\d{2})/i)
  const canal = capturar(texto, /Subcanal da compra:\s*(\S+)/i)

  // Jogos em ordem do número; um jogo repetido (cabeçalho de página) vale uma vez.
  const porNumero = new Map<number, number[]>()
  for (const m of texto.matchAll(/Jogo\s+(\d+)\s+((?:\d{1,2}\s*\|\s*)+\d{1,2})/g)) {
    const n = Number(m[1])
    if (!porNumero.has(n))
      porNumero.set(
        n,
        m[2]!
          .split('|')
          .map((d) => Number.parseInt(d.trim(), 10))
          .sort((a, b) => a - b),
      )
  }
  const jogos = [...porNumero.entries()].sort(([a], [b]) => a - b).map(([, j]) => j)

  const codigo = capturar(texto, /(?:^|\s)([0-9A-F]{32,40})(?=\s|$)/m)
  const codigoReciboHash = codigo ? await sha256(codigo) : null

  // --- Validações (Apêndice A.3) ---------------------------------------------
  if (!titulo) erros.push('Não parece um comprovante de aposta das Loterias CAIXA.')
  else if (tipo !== 'bolao')
    erros.push(
      'Por enquanto só o comprovante de bolão é lido. Registre esta aposta pelo formulário.',
    )
  const suportada = ehSlugSuportado(modalidadeSlug)
  if (!suportada)
    erros.push(
      modalidadeNome
        ? `Modalidade não suportada: ${modalidadeNome}.`
        : 'Não encontrei a modalidade no comprovante.',
    )
  if (!concurso) erros.push('Não encontrei o número do concurso.')

  if (jogos.length === 0) erros.push('Não encontrei nenhum jogo no comprovante.')
  else if (new Set(jogos.map((j) => j.length)).size > 1)
    erros.push('No bolão, todos os jogos têm a mesma quantidade de dezenas.')
  if (suportada) {
    const regra = obterRegra(modalidadeSlug)
    jogos.forEach((jogo, i) => {
      for (const e of regra.validarJogo(jogo)) erros.push(`Jogo ${i + 1}: ${e}`)
    })
  }

  if (valorTotalCentavos === null) erros.push('Não encontrei o valor total da aposta.')
  if (valorCotaCentavos === null) erros.push('Não encontrei o valor da cota.')
  if (tarifaCentavos === null) erros.push('Não encontrei a tarifa de serviço.')
  if (!dataCompra) erros.push('Não encontrei a data da compra.')
  if (!bolaoTotalCotas) erros.push('Não encontrei o total de cotas do bolão.')
  if (!bolaoCotasUsuario) erros.push('Não encontrei quantas cotas este recibo tem.')

  if (valorTotalCentavos !== null && valorCotaCentavos !== null && tarifaCentavos !== null) {
    const esperado = totalBolao(bolaoCotasUsuario ?? 1, valorCotaCentavos, tarifaCentavos)
    if (Math.abs(esperado - valorTotalCentavos) > 1)
      erros.push(
        `O valor total (${reais(valorTotalCentavos)}) não é a soma da cota com a tarifa (${reais(esperado)}).`,
      )
    if (!tarifaDentroDoLimite(tarifaCentavos, valorCotaCentavos))
      avisos.push('A tarifa de serviço passa de 35% do valor da cota.')
  }
  if (bolaoTotalCotas) {
    if (bolaoCotasUsuario && bolaoCotasUsuario > bolaoTotalCotas)
      erros.push('O recibo tem mais cotas que o total do bolão.')
    if (bolaoNumeroCota && bolaoNumeroCota > bolaoTotalCotas)
      erros.push('O número da cota passa do total de cotas.')
    const preco =
      suportada && dataCompra ? (opcoes.precoSimples?.(modalidadeSlug, dataCompra) ?? null) : null
    if (
      preco !== null &&
      valorCotaCentavos !== null &&
      jogos.length > 0 &&
      !valorCotaConfere(
        obterRegra(modalidadeSlug),
        jogos,
        preco,
        valorCotaCentavos,
        bolaoTotalCotas,
      )
    )
      avisos.push('O valor da cota não bate com o preço vigente da modalidade.')
  }
  if (dataSorteio && dataCompra && dataSorteio < dataCompra)
    avisos.push('A data do sorteio é anterior à data da compra.')

  return {
    tipo,
    modalidadeSlug,
    concurso,
    dataSorteio,
    dataCompra,
    horaCompra,
    dataApostaRecibo,
    canal,
    valorTotalCentavos,
    valorCotaCentavos,
    tarifaCentavos,
    bolaoNumeroCota,
    bolaoTotalCotas,
    bolaoCotasUsuario,
    jogos,
    codigoReciboHash,
    avisos,
    erros,
  }
}

/**
 * Comprovante revisado → aposta (seção 11.4, mapeamento): data da aposta = data da
 * compra; valor pago = total do recibo; a data de registro do bolão vai na observação.
 * O schema valida tudo de novo antes de salvar.
 */
export function comprovanteParaAposta(c: Comprovante): ApostaInput {
  const observacao = c.dataApostaRecibo
    ? `Bolão registrado pela lotérica em ${isoParaBr(c.dataApostaRecibo)}.`
    : null
  return {
    modalidadeSlug: c.modalidadeSlug as ApostaInput['modalidadeSlug'],
    tipo: 'bolao',
    concursoInicial: c.concurso ?? 0,
    qtdConcursos: 1,
    dataAposta: c.dataCompra ?? '',
    jogos: c.jogos,
    bolao: {
      totalCotas: c.bolaoTotalCotas ?? 0,
      cotasUsuario: c.bolaoCotasUsuario ?? 0,
      numeroCota: c.bolaoNumeroCota,
      valorCotaCentavos: c.valorCotaCentavos ?? 0,
      tarifaCentavos: c.tarifaCentavos ?? 0,
    },
    valorPagoCentavos: c.valorTotalCentavos ?? 0,
    participantes: [],
    localCompra: c.canal ? `App Loterias CAIXA (${c.canal})` : null,
    observacao,
  }
}
