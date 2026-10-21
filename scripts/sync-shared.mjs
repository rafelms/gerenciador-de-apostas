// Copia packages/shared/src → supabase/functions/_shared/domain/ para as Edge Functions.
// O deploy das functions não resolve caminhos fora de supabase/functions (seção 6).
//   node scripts/sync-shared.mjs          → copia
//   node scripts/sync-shared.mjs --check  → falha (exit 1) se a cópia estiver desatualizada (CI)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origem = path.join(raiz, 'packages/shared/src')
const destino = path.join(raiz, 'supabase/functions/_shared/domain')
const CABECALHO = '// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.\n'

function listar(dir, base = dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? listar(p, base) : [path.relative(base, p).replaceAll('\\', '/')]
  })
}

// No Deno, `zod` vem do import map em supabase/functions/deno.json.
const esperado = new Map(
  listar(origem)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => [f, CABECALHO + fs.readFileSync(path.join(origem, f), 'utf8')]),
)

if (process.argv.includes('--check')) {
  const atuais = listar(destino)
  const divergentes = [
    ...[...esperado]
      .filter(
        ([f, c]) =>
          !fs.existsSync(path.join(destino, f)) ||
          fs.readFileSync(path.join(destino, f), 'utf8') !== c,
      )
      .map(([f]) => f),
    ...atuais.filter((f) => !esperado.has(f)),
  ]
  if (divergentes.length) {
    console.error('Cópia do shared desatualizada. Rode `pnpm sync:shared`. Arquivos:', divergentes)
    process.exit(1)
  }
  console.log('Cópia do shared em dia.')
} else {
  fs.rmSync(destino, { recursive: true, force: true })
  for (const [f, conteudo] of esperado) {
    const alvo = path.join(destino, f)
    fs.mkdirSync(path.dirname(alvo), { recursive: true })
    fs.writeFileSync(alvo, conteudo)
  }
  console.log(`Copiados ${esperado.size} arquivos para supabase/functions/_shared/domain/`)
}
