<template>
  <div>
    <header class="mb-4">
      <h1 class="h3 mb-0">Painel do período</h1>
      <p class="text-body-secondary mb-0">
        {{
          periodo
            ? `Período ${periodo.nome} · ${formatarData(periodo.dataInicio)} a ${formatarData(periodo.dataFim)}`
            : 'Selecione um período letivo'
        }}
      </p>
    </header>

    <template v-if="periodo && auth.ehGestor">
      <BAlert :model-value="!!erro" variant="danger">{{ erro }}</BAlert>
      <div v-if="carregando && !painel" class="text-center py-5">
        <BSpinner label="Carregando" />
      </div>

      <template v-if="painel">
        <BRow class="g-3 mb-3">
          <BCol v-for="n in numeros" :key="n.rotulo" cols="6" md="4" xxl="2">
            <BCard class="h-100 indicador" body-class="indicador-corpo">
              <span class="indicador-icone" :class="`tom-${n.tom}`" aria-hidden="true">
                <i :class="`bi bi-${n.icone}`" />
              </span>
              <div class="min-w-0">
                <div class="indicador-valor">{{ formatarNumero(n.valor) }}</div>
                <div class="indicador-rotulo">{{ n.rotulo }}</div>
              </div>
            </BCard>
          </BCol>
        </BRow>

        <BRow class="g-3 mb-4">
          <BCol cols="12" lg="7">
            <BCard header-tag="h2" header-class="h6 mb-0" header="Pendências" class="h-100">
              <p v-if="!painel.pendencias.length" class="text-success mb-0">
                Nenhuma pendência: os dados estão prontos para gerar a grade.
              </p>
              <ul v-else class="list-unstyled mb-0">
                <li v-for="p in painel.pendencias" :key="p.mensagem" class="mb-2 d-flex gap-2">
                  <BBadge
                    :variant="p.nivel === 'erro' ? 'danger' : 'warning'"
                    class="align-self-start"
                  >
                    {{ p.nivel === 'erro' ? 'impede' : 'atenção' }}
                  </BBadge>
                  <span class="small">
                    {{ p.mensagem }}
                    <RouterLink v-if="p.rota" :to="rotaDaPendencia(p.rota)" class="ms-1"
                      >Resolver</RouterLink
                    >
                  </span>
                </li>
              </ul>
              <p v-if="painel.dados.ultimaImportacao" class="small text-body-secondary mt-3 mb-0">
                Última importação em {{ formatarDataHora(painel.dados.ultimaImportacao) }}.
              </p>
            </BCard>
          </BCol>
          <BCol cols="12" lg="5">
            <BCard header-tag="h2" header-class="h6 mb-0" header="Horários" class="h-100">
              <div v-if="painel.geracao?.ativo" class="small mb-2">
                <BSpinner small class="me-1" />
                Geração em andamento:
                <RouterLink :to="{ name: 'geracao' }">{{ painel.geracao.nome }}</RouterLink>
              </div>
              <p v-if="!painel.versoes.total" class="small text-body-secondary mb-0">
                Nenhum horário criado.
                <RouterLink :to="{ name: 'versoes' }">Criar o primeiro</RouterLink>
              </p>
              <ul v-else class="list-unstyled small mb-2">
                <li v-for="v in painel.versoes.recentes" :key="v.id" class="mb-1">
                  <RouterLink :to="{ name: 'versao', params: { id: v.id } }">{{
                    v.nome
                  }}</RouterLink>
                  <BBadge v-if="v.publicada" variant="primary" class="ms-1">publicado</BBadge>
                  <BBadge :variant="v.valida ? 'success' : 'danger'" class="ms-1">
                    {{ v.valida ? 'válida' : 'inválida' }}
                  </BBadge>
                  <span class="text-body-secondary">
                    · pontuação {{ formatarNumero(v.pontuacao) }}</span
                  >
                </li>
              </ul>
              <RouterLink v-if="painel.versoes.total" :to="{ name: 'versoes' }" class="small">
                Todos os {{ painel.versoes.total }} horários
              </RouterLink>
            </BCard>
          </BCol>
        </BRow>
      </template>
    </template>

    <BRow v-if="periodo && !auth.ehGestor" class="g-3">
      <BCol cols="12" md="6" xl="4">
        <BCard class="h-100">
          <h2 class="h6">Minha disponibilidade</h2>
          <p class="small text-body-secondary">
            Marque os horários em que você não pode dar aula ou prefere evitar.
          </p>
          <RouterLink :to="{ name: 'disponibilidade' }" class="small">Abrir</RouterLink>
        </BCard>
      </BCol>
      <BCol cols="12" md="6" xl="4">
        <BCard class="h-100">
          <h2 class="h6">Minha grade</h2>
          <p class="small text-body-secondary">Suas aulas na grade publicada do período.</p>
          <RouterLink :to="{ name: 'minha-grade' }" class="small">Abrir</RouterLink>
        </BCard>
      </BCol>
    </BRow>

    <h2 v-if="periodo && auth.ehGestor" class="secao-titulo">Ciclo do período</h2>
    <BRow v-if="periodo && auth.ehGestor" class="g-3">
      <BCol v-for="etapa in etapas" :key="etapa.titulo" cols="12" md="6" xl="4">
        <BCard class="h-100 etapa" :class="{ pronta: etapa.pronta }" body-class="d-flex gap-3">
          <span class="etapa-numero" aria-hidden="true">
            <i v-if="etapa.pronta" class="bi bi-check-lg" />
            <template v-else>{{ etapa.numero }}</template>
          </span>
          <div class="flex-grow-1 d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
              <h3 class="h6 mb-0">{{ etapa.titulo }}</h3>
              <BBadge
                v-if="etapa.pronta !== null"
                :variant="etapa.pronta ? 'success' : 'light'"
                :class="{ 'text-body-secondary border': !etapa.pronta }"
              >
                {{ etapa.pronta ? 'Pronta' : 'Pendente' }}
              </BBadge>
            </div>
            <p class="small text-body-secondary mb-3">{{ etapa.descricao }}</p>
            <RouterLink
              v-if="etapa.rota"
              :to="etapa.rota"
              class="btn btn-sm btn-outline-primary align-self-start mt-auto"
            >
              Abrir <i class="bi bi-arrow-right ms-1" aria-hidden="true" />
            </RouterLink>
          </div>
        </BCard>
      </BCol>
    </BRow>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BAlert, BBadge, BCard, BCol, BRow, BSpinner } from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { usePeriodoStore } from '@/stores/periodo'
