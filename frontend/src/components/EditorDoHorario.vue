<!--
  Editor do horário: um editor por vez. Mostra quem edita e, conforme o caso,
  "Transferir edição" (para o editor), "Assumir edição" (horário sem editor) ou o
  aviso de somente leitura (para os outros gestores).
  compacto: versão de uma linha, para a tabela de horários.
  Emite "atualizado" com o horário (resumo da API) depois de transferir ou assumir.
-->
<template>
  <div v-if="versao">
    <!-- Compacto: nome do editor e a ação disponível -->
    <div v-if="compacto" class="small d-flex flex-wrap align-items-center gap-1">
      <template v-if="versao.editor">
        <i class="bi bi-pencil-square" aria-hidden="true" />
        <span :class="souEditor ? 'fw-semibold' : ''">{{
          souEditor ? 'Você' : versao.editor.nome
        }}</span>
        <BButton
          v-if="souEditor"
          size="sm"
          variant="link"
          class="p-0 ms-1"
          @click="abrirTransferencia"
          >transferir</BButton
        >
      </template>
      <template v-else>
        <span class="text-body-secondary">Sem editor</span>
        <BButton size="sm" variant="link" class="p-0 ms-1" :disabled="enviando" @click="assumir"
          >assumir</BButton
        >
      </template>
    </div>

    <!-- Selo: uma linha no cabeçalho do editor e da tela do horário -->
    <span
      v-else-if="selo"
      class="selo-editor"
      :class="souEditor ? 'selo-meu' : versao.editor ? 'selo-leitura' : 'selo-livre'"
    >
      <template v-if="souEditor">
        <i class="bi bi-pencil-square" aria-hidden="true" />
        <span title="Você é o editor deste horário. Os outros gestores só visualizam."
          >Você edita</span
        >
        <BButton size="sm" variant="link" class="p-0" @click="abrirTransferencia"
          >transferir</BButton
        >
      </template>
      <template v-else-if="versao.editor">
        <i class="bi bi-lock" aria-hidden="true" />
        <span
          :title="`${versao.editor.nome} está editando este horário. Para alterar, peça que transfira a edição para você ou duplique o horário.`"
          >Somente leitura · {{ versao.editor.nome }} edita</span
        >
      </template>
      <template v-else>
        <i class="bi bi-unlock" aria-hidden="true" />
        <span>Sem editor</span>
        <BButton size="sm" variant="link" class="p-0" :disabled="enviando" @click="assumir"
          >assumir</BButton
        >
      </template>
    </span>

    <!-- Faixa: no topo das telas do horário -->
    <BAlert
      v-else
      :model-value="true"
      :variant="souEditor ? 'light' : 'warning'"
      class="d-flex flex-wrap align-items-center gap-2 py-2"
    >
      <template v-if="souEditor">
        <i class="bi bi-pencil-square" aria-hidden="true" />
        <span>Você é o editor deste horário. Os outros gestores só visualizam.</span>
        <BButton size="sm" variant="outline-primary" class="ms-auto" @click="abrirTransferencia"
          >Transferir edição</BButton
        >
      </template>
      <template v-else-if="versao.editor">
        <i class="bi bi-lock" aria-hidden="true" />
        <span
          >Somente leitura: <strong>{{ versao.editor.nome }}</strong> está editando este horário.
          Para alterar, peça que transfira a edição para você ou duplique o horário.</span
        >
      </template>
      <template v-else>
        <i class="bi bi-unlock" aria-hidden="true" />
        <span>Este horário está sem editor. Assuma a edição para alterá-lo.</span>
        <BButton size="sm" variant="primary" class="ms-auto" :disabled="enviando" @click="assumir"
          >Assumir edição</BButton
        >
      </template>
    </BAlert>
    <BAlert
      :model-value="!!erro"
      variant="danger"
      dismissible
      class="small py-2"
      @update:model-value="erro = ''"
      >{{ erro }}</BAlert
    >

    <BModal
      v-model="transferencia.visivel"
      title="Transferir edição"
      ok-title="Transferir"
      cancel-title="Cancelar"
      :ok-disabled="!transferencia.usuarioId || enviando"
      @ok.prevent="transferir"
    >
      <p>
        Passe a edição de <strong>{{ versao.nome }}</strong> para outro gestor. Depois disso, só ele
        poderá alterar este horário; você continua podendo visualizá-lo.
      </p>
      <div v-if="transferencia.carregando" class="text-center py-2">
        <BSpinner small label="Carregando" />
      </div>
      <BAlert
        v-else-if="!opcoesGestores.length"
        :model-value="true"
        variant="secondary"
        class="mb-0"
      >
        Não há outro gestor ativo. Crie a conta na tela de usuários.
      </BAlert>
      <BFormGroup
        v-else
        label="Novo editor"
        label-for="novo-editor"
        :invalid-feedback="transferencia.erro"
        :state="transferencia.erro ? false : null"
      >
        <BFormSelect
          id="novo-editor"
          v-model="transferencia.usuarioId"
          :options="[{ value: null, text: 'Escolha o gestor…', disabled: true }, ...opcoesGestores]"
          :state="transferencia.erro ? false : null"
        />
      </BFormGroup>
    </BModal>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { BAlert, BButton, BFormGroup, BFormSelect, BModal, BSpinner } from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { usePeriodoStore } from '@/stores/periodo'

