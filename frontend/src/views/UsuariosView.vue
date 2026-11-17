<!-- F5-08 — Contas de acesso: gestores e professores vinculados ao cadastro. -->
<template>
  <div>
    <header class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 class="h3 mb-0">Usuários</h1>
        <p class="text-body-secondary mb-0">
          Professores com conta informam a própria disponibilidade e consultam a própria grade.
        </p>
      </div>
      <BButton variant="primary" size="sm" @click="abrir(null)">Nova conta</BButton>
    </header>

    <BAlert :model-value="!!erro" variant="danger" dismissible @update:model-value="erro = ''">{{
      erro
    }}</BAlert>
    <BAlert
      :model-value="!!sucesso"
      variant="success"
      dismissible
      @update:model-value="sucesso = ''"
      >{{ sucesso }}</BAlert
    >

    <BCard no-body>
      <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>
      <BTable
        v-else
        :items="usuarios"
        :fields="CAMPOS"
        responsive
        hover
        class="mb-0"
        primary-key="id"
      >
        <template #cell(nome)="{ item }">
          <span class="fw-semibold">{{ item.nome }}</span>
          <span v-if="item.id === auth.usuario?.id" class="small text-body-secondary"> (você)</span>
          <div class="small text-body-secondary">{{ item.email }}</div>
        </template>
        <template #cell(perfil)="{ item }">
          <BBadge :variant="item.perfil === 'gestor' ? 'dark' : 'secondary'">{{
            item.perfil
          }}</BBadge>
          <div v-if="item.professor" class="small text-body-secondary">{{ item.professor }}</div>
        </template>
        <template #cell(ativo)="{ item }">
          <BBadge :variant="item.ativo ? 'success' : 'secondary'">{{
            item.ativo ? 'ativa' : 'desativada'
          }}</BBadge>
        </template>
        <template #cell(acoes)="{ item }">
          <div class="d-flex gap-1 justify-content-end">
            <BButton size="sm" variant="outline-secondary" @click="abrir(item)">Editar</BButton>
            <BButton
              v-if="item.id !== auth.usuario?.id"
              size="sm"
              :variant="item.ativo ? 'outline-danger' : 'outline-success'"
              @click="alternarAtivo(item)"
              >{{ item.ativo ? 'Desativar' : 'Reativar' }}</BButton
            >
          </div>
        </template>
      </BTable>
    </BCard>

    <BModal
      v-model="form.visivel"
      :title="form.id ? 'Editar conta' : 'Nova conta'"
      ok-title="Salvar"
      cancel-title="Cancelar"
      :ok-disabled="form.salvando"
      @ok.prevent="salvar"
    >
      <BAlert :model-value="!!form.erro" variant="danger" class="small">{{ form.erro }}</BAlert>
      <BForm @submit.prevent="salvar">
        <BFormGroup label="Perfil" label-for="perfil">
          <BFormSelect
            id="perfil"
            v-model="form.perfil"
            :options="[
              { value: 'professor', text: 'Professor' },
              { value: 'gestor', text: 'Gestor' },
            ]"
            :disabled="form.id === auth.usuario?.id"
          />
        </BFormGroup>
        <BFormGroup
          v-if="form.perfil === 'professor'"
          label="Professor"
          label-for="professor"
          class="mt-2"
          :state="estado('professorId')"
          :invalid-feedback="form.erros.professorId"
        >
          <BFormSelect
            id="professor"
            v-model="form.professorId"
            :options="opcoesProfessor"
            :state="estado('professorId')"
            @update:model-value="sugerirDados"
          />
        </BFormGroup>
        <BFormGroup
          label="Nome"
          label-for="nome"
          class="mt-2"
          :state="estado('nome')"
          :invalid-feedback="form.erros.nome"
        >
          <BFormInput id="nome" v-model="form.nome" maxlength="120" :state="estado('nome')" />
        </BFormGroup>
        <BFormGroup
          label="E-mail"
          label-for="email"
          class="mt-2"
          :state="estado('email')"
          :invalid-feedback="form.erros.email"
        >
          <BFormInput
            id="email"
            v-model="form.email"
            type="email"
            maxlength="120"
            :state="estado('email')"
          />
        </BFormGroup>
        <BFormGroup
          :label="form.id ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'"
          label-for="senha"
          class="mt-2"
          :state="estado('senha')"
          :invalid-feedback="form.erros.senha"
          description="Ao menos 8 caracteres. Informe a pessoa por um canal seguro e peça que troque no primeiro acesso."
        >
          <BFormInput
            id="senha"
            v-model="form.senha"
            type="password"
            autocomplete="new-password"
            :state="estado('senha')"
          />
        </BFormGroup>
      </BForm>
    </BModal>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  BAlert,
  BBadge,
  BButton,
  BCard,
  BForm,
  BFormGroup,
  BFormInput,
  BFormSelect,
  BModal,
  BSpinner,
  BTable,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { usePeriodoStore } from '@/stores/periodo'

