<!--
  Horários do período (tabela versao_grade). Cada horário tem nome e as próprias
  atribuições, copiadas da oferta (ou de outro horário) quando é criado. Depois de
  configurar as atribuições, o horário é gerado pelo solver e ajustado no editor.
  Cada horário tem um editor (quem o criou, ou a quem ele transferiu): só ele gera,
  edita, renomeia, publica e exclui; os outros gestores visualizam e duplicam.
-->
<template>
  <div>
    <header class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 class="h3 mb-0">Horários</h1>
        <p class="text-body-secondary mb-0">
          Crie quantos horários quiser, cada um com as próprias atribuições: mudar professor, aulas
          ou disciplinas num horário não afeta a oferta nem os outros.
        </p>
      </div>
      <div v-if="periodo" class="d-flex gap-2">
        <RouterLink
          v-if="versoes.length > 1"
          :to="{ name: 'comparar' }"
          class="btn btn-outline-secondary btn-sm"
          >Comparar horários</RouterLink
        >
        <BButton variant="primary" size="sm" @click="abrirNovo">Novo horário</BButton>
      </div>
    </header>

    <BAlert v-if="!periodo" :model-value="true" variant="warning"
      >Selecione um período letivo.</BAlert
    >

    <template v-else>
      <BAlert :model-value="!!erro" variant="danger" dismissible @update:model-value="erro = ''">
        {{ erro }}
      </BAlert>
      <BAlert
        :model-value="!!sucesso"
        variant="success"
        dismissible
        @update:model-value="sucesso = ''"
      >
        {{ sucesso }}
      </BAlert>

      <BCard no-body>
        <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>
        <div v-else-if="!versoes.length" class="text-body-secondary p-3">
          <p class="mb-2">Nenhum horário neste período.</p>
          <BButton variant="primary" size="sm" @click="abrirNovo">Criar o primeiro horário</BButton>
        </div>
        <BTable
          v-else
          :items="versoes"
          :fields="CAMPOS"
          responsive
          hover
          class="mb-0"
          primary-key="id"
        >
          <template #cell(nome)="{ item }">
            <RouterLink :to="{ name: 'versao', params: { id: item.id } }" class="fw-semibold">{{
              item.nome
            }}</RouterLink>
            <BBadge v-if="item.publicada" variant="primary" class="ms-2">Publicado</BBadge>
            <div class="small text-body-secondary">
              {{ descricaoOrigem(item) }}
              <span v-if="item.detalhes?.cancelada"> · geração encerrada antes do tempo</span>
            </div>
          </template>
          <template #cell(editor)="{ item }">
            <EditorDoHorario :versao="item" compacto @atualizado="substituir" />
          </template>
          <template #cell(atribuicoes)="{ item }">
            <RouterLink :to="{ name: 'horario-atribuicoes', params: { id: item.id } }">
              {{ item.totalAtribuicoes }} atribuição(ões)
            </RouterLink>
            <span class="small text-body-secondary d-block"
              >{{ item.aulasPrevistas ?? 0 }} aulas por semana</span
            >
          </template>
          <template #cell(situacao)="{ item }">
            <BBadge v-if="!item.totalAulas" variant="secondary">não gerado</BBadge>
            <BBadge v-else-if="item.valida === null" variant="secondary">não avaliado</BBadge>
            <BBadge v-else :variant="item.valida ? 'success' : 'danger'">
              {{ item.valida ? 'válido' : `${item.custoRigido} rígida(s)` }}
            </BBadge>
          </template>
          <template #cell(pontuacao)="{ item }">{{
            item.totalAulas ? formatarNumero(item.pontuacao) : '—'
          }}</template>
          <template #cell(aulas)="{ item }">
            {{ item.totalAulas }}
            <span v-if="item.aulasFixadas" class="small text-body-secondary d-block"
              >{{ item.aulasFixadas }} fixadas</span
            >
            <span v-if="item.aulasRevisar" class="small text-warning-emphasis d-block"
              >{{ item.aulasRevisar }} para revisar</span
            >
          </template>
          <template #cell(acoes)="{ item }">
            <div class="d-flex flex-wrap gap-1 justify-content-end">
              <RouterLink
                :to="{ name: 'horario-atribuicoes', params: { id: item.id } }"
                class="btn btn-sm btn-outline-primary"
                >Atribuições</RouterLink
              >
              <RouterLink
                :to="{ name: 'disponibilidade', query: { horario: item.id } }"
                class="btn btn-sm btn-outline-primary"
                >Disponibilidade</RouterLink
              >
              <RouterLink
                v-if="!item.publicada && podeEditar(item)"
                :to="{ name: 'geracao', query: { horario: item.id } }"
                class="btn btn-sm btn-outline-primary"
                >Gerar</RouterLink
              >
              <RouterLink
                v-if="!item.publicada && item.totalAulas"
                :to="{ name: 'editor-versao', params: { id: item.id } }"
                class="btn btn-sm btn-outline-primary"
                >{{ podeEditar(item) ? 'Editar' : 'Ver grade' }}</RouterLink
              >
              <BButton
                v-if="!item.publicada && item.totalAulas && podeEditar(item)"
                size="sm"
                variant="outline-success"
                @click="pedirPublicacao(item)"
                >Publicar</BButton
              >
              <BButton
                v-if="item.publicada && podeEditar(item)"
                size="sm"
                variant="outline-warning"
                @click="despublicar(item)"
                >Despublicar</BButton
              >
              <RouterLink
                v-if="item.totalAulas"
                :to="{ name: 'exportacoes', query: { versao: item.id } }"
                class="btn btn-sm btn-outline-secondary"
                >Exportar</RouterLink
              >
              <BButton
                v-if="podeEditar(item)"
                size="sm"
                variant="outline-secondary"
                @click="abrirRenomear(item)"
                >Renomear</BButton
              >
              <BButton size="sm" variant="outline-secondary" @click="abrirNovo(item)"
                >Duplicar</BButton
              >
              <BButton
                v-if="podeEditar(item)"
                size="sm"
                variant="outline-danger"
                :disabled="item.publicada"
                :title="item.publicada ? 'O horário publicado não pode ser excluído' : ''"
                @click="exclusao = { visivel: true, item }"
                >Excluir</BButton
              >
            </div>
          </template>
        </BTable>
      </BCard>
      <p class="small text-body-secondary mt-2">
        Só o editor de cada horário o altera; os outros gestores visualizam e podem duplicá-lo. A
        situação e a pontuação são as da última geração ou edição. A tela do horário reavalia com os
        dados e os pesos atuais.
      </p>
    </template>

    <BModal
      v-model="novo.visivel"
      :title="novo.copiarDe ? 'Duplicar horário' : 'Novo horário'"
      ok-title="Criar"
      cancel-title="Cancelar"
      :ok-disabled="novo.enviando"
      @ok.prevent="criar"
    >
      <BForm @submit.prevent="criar">
        <BFormGroup
          label="Nome do horário"
          label-for="nome-novo"
          :invalid-feedback="novo.erro"
          :state="novo.erro ? false : null"
        >
          <BFormInput
            id="nome-novo"
            v-model="novo.nome"
            maxlength="80"
            placeholder="Ex.: Proposta com TDS à tarde"
            :state="novo.erro ? false : null"
            autofocus
          />
        </BFormGroup>
        <BFormGroup label="Começar de" label-for="origem-novo" class="mt-3">
          <BFormSelect id="origem-novo" v-model="novo.copiarDe" :options="opcoesOrigem" />
          <template #description>
            {{
              novo.copiarDe
                ? 'Copia as atribuições e as aulas do horário escolhido.'
                : 'Começa sem aulas, com as atribuições da oferta do período. Ajuste as atribuições e depois gere.'
            }}
          </template>
        </BFormGroup>
      </BForm>
    </BModal>

    <BModal
      v-model="renomear.visivel"
      title="Renomear horário"
      ok-title="Salvar"
      cancel-title="Cancelar"
      @ok.prevent="salvarNome"
    >
      <BForm @submit.prevent="salvarNome">
        <BFormGroup
          label="Nome"
          label-for="nome-versao"
          :invalid-feedback="renomear.erro"
          :state="renomear.erro ? false : null"
        >
          <BFormInput
            id="nome-versao"
            v-model="renomear.nome"
            maxlength="80"
            :state="renomear.erro ? false : null"
            autofocus
          />
        </BFormGroup>
      </BForm>
    </BModal>

    <BModal
      v-model="publicacao.visivel"
      title="Publicar horário"
      :ok-title="publicacao.forcar ? 'Publicar mesmo assim' : 'Publicar'"
      :ok-variant="publicacao.forcar ? 'danger' : 'success'"
      :ok-disabled="publicacao.enviando"
      cancel-title="Cancelar"
      @ok.prevent="publicar"
    >
      <p>
        Publicar <strong>{{ publicacao.item?.nome }}</strong
        >? Ele passa a aparecer na consulta pública e fica bloqueado para edição. Se outro horário
        do período estiver publicado, ele deixa de estar.
      </p>
      <BAlert :model-value="!!publicacao.aviso" variant="warning" class="mb-0">{{
        publicacao.aviso
      }}</BAlert>
    </BModal>

    <BModal
      v-model="exclusao.visivel"
      title="Excluir horário"
      ok-title="Excluir"
      ok-variant="danger"
      cancel-title="Cancelar"
      @ok="excluir"
    >
      Excluir <strong>{{ exclusao.item?.nome }}</strong
      >, com as {{ exclusao.item?.totalAtribuicoes }} atribuições e as
      {{ exclusao.item?.totalAulas }} aulas dele? Esta ação não pode ser desfeita. A oferta e os
      outros horários não mudam.
    </BModal>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
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
import EditorDoHorario from '@/components/EditorDoHorario.vue'
import { formatarDataHora, formatarNumero } from '@/utils/formato'

