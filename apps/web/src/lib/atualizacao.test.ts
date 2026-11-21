import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  configurarAtualizacao,
  marcarTrabalhoNaoSalvo,
  reiniciarAtualizacao,
  useTrabalhoNaoSalvo,
  verificarAtualizacoes,
  versaoNovaAtiva,
} from './atualizacao'

const recarregar = vi.fn()
const avisar = vi.fn()

beforeEach(() => {
  reiniciarAtualizacao()
  recarregar.mockReset()
  avisar.mockReset()
  configurarAtualizacao({ recarregar, avisar })
})

describe('versão nova do app', () => {
  it('sem dados não salvos, recarrega na hora', () => {
    versaoNovaAtiva()
    expect(recarregar).toHaveBeenCalledOnce()
    expect(avisar).not.toHaveBeenCalled()
  })

  it('com formulário alterado, avisa e só recarrega quando ele é salvo ou fechado', () => {
    const { rerender, unmount } = renderHook(({ sujo }) => useTrabalhoNaoSalvo(sujo), {
      initialProps: { sujo: true },
    })
    versaoNovaAtiva()
    versaoNovaAtiva() // outra aba ativou de novo: um aviso só
    expect(recarregar).not.toHaveBeenCalled()
    expect(avisar).toHaveBeenCalledOnce()

    rerender({ sujo: true })
    expect(recarregar).not.toHaveBeenCalled()
    unmount()
    expect(recarregar).toHaveBeenCalledOnce()
  })

  it('espera todas as telas com dados não salvos', () => {
    const a = Symbol('a')
    const b = Symbol('b')
    marcarTrabalhoNaoSalvo(a, true)
    marcarTrabalhoNaoSalvo(b, true)
    versaoNovaAtiva()
    marcarTrabalhoNaoSalvo(a, false)
    expect(recarregar).not.toHaveBeenCalled()
    marcarTrabalhoNaoSalvo(b, false)
    expect(recarregar).toHaveBeenCalledOnce()
  })

  it('formulário limpo não segura a atualização', () => {
    renderHook(() => useTrabalhoNaoSalvo(false))
    versaoNovaAtiva()
    expect(recarregar).toHaveBeenCalledOnce()
  })

  it('sem versão nova, fechar o formulário não recarrega', () => {
    const { unmount } = renderHook(() => useTrabalhoNaoSalvo(true))
    unmount()
    expect(recarregar).not.toHaveBeenCalled()
  })
})

describe('verificarAtualizacoes', () => {
  afterEach(() => vi.useRealTimers())

  it('procura versão nova ao voltar para o app e a cada 30 min', () => {
    vi.useFakeTimers()
    const update = vi.fn().mockResolvedValue(undefined)
    verificarAtualizacoes({ update, installing: null } as unknown as ServiceWorkerRegistration)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30 * 60 * 1000)
    expect(update).toHaveBeenCalledTimes(2)
  })
})
