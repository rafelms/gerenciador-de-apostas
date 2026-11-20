import { createBrowserRouter, Navigate } from 'react-router'

import { ErroDeRota } from '@/components/erro-de-rota'
import { RotaAdmin, RotaProtegida, RotaPublica } from '@/features/auth/guardas'

// Telas internas carregadas sob demanda: o bundle inicial fica só com o login
// e a casca do app (seção 16: bundle inicial < 250 KB gzip).
const futuras = () => import('./paginas-futuras')

// Rotas da seção 12.6. A rota raiz (sem caminho) só existe para o errorElement valer
// para todas: erro numa tela ou arquivo de tela que sumiu após um deploy.
export const router = createBrowserRouter([
  {
    errorElement: <ErroDeRota />,
    children: [
      {
        element: <RotaPublica />,
        children: [
          {
            path: '/login',
            lazy: async () => ({
              Component: (await import('@/features/auth/login-page')).LoginPage,
            }),
          },
          {
            path: '/esqueci-senha',
            lazy: async () => ({
              Component: (await import('@/features/auth/esqueci-senha-page')).EsqueciSenhaPage,
            }),
          },
        ],
      },
      // Estas três dependem de uma sessão "em andamento" e cuidam do próprio acesso.
      {
        path: '/mfa',
        lazy: async () => ({ Component: (await import('@/features/auth/mfa-page')).MfaPage }),
      },
      {
        path: '/redefinir-senha',
        lazy: async () => ({
          Component: (await import('@/features/auth/redefinir-senha-page')).RedefinirSenhaPage,
        }),
      },
      {
        path: '/convite',
        lazy: async () => ({
          Component: (await import('@/features/auth/convite-page')).ConvitePage,
        }),
      },
      {
        element: <RotaProtegida />,
        children: [
          {
            // A casca (barras, menu, sino) também é sob demanda: o login não precisa dela.
            lazy: async () => ({ Component: (await import('./layout/app-layout')).AppLayout }),
            children: [
              {
                path: '/',
                lazy: async () => ({
                  Component: (await import('@/features/dashboard/dashboard-page')).DashboardPage,
                }),
              },
              {
                path: '/apostas',
                lazy: async () => ({
                  Component: (await import('@/features/apostas/apostas-lista-page'))
                    .ApostasListaPage,
                }),
              },
              {
                path: '/apostas/nova',
                lazy: async () => ({
                  Component: (await import('@/features/apostas/aposta-form-page')).ApostaFormPage,
                }),
              },
              {
                path: '/apostas/:id',
                lazy: async () => ({
                  Component: (await import('@/features/apostas/aposta-detalhe-page'))
                    .ApostaDetalhePage,
                }),
              },
              {
                path: '/apostas/:id/editar',
                lazy: async () => ({
                  Component: (await import('@/features/apostas/aposta-form-page')).ApostaFormPage,
                }),
              },
              {
                path: '/importar',
                lazy: async () => ({
                  Component: (await import('@/features/importacao/importar-page')).ImportarPage,
                }),
              },
              {
                path: '/exportar',
                lazy: async () => ({
                  Component: (await import('@/features/exportacao/exportar-page')).ExportarPage,
                }),
              },
              {
                path: '/resultados',
                lazy: async () => ({
                  Component: (await import('@/features/resultados/resultados-page')).ResultadosPage,
                }),
              },
              {
                path: '/calendario',
                lazy: async () => ({
                  Component: (await import('@/features/calendario/calendario-page')).CalendarioPage,
                }),
              },
              {
                path: '/analisador',
                lazy: async () => ({ Component: (await futuras()).AnalisadorPage }),
              },
              {
                path: '/simulador-rateio',
                lazy: async () => ({
                  Component: (await import('@/features/simulador/simulador-page')).SimuladorPage,
                }),
              },
              {
                path: '/orcamento',
                lazy: async () => ({
                  Component: (await import('@/features/orcamento/orcamento-page')).OrcamentoPage,
                }),
              },
              {
                path: '/notificacoes',
                lazy: async () => ({
                  Component: (await import('@/features/notificacoes/notificacoes-page'))
                    .NotificacoesPage,
                }),
              },
              {
                path: '/configuracoes',
                lazy: async () => ({
                  Component: (await import('@/features/configuracoes/configuracoes-page'))
                    .ConfiguracoesPage,
                }),
              },
              {
                path: '/admin',
                element: <RotaAdmin />,
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/features/admin/admin-page')).AdminPage,
                    }),
                  },
                  {
                    path: 'usuarios',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/usuarios-page')).UsuariosPage,
                    }),
                  },
                  {
                    path: 'resultados',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/resultados-page'))
                        .AdminResultadosPage,
                    }),
                  },
                  {
                    path: 'metricas',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/metricas-page')).AdminMetricasPage,
                    }),
                  },
                  {
                    path: 'configuracoes',
                    lazy: async () => ({
                      Component: (await import('@/features/admin/configuracoes-sistema-page'))
                        .AdminConfiguracoesPage,
                    }),
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