const CAMPOS = [
  { key: 'nome', label: 'Horário' },
  { key: 'editor', label: 'Editor' },
  { key: 'atribuicoes', label: 'Atribuições' },
  { key: 'situacao', label: 'Situação' },
  { key: 'pontuacao', label: 'Pontuação', sortable: true },
  { key: 'aulas', label: 'Aulas na grade' },
  { key: 'acoes', label: '', thClass: 'text-end' },
]

const periodoStore = usePeriodoStore()
const auth = useAuthStore()
const podeEditar = (item) => auth.ehEditorDe(item)
const periodo = computed(() => periodoStore.ativo)
const base = computed(() => `/periodos/${periodo.value?.id}/versoes`)

const versoes = ref([])
const carregando = ref(false)
const erro = ref('')
const sucesso = ref('')
const novo = reactive({ visivel: false, nome: '', copiarDe: null, erro: '', enviando: false })
const renomear = reactive({ visivel: false, item: null, nome: '', erro: '' })
const exclusao = ref({ visivel: false, item: null })
const publicacao = reactive({
  visivel: false,
  item: null,
  aviso: '',
  forcar: false,
  enviando: false,
})

const opcoesOrigem = computed(() => [
  { value: null, text: 'Oferta do período (atribuições importadas)' },
  ...versoes.value.map((v) => ({ value: v.id, text: `Cópia de ${v.nome}` })),
])

