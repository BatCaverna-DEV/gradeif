<template>
  <div>
    <header class="mb-3">
      <h1 class="h3 mb-0">Dados</h1>
      <p class="text-body-secondary mb-0">
        Consulta e correção pontual. Para cargas grandes, corrija a planilha e use a
        <RouterLink :to="{ name: 'importacao' }">importação</RouterLink>.
      </p>
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
        <BTabs v-model="aba" card nav-wrapper-class="px-2 pt-2">
          <BTab v-for="e in ENTIDADES" :id="e.chave" :key="e.chave" :title="tituloDaAba(e)">
            <div v-if="e.novo" class="mb-2">
              <BButton size="sm" variant="primary" @click="abrirCriacao(e)">{{
                e.novo.rotulo
              }}</BButton>
            </div>
            <p v-if="e.compartilhado" class="small text-body-secondary">
              Cadastro compartilhado por todos os períodos. As contagens da tabela se referem ao
              período {{ periodo.nome }}.
            </p>
            <BAlert :model-value="!!estado[e.chave].erro" variant="danger">{{
              estado[e.chave].erro
            }}</BAlert>

            <TabelaDados
              :itens="estado[e.chave].itens"
              :campos="e.colunas"
              :campos-busca="e.busca"
              :carregando="estado[e.chave].carregando"
              :placeholder="e.placeholder"
              @editar="abrirEdicao(e, $event)"
              @excluir="pedirExclusao(e, $event)"
            >
              <template #cell(cor)="{ item }">
                <span
                  class="amostra-cor"
                  :style="{ background: item.cor }"
                  :title="item.corEscolhida ? `Cor escolhida ${item.cor}` : 'Cor automática'"
                />
              </template>
              <template #cell(carga)="{ item }">
                <template v-if="e.chave === 'professores'">
                  <span
                    :class="{ 'text-danger fw-semibold': item.cargaAtribuida > item.cargaMaxima }"
                  >
                    {{ item.cargaAtribuida }} / {{ item.cargaMaxima }}
                  </span>
                  <BBadge
                    v-if="item.cargaAtribuida > item.cargaMaxima"
                    variant="danger"
                    class="ms-1"
                  >
                    acima do máximo
                  </BBadge>
                </template>
                <template v-else>
                  <span
                    :class="{
                      'text-danger fw-semibold': item.aulasSemanais > item.temposDisponiveis,
                    }"
                  >
                    {{ item.aulasSemanais }} / {{ item.temposDisponiveis }}
                  </span>
                  <BBadge
                    v-if="item.aulasSemanais > item.temposDisponiveis"
                    variant="danger"
                    class="ms-1"
                  >
                    não cabe nos turnos
                  </BBadge>
                </template>
              </template>
              <template #cell(ativo)="{ item }">
                <BBadge :variant="item.ativo ? 'success' : 'secondary'">{{
                  item.ativo ? 'ativo' : 'inativo'
                }}</BBadge>
              </template>
              <template #cell(ativa)="{ item }">
                <BBadge :variant="item.ativa ? 'success' : 'secondary'">{{
                  item.ativa ? 'ativa' : 'inativa'
                }}</BBadge>
              </template>
              <template #cell(nivel)="{ value }">{{ rotuloNivel(value) }}</template>
              <template #cell(turnos)="{ item }">
                {{ nomesTurnos(item.turnos) }}
                <BBadge
                  v-if="item.turnosDefinidos === false"
                  variant="warning"
                  class="ms-1"
                  title="Importada pela oferta sem a coluna Turno; corrija e salve"
                  >turno a definir</BBadge
                >
              </template>
              <template #cell(disciplina)="{ item }">
                {{ item.disciplina }}
                <span class="small text-body-secondary d-block">{{ item.disciplinaNome }}</span>
              </template>
              <template #cell(professoresDetalhe)="{ item }">
                {{ item.professoresDetalhe.map((p) => p.nome).join(', ') }}
              </template>
            </TabelaDados>
          </BTab>
        </BTabs>
      </BCard>
    </template>

    <BModal
      v-model="edicao.visivel"
      :title="edicao.titulo"
      ok-title="Salvar"
      cancel-title="Cancelar"
      :ok-disabled="edicao.salvando"
      @ok.prevent="salvar"
    >
      <BAlert :model-value="!!edicao.erro" variant="danger" class="small">{{ edicao.erro }}</BAlert>
      <BAlert :model-value="!!edicao.entidade?.compartilhado" variant="info" class="small">
        {{
          edicao.id
            ? 'Esta correção vale para todos os períodos.'
            : edicao.entidade?.chave === 'professores'
              ? 'O cadastro vale para todos os períodos. SIAPE e e-mail são opcionais; o nome não pode repetir o de outro professor.'
              : edicao.entidade?.chave === 'disciplinas'
                ? 'A disciplina vale para todos os períodos. Sem sigla, ela é gerada pelas iniciais do nome; sigla e nome não podem repetir.'
                : 'Esta correção vale para todos os períodos.'
        }}
      </BAlert>
      <FormularioRegistro
        v-if="edicao.entidade"
        v-model="edicao.dados"
        :campos="edicao.entidade.formulario"
        :referencia="edicao.referencia"
        :opcoes="opcoes"
        :erros="edicao.errosCampos"
        @enviar="salvar"
      >
        <template #sem-opcoes="{ campo }">
          <template v-if="campo === 'turnos'">
            O período {{ periodo?.nome }} ainda não tem turnos. Cadastre-os em
            <RouterLink
              v-if="periodo"
              :to="{ name: 'grade-horaria', params: { id: periodo.id } }"
              >Turnos e tempos de aula</RouterLink
            >
            e depois volte para cadastrar a turma.
          </template>
          <template v-else>Nenhuma opção disponível.</template>
        </template>
      </FormularioRegistro>
      <p v-if="edicao.id" class="small text-body-secondary mb-0">
        Mudanças que afetam aulas já alocadas marcam essas aulas para revisão no editor de grade.
      </p>
    </BModal>

    <BModal
      v-model="exclusao.visivel"
      title="Excluir registro"
      ok-title="Excluir"
      ok-variant="danger"
      cancel-title="Cancelar"
      @ok="excluir"
    >
      <p>
        Excluir <strong>{{ exclusao.rotulo }}</strong
        >? Esta ação não pode ser desfeita.
      </p>
      <p class="small text-body-secondary mb-0">{{ exclusao.entidade?.avisoExclusao }}</p>
    </BModal>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BAlert, BBadge, BButton, BCard, BModal, BTab, BTabs } from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'
