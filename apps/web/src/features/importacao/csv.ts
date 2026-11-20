// CSV para o Excel em português: separador ";" (a vírgula é o decimal) e números com
// vírgula decimal. Campos com ";", aspas ou quebra de linha vão entre aspas.

type Celula = string | number | null | undefined

function campo(valor: Celula): string {
  if (valor === null || valor === undefined) return ''
  const texto = typeof valor === 'number' ? String(valor).replace('.', ',') : valor
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function paraCsv(linhas: Record<string, Celula>[], colunas: readonly string[]): string {
  const corpo = linhas.map((l) => colunas.map((c) => campo(l[c])).join(';'))
  return [colunas.join(';'), ...corpo].join('\r\n') + '\r\n'
}
