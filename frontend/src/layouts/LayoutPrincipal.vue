<template>
  <div class="layout" :class="{ 'menu-aberto': menuAberto, 'menu-recolhido': menuRecolhido }">
    <!-- Menu lateral: fixo no computador; no celular, desliza da esquerda. -->
    <aside id="menu-principal" class="lateral" aria-label="Menu principal">
      <div class="lateral-topo">
        <RouterLink :to="{ name: 'painel' }" class="marca" @click="menuAberto = false">
          <img
            class="marca-logo"
            :src="logo"
            alt="GradeIF — Sistema de Geração de Horário Escolar"
          />
          <img class="marca-icone" :src="icone" alt="GradeIF" />
        </RouterLink>
        <button
          type="button"
          class="btn-icone d-lg-none"
          aria-label="Fechar menu"
          @click="menuAberto = false"
        >
          <i class="bi bi-x-lg" />
        </button>
      </div>

      <nav class="menu">
        <section v-for="grupo in gruposVisiveis" :key="grupo.titulo" class="menu-grupo">
          <h2 class="menu-titulo">{{ grupo.titulo }}</h2>
          <RouterLink
            v-for="item in grupo.itens"
            :key="item.nome"
            :to="{ name: item.nome }"
            class="menu-item"
            :class="{ ativo: ativo(item) }"
            :aria-current="ativo(item) ? 'page' : undefined"
            :title="menuRecolhido ? item.rotulo : undefined"
            @click="menuAberto = false"
          >
            <i :class="`bi bi-${item.icone}`" aria-hidden="true" />
            <span>{{ item.rotulo }}</span>
          </RouterLink>
        </section>
      </nav>

      <div class="lateral-rodape" title="IFMA Campus Coelho Neto">
        <i class="bi bi-building" aria-hidden="true" />
        <span>IFMA Campus Coelho Neto</span>
      </div>
    </aside>
    <div class="cortina" aria-hidden="true" @click="menuAberto = false" />

    <div class="principal">
      <header class="topo">
        <button
          type="button"
          class="btn-icone d-lg-none"
          aria-label="Abrir menu"
          aria-controls="menu-principal"
          :aria-expanded="menuAberto"
          @click="menuAberto = true"
        >
          <i class="bi bi-list" />
        </button>
        <RouterLink :to="{ name: 'painel' }" class="d-lg-none marca-mini" aria-label="Início">
          <img :src="icone" alt="" />
        </RouterLink>
        <!-- Modo foco: recolhe o menu lateral (só no computador). -->
        <button
          type="button"
          class="btn-icone d-none d-lg-inline-flex"
          :aria-label="menuRecolhido ? 'Mostrar o menu completo' : 'Recolher o menu (modo foco)'"
          :title="
            menuRecolhido ? 'Mostrar o menu completo' : 'Recolher o menu para ganhar espaço (F)'
          "
          aria-controls="menu-principal"
          :aria-pressed="menuRecolhido"
          @click="alternarMenu"
        >
          <i :class="menuRecolhido ? 'bi bi-layout-sidebar' : 'bi bi-layout-sidebar-inset'" />
        </button>

        <nav class="trilha d-none d-md-flex" aria-label="Você está em">
          <RouterLink :to="{ name: 'painel' }" aria-label="Início"
            ><i class="bi bi-house-door"
          /></RouterLink>
          <template v-if="grupoAtual">
            <i class="bi bi-chevron-right separador" aria-hidden="true" />
            <span>{{ grupoAtual }}</span>
          </template>
          <i class="bi bi-chevron-right separador" aria-hidden="true" />
          <strong>{{ rota.meta.titulo }}</strong>
        </nav>

        <div class="topo-acoes">
          <label class="seletor-periodo" title="Período letivo ativo">
            <i class="bi bi-calendar3" aria-hidden="true" />
            <BFormSelect
              v-model="periodoAtivo"
              :options="opcoesPeriodo"
              size="sm"
              aria-label="Período letivo ativo"
              :disabled="!periodoStore.periodos.length"
            />
          </label>

          <BDropdown variant="link" no-caret end class="menu-usuario" toggle-class="usuario">
            <template #button-content>
              <span class="avatar" aria-hidden="true">{{ iniciais }}</span>
              <span class="usuario-texto d-none d-md-flex">
                <span class="usuario-nome">{{ auth.usuario?.nome }}</span>
                <span class="usuario-perfil">{{ rotuloPerfil }}</span>
              </span>
              <i class="bi bi-chevron-down small d-none d-md-inline" aria-hidden="true" />
            </template>
            <BDropdownText class="d-md-none small">
              <strong>{{ auth.usuario?.nome }}</strong
              ><br />{{ rotuloPerfil }}
            </BDropdownText>
            <BDropdownItem @click="abrirSenha"
              ><i class="bi bi-key me-2" aria-hidden="true" />Alterar senha</BDropdownItem
            >
            <BDropdownDivider />
            <BDropdownItem @click="sair"
              ><i class="bi bi-box-arrow-right me-2" aria-hidden="true" />Sair</BDropdownItem
            >
          </BDropdown>
        </div>
      </header>

      <main class="conteudo">
        <BAlert
          v-if="
            !periodoStore.carregando && !periodoStore.periodos.length && rota.name !== 'periodos'
          "
          :model-value="true"
          variant="warning"
          class="d-flex align-items-center gap-2"
        >
          <i class="bi bi-exclamation-triangle" aria-hidden="true" />
          <span>
            Nenhum período letivo cadastrado.
            <RouterLink v-if="auth.ehGestor" :to="{ name: 'periodos' }"
              >Criar o primeiro período</RouterLink
            >
          </span>
        </BAlert>
        <RouterView />
      </main>
    </div>

    <BModal
      v-model="senha.visivel"
      title="Alterar senha"
      ok-title="Alterar"
      cancel-title="Cancelar"
      :ok-disabled="senha.enviando"
      @ok.prevent="trocarSenha"
    >
      <BAlert :model-value="!!senha.erro" variant="danger" class="small">{{ senha.erro }}</BAlert>
      <BAlert :model-value="senha.feito" variant="success" class="small"
        >Senha alterada. Outras sessões abertas desta conta foram encerradas.</BAlert
      >
      <BForm v-if="!senha.feito" @submit.prevent="trocarSenha">
        <BFormGroup label="Senha atual" label-for="senha-atual">
          <BFormInput
            id="senha-atual"
            v-model="senha.atual"
            type="password"
            autocomplete="current-password"
          />
        </BFormGroup>
        <BFormGroup
          label="Nova senha"
          label-for="senha-nova"
          class="mt-2"
          description="Ao menos 8 caracteres."
        >
          <BFormInput
            id="senha-nova"
            v-model="senha.nova"
            type="password"
            autocomplete="new-password"
          />
        </BFormGroup>
      </BForm>
    </BModal>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BAlert,
  BDropdown,
  BDropdownDivider,
  BDropdownItem,
  BDropdownText,
  BForm,
  BFormGroup,
  BFormInput,
  BFormSelect,
  BModal,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { usePeriodoStore } from '@/stores/periodo'
