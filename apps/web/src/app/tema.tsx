import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Tema = 'claro' | 'escuro' | 'sistema'
type TemaEfetivo = 'claro' | 'escuro'

const CHAVE = 'lotogestor:tema'

interface TemaContexto {
  tema: Tema
  temaEfetivo: TemaEfetivo
  setTema: (tema: Tema) => void
}

const Contexto = createContext<TemaContexto | null>(null)

function lerTemaSalvo(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo === 'claro' || salvo === 'escuro' || salvo === 'sistema') return salvo
  } catch {
    // localStorage indisponível
  }
  return 'sistema'
}

function sistemaEhEscuro() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(lerTemaSalvo)
  const [sistemaEscuro, setSistemaEscuro] = useState(sistemaEhEscuro)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const ouvir = () => setSistemaEscuro(mq.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])

  const temaEfetivo: TemaEfetivo = tema === 'sistema' ? (sistemaEscuro ? 'escuro' : 'claro') : tema

  useEffect(() => {
    document.documentElement.classList.toggle('dark', temaEfetivo === 'escuro')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', temaEfetivo === 'escuro' ? '#1A1C33' : '#282B4A')
  }, [temaEfetivo])

  const setTema = useCallback((novo: Tema) => {
    setTemaState(novo)
    try {
      localStorage.setItem(CHAVE, novo)
    } catch {
      // ignora
    }
  }, [])

  const valor = useMemo(() => ({ tema, temaEfetivo, setTema }), [tema, temaEfetivo, setTema])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTema() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useTema precisa estar dentro de <TemaProvider>')
  return ctx
}
