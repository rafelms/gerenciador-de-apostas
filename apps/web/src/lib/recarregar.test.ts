import { afterEach, describe, expect, it, vi } from 'vitest'

import { ehErroDeVersaoAntiga, recarregarUmaVez } from './recarregar'

describe('ehErroDeVersaoAntiga', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://app/assets/x.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
  ])('reconhece "%s"', (mensagem) => {
    expect(ehErroDeVersaoAntiga(new TypeError(mensagem))).toBe(true)
  })

  it('ignora outros erros', () => {
    expect(ehErroDeVersaoAntiga(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(ehErroDeVersaoAntiga({ status: 404 })).toBe(false)
  })
})

describe('recarregarUmaVez', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('recarrega uma vez e trava novas recargas por 30 s', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    expect(recarregarUmaVez()).toBe(true)
    expect(recarregarUmaVez()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
