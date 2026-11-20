import { COLUNAS_PLANILHA } from '@shared/parsers/planilha.ts'
import { useMutation } from '@tanstack/react-query'
import { FileSpreadsheet, FileText, Loader2, SlidersHorizontal } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { filtrosAtivos, filtrosDaUrl, filtrosParaUrl } from '@/features/apostas/filtros'
import { baixarCsv, baixarXlsx } from '@/features/importacao/arquivo-planilha'
import { useModalidades } from '@/features/modalidades/use-modalidades'
import { hojeIso } from '@/lib/formatadores'
import { dadosParaExportar, type AlvoExportacao } from './api'

type Formato = 'xlsx' | 'csv'

/** Ids vindos de "Exportar" na seleção da lista (estado da navegação). */
function idsDoEstado(estado: unknown): string[] | null {
  const ids = (estado as { ids?: unknown } | null)?.ids
  return Array.isArray(ids) && ids.every((i) => typeof i === 'string') && ids.length > 0
    ? ids
    : null
}

export function ExportarPage() {
  const [params] = useSearchParams()
  const { state } = useLocation()
  const { data: modalidades } = useModalidades()
  const ids = idsDoEstado(state)
  const filtros = filtrosDaUrl(params)
  const alvo: AlvoExportacao = ids ? { ids } : { filtros }
  const ativos = filtrosAtivos(
    filtros,
    modalidades?.find((m) => m.slug === filtros.modalidade)?.nome,
  )

  const exportar = useMutation({
    mutationFn: async (formato: Formato) => {
      const dados = await dadosParaExportar(alvo)
      if (dados.qtdApostas === 0) throw new Error('Nenhuma aposta para exportar com esses filtros.')
      const nome = `lotogestor-apostas-${hojeIso()}`
      if (formato === 'xlsx') await baixarXlsx(`${nome}.xlsx`, dados.abas)
      else baixarCsv(`${nome}.csv`, dados.linhasApostas, COLUNAS_PLANILHA)
      return dados.qtdApostas
    },
    onSuccess: (qtd) =>
      toast.success(qtd === 1 ? '1 aposta exportada.' : `${qtd} apostas exportadas.`),
    onError: (e) => toast.error(e.message || 'Não foi possível exportar. Tente de novo.'),
  })
  const exportando = exportar.isPending ? exportar.variables : null

  return (
    <>
      <CabecalhoPagina
        titulo="Exportar apostas"
        descricao="Baixe suas apostas para guardar, abrir no Excel ou importar em outra conta."
      />
      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>O que será exportado</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {ids ? (
              <p>
                {ids.length === 1
                  ? '1 aposta selecionada na lista.'
                  : `${ids.length} apostas selecionadas na lista.`}
              </p>
            ) : ativos.length > 0 ? (
              <>
                <p>As apostas com estes filtros da lista:</p>
                <ul className="flex flex-wrap gap-2" aria-label="Filtros da exportação">
                  {ativos.map((f) => (
                    <li
                      key={f.rotulo}
                      className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground"
                    >
                      {f.rotulo}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Todas as suas apostas.</p>
            )}
            <div>
              <Button asChild variant="outline" size="sm">
                <Link to={`/apostas?${filtrosParaUrl(filtros).toString()}`}>
                  <SlidersHorizontal aria-hidden="true" />
                  {ids ? 'Escolher na lista' : 'Alterar filtros na lista'}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Formato</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="grid gap-2">
              <Button
                onClick={() => exportar.mutate('xlsx')}
                disabled={exportar.isPending}
                className="justify-self-start"
              >
                {exportando === 'xlsx' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <FileSpreadsheet aria-hidden="true" />
                )}
                Baixar Excel (.xlsx)
              </Button>
              <p className="text-muted-foreground">
                Abas Apostas (no formato do modelo, pode ser importada de novo), Prêmios e Resumo
                por mês e modalidade.
              </p>
            </div>
            <div className="grid gap-2">
              <Button
                variant="outline"
                onClick={() => exportar.mutate('csv')}
                disabled={exportar.isPending}
                className="justify-self-start"
              >
                {exportando === 'csv' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <FileText aria-hidden="true" />
                )}
                Baixar CSV
              </Button>
              <p className="text-muted-foreground">
                Só as apostas, separadas por ponto e vírgula, como o Excel em português abre.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
