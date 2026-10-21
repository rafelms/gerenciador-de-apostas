import { z } from 'zod'

import { obterRegra } from '../regras/index.ts'
import { slugModalidadeSchema } from './aposta.ts'

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const centavos = z.number().int('Valor inválido.').nonnegative('O valor não pode ser negativo.')

export const faixaRateioSchema = z.object({
  acertos: z.number().int(),
  ganhadores: z.number().int().nonnegative('Ganhadores não pode ser negativo.'),
  valorCentavos: centavos,
})

/**
 * Resultado lançado à mão quando a API da CAIXA não responde (seção 11.5): pelo admin,
 * ou por um usuário para o concurso da própria aposta (não oficial). O rateio é
 * opcional: sem ele, as apostas premiadas ficam com o valor a informar.
 */
export const resultadoManualSchema = z
  .object({
    modalidadeSlug: slugModalidadeSchema,
    numero: z.number().int().positive('Informe o número do concurso.'),
    dataSorteio: dataIso,
    dezenas: z.array(z.number().int()),
    rateio: z.array(faixaRateioSchema).max(20),
    acumulado: z.boolean().nullable(),
  })
  .superRefine((r, ctx) => {
    const regra = obterRegra(r.modalidadeSlug)
    const unicas = new Set(r.dezenas)
    if (r.dezenas.length !== regra.qtdSorteadas || unicas.size !== r.dezenas.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['dezenas'],
        message: `${regra.nome} sorteia ${regra.qtdSorteadas} dezenas diferentes; informadas ${unicas.size}.`,
      })
    }
    if (r.dezenas.some((d) => d < regra.universoMin || d > regra.universoMax)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dezenas'],
        message: `As dezenas vão de ${regra.universoMin} a ${regra.universoMax}.`,
      })
    }
    const acertosValidos = new Set(regra.faixas.map((f) => f.acertos))
    const vistos = new Set<number>()
    r.rateio.forEach((f, i) => {
      if (!acertosValidos.has(f.acertos) || vistos.has(f.acertos)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rateio', i],
          message: `Faixa de ${f.acertos} acertos inválida ou repetida.`,
        })
      }
      vistos.add(f.acertos)
    })
  })

export type ResultadoManualInput = z.infer<typeof resultadoManualSchema>

/** Configurações globais editáveis pelo admin (seção 11.6). */
export const configuracoesSchema = z.object({
  aliquotaIrBps: z.number().int().min(0, 'Mínimo de 0%.').max(10_000, 'Máximo de 100%.'),
  limiteIsencaoIrCentavos: centavos,
  baseCalculoIr: z.enum(['cota', 'aposta']),
  valorRateioApiEh: z.enum(['bruto', 'liquido']),
  prazoResgateDias: z.number().int().min(1, 'Pelo menos 1 dia.').max(3650, 'Máximo de 3650 dias.'),
})

export type ConfiguracoesInput = z.infer<typeof configuracoesSchema>

/** Novo preço de aposta simples com vigência (a CAIXA reajusta periodicamente). */
export const novoPrecoSchema = z.object({
  modalidadeSlug: slugModalidadeSchema,
  precoSimplesCentavos: z.number().int().positive('Informe o preço.'),
  vigenteDesde: dataIso,
})

/**
 * Prêmio informado pelo usuário (seção 11.5), útil para faixas sem rateio disponível
 * ou quando o valor recebido difere do calculado. Valores da PARTE do usuário.
 */
export const premioManualSchema = z
  .object({
    brutoUsuarioCentavos: centavos,
    irUsuarioCentavos: centavos,
  })
  .refine((p) => p.irUsuarioCentavos <= p.brutoUsuarioCentavos, {
    message: 'O IR não pode passar do valor bruto.',
    path: ['irUsuarioCentavos'],
  })

export type PremioManualInput = z.infer<typeof premioManualSchema>