function descricaoOrigem(item) {
  const geradoEm = item.detalhes?.geradoEm
  if (item.origem === 'solver' && geradoEm) return `Gerado em ${formatarDataHora(geradoEm)}`
  if (item.detalhes?.copiaDe) return `Cópia criada em ${formatarDataHora(item.criadaEm)}`
  return `Criado em ${formatarDataHora(item.criadaEm)}`
}

// Troca o horário na lista pelo resumo atualizado (transferir ou assumir a edição).
function substituir(atualizado) {
  versoes.value = versoes.value.map((v) => (v.id === atualizado.id ? atualizado : v))
  sucesso.value = auth.ehEditorDe(atualizado)
    ? `Você agora é o editor de ${atualizado.nome}.`
    : `A edição de ${atualizado.nome} passou para ${atualizado.editor?.nome}.`
}

async function carregar() {
  versoes.value = []
  if (!periodo.value) return
  carregando.value = true
  try {
    versoes.value = await http.get(base.value)
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
}

watch(() => periodo.value?.id, carregar, { immediate: true })

// ---------- Novo horário (ou cópia de um existente) ----------
function abrirNovo(origem = null) {
  const copia = origem?.id ? origem : null
  Object.assign(novo, {
    visivel: true,
    nome: copia ? `${copia.nome} (cópia)`.slice(0, 80) : '',
    copiarDe: copia?.id ?? null,
    erro: '',
    enviando: false,
  })
}

async function criar() {
  novo.enviando = true
  novo.erro = ''
  try {
    const corpo = { nome: novo.nome }
    if (novo.copiarDe) corpo.copiarDe = novo.copiarDe
    const criado = await http.post(base.value, corpo)
    versoes.value = [criado, ...versoes.value]
    novo.visivel = false
    sucesso.value = `Horário ${criado.nome} criado com ${criado.totalAtribuicoes} atribuições.`
  } catch (e) {
    novo.erro = mensagemDeErro(e)
  } finally {
    novo.enviando = false
  }
}

// ---------- Publicação (F5-01) ----------
function pedirPublicacao(item) {
  Object.assign(publicacao, { visivel: true, item, aviso: '', forcar: false, enviando: false })
}

async function publicar() {
  const { item, forcar } = publicacao
  publicacao.enviando = true
  erro.value = ''
  try {
    const atualizada = await http.post(`${base.value}/${item.id}/publicar`, { forcar })
    versoes.value = versoes.value.map((v) =>
      v.id === atualizada.id ? atualizada : { ...v, publicada: false }
    )
    publicacao.visivel = false
    sucesso.value = `Publicado: ${atualizada.nome}. A consulta pública já mostra este horário.`
  } catch (e) {
    if (e.status === 409 && e.detalhes?.exigeConfirmacao) {
      publicacao.aviso = e.message
      publicacao.forcar = true
    } else {
      publicacao.visivel = false
      erro.value = mensagemDeErro(e)
    }
  } finally {
    publicacao.enviando = false
  }
}

async function despublicar(item) {
  erro.value = ''
  try {
    const atualizada = await http.post(`${base.value}/${item.id}/despublicar`)
    versoes.value = versoes.value.map((v) => (v.id === atualizada.id ? atualizada : v))
    sucesso.value = `${item.nome} deixou de estar publicado. A consulta pública não mostra mais o período.`
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}

// ---------- Renomear e excluir ----------
function abrirRenomear(item) {
  Object.assign(renomear, { visivel: true, item, nome: item.nome, erro: '' })
}

async function salvarNome() {
  renomear.erro = ''
  try {
    const atualizada = await http.put(`${base.value}/${renomear.item.id}`, { nome: renomear.nome })
    versoes.value = versoes.value.map((v) => (v.id === atualizada.id ? atualizada : v))
    renomear.visivel = false
  } catch (e) {
    renomear.erro = mensagemDeErro(e)
  }
}

async function excluir() {
  const { item } = exclusao.value
  erro.value = ''
  try {
    await http.delete(`${base.value}/${item.id}`)
    versoes.value = versoes.value.filter((v) => v.id !== item.id)
    sucesso.value = `Excluído: ${item.nome}.`
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}
</script>
