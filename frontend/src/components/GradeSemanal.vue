<!--
  F3-07 — Grade semanal: dias nas colunas, tempos de aula nas linhas,
  agrupados por turno. Mostra as aulas de uma turma, de um professor ou de uma sala.
  O texto de cada cartão muda conforme a visão (na visão por turma, o cartão mostra
  professor e sala; na de professor, turma e sala; na de sala, turma e professor).
  F4-03 — Com "editavel", os cartões podem ser arrastados e as células recebem a
  cor da simulação (celulas: Map horarioId → { nivel, motivos }). O componente só
  emite eventos; quem decide o que fazer é o editor.
-->
<template>
  <div>
    <div class="table-responsive">
      <table class="table table-bordered table-sm grade mb-0" :aria-label="titulo">
        <thead>
          <tr>
            <th scope="col" class="coluna-tempo">Tempo</th>
            <th v-for="d in gradeHoraria.dias" :key="d" scope="col" class="text-center">
              {{ DIAS[d] }}
            </th>
          </tr>
        </thead>
        <tbody v-for="turno in turnosVisiveis" :key="turno.id">
          <tr class="table-light">
            <th :colspan="gradeHoraria.dias.length + 1" scope="rowgroup" class="small">
              {{ turno.nome }}
            </th>
          </tr>
          <tr v-for="tempo in turno.tempos" :key="tempo.ordem">
            <th scope="row" class="coluna-tempo small fw-normal text-body-secondary">
              <div class="fw-semibold text-body">{{ tempo.ordem }}º</div>
              {{ tempo.horaInicio }}–{{ tempo.horaFim }}
            </th>
            <td
              v-for="d in gradeHoraria.dias"
              :key="d"
              :class="[
                {
                  'celula-choque':
                    aulasDa(turno.id, d, tempo.ordem).length > 1 &&
                    !paralelas(turno.id, d, tempo.ordem),
                  'celula-alvo': soltandoEm === horarioDe(turno.id, d, tempo.ordem),
                },
                classeNivel(turno.id, d, tempo.ordem),
              ]"
              :title="dicaCelula(turno.id, d, tempo.ordem)"
              @click="editavel && emit('clicar-celula', horarioDe(turno.id, d, tempo.ordem))"
              @dragover="aoPassar($event, turno.id, d, tempo.ordem)"
              @dragleave="soltandoEm = null"
              @drop.prevent="aoSoltar(turno.id, d, tempo.ordem, null)"
            >
              <span
                v-if="marcaProfessor(turno.id, d, tempo.ordem)"
                class="marca-professor"
                :class="`professor-${marcaProfessor(turno.id, d, tempo.ordem)}`"
                aria-hidden="true"
              />
              <button
                v-for="a in aulasDa(turno.id, d, tempo.ordem)"
                :key="a.id"
                type="button"
                class="cartao"
                :class="{
                  destacado: destaque.has(a.id),
                  revisar: a.revisar,
                  selecionado: a.id === selecionada,
                  arrastavel: editavel,
                }"
                :style="estiloCartao(a)"
                :title="descricao(a)"
                :draggable="editavel"
                :aria-pressed="editavel ? a.id === selecionada : undefined"
                @click.stop="emit('selecionar', a)"
                @dragstart="aoArrastar($event, a)"
                @dragend="aoTerminarArraste"
                @drop.stop.prevent="aoSoltar(turno.id, d, tempo.ordem, a)"
              >
                <span class="d-flex justify-content-between gap-1">
                  <strong>{{ a.sigla }}</strong>
                  <span>
                    <span v-if="a.fixada" class="badge text-bg-secondary" title="Aula fixada"
                      >fixa</span
                    >
                    <span
                      v-if="a.revisar"
                      class="badge text-bg-warning"
                      title="Marcada para revisão"
                      >rever</span
                    >
                  </span>
                </span>
                <span class="d-block linha">{{ linha1(a) }}</span>
                <span class="d-block linha text-body-secondary">{{ linha2(a) }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Legenda das cores (na visão por professor, todas as aulas são da mesma pessoa). -->
    <ul
      v-if="visao !== 'professor' && legenda.length"
      class="legenda list-unstyled d-flex flex-wrap gap-2 small mt-2 mb-0"
      aria-label="Cores dos professores"
    >
      <li v-for="p in legenda" :key="p.id" class="d-flex align-items-center gap-1">
        <span class="amostra" :style="{ background: p.cor }" aria-hidden="true" />
        {{ p.nome }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { DIAS } from '@/utils/formato'

const props = defineProps({
  gradeHoraria: { type: Object, required: true }, // { dias, turnos, horarios } da API
  aulas: { type: Array, required: true }, // aulas já filtradas para o recurso
  visao: { type: String, default: 'turma' }, // turma | professor | sala
  destaque: { type: Set, default: () => new Set() },
  titulo: { type: String, default: 'Grade semanal' },
  // Na visão por turma, os turnos permitidos aparecem mesmo vazios.
  turnosFixos: { type: Array, default: () => [] },
  editavel: { type: Boolean, default: false },
  celulas: { type: Map, default: null }, // horarioId → { nivel, professor, motivos }
  selecionada: { type: Number, default: null }, // id da aula selecionada
  // Marca as células em que o professor da aula selecionada está disponível.
  mostrarProfessor: { type: Boolean, default: false },
})
const emit = defineEmits(['selecionar', 'clicar-celula', 'arrastar', 'arrastar-fim', 'soltar'])

const ROTULOS_NIVEL = {
  livre: 'Livre',
  flexivel: 'Viola regra flexível',
  rigida: 'Viola regra rígida',
  atual: 'Posição atual',
}

// horarioId de cada célula: "turno|dia|ordem".
const horarioPorPosicao = computed(
  () =>
    new Map(
      props.gradeHoraria.horarios.map((h) => [`${h.turnoId}|${h.diaSemana}|${h.ordem}`, h.id])
    )
)
const horarioDe = (turno, dia, ordem) => horarioPorPosicao.value.get(`${turno}|${dia}|${ordem}`)

function celulaDe(turno, dia, ordem) {
  return props.celulas?.get(horarioDe(turno, dia, ordem)) ?? null
}

function classeNivel(turno, dia, ordem) {
  const c = celulaDe(turno, dia, ordem)
  return c ? `nivel-${c.nivel}` : ''
}

const ROTULOS_PROFESSOR = {
  livre: 'Professor disponível',
  evitar: 'Professor disponível, mas prefere evitar este horário',
  ocupado: 'Professor já tem aula neste horário',
  indisponivel: 'Professor indisponível neste horário',
}

// Só livre e "prefere evitar" ganham marca: são os horários em que a aula cabe
// para o professor.
function marcaProfessor(turno, dia, ordem) {
  if (!props.mostrarProfessor) return null
  const p = celulaDe(turno, dia, ordem)?.professor
  return p === 'livre' || p === 'evitar' ? p : null
}

function dicaCelula(turno, dia, ordem) {
  const c = celulaDe(turno, dia, ordem)
  if (!c) return undefined
  const professor = props.mostrarProfessor && c.professor ? [ROTULOS_PROFESSOR[c.professor]] : []
  return [ROTULOS_NIVEL[c.nivel], ...professor, ...(c.motivos ?? [])].join('\n')
}

// ---------- Arrastar e soltar ----------
const soltandoEm = ref(null)

function aoArrastar(evento, aula) {
  if (!props.editavel) return
  evento.dataTransfer.effectAllowed = 'move'
  evento.dataTransfer.setData('text/plain', String(aula.id))
  emit('arrastar', aula)
}

function aoTerminarArraste() {
  soltandoEm.value = null
  emit('arrastar-fim')
}

function aoPassar(evento, turno, dia, ordem) {
  if (!props.editavel) return
  evento.preventDefault()
  soltandoEm.value = horarioDe(turno, dia, ordem)
}

function aoSoltar(turno, dia, ordem, aulaAlvo) {
  soltandoEm.value = null
  if (!props.editavel) return
  emit('soltar', { horarioId: horarioDe(turno, dia, ordem), aulaAlvo })
}

const horarioPorId = computed(() => new Map(props.gradeHoraria.horarios.map((h) => [h.id, h])))

// Aulas por célula: "turno|dia|ordem".
const porCelula = computed(() => {
  const mapa = new Map()
  for (const a of props.aulas) {
    const h = horarioPorId.value.get(a.horarioId)
    if (!h) continue
    const chave = `${h.turnoId}|${h.diaSemana}|${h.ordem}`
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave).push(a)
  }
  return mapa
})

const aulasDa = (turno, dia, ordem) => porCelula.value.get(`${turno}|${dia}|${ordem}`) ?? []

// Turma dividida: aulas do mesmo grupo paralelo no mesmo horário não são choque.
function paralelas(turno, dia, ordem) {
  if (props.visao !== 'turma') return false
  const aulas = aulasDa(turno, dia, ordem)
  const grupo = aulas[0]?.grupoParalelo
  return (
    !!grupo &&
    aulas.every((a) => a.grupoParalelo === grupo) &&
    new Set(aulas.map((a) => a.atribuicaoId)).size === aulas.length
  )
}

// Só os turnos em que há aula. Sem nenhuma aula, os turnos permitidos da turma
// (turnosFixos); sem eles também, todos.
const turnosVisiveis = computed(() => {
  const usados = new Set()
  for (const a of props.aulas) {
    const h = horarioPorId.value.get(a.horarioId)
    if (h) usados.add(h.turnoId)
  }
  if (!usados.size) for (const t of props.turnosFixos) usados.add(t)
  const lista = props.gradeHoraria.turnos.filter((t) => usados.has(t.id))
  return lista.length ? lista : props.gradeHoraria.turnos
})

// ---------- Cores dos professores ----------
// Faixa lateral na cor do (primeiro) professor e fundo suave; com mais de um
// professor, o fundo se divide entre as cores de todos.
const fundo = (cor) => `color-mix(in srgb, ${cor} 11%, var(--bs-body-bg))`

function estiloCartao(a) {
  const cores = a.professores.map((p) => p.cor).filter(Boolean)
  if (!cores.length) return undefined
  const passo = 100 / cores.length
  return {
    '--cor-professor': cores[0],
    '--fundo-professor':
      cores.length === 1
        ? fundo(cores[0])
        : `linear-gradient(90deg, ${cores
            .map((c, i) => `${fundo(c)} ${i * passo}% ${(i + 1) * passo}%`)
            .join(', ')})`,
  }
}

const legenda = computed(() => {
  const mapa = new Map()
  for (const a of props.aulas)
    for (const p of a.professores) if (p.cor && !mapa.has(p.id)) mapa.set(p.id, p)
  return [...mapa.values()].sort((x, y) => x.nome.localeCompare(y.nome))
})

const nomesProfessores = (a) => a.professores.map((p) => p.nome).join(', ') || 'sem professor'
const nomeSala = (a) => a.sala ?? 'sem sala'

function linha1(a) {
  if (props.visao === 'turma') return nomesProfessores(a)
  return a.turma
}

function linha2(a) {
  if (props.visao === 'sala') return nomesProfessores(a)
  return nomeSala(a)
}

function descricao(a) {
  return `${a.sigla} — ${a.disciplina}\nTurma ${a.turma}\n${nomesProfessores(a)}\n${nomeSala(a)}`
}
</script>

<style scoped>
.grade {
  table-layout: fixed;
  min-width: 640px;
  background: var(--gf-superficie);
}
/* Dias da semana em texto normal (o tema deixa cabeçalhos de tabela em maiúsculas). */
.grade > thead th {
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.85rem;
  color: var(--gf-verde-escuro);
}
.coluna-tempo {
  width: 6.5rem;
}
.grade td {
  position: relative;
  vertical-align: top;
  padding: 0.2rem;
  height: 3.6rem;
}
/* Professor disponível: borda tracejada e um ponto no canto da célula. */
.grade td:has(> .professor-livre) {
  outline: 2px dashed var(--bs-success);
  outline-offset: -3px;
}
.grade td:has(> .professor-evitar) {
  outline: 2px dashed var(--bs-warning);
  outline-offset: -3px;
}
.marca-professor {
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  z-index: 1;
  pointer-events: none;
}
.professor-livre {
  background: var(--bs-success);
}
.professor-evitar {
  background: var(--bs-warning);
}
.cartao {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 0.78rem;
  line-height: 1.2;
  padding: 0.25rem 0.35rem;
  margin-bottom: 0.15rem;
  border: 1px solid var(--bs-border-color);
  border-left: 5px solid var(--cor-professor, var(--bs-primary));
  border-radius: 0.25rem;
  background: var(--fundo-professor, var(--bs-body-bg));
  color: var(--bs-body-color);
}
.legenda .amostra {
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 0.2rem;
}
.cartao:hover,
.cartao:focus-visible {
  border-color: var(--bs-primary);
}
.cartao.revisar {
  border-left-color: var(--bs-warning);
}
.cartao.destacado {
  outline: 3px solid var(--bs-danger);
  outline-offset: 1px;
  background: var(--bs-danger-bg-subtle);
}
.linha {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.celula-choque {
  background: var(--bs-danger-bg-subtle);
}
.nivel-livre {
  background: var(--bs-success-bg-subtle);
}
.nivel-flexivel {
  background: var(--bs-warning-bg-subtle);
}
.nivel-rigida {
  background: var(--bs-danger-bg-subtle);
}
.nivel-atual {
  box-shadow: inset 0 0 0 2px var(--bs-primary);
}
.celula-alvo {
  box-shadow: inset 0 0 0 3px var(--bs-primary);
}
.cartao.arrastavel {
  cursor: grab;
}
.cartao.selecionado {
  outline: 3px solid var(--bs-primary);
  outline-offset: 1px;
}
.badge {
  font-size: 0.6rem;
}
</style>
