import { z } from 'zod'

// Política de senha (seção 8.1): mínimo 10 caracteres, com letras e números.
// A mesma regra está configurada no Auth (config.toml) — o banco é a última barreira.
export const senhaSchema = z
  .string()
  .min(10, 'A senha precisa ter pelo menos 10 caracteres.')
  .max(72, 'A senha pode ter no máximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra.')
  .regex(/\d/, 'A senha precisa ter pelo menos um número.')

export const emailSchema = z.string().trim().toLowerCase().email('Informe um e-mail válido.')

export const nomeSchema = z
  .string()
  .trim()
  .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
  .max(80, 'O nome pode ter no máximo 80 caracteres.')

export const loginSchema = z.object({
  email: emailSchema,
  // No login não revelamos a política: qualquer senha não vazia vai para o Auth.
  senha: z.string().min(1, 'Informe a senha.'),
})

export const definirSenhaSchema = z
  .object({
    senha: senhaSchema,
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, {
    message: 'As senhas não conferem.',
    path: ['confirmacao'],
  })

export const aceitarConviteSchema = z
  .object({
    nome: nomeSchema,
    senha: senhaSchema,
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, {
    message: 'As senhas não conferem.',
    path: ['confirmacao'],
  })

export const codigoTotpSchema = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos.'),
})

export const convidarUsuarioSchema = z.object({
  email: emailSchema,
  nome: nomeSchema,
})

export const alterarUsuarioSchema = z.object({
  user_id: z.string().uuid(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type DefinirSenhaInput = z.infer<typeof definirSenhaSchema>
export type AceitarConviteInput = z.infer<typeof aceitarConviteSchema>
export type ConvidarUsuarioInput = z.infer<typeof convidarUsuarioSchema>
