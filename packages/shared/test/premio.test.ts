import { describe, expect, it } from 'vitest'

import {
  brutoDeLiquido,
  calcularIR,
  calcularPremio,
  CONFIG_PREMIO_PADRAO as CFG,
  configDoBanco,
  dividirPremio,
  prazoResgate,
  simularDivisao,
  valorFaixaBruto,
  type ConfigPremio,
} from '../src/premio.ts'

const POR_APOSTA: ConfigPremio = { ...CFG, baseCalculoIr: 'aposta' }

describe('calcularIR (aceite F2)', () => {
  it('R$ 2.259,20 é isento', () => {
    expect(calcularIR(225_920, CFG)).toEqual({ ir: 0, liquido: 225_920 })
  })

  it('R$ 2.259,21 paga 30% sobre o TOTAL', () => {
    // 225921 × 30% = 67776,3 → 67776 (half-up)
    expect(calcularIR(225_921, CFG)).toEqual({ ir: 67_776, liquido: 225_921 - 67_776 })
  })

  it('usa a alíquota e o limite configurados', () => {
    expect(
      calcularIR(100_000, { ...CFG, aliquotaIrBps: 1500, limiteIsencaoIrCentavos: 50_000 }).ir,
    ).toBe(15_000)
  })
})

describe('calcularPremio', () => {
  it('aposta simples: o prêmio todo é do usuário', () => {
    const p = calcularPremio({ brutoAposta: 1_000_000 }, CFG)
    expect(p).toMatchObject({
      brutoAposta: 1_000_000,
      brutoUsuario: 1_000_000,
      irUsuario: 300_000,
      liquidoUsuario: 700_000,
    })
    expect(p.regraIr).toEqual({
      aliquota_ir_bps: 3000,
      limite_isencao_ir_centavos: 225_920,
      base_calculo_ir: 'cota',
      valor_rateio_api_eh: 'bruto',
    })
  })

  it('bolão com IR por cota (padrão): a cota fica abaixo do limite e é isenta', () => {
    // Uma quina de R$ 38.295,72 num bolão de 38 cotas → R$ 1.007,78 por cota.
    expect(
      calcularPremio({ brutoAposta: 3_829_572, totalCotas: 38, cotasUsuario: 1 }, CFG),
    ).toMatchObject({
      brutoUsuario: 100_778,
      irUsuario: 0,
      liquidoUsuario: 100_778,
    })
  })

  it('bolão com IR pela aposta inteira [P2]', () => {
    // IR da aposta = 1.148.871,6 → 1.148.872; parte de 1/38 = 30.233
    expect(
      calcularPremio({ brutoAposta: 3_829_572, totalCotas: 38, cotasUsuario: 1 }, POR_APOSTA),
    ).toMatchObject({
      brutoUsuario: 100_778,
      irUsuario: 30_233,
      liquidoUsuario: 70_545,
    })
  })

  it('bolão com 2 cotas e cota acima do limite: IR cota a cota × cotas', () => {
    expect(
      calcularPremio({ brutoAposta: 38_000_000, totalCotas: 38, cotasUsuario: 2 }, CFG),
    ).toMatchObject({
      brutoUsuario: 2_000_000,
      irUsuario: 600_000,
      liquidoUsuario: 1_400_000,
    })
  })

  it('o IR nunca passa do bruto do usuário', () => {
    const cfg = { ...CFG, aliquotaIrBps: 10_000, limiteIsencaoIrCentavos: 0 }
    const p = calcularPremio({ brutoAposta: 5, totalCotas: 3, cotasUsuario: 2 }, cfg)
    expect(p.irUsuario).toBeLessThanOrEqual(p.brutoUsuario)
    expect(p.liquidoUsuario).toBe(p.brutoUsuario - p.irUsuario)
  })
})

describe('rateio líquido → bruto [P1]', () => {
  it('converte quando o bruto passa do limite', () => {
    expect(brutoDeLiquido(700_000, CFG)).toBe(1_000_000)
  })
  it('valor pequeno é isento: bruto = líquido', () => {
    expect(brutoDeLiquido(70_000, CFG)).toBe(70_000)
  })
  it('alíquota de 100% não divide por zero', () => {
    expect(brutoDeLiquido(500, { ...CFG, aliquotaIrBps: 10_000 })).toBe(500)
  })
  it('valorFaixaBruto respeita a configuração', () => {
    expect(valorFaixaBruto(700_000, CFG)).toBe(700_000)
    expect(valorFaixaBruto(700_000, { ...CFG, valorRateioApiEh: 'liquido' })).toBe(1_000_000)
  })
})

