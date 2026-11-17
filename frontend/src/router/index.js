// F1-13 — Rotas com guarda por perfil.
// meta.publica: sem login. meta.perfis: perfis que podem acessar (padrão: qualquer logado).
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LayoutPrincipal from '@/layouts/LayoutPrincipal.vue'

const GESTOR = ['gestor']

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { publica: true, titulo: 'Entrar' },
  },
  {
    path: '/',
    component: LayoutPrincipal,
    children: [
      {
        path: '',
        name: 'painel',
        component: () => import('@/views/PainelView.vue'),
        meta: { titulo: 'Painel do período' },
      },
      {
        path: 'periodos',
        name: 'periodos',
        component: () => import('@/views/PeriodosView.vue'),
        meta: { titulo: 'Períodos letivos', perfis: GESTOR },
      },
      {
        path: 'periodos/:id/grade-horaria',
        name: 'grade-horaria',
        component: () => import('@/views/GradeHorariaView.vue'),
        meta: { titulo: 'Turnos e tempos de aula', perfis: GESTOR },
        props: (rota) => ({ id: Number(rota.params.id) }),
      },
      {
        path: 'importacao',
        name: 'importacao',
        component: () => import('@/views/ImportacaoView.vue'),
        meta: { titulo: 'Importação', perfis: GESTOR },
      },
      {
        path: 'dados',
        name: 'dados',
        component: () => import('@/views/DadosView.vue'),
        meta: { titulo: 'Dados', perfis: GESTOR },
      },
      {
        path: 'disponibilidade',
        name: 'disponibilidade',
        component: () => import('@/views/DisponibilidadeView.vue'),
        meta: { titulo: 'Disponibilidade', perfis: ['gestor', 'professor'] },
      },
      {
        path: 'exportacoes',
        name: 'exportacoes',
        component: () => import('@/views/ExportacoesView.vue'),
        meta: { titulo: 'Exportações', perfis: GESTOR },
      },
      {
        path: 'usuarios',
        name: 'usuarios',
        component: () => import('@/views/UsuariosView.vue'),
        meta: { titulo: 'Usuários', perfis: GESTOR },
      },
      {
        path: 'minha-grade',
        name: 'minha-grade',
        component: () => import('@/views/MinhaGradeView.vue'),
        meta: { titulo: 'Minha grade', perfis: ['professor'] },
      },
      {
        path: 'restricoes',
        name: 'restricoes',
        component: () => import('@/views/RestricoesView.vue'),
        meta: { titulo: 'Restrições', perfis: GESTOR },
      },
      {
        path: 'geracao',
        name: 'geracao',
        component: () => import('@/views/GeracaoView.vue'),
        meta: { titulo: 'Geração', perfis: GESTOR },
      },
      {
        path: 'versoes',
        name: 'versoes',
        component: () => import('@/views/VersoesView.vue'),
        meta: { titulo: 'Horários', perfis: GESTOR },
      },
      {
        path: 'versoes/:id',
        name: 'versao',
        component: () => import('@/views/VersaoView.vue'),
        meta: { titulo: 'Horário', perfis: GESTOR },
        props: (rota) => ({ id: Number(rota.params.id) }),
      },
      {
        path: 'versoes/:id/atribuicoes',
        name: 'horario-atribuicoes',
        component: () => import('@/views/HorarioAtribuicoesView.vue'),
        meta: { titulo: 'Atribuições do horário', perfis: GESTOR },
        props: (rota) => ({ id: Number(rota.params.id) }),
      },
      {
        path: 'versoes/comparar',
        name: 'comparar',
        component: () => import('@/views/ComparacaoView.vue'),
        meta: { titulo: 'Comparar horários', perfis: GESTOR },
      },
      {
        path: 'versoes/:id/editar',
        name: 'editor-versao',
        component: () => import('@/views/EditorView.vue'),
        meta: { titulo: 'Editor de grade', perfis: GESTOR },
        props: (rota) => ({ id: Number(rota.params.id) }),
      },
      {
        path: 'editor',
        name: 'editor',
        component: () => import('@/views/EditorEntradaView.vue'),
        meta: { titulo: 'Editor de grade', perfis: GESTOR },
      },
    ],
  },
  {
    path: '/consulta/:periodoId?/:tipo?/:recursoId?',
    name: 'consulta',
    component: () => import('@/views/ConsultaView.vue'),
    meta: { publica: true, titulo: 'Consulta de horários' },
  },
  {
    path: '/:caminho(.*)*',
    name: 'nao-encontrado',
    component: () => import('@/views/NaoEncontradoView.vue'),
    meta: { publica: true, titulo: 'Página não encontrada' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (para) => {
  const auth = useAuthStore()
  await auth.carregar()

  if (para.meta.publica) {
    if (para.name === 'login' && auth.autenticado) return { name: 'painel' }
    return true
  }

  if (!auth.autenticado) return { name: 'login', query: { voltar: para.fullPath } }

  const perfis = para.meta.perfis
  if (perfis && !perfis.includes(auth.usuario.perfil)) return { name: 'painel' }

  return true
})

router.afterEach((para) => {
  document.title = para.meta.titulo ? `${para.meta.titulo} · GradeIF` : 'GradeIF'
})

export default router
