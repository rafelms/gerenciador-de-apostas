// Mede o JS inicial (entry + modulepreload do index.html) em gzip e falha acima do limite.
// Seção 16: bundle inicial < 250 KB gzip. Uso: node scripts/tamanho-bundle.mjs [limiteKB]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/dist')
const limiteKb = Number(process.argv[2] ?? 250)

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const arquivos = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])

let js = 0
let css = 0
for (const arquivo of arquivos) {
  const bytes = zlib.gzipSync(fs.readFileSync(path.join(dist, arquivo))).length
  if (arquivo.endsWith('.css')) css += bytes
  else js += bytes
}

const kb = (b) => (b / 1024).toFixed(1)
console.log(`JS inicial: ${kb(js)} KB gzip · CSS: ${kb(css)} KB gzip (${arquivos.length} arquivos)`)
if (js / 1024 > limiteKb) {
  console.error(`Acima do limite de ${limiteKb} KB gzip.`)
  process.exit(1)
}