const props = defineProps({
  versao: { type: Object, default: null },
  compacto: { type: Boolean, default: false },
  // Selo de uma linha (cabeçalho compacto do editor e da tela do horário).
  selo: { type: Boolean, default: false },
})
const emit = defineEmits(['atualizado'])

const auth = useAuthStore()
const periodoStore = usePeriodoStore()

const souEditor = computed(() => auth.ehEditorDe(props.versao))
const base = computed(() => `/periodos/${periodoStore.ativoId}/versoes/${props.versao?.id}`)

const enviando = ref(false)
const erro = ref('')
const gestores = ref([])
const transferencia = reactive({ visivel: false, usuarioId: null, erro: '', carregando: false })

const opcoesGestores = computed(() =>
  gestores.value
    .filter((u) => u.perfil === 'gestor' && u.ativo && u.id !== auth.usuario?.id)
    .map((u) => ({ value: u.id, text: `${u.nome} (${u.email})` }))
)

async function abrirTransferencia() {
  Object.assign(transferencia, { visivel: true, usuarioId: null, erro: '', carregando: true })
  try {
    gestores.value = await http.get('/usuarios')
  } catch (e) {
    transferencia.erro = mensagemDeErro(e)
  } finally {
    transferencia.carregando = false
  }
}

async function transferir() {
  enviando.value = true
  transferencia.erro = ''
  try {
    const atualizado = await http.post(`${base.value}/editor`, {
      usuarioId: transferencia.usuarioId,
    })
    transferencia.visivel = false
    emit('atualizado', atualizado)
  } catch (e) {
    transferencia.erro = mensagemDeErro(e)
  } finally {
    enviando.value = false
  }
}

async function assumir() {
  enviando.value = true
  erro.value = ''
  try {
    emit('atualizado', await http.post(`${base.value}/assumir`))
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    enviando.value = false
  }
}
</script>

<style scoped>
.selo-editor {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--gf-borda);
  font-size: 0.8rem;
  white-space: nowrap;
}
.selo-editor .btn-link {
  font-size: 0.8rem;
}
.selo-meu {
  background: var(--gf-verde-suave);
  color: var(--gf-verde-escuro);
}
.selo-leitura {
  background: var(--bs-warning-bg-subtle);
  color: var(--bs-warning-text-emphasis);
}
.selo-livre {
  background: var(--bs-tertiary-bg);
}
</style>
