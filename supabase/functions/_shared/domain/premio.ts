// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
import { parteDasCotas } from './conferencia.ts'
import { aplicarBps, multiplicarFracao, ratearMaiorResto, type Centavos } from './dinheiro.ts'

/** Configuração global usada no cálculo (tabela `configuracoes`, seção 11.6). */
export interface ConfigPremio {
  aliquotaIrBps: number
  limiteIsencaoIrCentavos: Centavos
  /** [PENDÊNCIA P2] IR apurado por cota do bolão ou pela aposta inteira. */
  baseCalculoIr: 'cota' | 'aposta'
  /** [PENDÊNCIA P1] O valor do rateio da API é bruto ou líquido. */
  valorRateioApiEh: 'bruto' | 'liquido'
  prazoResgateDias: number
}

/** Valores padrão da migration (30% acima de R$ 2.259,20; 90 dias para resgatar). */
export const CONFIG_PREMIO_PADRAO: ConfigPremio = {
  aliquotaIrBps: 3000,
  limiteIsencaoIrCentavos: 225_920,
  baseCalculoIr: 'cota',
  valorRateioApiEh: 'bruto',
  prazoResgateDias: 90,
}

/** Linha de `configuracoes` (snake_case do banco) → ConfigPremio. */
export function configDoBanco(c: {
  aliquota_ir_bps: number
  limite_isencao_ir_centavos: number
  base_calculo_ir: string
  valor_rateio_api_eh: string
  prazo_resgate_dias: number
}): ConfigPremio {
  return {
    aliquotaIrBps: c.aliquota_ir_bps,
    limiteIsencaoIrCentavos: c.limite_isencao_ir_centavos,
    baseCalculoIr: c.base_calculo_ir === 'aposta' ? 'aposta' : 'cota',
    valorRateioApiEh: c.valor_rateio_api_eh === 'liquido' ? 'liquido' : 'bruto',
    prazoResgateDias: c.prazo_resgate_dias,
  }
}

/**
 * Seção 9.5: prêmio acima do limite de isenção paga a alíquota sobre o TOTAL
 * (não só sobre o que excede); até o limite, é isento.
 */
export function calcularIR(base: Centavos, cfg: ConfigPremio): { ir: Centavos; liquido: Centavos } {
  const ir = base > cfg.limiteIsencaoIrCentavos ? aplicarBps(base, cfg.aliquotaIrBps) : 0
  return { ir, liquido: base - ir }
}

/**
 * Converte um valor líquido de volta para bruto (pendência P1):
 *   bruto = líquido ÷ (1 − alíquota), quando esse bruto passa do limite de isenção;
 *   senão o valor é isento e bruto = líquido.
 */
export function brutoDeLiquido(liquido: Centavos, cfg: ConfigPremio): Centavos {
  if (cfg.aliquotaIrBps >= 10_000) return liquido
  const candidato = multiplicarFracao(liquido, 10_000, 10_000 - cfg.aliquotaIrBps)
  return candidato > cfg.limiteIsencaoIrCentavos ? candidato : liquido
}

/** Valor de uma faixa do rateio, já em bruto, conforme a interpretação configurada. */
export function valorFaixaBruto(valorRateio: Centavos, cfg: ConfigPremio): Centavos {
  return cfg.valorRateioApiEh === 'liquido' ? brutoDeLiquido(valorRateio, cfg) : valorRateio
}

export interface EntradaPremio {
  /** Prêmio bruto da aposta inteira (todas as cotas). */
  brutoAposta: Centavos
  /** Bolão: total de cotas e cotas do usuário. Ausentes = aposta simples/teimosinha. */
  totalCotas?: number | null
  cotasUsuario?: number | null
}

/** Snapshot gravado em premios.regra_ir: mudanças futuras na configuração não alteram prêmios antigos. */
export interface RegraIrSnapshot {
  aliquota_ir_bps: number
  limite_isencao_ir_centavos: Centavos
  base_calculo_ir: 'cota' | 'aposta'
  valor_rateio_api_eh: 'bruto' | 'liquido'
}

export interface PremioCalculado {
  brutoAposta: Centavos
  brutoUsuario: Centavos
  irUsuario: Centavos
  liquidoUsuario: Centavos
  regraIr: RegraIrSnapshot
}

/**
 * Prêmio da parte do usuário (seções 9.4 e 9.5).
 *   Bolão:  brutoUsuario = brutoAposta × cotasUsuario ÷ totalCotas
 *           IR por cota (padrão): calcularIR(brutoAposta ÷ totalCotas) × cotasUsuario
 *           IR pela aposta:       calcularIR(brutoAposta) × cotasUsuario ÷ totalCotas
 *   Simples/teimosinha: tudo é do usuário.
 */
