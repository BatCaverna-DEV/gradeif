<template>
  <div>
    <header class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
      <div>
        <h1 class="h3 mb-0">Períodos letivos</h1>
        <p class="text-body-secondary mb-0">
          Cada período tem sua grade horária, turmas e versões de grade.
        </p>
      </div>
      <BButton variant="primary" @click="abrirNovo">Novo período</BButton>
    </header>

    <BAlert :model-value="!!erro" variant="danger">{{ erro }}</BAlert>

    <BCard no-body>
      <BTable
        :items="periodoStore.periodos"
        :fields="campos"
        :busy="periodoStore.carregando"
        show-empty
        empty-text="Nenhum período cadastrado."
        responsive
        hover
        class="mb-0"
      >
        <template #cell(datas)="{ item }">
          {{ formatarData(item.dataInicio) }} a {{ formatarData(item.dataFim) }}
        </template>
        <template #cell(situacao)="{ item }">
          <BBadge :variant="corSituacao[item.situacao]">{{ item.situacao }}</BBadge>
        </template>
        <template #cell(acoes)="{ item }">
          <div class="d-flex gap-2 justify-content-end">
            <BButton
              size="sm"
              variant="outline-primary"
              :to="{ name: 'grade-horaria', params: { id: item.id } }"
            >
              Turnos e tempos
            </BButton>
            <BButton size="sm" variant="outline-secondary" @click="abrirEdicao(item)"
              >Editar</BButton
            >
            <BButton size="sm" variant="outline-danger" @click="pedirExclusao(item)"
              >Excluir</BButton
            >
          </div>
        </template>
      </BTable>
    </BCard>

    <BModal
      v-model="formVisivel"
      :title="form.id ? `Editar período ${form.nome}` : 'Novo período letivo'"
      ok-title="Salvar"
      cancel-title="Cancelar"
      :ok-disabled="salvando"
      @ok.prevent="salvar"
    >
      <BAlert :model-value="!!erroForm" variant="danger" class="small">{{ erroForm }}</BAlert>
      <BForm @submit.prevent="salvar">
        <BFormGroup label="Nome" label-for="periodo-nome" description="Ex.: 2027.1 ou 2027">
          <BFormInput id="periodo-nome" v-model="form.nome" maxlength="20" required />
        </BFormGroup>
        <BRow class="mt-3">
          <BCol>
            <BFormGroup label="Início" label-for="periodo-inicio">
              <BFormInput id="periodo-inicio" v-model="form.dataInicio" type="date" required />
            </BFormGroup>
          </BCol>
          <BCol>
            <BFormGroup label="Fim" label-for="periodo-fim">
              <BFormInput id="periodo-fim" v-model="form.dataFim" type="date" required />
            </BFormGroup>
          </BCol>
        </BRow>
        <BFormGroup v-if="form.id" label="Situação" label-for="periodo-situacao" class="mt-3">
          <BFormSelect id="periodo-situacao" v-model="form.situacao" :options="situacoes" />
        </BFormGroup>
      </BForm>
    </BModal>

    <BModal
      v-model="exclusaoVisivel"
      title="Excluir período"
      ok-title="Excluir"
      ok-variant="danger"
      cancel-title="Cancelar"
      @ok="excluir"
    >
      Excluir o período <strong>{{ paraExcluir?.nome }}</strong> apaga também seus turnos, tempos de
      aula, turmas e atribuições. Esta ação não pode ser desfeita.
    </BModal>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import {
  BAlert,
  BBadge,
  BButton,
  BCard,
  BCol,
  BForm,
  BFormGroup,
  BFormInput,
  BFormSelect,
  BModal,
  BRow,
  BTable,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'

const periodoStore = usePeriodoStore()

const campos = [
  { key: 'nome', label: 'Período', sortable: true },
  { key: 'datas', label: 'Vigência' },
  { key: 'situacao', label: 'Situação' },
  { key: 'acoes', label: '', thClass: 'text-end' },
]

const corSituacao = { planejamento: 'warning', publicado: 'success', encerrado: 'secondary' }
const situacoes = [
  { value: 'planejamento', text: 'Planejamento' },
  { value: 'publicado', text: 'Publicado' },
  { value: 'encerrado', text: 'Encerrado' },
]

const erro = ref('')
const erroForm = ref('')
const salvando = ref(false)
const formVisivel = ref(false)
const form = reactive({ id: null, nome: '', dataInicio: '', dataFim: '', situacao: 'planejamento' })

const exclusaoVisivel = ref(false)
const paraExcluir = ref(null)

periodoStore.carregar().catch((e) => (erro.value = mensagemDeErro(e)))

function formatarData(iso) {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function abrirNovo() {
  Object.assign(form, { id: null, nome: '', dataInicio: '', dataFim: '', situacao: 'planejamento' })
  erroForm.value = ''
  formVisivel.value = true
}

function abrirEdicao(item) {
  Object.assign(form, { ...item })
  erroForm.value = ''
  formVisivel.value = true
}

async function salvar() {
  salvando.value = true
  erroForm.value = ''
  try {
    const corpo = { nome: form.nome.trim(), dataInicio: form.dataInicio, dataFim: form.dataFim }
    let periodo
    if (form.id) {
      periodo = await http.put(`/periodos/${form.id}`, { ...corpo, situacao: form.situacao })
    } else {
      periodo = await http.post('/periodos', corpo)
    }
    await periodoStore.carregar()
    if (!form.id) periodoStore.selecionar(periodo.id)
    formVisivel.value = false
  } catch (e) {
    erroForm.value = mensagemDeErro(e)
  } finally {
    salvando.value = false
  }
}

function pedirExclusao(item) {
  paraExcluir.value = item
  exclusaoVisivel.value = true
}

async function excluir() {
  erro.value = ''
  try {
    await http.delete(`/periodos/${paraExcluir.value.id}`)
    if (periodoStore.ativoId === paraExcluir.value.id) periodoStore.selecionar(null)
    await periodoStore.carregar()
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}
</script>
