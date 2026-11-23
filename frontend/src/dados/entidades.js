// Definição dos cinco cadastros da tela de dados (F1-21): colunas da tabela,
// campos de busca e campos do formulário de correção.
// Os nomes dos campos do formulário são os mesmos que a API espera no PUT.

const NIVEIS = [
  { value: 'integrado', text: 'Integrado' },
  { value: 'subsequente', text: 'Subsequente' },
  { value: 'superior', text: 'Superior' },
]

export const ENTIDADES = [
  {
    chave: 'professores',
    titulo: 'Professores',
    compartilhado: true,
    // Professores, turmas, disciplinas e salas podem ser cadastrados à mão; as
    // atribuições da oferta vêm da planilha.
    novo: {
      rotulo: 'Novo professor',
      valores: { nome: '', siape: '', email: '', cor: '', cargaMaxima: 20, ativo: true },
    },
    placeholder: 'Buscar por nome, SIAPE ou e-mail',
    colunas: [
      { key: 'cor', label: 'Cor' },
      { key: 'nome', label: 'Nome', sortable: true },
      { key: 'siape', label: 'SIAPE', sortable: true, formatter: (v) => v ?? '—' },
      { key: 'email', label: 'E-mail', formatter: (v) => v ?? '' },
      {
        key: 'carga',
        label: 'Aulas no período / máximo',
        sortable: true,
        sortByFormatted: true,
        formatter: (_v, _k, p) => p.cargaAtribuida,
      },
      { key: 'ativo', label: 'Situação' },
    ],
    busca: ['nome', 'siape', 'email'],
    rotulo: (p) => (p.siape ? `${p.nome} (SIAPE ${p.siape})` : p.nome),
    formulario: [
      { campo: 'nome', rotulo: 'Nome', tipo: 'texto', tamanho: 120 },
      {
        campo: 'siape',
        rotulo: 'SIAPE',
        tipo: 'texto',
        tamanho: 12,
        ajuda: 'Opcional. Professores vindos da planilha de oferta são reconhecidos pelo nome.',
      },
      { campo: 'email', rotulo: 'E-mail', tipo: 'email', tamanho: 120 },
      {
        campo: 'cor',
        // O formulário edita só a cor escolhida; vazia = automática.
        origem: 'corEscolhida',
        rotulo: 'Cor nas grades',
        tipo: 'cor',
        ajuda: 'As aulas do professor aparecem nesta cor na grade e no editor de horários.',
      },
      {
        campo: 'cargaMaxima',
        rotulo: 'Carga máxima semanal (aulas)',
        tipo: 'numero',
        min: 1,
        max: 60,
      },
      {
        campo: 'ativo',
        rotulo: 'Ativo',
        tipo: 'checkbox',
        ajuda: 'Inativos ficam fora das próximas gerações de grade.',
      },
    ],
    avisoExclusao: 'Só é possível excluir professor que não está em nenhuma atribuição.',
  },
  {
    chave: 'turmas',
    titulo: 'Turmas',
    // Turmas do semestre (período): valem para todos os horários dele.
    novo: {
      rotulo: 'Nova turma',
      valores: { codigo: '', curso: '', nivel: 'integrado', turnos: [], numeroAlunos: 0 },
    },
    placeholder: 'Buscar por código, curso ou nível',
    colunas: [
      { key: 'codigo', label: 'Código', sortable: true },
      { key: 'curso', label: 'Curso', sortable: true },
      { key: 'nivel', label: 'Nível', sortable: true },
      { key: 'turnos', label: 'Turnos' },
      { key: 'numeroAlunos', label: 'Alunos', sortable: true },
      {
        key: 'carga',
        label: 'Aulas / tempos disponíveis',
        sortable: true,
        sortByFormatted: true,
        formatter: (_v, _k, t) => t.aulasSemanais,
      },
    ],
    busca: ['codigo', 'curso', 'nivel'],
    rotulo: (t) => `turma ${t.codigo}`,
    formulario: [
      {
        campo: 'codigo',
        rotulo: 'Código',
        tipo: 'texto',
        tamanho: 40,
        ajuda: 'Chave usada na importação de planilhas.',
      },
      {
        campo: 'curso',
        rotulo: 'Curso',
        tipo: 'texto',
        tamanho: 120,
        ajuda: 'Um nome novo cria o curso.',
      },
      { campo: 'nivel', rotulo: 'Nível', tipo: 'select', opcoes: NIVEIS },
      { campo: 'turnos', rotulo: 'Turnos permitidos', tipo: 'checkboxes' },
      { campo: 'numeroAlunos', rotulo: 'Número de alunos', tipo: 'numero', min: 0, max: 1000 },
    ],
    avisoExclusao:
      'As atribuições da turma também serão excluídas. Turmas com aulas na grade não podem ser excluídas.',
  },
  {
    chave: 'disciplinas',
    titulo: 'Disciplinas',
    compartilhado: true,
    novo: {
      rotulo: 'Nova disciplina',
      valores: { sigla: '', nome: '', tipoAmbiente: 'sala' },
    },
    placeholder: 'Buscar por sigla, nome ou ambiente',
    colunas: [
      { key: 'sigla', label: 'Sigla', sortable: true },
      { key: 'nome', label: 'Nome', sortable: true },
      { key: 'tipoAmbiente', label: 'Tipo de ambiente', sortable: true },
      { key: 'atribuicoes', label: 'Atribuições no período', sortable: true },
    ],
    busca: ['sigla', 'nome', 'tipoAmbiente'],
    rotulo: (d) => `${d.sigla} (${d.nome})`,
    formulario: [
      {
        campo: 'sigla',
        rotulo: 'Sigla',
        tipo: 'texto',
        tamanho: 20,
        ajuda: 'Em branco num cadastro novo: gerada pelas iniciais do nome.',
      },
      { campo: 'nome', rotulo: 'Nome', tipo: 'texto', tamanho: 150 },
      {
        campo: 'tipoAmbiente',
        rotulo: 'Tipo de ambiente exigido',
        tipo: 'texto',
        tamanho: 40,
        ajuda: 'Deve coincidir com o tipo das salas (ex.: sala, laboratorio de informatica).',
      },
    ],
    avisoExclusao: 'Só é possível excluir disciplina que não está em nenhuma atribuição.',
  },
  {
    chave: 'atribuicoes',
    titulo: 'Atribuições (oferta)',
    placeholder: 'Buscar por turma, disciplina ou professor',
    colunas: [
      { key: 'turma', label: 'Turma', sortable: true },
      { key: 'disciplina', label: 'Disciplina', sortable: true },
      { key: 'professoresDetalhe', label: 'Professores' },
      { key: 'aulasSemanais', label: 'Aulas', sortable: true },
      { key: 'tamanhoBloco', label: 'Bloco', sortable: true },
      { key: 'grupoParalelo', label: 'Grupo paralelo', formatter: (v) => v ?? '' },
    ],
    busca: [
      'turma',
      'disciplina',
      'disciplinaNome',
      (a) => a.professoresDetalhe.map((p) => `${p.nome} ${p.siape ?? ''}`).join(' '),
    ],
    rotulo: (a) => `${a.turma} · ${a.disciplina}`,
    formulario: [
      { campo: 'professores', rotulo: 'Professores', tipo: 'multiselect' },
      { campo: 'aulasSemanais', rotulo: 'Aulas semanais', tipo: 'numero', min: 1, max: 40 },
      {
        campo: 'tamanhoBloco',
        rotulo: 'Tamanho do bloco (aulas geminadas)',
        tipo: 'numero',
        min: 1,
        max: 6,
      },
      {
        campo: 'grupoParalelo',
        rotulo: 'Grupo paralelo',
        tipo: 'texto',
        tamanho: 40,
        ajuda: 'Atribuições da mesma turma com o mesmo grupo podem ocorrer no mesmo horário.',
      },
    ],
    avisoExclusao: 'Atribuições com aulas na grade não podem ser excluídas.',
  },
  {
    chave: 'salas',
    titulo: 'Salas',
    compartilhado: true,
    novo: {
      rotulo: 'Nova sala',
      valores: { nome: '', tipo: 'sala', capacidade: 40, ativa: true },
    },
    placeholder: 'Buscar por nome ou tipo',
    colunas: [
      { key: 'nome', label: 'Nome', sortable: true },
      { key: 'tipo', label: 'Tipo', sortable: true },
      { key: 'capacidade', label: 'Capacidade', sortable: true },
      { key: 'ativa', label: 'Situação' },
    ],
    busca: ['nome', 'tipo'],
    rotulo: (s) => `sala ${s.nome}`,
    formulario: [
      {
        campo: 'nome',
        rotulo: 'Nome',
        tipo: 'texto',
        tamanho: 60,
        ajuda: 'Chave usada na importação de planilhas.',
      },
      {
        campo: 'tipo',
        rotulo: 'Tipo',
        tipo: 'texto',
        tamanho: 40,
        ajuda: 'Deve coincidir com o tipo de ambiente das disciplinas.',
      },
      { campo: 'capacidade', rotulo: 'Capacidade', tipo: 'numero', min: 1, max: 1000 },
      {
        campo: 'ativa',
        rotulo: 'Ativa',
        tipo: 'checkbox',
        ajuda: 'Salas inativas ficam fora das próximas gerações de grade.',
      },
    ],
    avisoExclusao: 'Salas usadas em alguma grade não podem ser excluídas; marque-as como inativas.',
  },
]
