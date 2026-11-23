<!--
  Grade de um turno com todos os dias de uma vez: os dias e os tempos nas
  linhas (o dia ocupa as linhas dos seus tempos) e as turmas nas colunas.
  Serve para mexer em todas as turmas do turno vendo a semana inteira.
  Entram as turmas que têm aula no turno em algum dia e as que têm algum tempo
  aberto nele (turno permitido e não marcado como indisponível na disponibilidade
  da turma neste horário). Os tempos fechados ficam riscados e não recebem aula nova.
  Como na grade semanal, o componente só emite eventos. A simulação (celulas:
  Map horarioId → { nivel, motivos }) vale para a aula escolhida, então só pinta
  a coluna da turma dela (turmaAlvo). Nas outras colunas, soltar ou clicar sobre
  uma aula propõe a troca; numa célula vazia, não faz nada.
-->
<template>
  <div>
    <p v-if="!turno || !colunas.length" class="text-body-secondary small p-3 mb-0">
      Nenhuma turma tem aula neste turno.
    </p>
    <div v-else class="rolagem" :style="{ maxHeight: alturaMaxima ?? '78vh' }">
      <table
        class="table table-bordered table-sm grade mb-0"
        :class="{ compacta }"
        :style="{
          minWidth: compacta ? `${9.5 + colunas.length * 6.5}rem` : `${11 + colunas.length * 8}rem`,
        }"
        :aria-label="titulo"
      >
        <thead>
          <tr>
            <th scope="col" class="coluna-dia fixa-1">Dias</th>
            <th scope="col" class="coluna-tempo fixa-2">Horário</th>
            <th
              v-for="t in colunas"
              :key="t.id"
              scope="col"
              class="text-center"
              :class="{ 'coluna-alvo': t.id === turmaAlvo }"
            >
              {{ t.codigo }}
            </th>
          </tr>
        </thead>
        <tbody v-for="(d, i) in gradeHoraria.dias" :key="d" :class="{ 'dia-par': i % 2 === 1 }">
          <tr v-for="(tempo, j) in turno.tempos" :key="tempo.ordem">
            <th
              v-if="j === 0"
              scope="rowgroup"
              :rowspan="turno.tempos.length"
              class="coluna-dia fixa-1"
            >
              {{ DIAS[d] }}
            </th>
            <th scope="row" class="coluna-tempo fixa-2 small fw-normal text-body-secondary">
              <span class="fw-semibold text-body"
                >{{ tempo.ordem }}º<template v-if="!compacta"> Horário</template></span
              >
              <span class="d-block">{{ tempo.horaInicio }}–{{ tempo.horaFim }}</span>
            </th>
            <td
              v-for="t in colunas"
              :key="t.id"
              :class="[
                {
                  'celula-choque': choqueNaCelula(t.id, d, tempo.ordem),
                  'celula-alvo': soltandoEm === chaveCelula(t.id, d, tempo.ordem),
                  'coluna-alvo': t.id === turmaAlvo,
                  'celula-fechada': fechada(t.id, d, tempo.ordem),
                },
                classeNivel(t.id, d, tempo.ordem),
              ]"
              :title="dicaCelula(t.id, d, tempo.ordem)"
              @click="aoClicarCelula(t.id, d, tempo.ordem)"
              @dragover="aoPassar($event, t.id, d, tempo.ordem)"
              @dragleave="soltandoEm = null"
              @drop.prevent="aoSoltar(t.id, d, tempo.ordem, null)"
            >
              <span
                v-if="marcaProfessor(t.id, d, tempo.ordem)"
                class="marca-professor"
                :class="`professor-${marcaProfessor(t.id, d, tempo.ordem)}`"
                aria-hidden="true"
              />
              <button
                v-for="a in aulasDa(t.id, d, tempo.ordem)"
                :key="a.id"
                type="button"
                class="cartao"
                :class="{
                  destacado: destaque.has(a.id),
                  revisar: a.revisar,
                  selecionado: a.id === selecionada,
                  arrastavel: editavel,
                  'choque-professor': professoresEmChoque(a).length > 0,
                }"
                :style="estiloCartao(a)"
                :title="descricao(a)"
                :draggable="editavel"
                :aria-pressed="editavel ? a.id === selecionada : undefined"
                @click.stop="emit('selecionar', a)"
                @dragstart="aoArrastar($event, a)"
                @dragend="aoTerminarArraste"
                @drop.stop.prevent="aoSoltar(t.id, d, tempo.ordem, a)"
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
                <span class="d-block linha">{{ nomesProfessores(a, compacta) }}</span>
                <span v-if="!compacta || a.sala" class="d-block linha text-body-secondary">{{
                  nomeSala(a)
                }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { DIAS, nomeCurto } from '@/utils/formato'
import { temposFechados } from '@/utils/disponibilidadeTurma'

const props = defineProps({
  gradeHoraria: { type: Object, required: true }, // { dias, turnos, horarios } da API
  turnoId: { type: Number, default: null },
  turmas: { type: Array, required: true }, // { id, codigo, turnos: [ids] }
  aulas: { type: Array, required: true }, // aulas do turno
  aulasDaSemana: { type: Array, required: true }, // todas, para saber os turnos de cada turma
  destaque: { type: Set, default: () => new Set() },
  titulo: { type: String, default: '' },
  editavel: { type: Boolean, default: false },
  celulas: { type: Map, default: null }, // horarioId → { nivel, professor, motivos }
  turmaAlvo: { type: Number, default: null }, // turma da aula escolhida
  selecionada: { type: Number, default: null }, // id da aula selecionada
  mostrarProfessor: { type: Boolean, default: false },
  // Cartões compactos: professor abreviado, sala só quando houver, colunas mais estreitas.
  compacta: { type: Boolean, default: false },
  // Altura máxima (CSS) da área de rolagem; sem ela, 78% da janela.
  alturaMaxima: { type: String, default: null },
  // Disponibilidade das turmas neste horário: Map(turmaId → Set(horarioId fechado)).
  indisponiveis: { type: Map, default: () => new Map() },
})
const emit = defineEmits(['selecionar', 'clicar-celula', 'arrastar', 'arrastar-fim', 'soltar'])

const ROTULOS_NIVEL = {
  livre: 'Livre',
  flexivel: 'Viola regra flexível',
  rigida: 'Viola regra rígida',
  atual: 'Posição atual',
}
const ROTULOS_PROFESSOR = {
  livre: 'Professor disponível',
  evitar: 'Professor disponível, mas prefere evitar este horário',
  ocupado: 'Professor já tem aula neste horário',
  indisponivel: 'Professor indisponível neste horário',
}

const turno = computed(() => props.gradeHoraria.turnos.find((t) => t.id === props.turnoId))

// ---------- Horários do turno ----------
const horarioPorId = computed(() => new Map(props.gradeHoraria.horarios.map((h) => [h.id, h])))
// horarioId de cada tempo do turno: "dia|ordem".
const horarioDoTurno = computed(
  () =>
    new Map(
      props.gradeHoraria.horarios
        .filter((h) => h.turnoId === props.turnoId)
        .map((h) => [`${h.diaSemana}|${h.ordem}`, h.id])
    )
)
const horarioDe = (dia, ordem) => horarioDoTurno.value.get(`${dia}|${ordem}`)
const chaveCelula = (turma, dia, ordem) => `${turma}|${dia}|${ordem}`

// Aulas por célula: "turma|dia|ordem".
const porCelula = computed(() => {
  const mapa = new Map()
  for (const a of props.aulas) {
    const h = horarioPorId.value.get(a.horarioId)
    if (!h || h.turnoId !== props.turnoId) continue
    const chave = chaveCelula(a.turmaId, h.diaSemana, h.ordem)
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave).push(a)
  }
  return mapa
})
const aulasDa = (turma, dia, ordem) => porCelula.value.get(chaveCelula(turma, dia, ordem)) ?? []

