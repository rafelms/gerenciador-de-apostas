import { useSearchParams } from 'react-router'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImportarExcel } from './importar-excel'
import { ImportarPdf } from './importar-pdf'

type Aba = 'planilha' | 'pdf'

export function ImportarPage() {
  const [params, setParams] = useSearchParams()
  const aba: Aba = params.get('aba') === 'pdf' ? 'pdf' : 'planilha'

  return (
    <>
      <CabecalhoPagina
        titulo="Importar apostas"
        descricao="Traga várias apostas de uma vez, por planilha ou pelo PDF do comprovante."
      />
      <Tabs
        value={aba}
        onValueChange={(v) => setParams(v === 'pdf' ? { aba: 'pdf' } : {}, { replace: true })}
      >
        <TabsList className="mb-2">
          <TabsTrigger value="planilha">Planilha</TabsTrigger>
          <TabsTrigger value="pdf">Comprovante (PDF)</TabsTrigger>
        </TabsList>
        <TabsContent value="planilha">
          <ImportarExcel />
        </TabsContent>
        <TabsContent value="pdf">
          <ImportarPdf />
        </TabsContent>
      </Tabs>
    </>
  )
}
