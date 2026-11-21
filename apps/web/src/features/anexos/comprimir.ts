// Compressão no navegador antes do upload (seção 11.12): a foto da câmera (8–12 MB) vira
// WebP de no máximo 1600 px no lado maior, bem abaixo do limite de 5 MB do bucket.

export const LADO_MAXIMO = 1600
export const LIMITE_BYTES = 5 * 1024 * 1024
/** Acima disso nem tenta decodificar: o celular pode ficar sem memória. */
export const ENTRADA_MAXIMA_BYTES = 30 * 1024 * 1024
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const

export class ErroAnexo extends Error {}

/** Reduz proporcionalmente para caber em `maximo` px no lado maior (nunca amplia). */
export function dimensoesAlvo(largura: number, altura: number, maximo = LADO_MAXIMO) {
  const escala = Math.min(1, maximo / Math.max(largura, altura))
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  }
}

/** Mensagem clara para o que não dá para enviar (aceite F5). */
export function validarEntrada(arquivo: { type: string; size: number }): string | null {
  if (!(TIPOS_ACEITOS as readonly string[]).includes(arquivo.type))
    return 'Envie uma foto em JPEG, PNG ou WebP.'
  if (arquivo.size > ENTRADA_MAXIMA_BYTES)
    return 'A imagem passa de 30 MB. Tire a foto com uma resolução menor e tente de novo.'
  return null
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number) {
  return new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, qualidade))
}

/**
 * Devolve a imagem comprimida (WebP; JPEG no navegador que não gera WebP). Tenta qualidades
 * menores até caber em 5 MB; se nem assim couber, recusa com uma mensagem clara.
 */
export async function comprimirImagem(arquivo: File): Promise<Blob> {
  const problema = validarEntrada(arquivo)
  if (problema) throw new ErroAnexo(problema)

  let imagem: ImageBitmap
  try {
    imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  } catch {
    throw new ErroAnexo('Não foi possível abrir esta imagem. Tente outra foto.')
  }
  const { largura, altura } = dimensoesAlvo(imagem.width, imagem.height)
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ErroAnexo('Seu navegador não conseguiu processar a imagem.')
  ctx.drawImage(imagem, 0, 0, largura, altura)
  imagem.close()

  for (const qualidade of [0.82, 0.7, 0.55]) {
    let blob = await paraBlob(canvas, 'image/webp', qualidade)
    // Safari antigo ignora o WebP e devolve PNG: aí usa JPEG.
    if (blob && blob.type !== 'image/webp') blob = await paraBlob(canvas, 'image/jpeg', qualidade)
    if (blob && blob.size <= LIMITE_BYTES) return blob
  }
  throw new ErroAnexo('Mesmo comprimida, a imagem passou de 5 MB. Tente uma foto menor.')
}