// ---------- Turmas (colunas) ----------
const turnosEmUso = computed(() => {
  const mapa = new Map() // turma → Set(turno), na semana inteira
  for (const a of props.aulasDaSemana) {
    const h = horarioPorId.value.get(a.horarioId)
    if (!h) continue
    if (!mapa.has(a.turmaId)) mapa.set(a.turmaId, new Set())
    mapa.get(a.turmaId).add(h.turnoId)
  }
  return mapa
})

// Tempos fechados de cada turma (turno não permitido ou indisponível).
const fechadosPorTurma = computed(
  () =>
    new Map(
      props.turmas.map((t) => [
        t.id,
        temposFechados(t, props.gradeHoraria.horarios, props.indisponiveis),
      ])
    )
)
const fechada = (turma, dia, ordem) =>
  fechadosPorTurma.value.get(turma)?.has(horarioDe(dia, ordem)) ?? false

const colunas = computed(() => {
  const doTurno = props.gradeHoraria.horarios.filter((h) => h.turnoId === props.turnoId)
  const aparece = (t) => {
    if (turnosEmUso.value.get(t.id)?.has(props.turnoId)) return true
    const fechados = fechadosPorTurma.value.get(t.id)
    return doTurno.some((h) => !fechados?.has(h.id))
  }
  return props.turmas
    .filter(aparece)
    .sort((x, y) => x.codigo.localeCompare(y.codigo, 'pt-BR', { numeric: true }))
})

