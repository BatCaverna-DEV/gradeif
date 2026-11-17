<!--
  Atribuições de um horário: professor, aulas, bloco e grupo de cada disciplina
  de cada turma, só neste horário. A oferta do período e os outros horários não mudam.
-->
<template>
  <div>
    <header class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <RouterLink :to="{ name: 'versoes' }" class="small">← Horários</RouterLink>
        <h1 class="h3 mb-0">Atribuições · {{ versao?.nome ?? '' }}</h1>
        <p class="text-body-secondary mb-0">
          Valem só para este horário. A oferta importada e os outros horários não mudam.
        </p>
      </div>
      <div v-if="versao" class="d-flex flex-wrap gap-2">
        <RouterLink
          v-if="!versao.publicada"
          :to="{ name: 'importacao', query: { horario: id } }"
          class="btn btn-sm btn-outline-primary"
          title="Importa a planilha de oferta e gera as atribuições neste horário"
          >Importar planilha</RouterLink
        >
        <RouterLink
          :to="{ name: 'disponibilidade', query: { horario: id } }"
          class="btn btn-sm btn-outline-secondary"
          >Disponibilidade</RouterLink
        >
        <RouterLink
          v-if="versao.totalAulas"
          :to="{ name: 'versao', params: { id } }"
          class="btn btn-sm btn-outline-secondary"
          >Ver grade</RouterLink
        >
        <RouterLink
          v-if="!versao.publicada"
          :to="{ name: 'geracao', query: { horario: id } }"
          class="btn btn-sm btn-primary"
          >Gerar este horário</RouterLink
        >
      </div>
    </header>

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
    <BAlert :model-value="!!versao?.publicada" variant="info">
      Este horário está publicado e não pode ser alterado. Duplique-o na tela de horários para fazer
      outra proposta.
    </BAlert>
    <BAlert
      :model-value="!!versao?.totalAulas && !versao?.publicada"
      variant="secondary"
      class="small"
    >
      O horário já tem aulas na grade. Mudar uma atribuição não move as aulas: as que ficarem a
      mais, a menos ou em conflito aparecem como violações e podem ser ajustadas no editor ou numa
      nova geração.
    </BAlert>

    <div v-if="versao && !versao.publicada" class="d-flex flex-wrap gap-2 mb-2">
      <BButton size="sm" variant="primary" @click="abrirNovaAtribuicao()">Nova atribuição</BButton>
      <BButton size="sm" variant="outline-primary" @click="abrirNovaTurma">Nova turma</BButton>
      <span class="small text-body-secondary align-self-center">
        A turma vale para o semestre inteiro; a atribuição, só para este horário.
      </span>
    </div>

    <BCard no-body class="mb-3">
      <div class="p-2">
        <TabelaDados
          :itens="atribuicoes"
          :campos="COLUNAS"
          :campos-busca="BUSCA"
          :carregando="carregando"
          placeholder="Buscar por turma, disciplina ou professor"
          texto-vazio="Este horário não tem atribuições. Adicione da oferta abaixo."
          @editar="abrirEdicao"
          @excluir="pedirExclusao"
        >
          <template #cell(disciplina)="{ item }">
            {{ item.disciplina }}
            <span class="small text-body-secondary d-block">{{ item.disciplinaNome }}</span>
          </template>
          <template #cell(professoresDetalhe)="{ item }">
            {{ item.professoresDetalhe.map((p) => p.nome).join(', ') }}
          </template>
          <template #cell(oferta)="{ item }">
            <BBadge v-if="!item.naOferta" variant="info">só neste horário</BBadge>
            <BBadge
              v-else-if="!item.diferencas.length"
              variant="light"
              class="border text-body-secondary"
              >igual à oferta</BBadge
            >
            <BBadge v-else variant="warning" :title="descreverDiferencas(item)"
              >difere: {{ item.diferencas.map((d) => ROTULOS_DIFERENCA[d]).join(', ') }}</BBadge
            >
          </template>
          <template #cell(aulasAlocadas)="{ item }">
            <span :class="{ 'text-danger fw-semibold': item.aulasAlocadas > item.aulasSemanais }">
              {{ item.aulasAlocadas }} / {{ item.aulasSemanais }}
            </span>
          </template>
        </TabelaDados>
      </div>
    </BCard>

    <BCard
      v-if="fora.length"
      header-tag="h2"
      header-class="h6 mb-0"
      header="Da oferta, fora deste horário"
    >
      <p class="small text-body-secondary">
        Disciplinas que foram tiradas deste horário ou que entraram na oferta depois que ele foi
        criado.
      </p>
      <BFormCheckboxGroup v-model="escolhidas" stacked>
        <BFormCheckbox v-for="a in fora" :key="a.id" :value="a.id">
          <strong>{{ a.turma }} · {{ a.disciplina }}</strong> — {{ a.disciplinaNome }},
          {{ a.aulasSemanais }} aula(s), {{ a.professoresDetalhe.map((p) => p.nome).join(', ') }}
        </BFormCheckbox>
      </BFormCheckboxGroup>
      <BButton
        class="mt-2"
        size="sm"
        variant="primary"
        :disabled="!escolhidas.length || ocupado || versao?.publicada"
        @click="adicionar"
        >Adicionar ao horário</BButton
      >
    </BCard>

    <BModal
      v-model="edicao.visivel"
      :title="edicao.titulo"
      ok-title="Salvar"
      cancel-title="Cancelar"
      :ok-disabled="edicao.salvando"
      @ok.prevent="salvar"
    >
      <BAlert :model-value="!!edicao.erro" variant="danger" class="small">{{ edicao.erro }}</BAlert>
      <FormularioRegistro
        v-model="edicao.dados"
        :campos="FORMULARIO"
        :opcoes="opcoes"
        :erros="edicao.errosCampos"
        @enviar="salvar"
      />
      <p class="small text-body-secondary mt-1 mb-0">
        O professor não está na lista?
        <RouterLink :to="{ name: 'dados', query: { aba: 'professores' } }"
          >Cadastre em Dados</RouterLink
        >
        e volte aqui.
      </p>
      <div v-if="edicao.item?.naOferta" class="small border-top pt-2 mt-2">
        <span class="text-body-secondary">Na oferta:</span>
        {{ edicao.item.naOferta.professoresDetalhe.map((p) => p.nome).join(', ') }} ·
        {{ edicao.item.naOferta.aulasSemanais }} aula(s), bloco de
        {{ edicao.item.naOferta.tamanhoBloco }}
        <BButton
          v-if="edicao.item.diferencas.length"
          size="sm"
          variant="link"
          class="p-0 ms-2 align-baseline"
          :disabled="edicao.salvando"
          @click="restaurar"
          >Voltar ao que está na oferta</BButton
        >
      </div>
    </BModal>

    <BModal
      v-model="nova.visivel"
      title="Nova atribuição neste horário"
      ok-title="Adicionar"
      cancel-title="Cancelar"
      :ok-disabled="nova.salvando"
      @ok.prevent="salvarNovaAtribuicao"
    >
      <BAlert :model-value="!!nova.erro" variant="danger" class="small">{{ nova.erro }}</BAlert>
      <FormularioRegistro
        v-model="nova.dados"
        :campos="CAMPOS_NOVA"
        :opcoes="opcoesNova"
        :erros="nova.errosCampos"
        @enviar="salvarNovaAtribuicao"
      />
      <p class="small text-body-secondary mt-1 mb-0">
        A turma não está na lista?
        <BButton size="sm" variant="link" class="p-0 align-baseline" @click="abrirNovaTurma"
          >Cadastre a turma</BButton
        >. A disciplina não está?
        <BButton size="sm" variant="link" class="p-0 align-baseline" @click="abrirNovaDisciplina"
          >Cadastre a disciplina</BButton
        >. Professor novo:
        <RouterLink :to="{ name: 'dados', query: { aba: 'professores' } }">em Dados</RouterLink>.
      </p>
    </BModal>

    <BModal
      v-model="novaDisciplina.visivel"
      title="Nova disciplina"
      ok-title="Cadastrar"
      cancel-title="Cancelar"
      :ok-disabled="novaDisciplina.salvando"
      @ok.prevent="salvarNovaDisciplina"
    >
      <BAlert :model-value="!!novaDisciplina.erro" variant="danger" class="small">{{
        novaDisciplina.erro
      }}</BAlert>
      <BAlert :model-value="true" variant="info" class="small">
        A disciplina vale para todos os períodos. Depois do cadastro, ela já vem escolhida na nova
        atribuição deste horário.
      </BAlert>
      <FormularioRegistro
        v-model="novaDisciplina.dados"
        :campos="CAMPOS_DISCIPLINA"
        :erros="novaDisciplina.errosCampos"
        @enviar="salvarNovaDisciplina"
      />
    </BModal>

    <BModal
      v-model="novaTurma.visivel"
      title="Nova turma do semestre"
      ok-title="Cadastrar"
      cancel-title="Cancelar"
      :ok-disabled="novaTurma.salvando"
      @ok.prevent="salvarNovaTurma"
    >
      <BAlert :model-value="!!novaTurma.erro" variant="danger" class="small">{{
        novaTurma.erro
      }}</BAlert>
      <BAlert :model-value="true" variant="info" class="small">
        A turma fica cadastrada no período e aparece em todos os horários dele. Depois, inclua as
        disciplinas dela em cada horário.
      </BAlert>
      <FormularioRegistro
        v-model="novaTurma.dados"
        :campos="CAMPOS_TURMA"
        :opcoes="{ turnos: opcoesTurnos }"
        :erros="novaTurma.errosCampos"
        @enviar="salvarNovaTurma"
      />
    </BModal>

    <BModal
      v-model="exclusao.visivel"
      title="Tirar do horário"
      ok-title="Tirar"
      ok-variant="danger"
      cancel-title="Cancelar"
      @ok="excluir"
    >
      <p>
        Tirar <strong>{{ exclusao.item?.turma }} · {{ exclusao.item?.disciplina }}</strong> deste
        horário?
      </p>
      <p v-if="exclusao.item?.aulasAlocadas" class="text-danger small">
        As {{ exclusao.item.aulasAlocadas }} aula(s) dela na grade deste horário também saem.
      </p>
      <p class="small text-body-secondary mb-0">
        A oferta não muda: dá para trazer a disciplina de volta na lista "Da oferta, fora deste
        horário".
      </p>
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
  BFormCheckbox,
  BFormCheckboxGroup,
  BModal,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'
