const TEXTO_CLARO = '#ffffff'
const TEXTO_ESCURO = '#1a1c33' // marinho-950

/** Luminância relativa (WCAG) de uma cor "#rrggbb". */
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contraste(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Cor do texto (branco ou marinho) com o maior contraste sobre o fundo `hex`. As cores das
 * modalidades vão do roxo escuro ao laranja: branco fixo não serviria para todas.
 */
export function corTextoSobre(hex: string): string {
  const fundo = luminancia(hex)
  return contraste(fundo, luminancia(TEXTO_CLARO)) >= contraste(fundo, luminancia(TEXTO_ESCURO))
    ? TEXTO_CLARO
    : TEXTO_ESCURO
}

/** Estilo de uma dezena marcada na cor da modalidade. */
export function estiloDezenaMarcada(cor: string) {
  return { backgroundColor: cor, color: corTextoSobre(cor) }
}