import TabelaDados from '@/components/TabelaDados.vue'
import FormularioRegistro from '@/components/FormularioRegistro.vue'
import { ENTIDADES } from '@/dados/entidades'

const periodoStore = usePeriodoStore()
const periodo = computed(() => periodoStore.ativo)
const rota = useRoute()
const router = useRouter()

const erro = ref('')
const sucesso = ref('')

// Estado de cada aba; os dados de uma aba só são buscados quando ela é aberta.
const estado = reactive(
  Object.fromEntries(
    ENTIDADES.map((e) => [e.chave, { itens: [], carregando: false, carregado: false, erro: '' }])
  )
)

const tituloDaAba = (e) =>
  estado[e.chave].carregado ? `${e.titulo} (${estado[e.chave].itens.length})` : e.titulo

// A aba aberta fica na URL (?aba=turmas), para poder compartilhar o link.
// O BTabs é controlado pelo id da aba, que é a chave do cadastro.
const chaveValida = (c) => ENTIDADES.some((e) => e.chave === c)
const aba = ref(chaveValida(rota.query.aba) ? rota.query.aba : ENTIDADES[0].chave)
const entidadeAtual = computed(() => ENTIDADES.find((e) => e.chave === aba.value) ?? ENTIDADES[0])

watch(aba, (chave) => {
  if (!chaveValida(chave)) return
  if (rota.query.aba !== chave) router.replace({ query: { ...rota.query, aba: chave } })
  carregar(chave)
})

const base = computed(() => `/periodos/${periodo.value?.id}/dados`)

async function carregar(chave, forcar = false) {
  const e = estado[chave]
  if (!periodo.value || (e.carregado && !forcar) || e.carregando) return
  e.carregando = true
  e.erro = ''
  try {
    e.itens = await http.get(`${base.value}/${chave}`)
    e.carregado = true
  } catch (err) {
    e.erro = mensagemDeErro(err)
  } finally {
    e.carregando = false
  }
}

// ---------- Turnos do período (rótulos e opções) ----------
const turnos = ref([])
async function carregarTurnos() {
  turnos.value = []
  if (!periodo.value) return
  try {
    turnos.value = (await http.get(`/periodos/${periodo.value.id}/grade-horaria`)).turnos
  } catch {
    turnos.value = []
  }
}
const nomesTurnos = (ids) =>
  (ids ?? []).map((id) => turnos.value.find((t) => t.id === id)?.nome ?? `#${id}`).join(', ')
const rotuloNivel = (n) =>
  ({ integrado: 'Integrado', subsequente: 'Subsequente', superior: 'Superior' })[n] ?? n

watch(
  () => periodo.value?.id,
  () => {
    for (const e of Object.values(estado))
      Object.assign(e, { itens: [], carregado: false, erro: '' })
    carregarTurnos()
    carregar(entidadeAtual.value.chave)
  },
  { immediate: true }
)

const opcoes = computed(() => ({
  turnos: turnos.value.map((t) => ({ value: t.id, text: t.nome })),
  professores: estado.professores.itens.map((p) => ({
    value: p.id,
    text: `${p.nome}${p.siape ? ` (${p.siape})` : ''}${p.ativo ? '' : ' — inativo'}`,
  })),
}))

