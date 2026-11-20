import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { ImportarExcel } from './importar-excel'

export function ImportarPage() {
  return (
    <>
      <CabecalhoPagina
        titulo="Importar apostas"
        descricao="Traga várias apostas de uma vez a partir de uma planilha."
      />
      <ImportarExcel />
    </>
  )
}