// Turma dividida: aulas do mesmo grupo paralelo no mesmo horário não são choque.
function choqueNaCelula(turma, dia, ordem) {
  const aulas = aulasDa(turma, dia, ordem)
  if (aulas.length < 2) return false
  const grupo = aulas[0].grupoParalelo
  const paralelas =
    !!grupo &&
    aulas.every((a) => a.grupoParalelo === grupo) &&
    new Set(aulas.map((a) => a.atribuicaoId)).size === aulas.length
  return !paralelas
}

// Professor com aula em mais de uma turma no mesmo tempo: o cartão ganha borda vermelha.
const professoresPorHorario = computed(() => {
  const mapa = new Map() // horarioId → Map(professorId → Set(atribuicaoId))
  for (const a of props.aulas) {
    if (!mapa.has(a.horarioId)) mapa.set(a.horarioId, new Map())
    const doHorario = mapa.get(a.horarioId)
    for (const p of a.professores) {
      if (!doHorario.has(p.id)) doHorario.set(p.id, new Set())
      doHorario.get(p.id).add(a.atribuicaoId)
    }
  }
  return mapa
})
function professoresEmChoque(a) {
  const doHorario = professoresPorHorario.value.get(a.horarioId)
  if (!doHorario) return []
  return a.professores.filter((p) => (doHorario.get(p.id)?.size ?? 0) > 1)
}

// ---------- Simulação (só na coluna da turma da aula escolhida) ----------
function celulaDe(turma, dia, ordem) {
  if (turma !== props.turmaAlvo) return null
  return props.celulas?.get(horarioDe(dia, ordem)) ?? null
}
function classeNivel(turma, dia, ordem) {
  const c = celulaDe(turma, dia, ordem)
  return c ? `nivel-${c.nivel}` : ''
}
function marcaProfessor(turma, dia, ordem) {
  if (!props.mostrarProfessor) return null
  const p = celulaDe(turma, dia, ordem)?.professor
  return p === 'livre' || p === 'evitar' ? p : null
}
const AVISO_FECHADO = 'Turma indisponível neste horário (veja a disponibilidade da turma)'

function dicaCelula(turma, dia, ordem) {
  const c = celulaDe(turma, dia, ordem)
  const aviso = fechada(turma, dia, ordem) ? [AVISO_FECHADO] : []
  if (!c) return aviso.length ? aviso[0] : undefined
  const professor = props.mostrarProfessor && c.professor ? [ROTULOS_PROFESSOR[c.professor]] : []
  return [...aviso, ROTULOS_NIVEL[c.nivel], ...professor, ...(c.motivos ?? [])].join('\n')
}

// ---------- Clique, arrastar e soltar ----------
const soltandoEm = ref(null)

// Aula nova só na coluna da turma da aula escolhida e num tempo aberto para ela.
const recebeAula = (turma, dia, ordem) => turma === props.turmaAlvo && !fechada(turma, dia, ordem)

function aoClicarCelula(turma, dia, ordem) {
  if (!props.editavel || !recebeAula(turma, dia, ordem)) return
  emit('clicar-celula', horarioDe(dia, ordem))
}

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

// Aceita soltar num tempo aberto da coluna da turma da aula ou sobre outra aula (troca).
function aoPassar(evento, turma, dia, ordem) {
  if (!props.editavel) return
  if (!recebeAula(turma, dia, ordem) && !aulasDa(turma, dia, ordem).length) return
  evento.preventDefault()
  soltandoEm.value = chaveCelula(turma, dia, ordem)
}

function aoSoltar(turma, dia, ordem, aulaAlvo) {
  soltandoEm.value = null
  if (!props.editavel) return
  if (!aulaAlvo && !recebeAula(turma, dia, ordem)) return
  emit('soltar', { horarioId: horarioDe(dia, ordem), aulaAlvo })
}

// ---------- Cartões ----------
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

const nomesProfessores = (a, curto = false) =>
  a.professores.map((p) => (curto ? nomeCurto(p.nome) : p.nome)).join(', ') || 'sem professor'
const nomeSala = (a) => a.sala ?? 'sem sala'

function descricao(a) {
  const h = horarioPorId.value.get(a.horarioId)
  const choque = professoresEmChoque(a)
  const aviso = choque.length
    ? `\n⚠ ${choque.map((p) => p.nome).join(', ')} com aula em outra turma neste horário`
    : ''
  const quando = h ? ` · ${DIAS[h.diaSemana]}, ${h.ordem}º horário` : ''
  return `${a.sigla} — ${a.disciplina}\nTurma ${a.turma}${quando}\n${nomesProfessores(a)}\n${nomeSala(a)}${aviso}`
}
</script>

