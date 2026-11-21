// Versão nova do app (seção 11.14). O service worker novo assume assim que instala
// (skipWaiting + clientsClaim, em vite.config.ts) e a página recarrega para usar os
// arquivos novos — mas nunca no meio de um formulário com dados não salvos: aí avisamos
// e a recarga fica para quando o usuário salvar, sair da tela ou pedir.
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

const ID_AVISO = 'versao-nova'

/** Telas com dados digitados e ainda não salvos. */
const trabalhos = new Set<symbol>()
let pendente = false

let recarregar = () => window.location.reload()
let avisar = () => {
  toast('Há uma versão nova do LotoGestor.', {
    id: ID_AVISO,
    description: 'Ela entra quando você salvar ou sair desta tela.',
    duration: Number.POSITIVE_INFINITY,
    action: { label: 'Atualizar agora', onClick: () => recarregar() },
  })
}

/** Só para testes: troca a recarga e o aviso. */
export function configurarAtualizacao(opcoes: { recarregar?: () => void; avisar?: () => void }) {
  if (opcoes.recarregar) recarregar = opcoes.recarregar
  if (opcoes.avisar) avisar = opcoes.avisar
}

/** Só para testes. */
export function reiniciarAtualizacao() {
  trabalhos.clear()
  pendente = false
}

/** O service worker de uma versão nova assumiu: recarrega agora ou quando for seguro. */
export function versaoNovaAtiva() {
  if (trabalhos.size === 0) {
    recarregar()
    return
  }
  if (!pendente) avisar()
  pendente = true
}

/** Marca (ou desmarca) uma tela com dados não salvos. */
export function marcarTrabalhoNaoSalvo(id: symbol, naoSalvo: boolean) {
  if (naoSalvo) trabalhos.add(id)
  else trabalhos.delete(id)
  if (pendente && trabalhos.size === 0) {
    pendente = false
    toast.dismiss(ID_AVISO)
    recarregar()
  }
}

/** Enquanto `naoSalvo` for true (e a tela estiver aberta), a atualização espera. */
export function useTrabalhoNaoSalvo(naoSalvo: boolean) {
  const id = useRef(Symbol('trabalho'))
  useEffect(() => {
    const atual = id.current
    marcarTrabalhoNaoSalvo(atual, naoSalvo)
    return () => marcarTrabalhoNaoSalvo(atual, false)
  }, [naoSalvo])
}

/** Procura versão nova ao voltar para o app e a cada 30 min (o app fica aberto por dias). */
export function verificarAtualizacoes(registro: ServiceWorkerRegistration) {
  const verificar = () => {
    if (navigator.onLine && !registro.installing) void registro.update().catch(() => undefined)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verificar()
  })
  window.setInterval(verificar, 30 * 60 * 1000)
}
