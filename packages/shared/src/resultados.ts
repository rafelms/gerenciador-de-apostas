import { z } from 'zod'

import type { FaixaRateio } from './conferencia.ts'
import { deReais, type Centavos } from './dinheiro.ts'
import type { RegraModalidade } from './regras/tipos.ts'

// Normalizador ISOLADO da API pública (não oficial) do portal de loterias da CAIXA
// (seção 17: se a API mudar, só este arquivo muda). Formato confirmado com chamadas
// reais em 21/10/2026 (Apêndice B):
//   GET https://servicebus2.caixa.gov.br/portaldeloterias/api/{slug}           → último concurso
//   GET https://servicebus2.caixa.gov.br/portaldeloterias/api/{slug}/{numero}  → concurso específico
//   Concurso inexistente responde HTTP 500 com { exceptionMessage }.

export const URL_API_CAIXA = 'https://servicebus2.caixa.gov.br/portaldeloterias/api'

const dataBR = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/)

const faixaApiSchema = z.object({
  descricaoFaixa: z.string(),
  /** Índice da faixa (1 = prêmio máximo), NÃO o número de acertos. */
  faixa: z.number().int(),
  numeroDeGanhadores: z.number().int().nonnegative(),
  /** Em reais, como número ("38295.72"). */
  valorPremio: z.number().nonnegative(),
})

export const respostaApiCaixaSchema = z.object({
  numero: z.number().int().positive(),
  dataApuracao: dataBR,
  listaDezenas: z.array(z.string()).nullable(),
  listaRateioPremio: z.array(faixaApiSchema).nullable(),
  acumulado: z.boolean().nullable().optional(),
  dataProximoConcurso: dataBR.nullable().optional().catch(null),
  valorEstimadoProximoConcurso: z.number().nonnegative().nullable().optional(),
})

export interface ConcursoNormalizado {
  numero: number
  /** ISO aaaa-mm-dd */
  dataSorteio: string
  /** null = ainda sem dezenas publicadas */
  dezenas: number[] | null
  rateio: FaixaRateio[]
  acumulado: boolean | null
  dataProximo: string | null
  valorEstimadoProximoCentavos: Centavos | null
}

/** "14/10/2026" → "2026-10-14" */
export function dataBrParaIso(data: string): string {
  const [dia, mes, ano] = data.split('/')
  return `${ano}-${mes}-${dia}`
}

/**
 * Resposta da API → formato da tabela `concursos`. Lança erro se a resposta não
 * tiver o formato esperado ou se as dezenas não forem válidas para a modalidade.
 */
export function normalizarConcursoCaixa(
  json: unknown,
  regra: RegraModalidade,
): ConcursoNormalizado {
  const r = respostaApiCaixaSchema.parse(json)

  let dezenas: number[] | null = null
  if (r.listaDezenas && r.listaDezenas.length > 0) {
    dezenas = r.listaDezenas.map((d) => Number.parseInt(d, 10)).sort((a, b) => a - b)
    const invalidas = dezenas.some(
      (d) => !Number.isInteger(d) || d < regra.universoMin || d > regra.universoMax,
    )
    if (
      invalidas ||
      new Set(dezenas).size !== regra.qtdSorteadas ||
      dezenas.length !== regra.qtdSorteadas
    ) {
      throw new Error(`Dezenas inesperadas para ${regra.nome} no concurso ${r.numero}`)
    }
  }

  // A faixa vem como índice; os acertos estão na descrição ("5 acertos"). Sem número
  // na descrição, usamos a ordem das faixas da modalidade (1 = maior faixa).
  const rateio: FaixaRateio[] = []
  for (const f of r.listaRateioPremio ?? []) {
    const daDescricao = /(\d+)\s*acertos?/i.exec(f.descricaoFaixa)?.[1]
    const acertos = daDescricao ? Number(daDescricao) : regra.faixas[f.faixa - 1]?.acertos
    if (acertos === undefined || !regra.faixas.some((fx) => fx.acertos === acertos)) continue
    rateio.push({
      acertos,
      ganhadores: f.numeroDeGanhadores,
      valorCentavos: deReais(f.valorPremio),
    })
  }
  rateio.sort((a, b) => b.acertos - a.acertos)

  return {
    numero: r.numero,
    dataSorteio: dataBrParaIso(r.dataApuracao),
    dezenas,
    rateio,
    acumulado: r.acumulado ?? null,
    dataProximo: r.dataProximoConcurso ? dataBrParaIso(r.dataProximoConcurso) : null,
    valorEstimadoProximoCentavos:
      r.valorEstimadoProximoConcurso === null || r.valorEstimadoProximoConcurso === undefined
        ? null
        : deReais(r.valorEstimadoProximoConcurso),
  }
}