import { menuRecolhido } from '@/utils/preferencias'
import logo from '@/assets/logo-gradeif.webp'
import icone from '@/assets/icone-gradeif.png'

const auth = useAuthStore()
const periodoStore = usePeriodoStore()
const rota = useRoute()
const router = useRouter()
const menuAberto = ref(false)
const alternarMenu = () => (menuRecolhido.value = !menuRecolhido.value)

// Menu na ordem do ciclo de um período letivo (descrição, seção 2).
// "tambem": telas internas que acendem o mesmo item.
const GRUPOS = [
  {
    titulo: 'Planejamento',
    itens: [
      { nome: 'painel', rotulo: 'Painel do período', icone: 'speedometer2' },
      {
        nome: 'periodos',
        rotulo: 'Períodos letivos',
        icone: 'calendar3',
        gestor: true,
        tambem: ['grade-horaria'],
      },
      { nome: 'importacao', rotulo: 'Importação', icone: 'cloud-arrow-up', gestor: true },
      { nome: 'dados', rotulo: 'Dados', icone: 'database', gestor: true },
      { nome: 'disponibilidade', rotulo: 'Disponibilidade', icone: 'calendar-x' },
      { nome: 'restricoes', rotulo: 'Restrições', icone: 'sliders', gestor: true },
    ],
  },
  {
    titulo: 'Horários',
    itens: [
      { nome: 'geracao', rotulo: 'Geração', icone: 'magic', gestor: true },
      {
        nome: 'editor',
        rotulo: 'Editor de grade',
        icone: 'grid-3x3-gap',
        gestor: true,
        tambem: ['editor-versao'],
      },
      {
        nome: 'versoes',
        rotulo: 'Horários',
        icone: 'collection',
        gestor: true,
        tambem: ['versao', 'horario-atribuicoes', 'comparar'],
      },
      {
        nome: 'exportacoes',
        rotulo: 'Exportações',
        icone: 'file-earmark-arrow-down',
        gestor: true,
      },
      { nome: 'minha-grade', rotulo: 'Minha grade', icone: 'person-badge', professor: true },
    ],
  },
  {
    titulo: 'Geral',
    itens: [
      { nome: 'usuarios', rotulo: 'Usuários', icone: 'people', gestor: true },
      { nome: 'consulta', rotulo: 'Consulta pública', icone: 'globe2' },
    ],
  },
]