describe('dividirPremio (seção 9.6)', () => {
  const tres = [
    { nome: 'Eu', peso: 1, ehUsuario: true },
    { nome: 'João', peso: 1, ehUsuario: false },
    { nome: 'Ana', peso: 1, ehUsuario: false },
  ]

  it('R$ 100,00 por pesos 1/1/1 → 33,34 + 33,33 + 33,33 (aceite F2)', () => {
    const linhas = dividirPremio({ bruto: 10_000, liquido: 10_000 }, tres)
    expect(linhas.map((l) => l.liquido)).toEqual([3334, 3333, 3333])
    expect(linhas.map((l) => l.ir)).toEqual([0, 0, 0])
  })

  it('bruto, IR e líquido somam exatamente os totais', () => {
    const linhas = dividirPremio({ bruto: 1_000_000, liquido: 700_000 }, tres)
    expect(linhas.map((l) => [l.bruto, l.ir, l.liquido])).toEqual([
      [333_334, 100_000, 233_334],
      [333_333, 100_000, 233_333],
      [333_333, 100_000, 233_333],
    ])
    expect(linhas[0]!.fracao).toBeCloseTo(1 / 3)
  })

  it('pesos diferentes', () => {
    const linhas = dividirPremio({ bruto: 10_000, liquido: 10_000 }, [
      { nome: 'Eu', peso: 1, ehUsuario: true },
      { nome: 'Ana', peso: 3, ehUsuario: false },
    ])
    expect(linhas.map((l) => l.liquido)).toEqual([2500, 7500])
  })

  it('sem participantes não há divisão', () => {
    expect(dividirPremio({ bruto: 100, liquido: 100 }, [])).toEqual([])
  })
})

describe('simularDivisao', () => {
  it('valor bruto de um bolão, dividido com amigos', () => {
    const r = simularDivisao(
      {
        valor: 38_000_000,
        tipoValor: 'bruto',
        totalCotas: 38,
        cotasUsuario: 2,
        participantes: [
          { nome: 'Eu', peso: 1, ehUsuario: true },
          { nome: 'João', peso: 1, ehUsuario: false },
        ],
      },
      CFG,
    )
    expect(r).toMatchObject({
      brutoUsuario: 2_000_000,
      irUsuario: 600_000,
      liquidoUsuario: 1_400_000,
    })
    expect(r.divisao.map((l) => l.liquido)).toEqual([700_000, 700_000])
  })

  it('valor líquido: a parte líquida é exata e o bruto é estimado', () => {
    const r = simularDivisao(
      { valor: 700_000, tipoValor: 'liquido', totalCotas: 1, cotasUsuario: 1, participantes: [] },
      CFG,
    )
    expect(r).toMatchObject({
      brutoUsuario: 1_000_000,
      irUsuario: 300_000,
      liquidoUsuario: 700_000,
    })
    // Sem participantes, o usuário fica com tudo.
    expect(r.divisao).toHaveLength(1)
    expect(r.divisao[0]).toMatchObject({ nome: 'Eu', liquido: 700_000 })
  })

  it('valor líquido de bolão, IR por cota e pela aposta', () => {
    const entrada = {
      valor: 26_600_000,
      tipoValor: 'liquido' as const,
      totalCotas: 38,
      cotasUsuario: 1,
      participantes: [],
    }
    expect(simularDivisao(entrada, CFG)).toMatchObject({
      liquidoUsuario: 700_000,
      brutoUsuario: 1_000_000,
    })
    expect(simularDivisao(entrada, POR_APOSTA)).toMatchObject({
      liquidoUsuario: 700_000,
      brutoUsuario: 1_000_000,
    })
  })

  it('normaliza cotas fora do intervalo', () => {
    const r = simularDivisao(
      { valor: 10_000, tipoValor: 'bruto', totalCotas: 0, cotasUsuario: 5, participantes: [] },
      CFG,
    )
    expect(r.liquidoUsuario).toBe(10_000)
  })
})

describe('auxiliares', () => {
  it('prazo de resgate: sorteio + 90 dias', () => {
    expect(prazoResgate('2026-10-14', 90)).toBe('2027-01-12')
    expect(prazoResgate('2026-02-27', 2)).toBe('2026-03-01')
  })

  it('configDoBanco converte a linha de configuracoes', () => {
    expect(
      configDoBanco({
        aliquota_ir_bps: 3000,
        limite_isencao_ir_centavos: 225_920,
        base_calculo_ir: 'aposta',
        valor_rateio_api_eh: 'liquido',
        prazo_resgate_dias: 90,
      }),
    ).toEqual({ ...CFG, baseCalculoIr: 'aposta', valorRateioApiEh: 'liquido' })
    expect(
      configDoBanco({
        ...{ aliquota_ir_bps: 1, limite_isencao_ir_centavos: 1, prazo_resgate_dias: 1 },
        base_calculo_ir: 'x',
        valor_rateio_api_eh: 'y',
      }),
    ).toMatchObject({
      baseCalculoIr: 'cota',
      valorRateioApiEh: 'bruto',
    })
  })
})
