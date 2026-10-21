// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
import { z } from 'zod'

import { tarifaDentroDoLimite } from '../aposta.ts'
import { obterRegra } from '../regras/index.ts'

export const slugModalidadeSchema = z.enum(['megasena', 'lotofacil', 'quina'])
export const tipoApostaSchema = z.enum(['simples', 'bolao', 'teimosinha'])

const centavos = z.number().int('Valor inválido.')

export const participanteSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(60, 'Máximo de 60 caracteres.'),
  peso: z.number().positive('O peso precisa ser maior que zero.').max(9999.99),
  ehUsuario: z.boolean(),
  contribuicaoCentavos: centavos.nonnegative().nullable().optional(),
})

export const bolaoSchema = z.object({
  totalCotas: z
    .number()
    .int()
    .min(2, 'O bolão tem pelo menos 2 cotas.')
    .max(100, 'Máximo de 100 cotas.'),
  cotasUsuario: z.number().int().min(1, 'Informe pelo menos 1 cota.'),
  numeroCota: z.number().int().min(1).nullable().optional(),
  valorCotaCentavos: centavos.positive('Informe o valor da cota.'),
  tarifaCentavos: centavos.nonnegative(),
})

/**
 * Aposta como o usuário a informa (formulário, planilha ou PDF revisado).
 * O banco valida tudo de novo (constraints e triggers): esta é a 1ª barreira, não a última.
 */
export const apostaSchema = z
  .object({
    modalidadeSlug: slugModalidadeSchema,
    tipo: tipoApostaSchema,
    concursoInicial: z.number().int().positive('Informe o número do concurso.'),
    qtdConcursos: z.number().int().min(1).max(24, 'A teimosinha vai até 24 concursos.'),
    dataAposta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
    jogos: z.array(z.array(z.number())).min(1, 'Adicione pelo menos um jogo.').max(200),
    bolao: bolaoSchema.nullable(),
    valorPagoCentavos: centavos.nonnegative('O valor pago não pode ser negativo.'),
    participantes: z.array(participanteSchema).max(30),
    localCompra: z.string().trim().max(60).nullable(),
    observacao: z.string().trim().max(500, 'Máximo de 500 caracteres.').nullable(),
  })
  .superRefine((a, ctx) => {
    // Teimosinha ⇔ mais de um concurso (mesma regra da constraint teimosinha_qtd).
    if (a.tipo === 'teimosinha' && a.qtdConcursos < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['qtdConcursos'],
        message: 'A teimosinha precisa de 2 a 24 concursos.',
      })
    }
    if (a.tipo !== 'teimosinha' && a.qtdConcursos !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['qtdConcursos'],
        message: 'Só a teimosinha vale para mais de um concurso.',
      })
    }

    const regra = obterRegra(a.modalidadeSlug)
    a.jogos.forEach((jogo, i) => {
      for (const erro of regra.validarJogo(jogo)) {
        ctx.addIssue({ code: 'custom', path: ['jogos', i], message: `Jogo ${i + 1}: ${erro}` })
      }
    })

    if (a.tipo === 'bolao') {
      if (!a.bolao) {
        ctx.addIssue({ code: 'custom', path: ['bolao'], message: 'Informe os dados do bolão.' })
      } else {
        const b = a.bolao
        if (b.cotasUsuario > b.totalCotas) {
          ctx.addIssue({
            code: 'custom',
            path: ['bolao', 'cotasUsuario'],
            message: 'Suas cotas não podem passar do total.',
          })
        }
        if (b.numeroCota && b.numeroCota > b.totalCotas) {
          ctx.addIssue({
            code: 'custom',
            path: ['bolao', 'numeroCota'],
            message: 'O número da cota não pode passar do total.',
          })
        }
        if (!tarifaDentroDoLimite(b.tarifaCentavos, b.valorCotaCentavos)) {
          ctx.addIssue({
            code: 'custom',
            path: ['bolao', 'tarifaCentavos'],
            message: 'A tarifa passa de 35% do valor da cota.',
          })
        }
      }
      // Regra do bolão CAIXA: todos os jogos com a mesma quantidade de dezenas.
      if (new Set(a.jogos.map((j) => j.length)).size > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['jogos'],
          message: 'No bolão, todos os jogos têm a mesma quantidade de dezenas.',
        })
      }
    } else if (a.bolao) {
      ctx.addIssue({
        code: 'custom',
        path: ['bolao'],
        message: 'Dados de bolão só valem para o tipo bolão.',
      })
    }

    if (a.participantes.length > 0) {
      const usuarios = a.participantes.filter((p) => p.ehUsuario).length
      if (usuarios !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['participantes'],
          message: 'A divisão precisa incluir você exatamente uma vez.',
        })
      }
      const contribuicoes = a.participantes.map((p) => p.contribuicaoCentavos)
      const algumas = contribuicoes.some((c) => c !== null && c !== undefined)
      const todas = contribuicoes.every((c) => c !== null && c !== undefined)
      if (algumas && !todas) {
        ctx.addIssue({
          code: 'custom',
          path: ['participantes'],
          message: 'Informe a contribuição de todos ou de ninguém.',
        })
      }
      if (todas) {
        const soma = contribuicoes.reduce<number>((s, c) => s + (c ?? 0), 0)
        if (soma !== a.valorPagoCentavos) {
          ctx.addIssue({
            code: 'custom',
            path: ['participantes'],
            message: 'A soma das contribuições precisa ser igual ao valor pago.',
          })
        }
      }
    }
  })

export type ApostaInput = z.infer<typeof apostaSchema>

/**
 * Aposta validada → corpo da RPC `salvar_aposta` (snake_case, colunas do banco).
 * Usado pelo formulário e, na fase 3, pela importação de planilha/PDF.
 */
export function apostaParaRpc(
  a: ApostaInput,
  extras: { origem?: 'manual' | 'excel' | 'pdf'; comprovanteHash?: string | null } = {},
) {
  return {
    modalidade_slug: a.modalidadeSlug,
    tipo: a.tipo,
    origem: extras.origem ?? 'manual',
    concurso_inicial: a.concursoInicial,
    qtd_concursos: a.qtdConcursos,
    data_aposta: a.dataAposta,
    bolao_total_cotas: a.bolao?.totalCotas ?? null,
    bolao_cotas_usuario: a.bolao?.cotasUsuario ?? null,
    bolao_numero_cota: a.bolao?.numeroCota ?? null,
    valor_cota_centavos: a.bolao?.valorCotaCentavos ?? null,
    tarifa_centavos: a.bolao?.tarifaCentavos ?? 0,
    valor_pago_centavos: a.valorPagoCentavos,
    comprovante_hash: extras.comprovanteHash ?? null,
    local_compra: a.localCompra,
    observacao: a.observacao,
    jogos: a.jogos.map((j) => [...j].sort((x, y) => x - y)),
    participantes: a.participantes.map((p) => ({
      nome: p.nome,
      peso: p.peso,
      eh_usuario: p.ehUsuario,
      contribuicao_centavos: p.contribuicaoCentavos ?? null,
    })),
  }
}
export type ParticipanteInput = z.infer<typeof participanteSchema>
export type BolaoInput = z.infer<typeof bolaoSchema>