import { formatarData, formatarDataHora, formatarNumero } from '@/utils/formato'

const periodoStore = usePeriodoStore()
const auth = useAuthStore()
const periodo = computed(() => periodoStore.ativo)
const painel = ref(null)
const carregando = ref(false)
const erro = ref('')

watch(
  () => periodoStore.ativoId,
  async (id) => {
    painel.value = null
    erro.value = ''
    if (!id || !auth.ehGestor) return
    carregando.value = true
    try {
      painel.value = await http.get(`/periodos/${id}/painel`)
    } catch (e) {
      erro.value = mensagemDeErro(e)
    } finally {
      carregando.value = false
    }
  },
  { immediate: true }
)

const numeros = computed(() => {
  const d = painel.value?.dados ?? {}
  return [
    { rotulo: 'turmas', valor: d.turmas, icone: 'people-fill', tom: 'verde' },
    { rotulo: 'professores', valor: d.professores, icone: 'person-workspace', tom: 'azul' },
    { rotulo: 'atribuições', valor: d.atribuicoes, icone: 'journal-bookmark', tom: 'amarelo' },
    { rotulo: 'aulas semanais', valor: d.aulasSemanais, icone: 'clock-history', tom: 'vermelho' },
    { rotulo: 'salas ativas', valor: d.salasAtivas, icone: 'door-open', tom: 'cinza' },
    { rotulo: 'tempos na semana', valor: d.horarios, icone: 'calendar-week', tom: 'verde' },
  ]
})

