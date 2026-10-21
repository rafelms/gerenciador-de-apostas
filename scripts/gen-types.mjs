// Gera apps/web/src/types/database.ts a partir do banco local.
// Script em Node (e não `>` no shell) para não depender da codificação do terminal
// — o redirecionamento do PowerShell grava UTF-16/BOM.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const saida = path.join(raiz, 'apps/web/src/types/database.ts')

const tipos = execFileSync('pnpm', ['exec', 'supabase', 'gen', 'types', 'typescript', '--local'], {
  cwd: raiz,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'inherit'],
})

fs.mkdirSync(path.dirname(saida), { recursive: true })
fs.writeFileSync(saida, tipos.replace(/^\uFEFF/, ''))
console.log(`Tipos gerados em ${path.relative(raiz, saida)}`)