<style scoped>
/* Rolagem própria: o cabeçalho das turmas e as colunas de dia e horário ficam fixos. */
.rolagem {
  overflow: auto;
}
.grade {
  --largura-dia: 5.5rem;
  table-layout: fixed;
  background: var(--gf-superficie);
  border-collapse: separate;
  border-spacing: 0;
  /* Bordas separadas (para as partes fixas): cada célula desenha a da direita e a
     de baixo, e a tabela a de cima e a da esquerda, sem linhas duplas. */
  border-top: 1px solid var(--gf-borda-grade);
  border-left: 1px solid var(--gf-borda-grade);
}
.grade > :not(caption) > * > * {
  border-width: 0 1px 1px 0;
  border-style: solid;
  border-color: var(--gf-borda-grade);
}
.grade.compacta {
  --largura-dia: 5rem;
}
.grade > thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--bs-body-bg);
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.85rem;
  color: var(--gf-verde-escuro);
  vertical-align: middle;
}
.grade > thead th.coluna-alvo {
  box-shadow: inset 0 -3px 0 var(--bs-primary);
}
.coluna-dia {
  width: var(--largura-dia);
}
.coluna-tempo {
  width: 5.5rem;
}
.compacta .coluna-tempo {
  width: 5rem;
}
.fixa-1,
.fixa-2 {
  position: sticky;
  z-index: 2;
  background: var(--bs-body-bg);
}
.fixa-1 {
  left: 0;
}
.fixa-2 {
  left: var(--largura-dia);
}
.grade > thead th.fixa-1,
.grade > thead th.fixa-2 {
  z-index: 4;
}
tbody th.coluna-dia {
  vertical-align: top;
  font-weight: 600;
}
/* Um dia sim, outro não, com fundo cinza (como no modelo) e linha mais forte entre os dias. */
.dia-par th,
.dia-par td {
  background-color: var(--bs-tertiary-bg);
}
/* Linha mais forte entre um dia e outro. */
tbody + tbody tr:first-child > * {
  border-top: 2px solid #9fb0a5;
}
.coluna-tempo .d-block {
  font-size: 0.7rem;
}
.grade td {
  position: relative;
  vertical-align: top;
  padding: 0.15rem;
  height: 3.3rem;
}
.grade.compacta td {
  height: 2.8rem;
}
.grade.compacta .cartao {
  padding: 0.15rem 0.3rem;
}
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
  font-size: 0.75rem;
  line-height: 1.15;
  padding: 0.2rem 0.3rem;
  margin-bottom: 0.15rem;
  border: 1px solid var(--bs-border-color);
  border-left: 5px solid var(--cor-professor, var(--bs-primary));
  border-radius: 0.25rem;
  background: var(--fundo-professor, var(--bs-body-bg));
  color: var(--bs-body-color);
}
.cartao:hover,
.cartao:focus-visible {
  border-color: var(--bs-primary);
}
.cartao.revisar {
  border-left-color: var(--bs-warning);
}
.cartao.choque-professor {
  border-top: 2px solid var(--bs-danger);
  border-right: 2px solid var(--bs-danger);
  border-bottom: 2px solid var(--bs-danger);
}
.cartao.destacado {
  outline: 3px solid var(--bs-danger);
  outline-offset: 1px;
  background: var(--bs-danger-bg-subtle);
}
.cartao.selecionado {
  outline: 3px solid var(--bs-primary);
  outline-offset: 1px;
}
.cartao.arrastavel {
  cursor: grab;
}
.linha {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grade td.celula-choque {
  background: var(--bs-danger-bg-subtle);
}
.grade td.nivel-livre {
  background: var(--bs-success-bg-subtle);
}
.grade td.nivel-flexivel {
  background: var(--bs-warning-bg-subtle);
}
.grade td.nivel-rigida {
  background: var(--bs-danger-bg-subtle);
}
.nivel-atual {
  box-shadow: inset 0 0 0 2px var(--bs-primary);
}
/* Tempo fechado para a turma: riscado por cima da cor que a célula tiver. */
.grade td.celula-fechada {
  background-image: repeating-linear-gradient(
    135deg,
    transparent 0 6px,
    rgba(var(--bs-secondary-rgb), 0.18) 6px 8px
  );
  cursor: not-allowed;
}
.celula-alvo {
  box-shadow: inset 0 0 0 3px var(--bs-primary);
}
.badge {
  font-size: 0.6rem;
}
</style>
