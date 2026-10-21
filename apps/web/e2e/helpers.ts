import { createHmac, randomUUID } from 'node:crypto'

import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Chaves do Supabase LOCAL (valores padrão e públicos do `supabase start`).
// Nunca aponte estes testes para produção.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const CHAVE_PUBLICA =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const CHAVE_SECRETA = process.env.SUPABASE_SECRET_KEY ?? 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
export const SENHA_TESTE = 'SenhaTeste123'

if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) {
  throw new Error('Os testes e2e só rodam contra o Supabase local.')
}

export const admin = createClient(SUPABASE_URL, CHAVE_SECRETA, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export function clienteAnonimo(): SupabaseClient {
  return createClient(SUPABASE_URL, CHAVE_PUBLICA, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Cria um usuário já confirmado (como se tivesse aceitado o convite). */
export async function criarUsuario(papel: 'admin' | 'membro' = 'membro') {
  const email = `e2e-${randomUUID().slice(0, 8)}@teste.local`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA_TESTE,
    email_confirm: true,
    user_metadata: { nome: `E2E ${papel}` },
  })
  if (error || !data.user) throw error ?? new Error('falha ao criar usuário')
  if (papel === 'admin')
    await admin.from('profiles').update({ papel: 'admin' }).eq('id', data.user.id)
  return { id: data.user.id, email }
}

/** Remove usuários criados pelos testes (mantém os do seed). */
export async function limparUsuariosDeTeste() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith('@teste.local')) await admin.auth.admin.deleteUser(u.id)
  }
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238): o mesmo cálculo de um app autenticador.
// ---------------------------------------------------------------------------
function base32(segredo: string): Buffer {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of segredo.replace(/=+$/, '').toUpperCase())
    bits += alfabeto.indexOf(c).toString(2).padStart(5, '0')
  const bytes = bits.match(/.{8}/g) ?? []
  return Buffer.from(bytes.map((b) => parseInt(b, 2)))
}

export function gerarTotp(segredo: string, quando = Date.now()): string {
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(Math.floor(quando / 1000 / 30)))
  const hmac = createHmac('sha1', base32(segredo)).update(contador).digest()
  const offset = hmac[hmac.length - 1]! & 0xf
  const codigo = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return codigo.toString().padStart(6, '0')
}

/** Cadastra TOTP via API e devolve um cliente com sessão aal2 + o segredo. */
export async function sessaoAal2(email: string) {
  const cliente = clienteAnonimo()
  await cliente.auth.signInWithPassword({ email, password: SENHA_TESTE })
  const { data: fator, error } = await cliente.auth.mfa.enroll({ factorType: 'totp' })
  if (error || !fator) throw error ?? new Error('falha no enroll')
  const verificacao = await cliente.auth.mfa.challengeAndVerify({
    factorId: fator.id,
    code: gerarTotp(fator.totp.secret),
  })
  if (verificacao.error) throw verificacao.error
  return { cliente, segredo: fator.totp.secret }
}

export async function entrarPelaTela(page: Page, email: string, senha = SENHA_TESTE) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

/** A página não pode ter rolagem horizontal (aceite F0). */
export async function semRolagemHorizontal(page: Page) {
  const larguras = await page.evaluate(() => ({
    conteudo: document.documentElement.scrollWidth,
    janela: document.documentElement.clientWidth,
  }))
  expect(larguras.conteudo, 'rolagem horizontal detectada').toBeLessThanOrEqual(larguras.janela)
}
