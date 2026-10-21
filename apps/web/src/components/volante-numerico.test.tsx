import { regras } from '@shared/regras/index.ts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { VolanteNumerico } from './volante-numerico'

function Volante({ inicial = [] as number[] }) {
  const [dezenas, setDezenas] = useState(inicial)
  return (
    <VolanteNumerico
      regra={regras.megasena}
      selecionadas={dezenas}
      onChange={setDezenas}
      precoSimples={600}
    />
  )
}

describe('VolanteNumerico', () => {
  it('mostra as 60 dezenas da Mega-Sena como botões alternáveis', () => {
    render(<Volante />)
    expect(screen.getAllByRole('button', { name: /^Dezena/ })).toHaveLength(60)
    expect(screen.getByRole('button', { name: 'Dezena 01' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('marca, conta e mostra o custo ao vivo (7 dezenas = R$ 42,00)', async () => {
    const user = userEvent.setup()
    render(<Volante />)
    for (const d of ['02', '09', '24', '28', '44', '48'])
      await user.click(screen.getByRole('button', { name: `Dezena ${d}` }))
    expect(screen.getByText('6/6–20')).toBeInTheDocument()
    expect(screen.getByText('R$ 6,00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dezena 49' }))
    expect(screen.getByText('7/6–20')).toBeInTheDocument()
    expect(screen.getByText('R$ 42,00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dezena 49' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Dezena 49' }))
    expect(screen.getByText('6/6–20')).toBeInTheDocument()
  })

  it('não deixa passar do máximo e permite limpar', async () => {
    const user = userEvent.setup()
    render(<Volante inicial={Array.from({ length: 20 }, (_, i) => i + 1)} />)
    expect(screen.getByRole('button', { name: 'Dezena 21' })).toBeDisabled()
    expect(screen.getByText(/Máximo de 20 dezenas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Limpar/ }))
    expect(screen.getByText('0/6–20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dezena 21' })).toBeEnabled()
  })
})
