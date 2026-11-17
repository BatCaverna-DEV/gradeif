// Planilhas CSV de exemplo usadas pelos testes de integração.
import { lerArquivos } from '../../src/importacao/previa.js'
import { confirmarImportacao } from '../../src/importacao/gravacao.js'

export const CSV = {
  'salas.csv':
    'Nome;Tipo;Capacidade\nSala 1;sala;40\nLab. Informática;Laboratório de Informática;20\n',
  'professores.csv':
    'nome,siape,e-mail,carga máxima semanal\nAna Souza,1111111,ana@ifma.edu.br,20\nBruno Lima,2222222,,16\n',
  'disciplinas.csv':
    'Sigla;Nome;Tipo de ambiente\nMAT1;Matemática I;\nPROG1;Programação I;laboratorio de informatica\n',
  'turmas.csv':
    'Código;Curso;Nível;Turnos;Número de alunos\n' +
    'INF1M;Técnico em Informática;Integrado;M;35\n' +
    'INF1V;Técnico em Informática;integrado;Vespertino;30\n',
  'atribuicoes.csv':
    'Turma;Disciplina;Professores;Aulas semanais;Tamanho do bloco\n' +
    'INF1M;MAT1;1111111;4;2\n' +
    'INF1M;PROG1;"2222222, Ana Souza";4;2\n' +
    'INF1V;MAT1;Ana Souza;4;\n',
}

// Importa as cinco planilhas no período e devolve o resultado da gravação.
export async function importarTudo(periodoId) {
  const lista = Object.entries(CSV).map(([nome, texto]) => ({
    nome,
    buffer: Buffer.from(texto, 'utf8'),
  }))
  return confirmarImportacao({ periodoId, lidos: await lerArquivos(lista), usuarioId: null })
}