function rotaDaPendencia(nome) {
  if (nome === 'grade-horaria') return { name: nome, params: { id: periodo.value.id } }
  return { name: nome }
}

// Ciclo de um período letivo (descrição, seção 2).
const etapas = computed(() => {
  const d = painel.value?.dados
  const v = painel.value?.versoes
  const saber = (valor) => (painel.value ? valor : null)
  return [
    {
      numero: 1,
      titulo: 'Turnos e tempos de aula',
      descricao: d?.horarios
        ? `${d.turnos} turno(s), ${d.horarios} tempos na semana.`
        : 'Defina os turnos, os tempos de aula e os dias letivos.',
      pronta: saber(!!d?.horarios),
      rota: periodo.value ? { name: 'grade-horaria', params: { id: periodo.value.id } } : null,
    },
    {
      numero: 2,
      titulo: 'Importação',
      descricao: 'Professores, turmas, disciplinas, atribuições e salas.',
      pronta: saber(!!d?.atribuicoes),
      rota: { name: 'importacao' },
    },
    {
      numero: 3,
      titulo: 'Disponibilidade',
      descricao: 'Indisponibilidades e preferências dos professores.',
      pronta: null,
      rota: { name: 'disponibilidade' },
    },
    {
      numero: 4,
      titulo: 'Restrições',
      descricao: 'Ativação, pesos e parâmetros das regras.',
      pronta: null,
      rota: { name: 'restricoes' },
    },
    {
      numero: 5,
      titulo: 'Geração e ajuste',
      descricao: v?.total
        ? `${v.total} horário(s) criado(s).`
        : 'Gerar a grade e ajustar manualmente.',
      pronta: saber(!!v?.total),
      rota: { name: 'geracao' },
    },
    {
      numero: 6,
      titulo: 'Publicação',
      descricao: v?.publicada
        ? `Publicada: ${v.publicada.nome}.`
        : 'Comparar versões, publicar e exportar.',
      pronta: saber(!!v?.publicada),
      rota: { name: 'versoes' },
    },
  ]
})
</script>

<style scoped>
.indicador-icone {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 0.75rem;
  font-size: 1.25rem;
}
.tom-verde {
  background: #e3f1e5;
  color: #1f7a33;
}
.tom-azul {
  background: #e6effd;
  color: #2b6cd8;
}
.tom-amarelo {
  background: #fff4d6;
  color: #b07800;
}
.tom-vermelho {
  background: #fde8e6;
  color: #c83a2c;
}
.tom-cinza {
  background: #edf1f4;
  color: #5b6b78;
}
.indicador-valor {
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--gf-texto);
}
.indicador-rotulo {
  font-size: 0.78rem;
  color: var(--gf-texto-suave);
}
.min-w-0 {
  min-width: 0;
}
.indicador :deep(.indicador-corpo) {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding-block: 1rem;
}
.indicador-rotulo {
  overflow-wrap: normal;
  word-break: normal;
}
/* Celular: ícone em cima, para o rótulo não quebrar no meio da palavra. */
@media (max-width: 575.98px) {
  .indicador :deep(.indicador-corpo) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.9rem 1rem;
  }
  .indicador-icone {
    width: 38px;
    height: 38px;
    font-size: 1.1rem;
  }
}
.etapa-numero {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--gf-fundo);
  border: 1px solid var(--gf-borda);
  color: var(--gf-texto-suave);
  font-weight: 700;
}
.etapa.pronta .etapa-numero {
  background: var(--gf-verde);
  border-color: var(--gf-verde);
  color: #fff;
}
</style>
