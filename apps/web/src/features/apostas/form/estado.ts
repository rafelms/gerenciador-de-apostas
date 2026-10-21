import { custoAposta, tarifaDentroDoLimite, totalBolao, valorCotaConfere } from '@shared/aposta.ts'
import { formatarBRL, tentarDeReais } from '@shared/dinheiro.ts'
import type { SlugModalidade } from '@shared/regras/tipos.ts'
import { apostaSchema, type ApostaInput } from '@shared/schemas/aposta.ts'
import type { FieldErrors, Resolver } from 'react-hook-form'

import { hojeIso } from '@/lib/formatadores'
import type { Modalidade } from '@/features/modalidades/use-modalidades'
import { precoVigente } from '@/features/modalidades/use-modalidades'
import type { ApostaCompleta } from '../api'

/**
 * Estado do formulário: tudo como o usuário digita (textos), convertido para
 * ApostaInput (centavos e números) só na validação/envio.
 */
export interface FormAposta {
  modalidadeSlug: SlugModalidade | ''
  tipo: 'simples' | 'bolao' | 'teimosinha'
  concursoInicial: string
  qtdConcursos: string
  jogos: { dezenas: number[] }[]
  totalCotas: string
  cotasUsuario: string
  numeroCota: string
  valorCota: string
  tarifa: string
  valorPago: string
  /** O usuário digitou o valor pago (senão usamos o calculado). */
  valorPagoManual: boolean
  dividir: boolean
  participantes: { nome: string; peso: string; ehUsuario: boolean }[]
  dataAposta: string
  localCompra: string
  observacao: string
}

export function valoresIniciais(): FormAposta {
  return {
    modalidadeSlug: '',
    tipo: 'simples',
    concursoInicial: '',
    qtdConcursos: '1',
    jogos: [{ dezenas: [] }],
    totalCotas: '',
    cotasUsuario: '1',
    numeroCota: '',
    valorCota: '',
    tarifa: '',
    valorPago: '',
    valorPagoManual: false,
    dividir: false,
    participantes: [],
    dataAposta: hojeIso(),
    localCompra: '',
    observacao: '',
  }
}

const reais = (c: number | null | undefined) =>
  c === null || c === undefined ? '' : formatarBRL(c).replace('R$ ', '')

export function apostaParaForm(a: ApostaCompleta): FormAposta {
  return {
    modalidadeSlug: (a.modalidades?.slug ?? '') as SlugModalidade,
    tipo: a.tipo,
    concursoInicial: String(a.concurso_inicial),
    qtdConcursos: String(a.qtd_concursos),
    jogos: a.aposta_jogos.map((j) => ({ dezenas: j.dezenas })),
    totalCotas: a.bolao_total_cotas ? String(a.bolao_total_cotas) : '',
    cotasUsuario: a.bolao_cotas_usuario ? String(a.bolao_cotas_usuario) : '1',
    numeroCota: a.bolao_numero_cota ? String(a.bolao_numero_cota) : '',
    valorCota: reais(a.valor_cota_centavos),
    tarifa: a.tipo === 'bolao' ? reais(a.tarifa_centavos) : '',
    valorPago: reais(a.valor_pago_centavos),
    valorPagoManual: true,
    dividir: a.participantes.length > 0,
    participantes: a.participantes.map((p) => ({
      nome: p.nome,
      peso: String(p.peso).replace('.', ','),
      ehUsuario: p.eh_usuario,
    })),
    dataAposta: a.data_aposta,
    localCompra: a.local_compra ?? '',
    observacao: a.observacao ?? '',
  }
}

const inteiro = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : Number.NaN)
const peso = (t: string) => Number(t.trim().replace(',', '.'))

/** Valor que o sistema sugere como "pago" (seção 5.3 e bolão: cotas × (cota + tarifa)). */
export function valorCalculado(f: FormAposta, modalidade: Modalidade | undefined): number | null {
  if (!modalidade) return null
  if (f.tipo === 'bolao') {
    const cota = tentarDeReais(f.valorCota)
    const cotas = inteiro(f.cotasUsuario)
    if (cota === null || Number.isNaN(cotas)) return null
    return totalBolao(cotas, cota, tentarDeReais(f.tarifa) ?? 0)
  }
  const preco = precoVigente(modalidade, f.dataAposta)
  const jogosValidos = f.jogos.filter((j) => modalidade.regra.validarJogo(j.dezenas).length === 0)
  if (!preco || jogosValidos.length !== f.jogos.length) return null
  const qtd = f.tipo === 'teimosinha' ? inteiro(f.qtdConcursos) : 1
  return Number.isNaN(qtd)
    ? null
    : custoAposta(
        modalidade.regra,
        f.jogos.map((j) => j.dezenas),
        preco,
        qtd,
      )
}

export function valorPagoEfetivo(f: FormAposta, modalidade: Modalidade | undefined): number | null {
  return f.valorPagoManual ? tentarDeReais(f.valorPago) : valorCalculado(f, modalidade)
}

