// Catálogo das restrições (descrição, seção 4). É a fonte única para:
// - o seed de restricao_config ao criar um período;
// - a tela de restrições (nomes e descrições);
// - o registro de módulos de restrição (restricoes/index.js).

export const TIPO = Object.freeze({ RIGIDA: 'rigida', FLEXIVEL: 'flexivel' })

export const CATALOGO = Object.freeze([
  // Rígidas: toda grade válida precisa cumprir. Peso não se aplica.
  {
    codigo: 'R1',
    tipo: TIPO.RIGIDA,
    nome: 'Choque de professor',
    descricao: 'Um professor não dá duas aulas no mesmo horário',
  },
  {
    codigo: 'R2',
    tipo: TIPO.RIGIDA,
    nome: 'Choque de turma',
    descricao: 'Uma turma não tem duas aulas no mesmo horário, salvo atribuições paralelas',
  },
  {
    codigo: 'R3',
    tipo: TIPO.RIGIDA,
    nome: 'Choque de sala',
    descricao: 'Uma sala não recebe duas aulas no mesmo horário',
  },
  {
    codigo: 'R4',
    tipo: TIPO.RIGIDA,
    nome: 'Carga semanal',
    descricao: 'Toda atribuição recebe exatamente suas aulas semanais',
  },
  {
    codigo: 'R5',
    tipo: TIPO.RIGIDA,
    nome: 'Turno da turma',
    descricao: 'A aula cai em um turno permitido para a turma',
  },
  {
    codigo: 'R6',
    tipo: TIPO.RIGIDA,
    nome: 'Indisponibilidade rígida',
    descricao: 'Indisponibilidades rígidas de professor, turma e sala são respeitadas',
  },
  {
    codigo: 'R7',
    tipo: TIPO.RIGIDA,
    nome: 'Tipo e capacidade da sala',
    descricao: 'A sala é do tipo exigido pela disciplina e comporta a turma',
  },
  {
    codigo: 'R8',
    tipo: TIPO.RIGIDA,
    nome: 'Aulas fixadas',
    descricao: 'Aulas fixadas permanecem no horário e na sala definidos',
  },

  // Flexíveis: somam penalidade conforme o peso (1 a 10).
  {
    codigo: 'F1',
    tipo: TIPO.FLEXIVEL,
    peso: 9,
    nome: 'Aulas geminadas consecutivas',
    descricao: 'Aulas geminadas ficam em tempos consecutivos, sem intervalo no meio',
  },
  {
    codigo: 'F2',
    tipo: TIPO.FLEXIVEL,
    peso: 9,
    nome: 'Turma sem janelas',
    descricao: 'Turma sem tempos vagos entre aulas no turno',
  },
  {
    codigo: 'F3',
    tipo: TIPO.FLEXIVEL,
    peso: 8,
    nome: 'Interjornada noite/manhã',
    descricao: 'Professor que leciona à noite não abre a manhã seguinte',
    // Tempos iniciais da manhã que contam como "abrir a manhã". Os turnos de noite e
    // de manhã são reconhecidos pelo nome; turnoNoite e turnoManha (ids) sobrepõem.
    parametros: { primeirosTempos: 2 },
  },
  {
    codigo: 'F4',
    tipo: TIPO.FLEXIVEL,
    peso: 7,
    nome: 'Limite diário da disciplina',
    descricao: 'Limite de aulas da mesma disciplina por dia para a turma',
    parametros: { maximoPorDia: 2 },
  },
  {
    codigo: 'F5',
    tipo: TIPO.FLEXIVEL,
    peso: 6,
    nome: 'Preferências do professor',
    descricao: 'Preferências de horário do professor',
  },
  {
    codigo: 'F6',
    tipo: TIPO.FLEXIVEL,
    peso: 6,
    nome: 'Janelas do professor',
    descricao: 'Poucas janelas na grade de cada professor',
  },
  {
    codigo: 'F7',
    tipo: TIPO.FLEXIVEL,
    peso: 5,
    nome: 'Dias no campus',
    descricao: 'Aulas do professor concentradas em menos dias no campus',
    // Referência para o mínimo de dias: aulas da semana divididas por este número.
    parametros: { aulasPorDia: 6 },
  },
  {
    codigo: 'F8',
    tipo: TIPO.FLEXIVEL,
    peso: 4,
    nome: 'Espalhamento da disciplina',
    descricao: 'Aulas da mesma disciplina espalhadas ao longo da semana',
  },
  {
    codigo: 'F9',
    tipo: TIPO.FLEXIVEL,
    peso: 4,
    nome: 'Limite diário do professor',
    descricao: 'Limite de aulas diárias por professor',
    parametros: { maximoPorDia: 6 },
  },
  {
    codigo: 'F10',
    tipo: TIPO.FLEXIVEL,
    peso: 3,
    nome: 'Mesma sala no turno',
    descricao: 'Turma permanece na mesma sala ao longo do turno',
  },
])

export const CODIGOS = Object.freeze(CATALOGO.map((r) => r.codigo))

export function obterRestricao(codigo) {
  return CATALOGO.find((r) => r.codigo === codigo) ?? null
}

export function ehRigida(codigo) {
  return obterRestricao(codigo)?.tipo === TIPO.RIGIDA
}

// Linhas iniciais de restricao_config para um período novo.
export function configuracaoInicial() {
  return CATALOGO.map((r) => ({
    codigo: r.codigo,
    ativa: true,
    peso: r.tipo === TIPO.RIGIDA ? 10 : r.peso,
    parametros: r.parametros ?? null,
  }))
}