const CAMPOS = [
  { key: 'nome', label: 'Conta', sortable: true },
  { key: 'perfil', label: 'Perfil' },
  { key: 'ativo', label: 'Situação' },
  { key: 'acoes', label: '' },
]

const auth = useAuthStore()
const periodoStore = usePeriodoStore()
const usuarios = ref([])
const professores = ref([])
const carregando = ref(false)
const erro = ref('')
const sucesso = ref('')

const form = reactive({
  visivel: false,
  id: null,
  nome: '',
  email: '',
  perfil: 'professor',
  professorId: null,
  senha: '',
  erro: '',
  erros: {},
  salvando: false,
})
const estado = (campo) => (form.erros[campo] ? false : null)

const opcoesProfessor = computed(() => [
  { value: null, text: 'Escolha o professor…', disabled: true },
  ...professores.value.map((p) => ({
    value: p.id,
    text: `${p.nome}${p.siape ? ` (SIAPE ${p.siape})` : ''}${usuarios.value.some((u) => u.professorId === p.id && u.id !== form.id) ? ' — já tem conta' : ''}`,
    disabled: usuarios.value.some((u) => u.professorId === p.id && u.id !== form.id),
  })),
])

async function carregar() {
  carregando.value = true
  try {
    usuarios.value = await http.get('/usuarios')
    if (periodoStore.ativoId)
      professores.value = await http.get(`/periodos/${periodoStore.ativoId}/dados/professores`)
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

function abrir(u) {
  Object.assign(form, {
    visivel: true,
    id: u?.id ?? null,
    nome: u?.nome ?? '',
    email: u?.email ?? '',
    perfil: u?.perfil ?? 'professor',
    professorId: u?.professorId ?? null,
    senha: '',
    erro: '',
    erros: {},
    salvando: false,
  })
}

// Ao escolher o professor numa conta nova, sugere nome e e-mail do cadastro.
function sugerirDados(id) {
  const p = professores.value.find((x) => x.id === id)
  if (!p || form.id) return
  if (!form.nome) form.nome = p.nome
  if (!form.email && p.email) form.email = p.email
}

async function salvar() {
  form.salvando = true
  form.erro = ''
  form.erros = {}
  const corpo = {
    nome: form.nome,
    email: form.email,
    perfil: form.perfil,
    professorId: form.perfil === 'professor' ? form.professorId : null,
  }
  if (form.senha) corpo.senha = form.senha
  try {
    const salvo = form.id
      ? await http.put(`/usuarios/${form.id}`, corpo)
      : await http.post('/usuarios', corpo)
    const i = usuarios.value.findIndex((u) => u.id === salvo.id)
    if (i >= 0) usuarios.value.splice(i, 1, salvo)
    else usuarios.value.push(salvo)
    sucesso.value = form.id
      ? `Conta de ${salvo.nome} atualizada.`
      : `Conta criada para ${salvo.nome}.`
    form.visivel = false
  } catch (e) {
    if (Array.isArray(e.detalhes) && e.detalhes.length) {
      form.erros = Object.fromEntries(e.detalhes.map((d) => [d.campo, d.mensagem]))
      form.erro = 'Corrija os campos destacados.'
    } else form.erro = mensagemDeErro(e)
  } finally {
    form.salvando = false
  }
}

async function alternarAtivo(u) {
  erro.value = ''
  try {
    const salvo = await http.put(`/usuarios/${u.id}`, { ativo: !u.ativo })
    usuarios.value = usuarios.value.map((x) => (x.id === salvo.id ? salvo : x))
    sucesso.value = salvo.ativo
      ? `Conta de ${salvo.nome} reativada.`
      : `Conta de ${salvo.nome} desativada; as sessões abertas foram encerradas.`
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}
</script>