/** Avisos que NÃO bloqueiam o envio (divergências de valor). */
export function avisos(f: FormAposta, modalidade: Modalidade | undefined): string[] {
  const lista: string[] = []
  if (!modalidade) return lista
  const calculado = valorCalculado(f, modalidade)
  const pago = valorPagoEfetivo(f, modalidade)
  if (f.valorPagoManual && calculado !== null && pago !== null && calculado !== pago) {
    lista.push(`O valor pago difere do calculado (${formatarBRL(calculado)}).`)
  }
  if (f.tipo === 'bolao') {
    const cota = tentarDeReais(f.valorCota)
    const total = inteiro(f.totalCotas)
    const preco = precoVigente(modalidade, f.dataAposta)
    const jogos = f.jogos.map((j) => j.dezenas)
    const jogosOk = jogos.every((j) => modalidade.regra.validarJogo(j).length === 0)
    if (
      cota &&
      preco &&
      jogosOk &&
      !Number.isNaN(total) &&
      !valorCotaConfere(modalidade.regra, jogos, preco, cota, total)
    ) {
      lista.push('O valor da cota não bate com o preço vigente dos jogos.')
    }
  }
  return lista
}

/** Converte o formulário para a entrada do schema (sem validar). */
export function montarApostaInput(f: FormAposta, modalidade: Modalidade | undefined): unknown {
  const bolao =
    f.tipo === 'bolao'
      ? {
          totalCotas: inteiro(f.totalCotas),
          cotasUsuario: inteiro(f.cotasUsuario),
          numeroCota: f.numeroCota.trim() ? inteiro(f.numeroCota) : null,
          valorCotaCentavos: tentarDeReais(f.valorCota) ?? Number.NaN,
          tarifaCentavos: tentarDeReais(f.tarifa) ?? 0,
        }
      : null

  return {
    modalidadeSlug: f.modalidadeSlug,
    tipo: f.tipo,
    concursoInicial: inteiro(f.concursoInicial),
    qtdConcursos: f.tipo === 'teimosinha' ? inteiro(f.qtdConcursos) : 1,
    dataAposta: f.dataAposta,
    jogos: f.jogos.map((j) => j.dezenas),
    bolao,
    valorPagoCentavos: valorPagoEfetivo(f, modalidade) ?? Number.NaN,
    participantes: f.dividir
      ? f.participantes.map((p) => ({ nome: p.nome, peso: peso(p.peso), ehUsuario: p.ehUsuario }))
      : [],
    localCompra: f.localCompra.trim() || null,
    observacao: f.observacao.trim() || null,
  }
}

// Caminho do erro no schema → nome do campo no formulário.
const mapaCampos: Record<string, string> = {
  'bolao.totalCotas': 'totalCotas',
  'bolao.cotasUsuario': 'cotasUsuario',
  'bolao.numeroCota': 'numeroCota',
  'bolao.valorCotaCentavos': 'valorCota',
  'bolao.tarifaCentavos': 'tarifa',
  bolao: 'totalCotas',
  valorPagoCentavos: 'valorPago',
}

/**
 * Grava `valor` em obj["a"]["b"] para o caminho "a.b"; mantém o primeiro erro de cada campo.
 * Field arrays (próximo segmento numérico ou `root`) viram arrays: o `trigger` do RHF descarta
 * erros de field array em objeto quando não há inputs registrados dentro dele.
 */
function definirAninhado(obj: Record<string, unknown>, caminho: string, valor: unknown) {
  const partes = caminho.split('.')
  let atual = obj
  partes.slice(0, -1).forEach((p, i) => {
    atual[p] ??= /^(\d+|root)$/.test(partes[i + 1]!) ? [] : {}
    atual = atual[p] as Record<string, unknown>
  })
  const ultima = partes.at(-1)!
  atual[ultima] ??= valor
}

/** Resolver do React Hook Form que valida com o MESMO schema Zod do shared. */
export function criarResolver(
  obterModalidade: (slug: string) => Modalidade | undefined,
): Resolver<FormAposta> {
  return async (valores) => {
    const resultado = apostaSchema.safeParse(
      montarApostaInput(valores, obterModalidade(valores.modalidadeSlug)),
    )
    if (resultado.success) return { values: valores, errors: {} }

    // O React Hook Form espera erros aninhados (jogos[0], jogos.root…).
    const errors: Record<string, unknown> = {}
    for (const issue of resultado.error.issues) {
      const caminho = issue.path.join('.')
      const campo =
        mapaCampos[caminho] ??
        (caminho === 'jogos'
          ? 'jogos.root'
          : caminho.startsWith('participantes')
            ? 'participantes'
            : caminho)
      const mensagem =
        campo === 'modalidadeSlug'
          ? 'Escolha a modalidade.'
          : campo === 'valorPago' && issue.code === 'invalid_type'
            ? 'Informe o valor pago.'
            : campo === 'concursoInicial' && issue.code === 'invalid_type'
              ? 'Informe o número do concurso.'
              : issue.message
      definirAninhado(errors, campo, { type: issue.code, message: mensagem })
    }
    return { values: {}, errors: errors as FieldErrors<FormAposta> }
  }
}

export function paraApostaInput(f: FormAposta, modalidade: Modalidade | undefined): ApostaInput {
  return apostaSchema.parse(montarApostaInput(f, modalidade))
}

export function tarifaAcimaDoLimite(f: FormAposta): boolean {
  const cota = tentarDeReais(f.valorCota)
  const tarifa = tentarDeReais(f.tarifa)
  return cota !== null && tarifa !== null && !tarifaDentroDoLimite(tarifa, cota)
}