const podeVer = (i) => (!i.gestor || auth.ehGestor) && (!i.professor || !auth.ehGestor)
const gruposVisiveis = computed(() =>
  GRUPOS.map((g) => ({ ...g, itens: g.itens.filter(podeVer) })).filter((g) => g.itens.length)
)
const ativo = (item) => rota.name === item.nome || (item.tambem ?? []).includes(rota.name)
const grupoAtual = computed(() => GRUPOS.find((g) => g.itens.some((i) => ativo(i)))?.titulo ?? null)

const iniciais = computed(() => {
  const partes = (auth.usuario?.nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes.length > 1 ? partes.at(-1)[0] : '')).toUpperCase()
})
const rotuloPerfil = computed(
  () => ({ gestor: 'Gestor', professor: 'Professor' })[auth.usuario?.perfil] ?? auth.usuario?.perfil
)

// Fecha o menu do celular ao trocar de página.
watch(
  () => rota.fullPath,
  () => (menuAberto.value = false)
)

// ---------- Troca da própria senha ----------
const senha = reactive({
  visivel: false,
  atual: '',
  nova: '',
  erro: '',
  feito: false,
  enviando: false,
})
function abrirSenha() {
  Object.assign(senha, {
    visivel: true,
    atual: '',
    nova: '',
    erro: '',
    feito: false,
    enviando: false,
  })
}
async function trocarSenha() {
  if (senha.feito) return (senha.visivel = false)
  senha.enviando = true
  senha.erro = ''
  try {
    await http.put('/auth/senha', { senhaAtual: senha.atual, novaSenha: senha.nova })
    senha.feito = true
  } catch (e) {
    senha.erro = mensagemDeErro(e)
  } finally {
    senha.enviando = false
  }
}

const opcoesPeriodo = computed(() =>
  periodoStore.periodos.length
    ? periodoStore.periodos.map((p) => ({ value: p.id, text: `Período ${p.nome}` }))
    : [{ value: null, text: 'Sem períodos' }]
)

const periodoAtivo = computed({
  get: () => periodoStore.ativoId,
  set: (id) => periodoStore.selecionar(id),
})

onMounted(() => {
  periodoStore.carregar().catch(() => {})
})

// Sessão expirada (qualquer 401 da API): volta ao login e, depois, para esta página.
let saindo = false
watch(
  () => auth.autenticado,
  (autenticado) => {
    if (!autenticado && !saindo) router.replace({ name: 'login', query: { voltar: rota.fullPath } })
  }
)

async function sair() {
  saindo = true
  await auth.sair()
  router.push({ name: 'login' })
}
</script>

<style scoped>
.layout {
  --largura-menu: 264px;
  min-height: 100vh;
}

