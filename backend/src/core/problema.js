// F2-01 — Formato JSON do problema (entrada do solver) e da solução (saída).
// Ids são os mesmos do banco, mas o núcleo não sabe disso: só precisa que sejam
// inteiros únicos dentro de cada coleção.

import { z } from 'zod'
import { CODIGOS } from './restricoes/catalogo.js'

const id = z.number().int().positive()

export const TurnoSchema = z.object({
  id,
  nome: z.string(),
  ordem: z.number().int().default(1),
})

export const HorarioSchema = z.object({
  id,
  turnoId: id,
  diaSemana: z.number().int().min(1).max(7),
  ordem: z.number().int().min(1),
  horaInicio: z.string().optional(),
  horaFim: z.string().optional(),
})

export const TurmaSchema = z.object({
  id,
  codigo: z.string(),
  turnosPermitidos: z.array(id).min(1),
  numeroAlunos: z.number().int().min(0).default(0),
})

export const ProfessorSchema = z.object({
  id,
  nome: z.string(),
  cargaMaximaSemanal: z.number().int().min(0).default(20),
})

export const SalaSchema = z.object({
  id,
  nome: z.string(),
  tipo: z.string().default('sala'),
  capacidade: z.number().int().min(0).default(40),
})

export const AtribuicaoSchema = z.object({
  id,
  turmaId: id,
  disciplinaId: id,
  // Só para mensagens (ex.: "INF1V · MAT1").
  rotulo: z.string().optional(),
  tipoAmbiente: z.string().default('sala'),
  professores: z.array(id).min(1),
  aulasSemanais: z.number().int().min(1),
  tamanhoBloco: z.number().int().min(1).default(1),
  grupoParalelo: z.string().nullable().default(null),
})

export const IndisponibilidadeSchema = z.object({
  tipoRecurso: z.enum(['professor', 'turma', 'sala']),
  recursoId: id,
  horarioId: id,
  rigida: z.boolean().default(true),
})

export const RestricaoConfigSchema = z.object({
  codigo: z.enum(CODIGOS),
  ativa: z.boolean().default(true),
  peso: z.number().int().min(0).max(10).default(5),
  parametros: z.record(z.string(), z.unknown()).nullable().default(null),
})

export const AulaSchema = z.object({
  id: id.optional(),
  atribuicaoId: id,
  horarioId: id,
  salaId: id.nullable().default(null),
  fixada: z.boolean().default(false),
})

export const ProblemaSchema = z.object({
  // Sem turnos, o núcleo deduz um por turnoId dos horários (sem nome).
  turnos: z.array(TurnoSchema).default([]),
  horarios: z.array(HorarioSchema).min(1),
  turmas: z.array(TurmaSchema).min(1),
  professores: z.array(ProfessorSchema).min(1),
  salas: z.array(SalaSchema),
  atribuicoes: z.array(AtribuicaoSchema).min(1),
  indisponibilidades: z.array(IndisponibilidadeSchema).default([]),
  restricoes: z.array(RestricaoConfigSchema).default([]),
  aulasFixadas: z.array(AulaSchema).default([]),
  opcoes: z
    .object({
      semente: z.string().default('1'),
      tempoLimiteMs: z.number().int().min(100).default(60_000),
      // Com limite de iterações, o resfriamento segue as iterações e o resultado
      // se repete com a mesma semente; sem ele, segue o relógio.
      maxIteracoes: z.number().int().min(1).optional(),
      temperaturaInicial: z.number().positive().optional(),
      temperaturaFinal: z.number().positive().default(0.05),
    })
    // prefault: no Zod 4 o objeto vazio passa pelo esquema e recebe os padrões internos
    .prefault({}),
})

// aulas: posições (base 0) na lista de aulas da solução ou da grade avaliada.
export const ViolacaoSchema = z.object({
  codigo: z.enum(CODIGOS),
  custo: z.number().min(0),
  aulas: z.array(z.number().int().min(0)),
  recurso: z.object({ tipo: z.string(), id: id }).nullable(),
  mensagem: z.string(),
})

export const SolucaoSchema = z.object({
  aulas: z.array(AulaSchema),
  naoAlocados: z.array(
    z.object({
      atribuicaoId: id,
      aulasFaltantes: z.number().int().min(1),
      motivos: z.array(z.string()),
    })
  ),
  // Válida = nenhuma restrição rígida violada.
  valida: z.boolean(),
  // Soma das violações rígidas (sem peso).
  custoRigido: z.number().min(0),
  // Penalidade das flexíveis ponderada pelos pesos. Menor é melhor.
  pontuacao: z.number(),
  pontuacaoPorRestricao: z.record(z.string(), z.number()),
  violacoes: z.array(ViolacaoSchema),
  semente: z.string(),
  iteracoes: z.number().int().min(0),
  tempoMs: z.number().min(0),
  motivoFim: z.enum(['tempo', 'iteracoes', 'cancelado', 'otimo', 'sem-blocos']).optional(),
})

export function validarProblema(dados) {
  return ProblemaSchema.parse(dados)
}

export function validarSolucao(dados) {
  return SolucaoSchema.parse(dados)
}
