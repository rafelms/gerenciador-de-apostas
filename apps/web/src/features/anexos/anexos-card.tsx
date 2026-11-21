import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-provider'
import { formatarDataHora } from '@/lib/formatadores'
import {
  chavesAnexos,
  enviarAnexo,
  listarAnexos,
  MAX_ANEXOS,
  removerAnexo,
  urlAssinada,
  type Anexo,
} from './api'
import { comprimirImagem, ErroAnexo, TIPOS_ACEITOS } from './comprimir'

/** Fotos do comprovante (seção 11.12): até 3, câmera no celular, vistas em lightbox. */
export function AnexosCard({ apostaId }: { apostaId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState<(Anexo & { urlGrande: string | null }) | null>(null)

  async function abrir(a: Anexo) {
    setAberto({ ...a, urlGrande: null })
    try {
      const urlGrande = await urlAssinada(a.storagePath)
      setAberto((atual) => (atual?.id === a.id ? { ...atual, urlGrande } : atual))
    } catch (e) {
      setAberto(null)
      toast.error(e instanceof Error ? e.message : 'Não foi possível abrir a foto.')
    }
  }

  const anexos = useQuery({
    queryKey: chavesAnexos.daAposta(apostaId),
    queryFn: () => listarAnexos(apostaId),
    // As URLs assinadas valem 60 s; as miniaturas já carregadas ficam na tela.
    staleTime: 45_000,
  })
  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: chavesAnexos.daAposta(apostaId) })

  const enviar = useMutation({
    mutationFn: async (arquivo: File) => {
      const imagem = await comprimirImagem(arquivo)
      await enviarAnexo(perfil!.id, apostaId, imagem)
    },
    onSuccess: () => {
      toast.success('Foto anexada.')
      void invalidar()
    },
    onError: (e) =>
      toast.error(
        e instanceof ErroAnexo || e instanceof Error ? e.message : 'Não foi possível anexar.',
      ),
  })

  const remover = useMutation({
    mutationFn: removerAnexo,
    onSuccess: () => {
      setAberto(null)
      toast.success('Foto removida.')
      void invalidar()
    },
    onError: (e) => toast.error(e.message),
  })

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (arquivo) enviar.mutate(arquivo)
  }

  const lista = anexos.data ?? []
  const cheio = lista.length >= MAX_ANEXOS

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Comprovantes</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {anexos.isPending && <Skeleton className="h-24 w-full rounded-xl" />}
        {anexos.isError && (
          <p className="text-sm text-destructive">Não foi possível carregar as fotos.</p>
        )}
        {lista.length > 0 && (
          <ul className="grid grid-cols-3 gap-2" aria-label="Fotos anexadas">
            {lista.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="block aspect-square w-full overflow-hidden rounded-xl bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => void abrir(a)}
                  aria-label={`Ver foto ${i + 1} de ${lista.length}`}
                >
                  {a.url ? (
                    <img src={a.url} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Indisponível</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {anexos.data && lista.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Anexe a foto do bilhete ou do comprovante (até {MAX_ANEXOS}). Só você vê.
          </p>
        )}

        {anexos.data && !cheio && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={camera}
              type="file"
              accept={TIPOS_ACEITOS.join(',')}
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={escolher}
            />
            <input
              ref={galeria}
              type="file"
              accept={TIPOS_ACEITOS.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={escolher}
            />
            <Button
              variant="outline"
              className="lg:hidden"
              disabled={enviar.isPending}
              onClick={() => camera.current?.click()}
            >
              <Camera aria-hidden="true" />
              Tirar foto
            </Button>
            <Button
              variant="outline"
              disabled={enviar.isPending}
              onClick={() => galeria.current?.click()}
            >
              {enviar.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus aria-hidden="true" />
              )}
              {enviar.isPending ? 'Enviando…' : 'Escolher imagem'}
            </Button>
          </div>
        )}
        {cheio && (
          <p className="text-xs text-muted-foreground">
            Limite de {MAX_ANEXOS} fotos. Remova uma para anexar outra.
          </p>
        )}
      </CardContent>

      <Dialog open={!!aberto} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-3xl">
          <div>
            <DialogTitle>Comprovante</DialogTitle>
            {aberto && (
              <DialogDescription>Anexado em {formatarDataHora(aberto.criadoEm)}</DialogDescription>
            )}
          </div>
          {aberto && !aberto.urlGrande && <Skeleton className="aspect-[3/4] w-full rounded-xl" />}
          {aberto?.urlGrande && (
            <img
              src={aberto.urlGrande}
              alt="Foto do comprovante da aposta"
              className="mx-auto max-h-full min-h-0 w-auto rounded-xl object-contain"
            />
          )}
          <DialogFooter>
            {aberto && (
              <ConfirmDialog
                titulo="Remover esta foto?"
                descricao="A foto sai do comprovante e não dá para desfazer."
                textoConfirmar="Remover"
                destrutivo
                onConfirmar={() => remover.mutateAsync(aberto)}
              >
                <Button variant="outline" className="text-destructive">
                  <Trash2 aria-hidden="true" />
                  Remover
                </Button>
              </ConfirmDialog>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