import TabelaDados from '@/components/TabelaDados.vue'
import FormularioRegistro from '@/components/FormularioRegistro.vue'
import { ENTIDADES } from '@/dados/entidades'

const props = defineProps({ id: { type: Number, required: true } })

const DEF = ENTIDADES.find((e) => e.chave === 'atribuicoes')
const DEF_TURMA = ENTIDADES.find((e) => e.chave === 'turmas')
const CAMPOS_TURMA = DEF_TURMA.formulario
const DEF_DISCIPLINA = ENTIDADES.find((e) => e.chave === 'disciplinas')
const CAMPOS_DISCIPLINA = DEF_DISCIPLINA.formulario
const FORMULARIO = DEF.formulario
const BUSCA = DEF.busca
const COLUNAS = [
  ...DEF.colunas,
  { key: 'oferta', label: 'Comparado à oferta' },
  { key: 'aulasAlocadas', label: 'Na grade / previstas' },
]
const CAMPOS_NOVA = [
  { campo: 'turmaId', rotulo: 'Turma', tipo: 'select' },
  { campo: 'disciplinaId', rotulo: 'Disciplina', tipo: 'select' },
  ...DEF.formulario,
]
const ROTULOS_DIFERENCA = {
  aulas: 'aulas',
  bloco: 'bloco',
  grupo: 'grupo',
  professores: 'professores',
}