// ---------- Edição ----------
const edicao = reactive({
  visivel: false,
  entidade: null,
  id: null,
  titulo: '',
  dados: {},
  referencia: null,
  erro: '',
  errosCampos: {},
  salvando: false,
})

async function abrirEdicao(entidade, item) {
  sucesso.value = ''
  // A lista de professores alimenta o seletor das atribuições.
  if (entidade.chave === 'atribuicoes') await carregar('professores')
  const dados = {}
  for (const c of entidade.formulario) {
    const v = item[c.origem ?? c.campo]
    dados[c.campo] = Array.isArray(v) ? [...v] : (v ?? (c.tipo === 'checkbox' ? false : ''))
  }
  Object.assign(edicao, {
    visivel: true,
    entidade,
    id: item.id,
    titulo: `Corrigir ${entidade.rotulo(item)}`,
    dados,
    referencia: item,
    erro: '',
    errosCampos: {},
    salvando: false,
  })
}

// Cadastro manual (só professores): o mesmo formulário, sem registro de origem.
function abrirCriacao(entidade) {
  sucesso.value = ''
  Object.assign(edicao, {
    visivel: true,
    entidade,
    id: null,
    titulo: entidade.novo.rotulo,
    dados: { ...entidade.novo.valores },
    referencia: null,
    erro: '',
    errosCampos: {},
    salvando: false,
  })
}

function corpoDaEdicao() {
  const corpo = { ...edicao.dados }
  for (const c of edicao.entidade.formulario) {
    if (c.tipo === 'numero') corpo[c.campo] = corpo[c.campo] === '' ? null : Number(corpo[c.campo])
  }
  return corpo
}

async function salvar() {
  edicao.salvando = true
  edicao.erro = ''
  edicao.errosCampos = {}
  const { entidade, id } = edicao
  try {
    if (id == null) {
      const r = await http.post(`${base.value}/${entidade.chave}`, corpoDaEdicao())
      estado[entidade.chave].itens = [...estado[entidade.chave].itens, r.registro].sort((a, b) =>
        String(a.nome ?? a.codigo ?? '').localeCompare(String(b.nome ?? b.codigo ?? ''))
      )
      edicao.visivel = false
      sucesso.value =
        entidade.chave === 'turmas'
          ? `Cadastrada a ${entidade.rotulo(r.registro)} no período ${periodo.value.nome}. Inclua as disciplinas dela nas atribuições de cada horário.`
          : entidade.chave === 'disciplinas'
            ? `Cadastrada a disciplina ${entidade.rotulo(r.registro)}. Ela já pode ser escolhida nas atribuições dos horários.`
            : `Cadastrado: ${entidade.rotulo(r.registro)}. Ele já pode ser escolhido nas atribuições.`
      return
    }
    const r = await http.put(`${base.value}/${entidade.chave}/${id}`, corpoDaEdicao())
    const lista = estado[entidade.chave].itens
    const i = lista.findIndex((x) => x.id === id)
    if (i >= 0) lista.splice(i, 1, r.registro)
    edicao.visivel = false

    sucesso.value = r.alterados.length
      ? `Correção salva em ${entidade.rotulo(r.registro)}.` +
        (r.aulasMarcadas ? ` ${r.aulasMarcadas} aula(s) da grade foram marcadas para revisão.` : '')
      : 'Nada foi alterado.'
    // Números de outras abas (carga, contagens) podem ter mudado.
    for (const outra of ENTIDADES)
      if (outra.chave !== entidade.chave) estado[outra.chave].carregado = false
  } catch (e) {
    if (Array.isArray(e.detalhes)) {
      edicao.errosCampos = Object.fromEntries(e.detalhes.map((d) => [d.campo, d.mensagem]))
      edicao.erro = 'Corrija os campos destacados.'
    } else {
      edicao.erro = mensagemDeErro(e)
    }
  } finally {
    edicao.salvando = false
  }
}

// ---------- Exclusão ----------
const exclusao = reactive({ visivel: false, entidade: null, item: null, rotulo: '' })

function pedirExclusao(entidade, item) {
  sucesso.value = ''
  Object.assign(exclusao, { visivel: true, entidade, item, rotulo: entidade.rotulo(item) })
}

async function excluir() {
  const { entidade, item, rotulo } = exclusao
  erro.value = ''
  try {
    await http.delete(`${base.value}/${entidade.chave}/${item.id}`)
    estado[entidade.chave].itens = estado[entidade.chave].itens.filter((x) => x.id !== item.id)
    sucesso.value = `Excluído: ${rotulo}.`
    for (const outra of ENTIDADES)
      if (outra.chave !== entidade.chave) estado[outra.chave].carregado = false
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}
</script>

<style scoped>
.amostra-cor {
  display: inline-block;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 0.25rem;
  vertical-align: middle;
}
</style>
