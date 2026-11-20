// Texto de um PDF, extraído no navegador pelo pdf.js (seção 11.4). O pdf.js roda num
// Web Worker e só é baixado quando o usuário escolhe um PDF. O arquivo e o texto (que
// têm nome e CPF) ficam no aparelho: só os dados revisados vão ao banco.

import urlDoWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/** Comprovantes têm 1 ou 2 páginas; acima disso não é um comprovante. */
const MAX_PAGINAS = 10
export const TAMANHO_MAXIMO_PDF = 5 * 1024 * 1024

export class ErroPdf extends Error {}

/**
 * Uma linha de texto por linha do PDF (o pdf.js marca o fim de linha com `hasEOL`);
 * pedaços da mesma linha são separados por espaço e o parser colapsa os excessos.
 */
export async function textoDoPdf(arquivo: File): Promise<string> {
  if (arquivo.size > TAMANHO_MAXIMO_PDF) throw new ErroPdf('O arquivo passa de 5 MB.')
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = urlDoWorker

  const tarefa = pdfjs.getDocument({
    data: new Uint8Array(await arquivo.arrayBuffer()),
    disableFontFace: true,
    stopAtErrors: true,
  })
  let doc
  try {
    doc = await tarefa.promise
  } catch {
    void tarefa.destroy()
    throw new ErroPdf('Não foi possível abrir este arquivo como PDF.')
  }
  try {
    if (doc.numPages > MAX_PAGINAS)
      throw new ErroPdf('O PDF tem páginas demais para ser um comprovante.')
    const paginas: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n)
      const conteudo = await pagina.getTextContent()
      let texto = ''
      for (const item of conteudo.items) {
        if (!('str' in item)) continue
        texto += item.str + (item.hasEOL ? '\n' : ' ')
      }
      paginas.push(texto)
    }
    const texto = paginas.join('\n')
    if (!texto.trim())
      throw new ErroPdf('Este PDF não tem texto selecionável (parece uma foto ou digitalização).')
    return texto
  } finally {
    // Libera o documento e o worker.
    void tarefa.destroy()
  }
}