const periodoStore = usePeriodoStore()
const base = computed(() => `/periodos/${periodoStore.ativoId}/versoes/${props.id}`)

const versao = ref(null)
const atribuicoes = ref([])
const fora = ref([])
const professores = ref([])
const turmas = ref([])
const disciplinas = ref([])
const turnos = ref([])
const escolhidas = ref([])
const carregando = ref(false)
const ocupado = ref(false)
const erro = ref('')
const sucesso = ref('')

const opcoes = computed(() => ({
  professores: professores.value.map((p) => ({
    value: p.id,
    text: `${p.nome}${p.siape ? ` (${p.siape})` : ''}${p.ativo ? '' : ' — inativo'}`,
  })),
}))

async function carregar() {
  if (!periodoStore.ativoId) return
  carregando.value = true
  erro.value = ''
  try {
    const periodo = `/periodos/${periodoStore.ativoId}`
    const [v, lista, profs, ts, ds, grade] = await Promise.all([
      http.get(base.value),
      http.get(`${base.value}/atribuicoes`),
      http.get(`${periodo}/dados/professores`),
      http.get(`${periodo}/dados/turmas`),
      http.get(`${periodo}/dados/disciplinas`),
      http.get(`${periodo}/grade-horaria`),
    ])
    versao.value = v
    atribuicoes.value = lista.atribuicoes
    fora.value = lista.foraDoHorario
    professores.value = profs
    turmas.value = ts
    disciplinas.value = ds
    turnos.value = grade.turnos
    escolhidas.value = []
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
}

watch(() => [props.id, periodoStore.ativoId], carregar, { immediate: true })

function descreverDiferencas(item) {
  const o = item.naOferta
  return `Na oferta: ${o.professoresDetalhe.map((p) => p.nome).join(', ')}, ${o.aulasSemanais} aula(s), bloco de ${o.tamanhoBloco}${o.grupoParalelo ? `, grupo ${o.grupoParalelo}` : ''}`
}

// ---------- Edição ----------
const edicao = reactive({
  visivel: false,
  item: null,
  titulo: '',
  dados: {},
  erro: '',
  errosCampos: {},
  salvando: false,
})

function abrirEdicao(item) {
  sucesso.value = ''
  const dados = {}
  for (const c of FORMULARIO) {
    const v = item[c.campo]
    dados[c.campo] = Array.isArray(v) ? [...v] : (v ?? '')
  }
  Object.assign(edicao, {
    visivel: true,
    item,
    titulo: `${item.turma} · ${item.disciplina} neste horário`,
    dados,
    erro: '',
    errosCampos: {},
    salvando: false,
  })
}

function aplicar(registro) {
  atribuicoes.value = atribuicoes.value.map((a) =>
    a.id === registro.id ? { ...a, ...registro } : a
  )
}

async function salvar() {
  edicao.salvando = true
  edicao.erro = ''
  edicao.errosCampos = {}
  const corpo = { ...edicao.dados }
  for (const c of FORMULARIO)
    if (c.tipo === 'numero') corpo[c.campo] = corpo[c.campo] === '' ? null : Number(corpo[c.campo])
  try {
    const r = await http.put(`${base.value}/atribuicoes/${edicao.item.id}`, corpo)
    edicao.visivel = false
    sucesso.value = r.alterados.length
      ? `${edicao.item.turma} · ${edicao.item.disciplina} atualizada neste horário.` +
        (r.aulasMarcadas ? ` ${r.aulasMarcadas} aula(s) da grade foram marcadas para revisão.` : '')
      : 'Nada foi alterado.'
    await carregar()
  } catch (e) {
    if (Array.isArray(e.detalhes) && e.detalhes.length) {
      edicao.errosCampos = Object.fromEntries(e.detalhes.map((d) => [d.campo, d.mensagem]))
      edicao.erro = 'Corrija os campos destacados.'
    } else edicao.erro = mensagemDeErro(e)
  } finally {
    edicao.salvando = false
  }
}

async function restaurar() {
  edicao.salvando = true
  edicao.erro = ''
  try {
    const r = await http.post(`${base.value}/atribuicoes/${edicao.item.id}/restaurar`)
    aplicar(r.registro)
    edicao.visivel = false
    sucesso.value = `${edicao.item.turma} · ${edicao.item.disciplina} voltou a ficar igual à oferta.`
    await carregar()
  } catch (e) {
    edicao.erro = mensagemDeErro(e)
  } finally {
    edicao.salvando = false
  }
}

// ---------- Nova atribuição (só deste horário) e nova turma (do semestre) ----------
const opcoesTurnos = computed(() => turnos.value.map((t) => ({ value: t.id, text: t.nome })))
const opcoesNova = computed(() => ({
  ...opcoes.value,
  turmaId: [
    { value: null, text: 'Escolha a turma…', disabled: true },
    ...turmas.value.map((t) => ({ value: t.id, text: `${t.codigo} (${t.curso})` })),
  ],
  disciplinaId: [
    { value: null, text: 'Escolha a disciplina…', disabled: true },
    ...disciplinas.value.map((d) => ({ value: d.id, text: `${d.sigla} — ${d.nome}` })),
  ],
}))

const nova = reactive({ visivel: false, dados: {}, erro: '', errosCampos: {}, salvando: false })

function abrirNovaAtribuicao(turmaId = null) {
  sucesso.value = ''
  Object.assign(nova, {
    visivel: true,
    dados: {
      turmaId,
      disciplinaId: null,
      professores: [],
      aulasSemanais: 2,
      tamanhoBloco: 2,
      grupoParalelo: '',
    },
    erro: '',
    errosCampos: {},
    salvando: false,
  })
}

async function salvarNovaAtribuicao() {
  nova.salvando = true
  nova.erro = ''
  nova.errosCampos = {}
  const corpo = { ...nova.dados }
  for (const c of ['aulasSemanais', 'tamanhoBloco'])
    corpo[c] = corpo[c] === '' ? null : Number(corpo[c])
  try {
    const r = await http.post(`${base.value}/atribuicoes`, corpo)
    nova.visivel = false
    sucesso.value = `${r.registro.turma} · ${r.registro.disciplina} adicionada a este horário.`
    await carregar()
  } catch (e) {
    if (Array.isArray(e.detalhes) && e.detalhes.length) {
      nova.errosCampos = Object.fromEntries(e.detalhes.map((d) => [d.campo, d.mensagem]))
      nova.erro = e.status === 409 ? mensagemDeErro(e) : 'Corrija os campos destacados.'
    } else nova.erro = mensagemDeErro(e)
  } finally {
    nova.salvando = false
  }
}

// Nova disciplina a partir da nova atribuição: ao voltar, ela já vem escolhida.
const novaDisciplina = reactive({
  visivel: false,
  dados: {},
  erro: '',
  errosCampos: {},
  salvando: false,
  rascunho: null,
})

function abrirNovaDisciplina() {
  const rascunho = nova.visivel ? { ...nova.dados } : null
  nova.visivel = false
  Object.assign(novaDisciplina, {
    visivel: true,
    dados: { ...DEF_DISCIPLINA.novo.valores },
    erro: '',
    errosCampos: {},
    salvando: false,
    rascunho,
  })
}

async function salvarNovaDisciplina() {
  novaDisciplina.salvando = true
  novaDisciplina.erro = ''
  novaDisciplina.errosCampos = {}
  try {
    const r = await http.post(
      `/periodos/${periodoStore.ativoId}/dados/disciplinas`,
      novaDisciplina.dados
    )
    disciplinas.value = [...disciplinas.value, r.registro].sort((a, b) =>
      a.sigla.localeCompare(b.sigla)
    )
    novaDisciplina.visivel = false
    abrirNovaAtribuicao(novaDisciplina.rascunho?.turmaId ?? null)
    if (novaDisciplina.rascunho) Object.assign(nova.dados, novaDisciplina.rascunho)
    nova.dados.disciplinaId = r.registro.id
    sucesso.value = `Disciplina ${r.registro.sigla} — ${r.registro.nome} cadastrada.`
  } catch (e) {
    if (Array.isArray(e.detalhes) && e.detalhes.length) {
      novaDisciplina.errosCampos = Object.fromEntries(e.detalhes.map((d) => [d.campo, d.mensagem]))
      novaDisciplina.erro = e.status === 409 ? mensagemDeErro(e) : 'Corrija os campos destacados.'
    } else novaDisciplina.erro = mensagemDeErro(e)
  } finally {
    novaDisciplina.salvando = false
  }
}

const novaTurma = reactive({
  visivel: false,
  dados: {},
  erro: '',
  errosCampos: {},
  salvando: false,
})

function abrirNovaTurma() {
  nova.visivel = false
  Object.assign(novaTurma, {
    visivel: true,
    dados: { ...DEF_TURMA.novo.valores },
    erro: '',
    errosCampos: {},
    salvando: false,
  })
}

// Cadastra a turma no período e já abre a nova atribuição para ela.
async function salvarNovaTurma() {
  novaTurma.salvando = true
  novaTurma.erro = ''
  novaTurma.errosCampos = {}
  const corpo = { ...novaTurma.dados, numeroAlunos: Number(novaTurma.dados.numeroAlunos || 0) }
  try {
    const r = await http.post(`/periodos/${periodoStore.ativoId}/dados/turmas`, corpo)
    turmas.value = [...turmas.value, r.registro].sort((a, b) => a.codigo.localeCompare(b.codigo))
    novaTurma.visivel = false
    abrirNovaAtribuicao(r.registro.id)
    sucesso.value = `Turma ${r.registro.codigo} cadastrada. Agora inclua as disciplinas dela neste horário.`
  } catch (e) {
    if (Array.isArray(e.detalhes) && e.detalhes.length) {
      novaTurma.errosCampos = Object.fromEntries(e.detalhes.map((d) => [d.campo, d.mensagem]))
      novaTurma.erro = e.status === 409 ? mensagemDeErro(e) : 'Corrija os campos destacados.'
    } else novaTurma.erro = mensagemDeErro(e)
  } finally {
    novaTurma.salvando = false
  }
}

// ---------- Tirar e adicionar ----------
const exclusao = reactive({ visivel: false, item: null })

function pedirExclusao(item) {
  sucesso.value = ''
  Object.assign(exclusao, { visivel: true, item })
}

async function excluir() {
  const { item } = exclusao
  erro.value = ''
  try {
    const r = await http.delete(`${base.value}/atribuicoes/${item.id}`)
    sucesso.value =
      `${item.turma} · ${item.disciplina} saiu deste horário` +
      (r.aulasRemovidas ? `, com ${r.aulasRemovidas} aula(s) da grade.` : '.')
    await carregar()
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}

async function adicionar() {
  ocupado.value = true
  erro.value = ''
  try {
    const n = escolhidas.value.length
    await http.post(`${base.value}/atribuicoes/adicionar`, { ids: escolhidas.value })
    sucesso.value = `${n} atribuição(ões) da oferta adicionada(s) ao horário.`
    await carregar()
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    ocupado.value = false
  }
}
</script>
