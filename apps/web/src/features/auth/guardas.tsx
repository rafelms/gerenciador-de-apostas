import { Navigate, Outlet, useLocation } from 'react-router'

import { CarregandoTela } from '@/components/carregando-tela'
import { useAuth } from './auth-provider'

/** Exige sessão ativa. Se o usuário tem MFA cadastrado e ainda não validou, vai para /mfa. */
export function RotaProtegida() {
  const { carregando, sessao, perfil, precisaMfa } = useAuth()
  const location = useLocation()

  if (carregando) return <CarregandoTela />
  if (!sessao || !perfil)
    return <Navigate to="/login" replace state={{ de: location.pathname + location.search }} />
  if (precisaMfa)
    return <Navigate to="/mfa" replace state={{ de: location.pathname + location.search }} />
  return <Outlet />
}

/** Área do admin: papel admin + sessão aal2. Sem MFA ativo, manda ativar (seção 11.13). */
export function RotaAdmin() {
  const { ehAdmin, aalAtual } = useAuth()

  if (!ehAdmin) return <Navigate to="/" replace />
  if (aalAtual !== 'aal2')
    return <Navigate to="/configuracoes?secao=seguranca&motivo=admin-mfa" replace />
  return <Outlet />
}

/** Telas de login/recuperação: quem já está logado volta para o início. */
export function RotaPublica() {
  const { carregando, sessao, perfil, precisaMfa } = useAuth()

  if (carregando) return <CarregandoTela />
  if (sessao && perfil && !precisaMfa) return <Navigate to="/" replace />
  return <Outlet />
}
