import { expect, test, type Page } from '@playwright/test'

import {
  admin,
  clienteAnonimo,
  criarUsuario,
  entrarPelaTela,
  limparUsuariosDeTeste,
  semRolagemHorizontal,
  SENHA_TESTE,
} from './helpers'

test.afterAll(async () => {
  await limparUsuariosDeTeste()
})

async function criarAposta(email: string) {
  const cliente = clienteAnonimo()
  await cliente.auth.signInWithPassword({ email, password: SENHA_TESTE })
  const { data, error } = await cliente.rpc('salvar_aposta', {
    p_aposta: {
      modalidade_slug: 'megasena',
      tipo: 'simples',
      concurso_inicial: 3069,
      qtd_concursos: 1,
      data_aposta: '2026-10-10',
      valor_pago_centavos: 600,
      jogos: [[3, 17, 22, 31, 40, 50]],
      participantes: [],
    } as never,
  })
  if (error) throw error
  return { id: data as string, cliente }
}

/** JPEG gerado no próprio navegador: ruído em 4000×3000 dá uma foto "de câmera" pesada. */
async function fotoPesada(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 4000
    c.height = 3000
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(c.width, c.height)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255
      img.data[i + 1] = Math.random() * 255
      img.data[i + 2] = Math.random() * 255
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.92))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  })
  return Buffer.from(base64, 'base64')
}

/** PNG 1×1 válido: o menor arquivo de imagem possível. */
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const entradaGaleria = (page: Page) => page.locator('input[type=file]:not([capture])')

test.describe('Anexos (F5.3)', () => {
  test('foto de ~8 MB é comprimida abaixo de 5 MB, abre na lightbox e só o dono acessa', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const u = await criarUsuario()
    const { id } = await criarAposta(u.email)
    await entrarPelaTela(page, u.email)
    await expect(page).toHaveURL('/')
    await page.goto(`/apostas/${id}`)
    await expect(page.getByRole('heading', { name: 'Comprovantes' })).toBeVisible()

    const foto = await fotoPesada(page)
    expect(foto.length, 'a foto de teste precisa ser pesada').toBeGreaterThan(6 * 1024 * 1024)
    await entradaGaleria(page).setInputFiles({
      name: 'bilhete.jpg',
      mimeType: 'image/jpeg',
      buffer: foto,
    })
    await expect(page.getByText('Foto anexada.')).toBeVisible({ timeout: 30_000 })

    const { data: anexo } = await admin
      .from('anexos')
      .select('storage_path, tamanho_bytes, mime')
      .eq('aposta_id', id)
      .single()
    expect(anexo!.tamanho_bytes).toBeLessThan(5 * 1024 * 1024)
    expect(anexo!.storage_path).toMatch(new RegExp(`^${u.id}/${id}/[0-9a-f-]{36}\\.(webp|jpg)$`))

    // Lightbox com URL assinada.
    await page.getByRole('button', { name: 'Ver foto 1 de 1' }).click()
    const grande = page.getByRole('img', { name: 'Foto do comprovante da aposta' })
    await expect(grande).toBeVisible()
    expect(await grande.getAttribute('src')).toContain('token=')
    await page.keyboard.press('Escape')

    // Outro usuário não gera URL nem baixa o arquivo, nem com o caminho exato.
    const outro = await criarUsuario()
    const intruso = clienteAnonimo()
    await intruso.auth.signInWithPassword({ email: outro.email, password: SENHA_TESTE })
    const { data: url } = await intruso.storage
      .from('comprovantes')
      .createSignedUrl(anexo!.storage_path, 60)
    expect(url).toBeNull()
    const { data: arquivo } = await intruso.storage
      .from('comprovantes')
      .download(anexo!.storage_path)
    expect(arquivo).toBeNull()
    await semRolagemHorizontal(page)
  })

  test('tipo errado é recusado com mensagem; até 3 fotos; remover libera', async ({ page }) => {
    const u = await criarUsuario()
    const { id } = await criarAposta(u.email)
    await entrarPelaTela(page, u.email)
    await expect(page).toHaveURL('/')
    await page.goto(`/apostas/${id}`)
    await expect(page.getByRole('heading', { name: 'Comprovantes' })).toBeVisible()

    await entradaGaleria(page).setInputFiles({
      name: 'recibo.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    })
    await expect(page.getByText('Envie uma foto em JPEG, PNG ou WebP.')).toBeVisible()

    for (let i = 1; i <= 3; i++) {
      await entradaGaleria(page).setInputFiles({
        name: `f${i}.png`,
        mimeType: 'image/png',
        buffer: PNG_MINIMO,
      })
      await expect(page.getByRole('button', { name: `Ver foto ${i} de ${i}` })).toBeVisible()
    }
    await expect(page.getByText('Limite de 3 fotos.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Escolher imagem' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Ver foto 2 de 3' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click()
    await expect(page.getByText('Foto removida.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ver foto 2 de 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Escolher imagem' })).toBeVisible()

    // Excluir a aposta leva os arquivos junto.
    const { data: antes } = await admin.from('anexos').select('storage_path').eq('aposta_id', id)
    await page
      .getByRole('button', { name: /Excluir/ })
      .first()
      .click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Excluir/ })
      .click()
    await expect(page).toHaveURL('/apostas')
    const { data: restantes } = await admin.storage.from('comprovantes').list(`${u.id}/${id}`)
    expect(antes).toHaveLength(2)
    expect(restantes ?? []).toHaveLength(0)
  })
})