/* ---------- Menu lateral ---------- */
.lateral {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--largura-menu);
  display: flex;
  flex-direction: column;
  background: var(--gf-superficie);
  border-right: 1px solid var(--gf-borda);
  z-index: 1040;
}
.lateral-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.1rem 0.9rem;
}
.marca img {
  display: block;
  width: 100%;
  max-width: 205px;
  height: auto;
}
.marca .marca-icone {
  display: none;
  width: 38px;
  height: 38px;
}
.menu {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0.75rem 1rem;
}
.menu-grupo + .menu-grupo {
  margin-top: 0.9rem;
}
.menu-titulo {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a988f;
  margin: 0 0 0.35rem 0.75rem;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.75rem;
  margin-bottom: 2px;
  border-radius: 0.6rem;
  color: #3d4d43;
  font-weight: 500;
  font-size: 0.925rem;
  text-decoration: none;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.menu-item i {
  font-size: 1.05rem;
  width: 1.25rem;
  text-align: center;
  color: #7b8a81;
  transition: color 0.15s;
}
.menu-item:hover {
  background: var(--gf-verde-suave);
  color: var(--gf-verde-escuro);
}
.menu-item:hover i {
  color: var(--gf-verde);
}
.menu-item.ativo {
  background: linear-gradient(90deg, var(--gf-verde) 0%, #2a8a3b 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(31, 122, 51, 0.25);
}
.menu-item.ativo i {
  color: #fff;
}
.menu-item:focus-visible {
  outline: 2px solid var(--gf-verde);
  outline-offset: 2px;
}
.lateral-rodape {
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--gf-borda);
  font-size: 0.78rem;
  color: var(--gf-texto-suave);
}
.lateral-rodape i {
  margin-right: 0.35rem;
}

/* ---------- Área principal ---------- */
.principal {
  margin-left: var(--largura-menu);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.topo {
  position: sticky;
  top: 0;
  z-index: 1020;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 64px;
  padding: 0.6rem 1.75rem;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: saturate(180%) blur(10px);
  border-bottom: 1px solid var(--gf-borda);
}
.trilha {
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--gf-texto-suave);
  min-width: 0;
}
.trilha a {
  color: var(--gf-texto-suave);
}
.trilha a:hover {
  color: var(--gf-verde);
}
.trilha strong {
  color: var(--gf-texto);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trilha .separador {
  font-size: 0.65rem;
  opacity: 0.6;
}
.topo-acoes {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.seletor-periodo {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  padding: 0 0.25rem 0 0.75rem;
  border: 1px solid var(--gf-borda);
  border-radius: 999px;
  background: var(--gf-superficie);
  color: var(--gf-verde);
}
.seletor-periodo :deep(.form-select) {
  border: 0;
  background-color: transparent;
  box-shadow: none;
  font-weight: 600;
  color: var(--gf-texto);
  min-width: 150px;
  padding-left: 0.25rem;
}
.menu-usuario :deep(.usuario) {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.25rem 0.5rem 0.25rem 0.25rem;
  border-radius: 999px;
  color: var(--gf-texto);
  text-decoration: none;
}
.menu-usuario :deep(.usuario:hover) {
  background: var(--gf-verde-suave);
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--gf-verde-escuro), var(--gf-verde-vivo));
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.02em;
}
.usuario-texto {
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;
}
.usuario-nome {
  font-weight: 600;
  font-size: 0.875rem;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.usuario-perfil {
  font-size: 0.75rem;
  color: var(--gf-texto-suave);
}
.conteudo {
  flex: 1;
  width: 100%;
  max-width: 1600px;
  padding: 1.75rem;
}
.btn-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 0.6rem;
  background: transparent;
  color: var(--gf-texto);
  font-size: 1.35rem;
}
.btn-icone:hover {
  background: var(--gf-verde-suave);
}
.marca-mini img {
  width: 34px;
  height: 34px;
}
.cortina {
  display: none;
}

/* ---------- Modo foco: menu recolhido (só no computador) ---------- */
@media (min-width: 992px) {
  .layout.menu-recolhido {
    --largura-menu: 68px;
  }
  .menu-recolhido .lateral-topo {
    justify-content: center;
    padding: 0.9rem 0.5rem;
  }
  .menu-recolhido .marca .marca-logo {
    display: none;
  }
  .menu-recolhido .marca .marca-icone {
    display: block;
  }
  .menu-recolhido .menu {
    padding: 0.25rem 0.5rem 1rem;
  }
  .menu-recolhido .menu-titulo {
    height: 1px;
    margin: 0.35rem 0.4rem 0.5rem;
    overflow: hidden;
    color: transparent;
    background: var(--gf-borda);
  }
  .menu-recolhido .menu-grupo + .menu-grupo {
    margin-top: 0.4rem;
  }
  .menu-recolhido .menu-item {
    justify-content: center;
    padding: 0.6rem 0;
  }
  .menu-recolhido .menu-item span,
  .menu-recolhido .lateral-rodape span {
    display: none;
  }
  .menu-recolhido .lateral-rodape {
    padding: 0.85rem 0;
    text-align: center;
  }
  .menu-recolhido .lateral-rodape i {
    margin: 0;
  }
}

/* ---------- Celular e tablet ---------- */
@media (max-width: 991.98px) {
  .lateral {
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: var(--gf-sombra-forte);
  }
  .menu-aberto .lateral {
    transform: none;
  }
  .menu-aberto .cortina {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(10, 30, 18, 0.45);
    z-index: 1030;
  }
  .principal {
    margin-left: 0;
  }
  .topo {
    padding: 0.5rem 1rem;
    gap: 0.5rem;
  }
  .conteudo {
    padding: 1.25rem 1rem;
  }
}
@media (max-width: 575.98px) {
  .seletor-periodo :deep(.form-select) {
    min-width: 0;
    max-width: 158px;
    padding-right: 1.75rem;
  }
}
</style>