export function calcularPremio(e: EntradaPremio, cfg: ConfigPremio): PremioCalculado {
  const regraIr: RegraIrSnapshot = {
    aliquota_ir_bps: cfg.aliquotaIrBps,
    limite_isencao_ir_centavos: cfg.limiteIsencaoIrCentavos,
    base_calculo_ir: cfg.baseCalculoIr,
    valor_rateio_api_eh: cfg.valorRateioApiEh,
  }

  const total = e.totalCotas ?? null
  const cotas = e.cotasUsuario ?? null
  if (!total || !cotas) {
    const { ir, liquido } = calcularIR(e.brutoAposta, cfg)
    return {
      brutoAposta: e.brutoAposta,
      brutoUsuario: e.brutoAposta,
      irUsuario: ir,
      liquidoUsuario: liquido,
      regraIr,
    }
  }

  const brutoUsuario = parteDasCotas(e.brutoAposta, cotas, total)
  const irUsuario =
    cfg.baseCalculoIr === 'cota'
      ? calcularIR(multiplicarFracao(e.brutoAposta, 1, total), cfg).ir * cotas
      : parteDasCotas(calcularIR(e.brutoAposta, cfg).ir, cotas, total)
  // O IR nunca passa do bruto (arredondamentos de cota a cota em valores minúsculos).
  const ir = Math.min(irUsuario, brutoUsuario)
  return {
    brutoAposta: e.brutoAposta,
    brutoUsuario,
    irUsuario: ir,
    liquidoUsuario: brutoUsuario - ir,
    regraIr,
  }
}

export interface ParticipanteDivisao {
  nome: string
  peso: number
  ehUsuario: boolean
}

export interface LinhaDivisao extends ParticipanteDivisao {
  /** Fração do participante (0–1), só para exibição. */
  fracao: number
  bruto: Centavos
  ir: Centavos
  liquido: Centavos
}

/**
 * Seção 9.6: divide a parte do usuário entre os participantes, pelo maior resto.
 * Bruto e líquido são rateados com os mesmos pesos; o IR de cada um é a diferença,
 * então as três colunas somam exatamente os totais.
 */
export function dividirPremio(
  premio: { bruto: Centavos; liquido: Centavos },
  participantes: ParticipanteDivisao[],
): LinhaDivisao[] {
  if (participantes.length === 0) return []
  const pesos = participantes.map((p) => p.peso)
  const somaPesos = pesos.reduce((a, b) => a + b, 0)
  const brutos = ratearMaiorResto(premio.bruto, pesos)
  const liquidos = ratearMaiorResto(premio.liquido, pesos)
  return participantes.map((p, i) => ({
    ...p,
    fracao: p.peso / somaPesos,
    bruto: brutos[i]!,
    liquido: liquidos[i]!,
    ir: brutos[i]! - liquidos[i]!,
  }))
}

export interface EntradaSimulacao {
  /** Prêmio da aposta inteira (todas as cotas). */
  valor: Centavos
  tipoValor: 'bruto' | 'liquido'
  totalCotas: number
  cotasUsuario: number
  participantes: ParticipanteDivisao[]
}

export interface ResultadoSimulacao {
  brutoUsuario: Centavos
  irUsuario: Centavos
  liquidoUsuario: Centavos
  divisao: LinhaDivisao[]
}

/**
 * Modo simulação (seção 9.6), sem salvar nada. Com valor líquido, a parte do
 * usuário é exata e o bruto é estimado de volta (brutoDeLiquido); com valor
 * bruto, aplica o IR configurado.
 */
export function simularDivisao(e: EntradaSimulacao, cfg: ConfigPremio): ResultadoSimulacao {
  const total = Math.max(1, e.totalCotas)
  const cotas = Math.min(Math.max(1, e.cotasUsuario), total)
  const bolao = total > 1 ? { totalCotas: total, cotasUsuario: cotas } : {}

  let brutoUsuario: Centavos
  let liquidoUsuario: Centavos
  if (e.tipoValor === 'bruto') {
    const p = calcularPremio({ brutoAposta: e.valor, ...bolao }, cfg)
    brutoUsuario = p.brutoUsuario
    liquidoUsuario = p.liquidoUsuario
  } else {
    liquidoUsuario = parteDasCotas(e.valor, cotas, total)
    const liquidoBase =
      cfg.baseCalculoIr === 'cota' ? multiplicarFracao(e.valor, 1, total) : e.valor
    const brutoBase = brutoDeLiquido(liquidoBase, cfg)
    brutoUsuario =
      cfg.baseCalculoIr === 'cota' ? brutoBase * cotas : parteDasCotas(brutoBase, cotas, total)
    brutoUsuario = Math.max(brutoUsuario, liquidoUsuario)
  }

  const participantes =
    e.participantes.length > 0 ? e.participantes : [{ nome: 'Eu', peso: 1, ehUsuario: true }]
  return {
    brutoUsuario,
    irUsuario: brutoUsuario - liquidoUsuario,
    liquidoUsuario,
    divisao: dividirPremio({ bruto: brutoUsuario, liquido: liquidoUsuario }, participantes),
  }
}

/** Prazo para resgatar: data do sorteio + N dias (padrão 90). Datas ISO "aaaa-mm-dd". */
export function prazoResgate(dataSorteio: string, dias: number): string {
  const [ano, mes, dia] = dataSorteio.split('-').map(Number)
  const data = new Date(Date.UTC(ano!, mes! - 1, dia! + dias))
  return data.toISOString().slice(0, 10)
}
