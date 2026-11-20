// Leitura tolerante de valores vindos de planilha ou de texto de PDF.
// Funções puras: devolvem null quando o valor não serve; quem chama monta a mensagem.

/** Sem acento e minúsculo, para comparar textos ("Bolão" = "bolao"). */
export function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** "Data Aposta", "data_aposta", "DATA-APOSTA" → "data_aposta" (sem acento, minúsculo). */
export function normalizarCabecalho(nome: string): string {
  return semAcento(nome).replace(/[\s-]+/g, '_')
}

/** Célula vazia: null, undefined, "" ou só espaços. */
export function vazio(valor: unknown): boolean {
  return valor === null || valor === undefined || (typeof valor === 'string' && !valor.trim())
}

/** Texto de uma célula (números viram texto sem notação científica). */
export function texto(valor: unknown): string {
  if (vazio(valor)) return ''
  return String(valor).trim()
}

/** Inteiro positivo ou zero: 3070, "3070", "3.070" → 3070. Outros valores → null. */
export function lerInteiro(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isSafeInteger(valor) && valor >= 0 ? valor : null
  const t = texto(valor).replace(/\./g, '')
  return /^\d{1,9}$/.test(t) ? Number(t) : null
}

const DIA_MS = 86_400_000
// Dia 0 do Excel (com o bug do ano bissexto de 1900, válido para datas após 01/03/1900).
const EPOCA_EXCEL = Date.UTC(1899, 11, 30)

function isoValida(ano: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
    return null
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Data de planilha ou de texto → "aaaa-mm-dd".
 * Aceita "dd/mm/aaaa", "aaaa-mm-dd", número de série do Excel (46306 = 11/10/2026) e Date.
 */
export function lerData(valor: unknown): string | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null
    return isoValida(valor.getFullYear(), valor.getMonth() + 1, valor.getDate())
  }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 61 || valor > 2_958_465) return null
    const d = new Date(EPOCA_EXCEL + Math.floor(valor) * DIA_MS)
    return isoValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }
  const t = texto(valor)
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) return isoValida(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (m) return isoValida(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

/** "2026-10-11" → "11/10/2026" */
export function isoParaBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
