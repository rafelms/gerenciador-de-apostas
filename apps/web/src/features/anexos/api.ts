import { supabase } from '@/lib/supabase'

export const BUCKET = 'comprovantes'
export const MAX_ANEXOS = 3
/** URL assinada de curta duração (seção 8.4): o arquivo nunca fica público. */
const VALIDADE_URL_S = 60

export const chavesAnexos = {
  daAposta: (apostaId: string) => ['apostas', 'anexos', apostaId] as const,
}

export interface Anexo {
  id: string
  storagePath: string
  tamanhoBytes: number
  criadoEm: string
  /** URL assinada válida por 60 s (null se o arquivo sumiu do storage). */
  url: string | null
}

export async function listarAnexos(apostaId: string): Promise<Anexo[]> {
  const { data, error } = await supabase
    .from('anexos')
    .select('id, storage_path, tamanho_bytes, created_at')
    .eq('aposta_id', apostaId)
    .order('created_at')
  if (error) throw error
  if (data.length === 0) return []
  const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(
    data.map((a) => a.storage_path),
    VALIDADE_URL_S,
  )
  const porCaminho = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]))
  return data.map((a) => ({
    id: a.id,
    storagePath: a.storage_path,
    tamanhoBytes: a.tamanho_bytes,
    criadoEm: a.created_at,
    url: porCaminho.get(a.storage_path) ?? null,
  }))
}

/** Envia ao storage e registra; se o registro for recusado (ex.: 4º anexo), apaga o arquivo. */
export async function enviarAnexo(userId: string, apostaId: string, imagem: Blob) {
  const extensao = imagem.type === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `${userId}/${apostaId}/${crypto.randomUUID()}.${extensao}`
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, imagem, { contentType: imagem.type, upsert: false })
  if (erroUpload) throw new Error('Não foi possível enviar a imagem. Tente de novo.')

  const { error } = await supabase.from('anexos').insert({
    aposta_id: apostaId,
    storage_path: caminho,
    mime: imagem.type,
    tamanho_bytes: imagem.size,
  })
  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho])
    throw new Error(
      error.code === '23514' ? error.message : 'Não foi possível salvar o anexo. Tente de novo.',
    )
  }
}

/** URL nova para a lightbox: a da lista pode ter vencido se a tela ficou aberta. */
export async function urlAssinada(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(caminho, VALIDADE_URL_S)
  if (error || !data) throw new Error('Não foi possível abrir a foto.')
  return data.signedUrl
}

export async function removerAnexo(anexo: Pick<Anexo, 'id' | 'storagePath'>) {
  const { error } = await supabase.from('anexos').delete().eq('id', anexo.id)
  if (error) throw new Error('Não foi possível remover. Tente de novo.')
  // O registro já saiu; um arquivo que falhe aqui fica órfão, mas sem acesso de ninguém além do dono.
  await supabase.storage.from(BUCKET).remove([anexo.storagePath])
}