// ---------------------------------------------------------------------------
// Fonte ALTERNATIVA (pendência P4): API comunitária de código aberto que espelha a da
// CAIXA, usada quando a CAIXA bloqueia a nuvem. Formato conferido em 22/10/2026:
//   GET https://loteriascaixa-api.herokuapp.com/api/{slug}/latest    → último concurso
//   GET https://loteriascaixa-api.herokuapp.com/api/{slug}/{numero}  → concurso específico
//   Concurso inexistente responde HTTP 404.
// ---------------------------------------------------------------------------
export const URL_API_ALTERNATIVA = 'https://loteriascaixa-api.herokuapp.com/api'

const respostaAlternativaSchema = z.object({
  concurso: z.number().int().positive(),
  data: dataBR,
  dezenas: z.array(z.string()).nullable(),
  premiacoes: z
    .array(
      z.object({
        descricao: z.string(),
        faixa: z.number().int(),
        ganhadores: z.number().int().nonnegative(),
        valorPremio: z.number().nonnegative(),
      }),
    )
    .nullable(),
  acumulou: z.boolean().nullable().optional(),
  dataProximoConcurso: dataBR.nullable().optional().catch(null),
  valorEstimadoProximoConcurso: z.number().nonnegative().nullable().optional(),
})

/**
 * Resposta da API alternativa → formato da CAIXA → mesma normalização (e as mesmas
 * validações de dezenas e faixas) de `normalizarConcursoCaixa`.
 */
export function normalizarConcursoAlternativo(
  json: unknown,
  regra: RegraModalidade,
): ConcursoNormalizado {
  const r = respostaAlternativaSchema.parse(json)
  return normalizarConcursoCaixa(
    {
      numero: r.concurso,
      dataApuracao: r.data,
      listaDezenas: r.dezenas,
      listaRateioPremio:
        r.premiacoes?.map((p) => ({
          descricaoFaixa: p.descricao,
          faixa: p.faixa,
          numeroDeGanhadores: p.ganhadores,
          valorPremio: p.valorPremio,
        })) ?? null,
      acumulado: r.acumulou ?? null,
      dataProximoConcurso: r.dataProximoConcurso ?? null,
      valorEstimadoProximoConcurso: r.valorEstimadoProximoConcurso ?? null,
    },
    regra,
  )
}

// ---------------------------------------------------------------------------
// Rateio no banco (concursos.rateio, jsonb snake_case):
//   [{ "acertos": 6, "ganhadores": 0, "valor_centavos": 0 }, ...]
// ---------------------------------------------------------------------------
const faixaBancoSchema = z.object({
  acertos: z.number().int(),
  ganhadores: z.number().int().nonnegative(),
  valor_centavos: z.number().int().nonnegative(),
})

/** jsonb do banco → FaixaRateio[]. Ausente ou inválido → lista vazia (prêmio sem valor). */
export function rateioDoBanco(json: unknown): FaixaRateio[] {
  const r = z.array(faixaBancoSchema).safeParse(json)
  if (!r.success) return []
  return r.data.map((f) => ({
    acertos: f.acertos,
    ganhadores: f.ganhadores,
    valorCentavos: f.valor_centavos,
  }))
}

export function rateioParaBanco(
  rateio: FaixaRateio[],
): { acertos: number; ganhadores: number; valor_centavos: number }[] {
  return rateio.map((f) => ({
    acertos: f.acertos,
    ganhadores: f.ganhadores,
    valor_centavos: f.valorCentavos,
  }))
}
