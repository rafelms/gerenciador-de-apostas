import { createBrowserRouter, Navigate } from 'react-router'

import { RotaAdmin, RotaProtegida, RotaPublica } from '@/features/auth/guardas'
import { AppLayout } from './layout/app-layout'

// Telas internas carregadas sob demanda: o bundle inicial fica só com o login
// e a casca do app (seção 16: bundle inicial < 250 KB gzip).
const futuras = () => import('./paginas-futuras')

// Rotas da seção 12.6.
export const router = createBrowserRouter([
  {
    element: <RotaPublica />,
    children: [
      { path: '/login', lazy: async () => ({ Component: (await import('@/features/auth/login-page')).LoginPage }) },
      {
        path: '/esqueci-senha',
        lazy: async () => ({ Component: (await import('@/features/auth/esqueci-senha-page')).EsqueciSenhaPage }),
      },
    ],
  },
  // Estas três dependem de uma sessão "em andamento" e cuidam do próprio acesso.
  { path: '/mfa', lazy: async () => ({ Component: (await import('@/features/auth/mfa-page')).MfaPage }) },
  {
    path: '/redefinir-senha',
    lazy: async () => ({ Component: (await import('@/features/auth/redefinir-senha-page')).RedefinirSenhaPage }),
  },
  { path: '/convite', lazy: async () => ({ Component: (await import('@/features/auth/convite-page')).ConvitePage }) },
  {
    element: <RotaProtegida />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/',
            lazy: async () => ({ Component: (await import('@/features/dashboard/dashboard-page')).DashboardPage }),
          },
          {
            path: '/apostas',
            lazy: async () => ({ Component: (await import('@/features/apostas/apostas-lista-page')).ApostasListaPage }),
          },
          {
            path: '/apostas/nova',
            lazy: async () => ({ Component: (await import('@/features/apostas/aposta-form-page')).ApostaFormPage }),
          },
          {
            path: '/apostas/:id',
            lazy: async () => ({ Component: (await import('@/features/apostas/aposta-detalhe-page')).ApostaDetalhePage }),
          },
          {
            path: '/apostas/:id/editar',
            lazy: async () => ({ Component: (await import('@/features/apostas/aposta-form-page')).ApostaFormPage }),
          },
          { path: '/importar', lazy: async () => ({ Component: (await futuras()).ImportarPage }) },
          { path: '/exportar', lazy: async () => ({ Component: (await futuras()).ExportarPage }) },
          { path: '/resultados', lazy: async () => ({ Component: (await futuras()).ResultadosPage }) },
          { path: '/calendario', lazy: async () => ({ Component: (await futuras()).CalendarioPage }) },
          { path: '/analisador', lazy: async () => ({ Component: (await futuras()).AnalisadorPage }) },
          { path: '/simulador-rateio', lazy: async () => ({ Component: (await futuras()).SimuladorRateioPage }) },
          { path: '/orcamento', lazy: async () => ({ Component: (await futuras()).OrcamentoPage }) },
          { path: '/notificacoes', lazy: async () => ({ Component: (await futuras()).NotificacoesPage }) },
          {
            path: '/configuracoes',
            lazy: async () => ({
              Component: (await import('@/features/configuracoes/configuracoes-page')).ConfiguracoesPage,
            }),
          },
          {
            path: '/admin',
            element: <RotaAdmin />,
            children: [
              { index: true, lazy: async () => ({ Component: (await import('@/features/admin/admin-page')).AdminPage }) },
              {
                path: 'usuarios',
                lazy: async () => ({ Component: (await import('@/features/admin/usuarios-page')).UsuariosPage }),
              },
              { path: 'resultados', lazy: async () => ({ Component: (await futuras()).AdminResultadosPage }) },
              { path: 'configuracoes', lazy: async () => ({ Component: (await futuras()).AdminConfiguracoesPage }) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
