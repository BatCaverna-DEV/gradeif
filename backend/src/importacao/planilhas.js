// F1-15/F1-16 — Definição das planilhas: colunas, sinônimos aceitos no cabeçalho,
// detecção do tipo e validação Zod por linha.
// A importação principal é a planilha de OFERTA (uma linha por disciplina de uma
// turma, com o professor), que cria professores, disciplinas, turmas e
// atribuições de uma vez (ver oferta.js). As cinco planilhas separadas da
// descrição continuam aceitas; a de salas é a única ainda necessária.
import { z } from 'zod'
import { normalizar, separarLista } from './texto.js'

// ---------- Tipos de campo ----------

const vazio = (v) => v === undefined || v === null || String(v).trim() === ''

const texto = (max) =>
  z.preprocess(
    (v) => (vazio(v) ? undefined : String(v).trim()),
    z.string({ error: 'Campo obrigatório' }).max(max, `Use no máximo ${max} caracteres`)
  )

const textoOpcional = (max) =>
  z.preprocess(
    (v) => (vazio(v) ? undefined : String(v).trim()),
    z.string().max(max, `Use no máximo ${max} caracteres`).optional()
  )

const inteiro = ({ min, mensagemMin, max }) => {
  let esquema = z
    .number({
      error: (iss) => (iss.input === undefined ? 'Campo obrigatório' : 'Informe um número inteiro'),
    })
    .int('Informe um número inteiro')
    .min(min, mensagemMin)
  if (max !== undefined) esquema = esquema.max(max, `O valor máximo é ${max}`)
  return z.preprocess(
    (v) => (vazio(v) ? undefined : Number(String(v).trim().replace(',', '.'))),
    esquema
  )
}

const inteiroOpcional = (opcoes) =>
  z.preprocess((v) => (vazio(v) ? undefined : v), inteiro(opcoes).optional())

const lista = (mensagem) =>
  z.preprocess((v) => (vazio(v) ? [] : separarLista(v)), z.array(z.string()).min(1, mensagem))

export function nivelDeEnsino(valor) {
  const n = normalizar(valor)
  if (n.startsWith('integ') || n.includes('medio')) return 'integrado'
  if (n.startsWith('subseq') || n.includes('subsequente')) return 'subsequente'
  if (/^(super|gradua|licenc|bachar|tecnolog)/.test(n)) return 'superior'
  return null
}

const nivel = z.preprocess(
  (v) => (vazio(v) ? undefined : (nivelDeEnsino(v) ?? `invalido:${v}`)),
  z.enum(['integrado', 'subsequente', 'superior'], {
    error: (iss) =>
      iss.input === undefined
        ? 'Campo obrigatório'
        : 'Nível inválido: use integrado, subsequente ou superior',
  })
)

// ---------- Planilhas ----------
// Cada coluna: campo interno, rótulo do modelo, sinônimos aceitos e se é obrigatória.
// O rótulo também é aceito como cabeçalho.

export const PLANILHAS = {
  salas: {
    titulo: 'Salas',
    chave: 'nome',
    colunas: [
      {
        campo: 'nome',
        rotulo: 'Nome',
        obrigatoria: true,
        sinonimos: ['sala', 'nome da sala'],
        exemplo: 'Lab. Informática 1',
        descricao: 'Nome único da sala ou laboratório',
      },
      {
        campo: 'tipo',
        rotulo: 'Tipo',
        sinonimos: ['tipo de sala', 'tipo de ambiente', 'ambiente'],
        exemplo: 'laboratorio de informatica',
        descricao: 'Tipo de ambiente; deve coincidir com o exigido pelas disciplinas. Vazio = sala',
      },
      {
        campo: 'capacidade',
        rotulo: 'Capacidade',
        obrigatoria: true,
        sinonimos: ['lugares', 'capacidade de alunos', 'vagas'],
        exemplo: 40,
        descricao: 'Número de lugares',
        validacao: { tipo: 'inteiro', min: 1 },
      },
    ],
    esquema: z.object({
      nome: texto(60),
      tipo: textoOpcional(40),
      capacidade: inteiro({ min: 1, mensagemMin: 'A capacidade deve ser maior que zero' }),
    }),
  },

  professores: {
    titulo: 'Professores',
    chave: 'siape ou nome',
    // Só "Nome" não basta para reconhecer a planilha.
    exigeUmaDe: ['siape', 'email', 'cargaMaxima'],
    colunas: [
      {
        campo: 'nome',
        rotulo: 'Nome',
        obrigatoria: true,
        sinonimos: ['professor', 'nome do professor', 'docente', 'servidor', 'nome completo'],
        exemplo: 'Maria da Silva',
        descricao: 'Nome completo do docente',
      },
      {
        campo: 'siape',
        rotulo: 'SIAPE',
        sinonimos: ['matricula siape', 'matricula'],
        exemplo: '1234567',
        descricao:
          'Matrícula SIAPE (só dígitos). Identifica o professor; sem ela, ou sem SIAPE cadastrado, o professor é reconhecido pelo nome',
      },
      {
        campo: 'email',
        rotulo: 'E-mail',
        sinonimos: ['email', 'e mail institucional', 'email institucional'],
        exemplo: 'maria.silva@ifma.edu.br',
        descricao: 'E-mail institucional (opcional)',
      },
      {
        campo: 'cargaMaxima',
        rotulo: 'Carga máxima semanal',
        sinonimos: [
          'carga maxima',
          'carga horaria',
          'carga horaria maxima',
          'ch maxima',
          'carga semanal',
          'aulas maximas',
        ],
        exemplo: 20,
        descricao: 'Máximo de aulas por semana. Vazio = 20 para novos professores',
        validacao: { tipo: 'inteiro', min: 1, max: 60 },
      },
    ],
    esquema: z.object({
      nome: texto(120),
      siape: z.preprocess(
        (v) => (vazio(v) ? undefined : String(v).trim()),
        z
          .string()
          .regex(/^\d{4,12}$/, 'O SIAPE deve conter só dígitos (4 a 12)')
          .optional()
      ),
      email: z.preprocess(
        (v) => (vazio(v) ? undefined : String(v).trim().toLowerCase()),
        z.email('E-mail inválido').max(120).optional()
      ),
      cargaMaxima: inteiroOpcional({
        min: 1,
        mensagemMin: 'A carga máxima não pode ser zero',
        max: 60,
      }),
    }),
  },

  disciplinas: {
    titulo: 'Disciplinas',
    chave: 'sigla',
    colunas: [
      {
        campo: 'sigla',
        rotulo: 'Sigla',
        obrigatoria: true,
        sinonimos: ['codigo', 'codigo da disciplina'],
        exemplo: 'MAT1',
        descricao: 'Sigla única; identifica a disciplina',
      },
      {
        campo: 'nome',
        rotulo: 'Nome',
        obrigatoria: true,
        sinonimos: ['disciplina', 'nome da disciplina', 'componente curricular', 'componente'],
        exemplo: 'Matemática I',
        descricao: 'Nome do componente curricular',
      },
      {
        campo: 'tipoAmbiente',
        rotulo: 'Tipo de ambiente',
        sinonimos: ['ambiente', 'tipo de sala', 'ambiente exigido', 'tipo'],
        exemplo: 'sala',
        descricao: 'Tipo de sala exigido; deve coincidir com o tipo das salas. Vazio = sala',
      },
    ],
    esquema: z.object({
      sigla: texto(20),
      nome: texto(150),
      tipoAmbiente: textoOpcional(40),
    }),
  },

  turmas: {
    titulo: 'Turmas',
    chave: 'codigo',
    colunas: [
      {
        campo: 'codigo',
        rotulo: 'Código',
        obrigatoria: true,
        sinonimos: ['codigo da turma', 'turma'],
        exemplo: 'INF1M',
        descricao: 'Código único da turma no período',
      },
      {
        campo: 'curso',
        rotulo: 'Curso',
        obrigatoria: true,
        sinonimos: ['nome do curso'],
        exemplo: 'Técnico em Informática',
        descricao: 'Nome do curso; é criado se ainda não existir',
      },
      {
        campo: 'nivel',
        rotulo: 'Nível',
        obrigatoria: true,
        sinonimos: ['nivel de ensino', 'modalidade'],
        exemplo: 'integrado',
        descricao: 'integrado, subsequente ou superior',
        validacao: { tipo: 'lista', valores: ['integrado', 'subsequente', 'superior'] },
      },
      {
        campo: 'turnos',
        rotulo: 'Turnos',
        obrigatoria: true,
        sinonimos: ['turno', 'turnos permitidos'],
        exemplo: 'Matutino, Vespertino',
        descricao:
          'Turnos em que a turma pode ter aula, separados por vírgula. Aceita a inicial (M, V, N)',
      },
      {
        campo: 'numeroAlunos',
        rotulo: 'Número de alunos',
        obrigatoria: true,
        sinonimos: [
          'n de alunos',
          'no de alunos',
          'numero alunos',
          'alunos',
          'quantidade de alunos',
          'qtd alunos',
          'qtd de alunos',
        ],
        exemplo: 35,
        descricao: 'Quantidade de alunos da turma',
        validacao: { tipo: 'inteiro', min: 0 },
      },
    ],
    esquema: z.object({
      codigo: texto(40),
      curso: texto(120),
      nivel,
      turnos: lista('Informe ao menos um turno'),
      numeroAlunos: inteiro({ min: 0, mensagemMin: 'O número de alunos não pode ser negativo' }),
    }),
  },

  atribuicoes: {
    titulo: 'Atribuições',
    chave: 'turma + disciplina',
    colunas: [
      {
        campo: 'turma',
        rotulo: 'Turma',
        obrigatoria: true,
        sinonimos: ['codigo da turma'],
        exemplo: 'INF1M',
        descricao: 'Código da turma (planilha de turmas)',
      },
      {
        campo: 'disciplina',
        rotulo: 'Disciplina',
        obrigatoria: true,
        sinonimos: ['sigla', 'sigla da disciplina'],
        exemplo: 'MAT1',
        descricao: 'Sigla da disciplina (planilha de disciplinas)',
      },
      {
        campo: 'professores',
        rotulo: 'Professores',
        obrigatoria: true,
        sinonimos: [
          'professor',
          'professores siape',
          'siape dos professores',
          'siape',
          'docentes',
          'docente',
        ],
        exemplo: '1234567',
        descricao: 'SIAPE dos professores, separados por vírgula. Aceita o nome se for único',
      },
      {
        campo: 'aulasSemanais',
        rotulo: 'Aulas semanais',
        obrigatoria: true,
        sinonimos: ['aulas', 'aulas por semana', 'ch semanal', 'carga semanal', 'aulas na semana'],
        exemplo: 4,
        descricao: 'Quantidade de aulas por semana',
        validacao: { tipo: 'inteiro', min: 1, max: 40 },
      },
      {
        campo: 'tamanhoBloco',
        rotulo: 'Tamanho do bloco',
        sinonimos: ['bloco', 'geminadas', 'aulas geminadas', 'tamanho bloco', 'bloco geminado'],
        exemplo: 2,
        descricao: 'Aulas seguidas por encontro (geminadas). Vazio = 1',
        validacao: { tipo: 'inteiro', min: 1, max: 6 },
      },
      {
        campo: 'grupoParalelo',
        rotulo: 'Grupo paralelo',
        sinonimos: ['paralela', 'grupo', 'divisao'],
        exemplo: '',
        descricao:
          'Opcional. Atribuições da mesma turma com o mesmo grupo podem ocorrer no mesmo horário (turma dividida)',
      },
    ],
    esquema: z
      .object({
        turma: texto(40),
        disciplina: texto(20),
        professores: lista('Informe ao menos um professor'),
        aulasSemanais: inteiro({
          min: 1,
          mensagemMin: 'Informe ao menos uma aula semanal',
          max: 40,
        }),
        tamanhoBloco: inteiroOpcional({
          min: 1,
          mensagemMin: 'O bloco tem ao menos uma aula',
          max: 6,
        }),
        grupoParalelo: textoOpcional(40),
      })
      .superRefine((d, ctx) => {
        if (d.tamanhoBloco && d.aulasSemanais && d.tamanhoBloco > d.aulasSemanais) {
          ctx.addIssue({
            code: 'custom',
            path: ['tamanhoBloco'],
            message: 'O bloco não pode ser maior que as aulas semanais',
          })
        }
      }),
  },
  oferta: {
    titulo: 'Oferta do semestre',
    chave: 'turma + curso + período, e disciplina',
    colunas: [
      {
        campo: 'semestre',
        rotulo: 'Semestre',
        sinonimos: ['periodo letivo', 'ano semestre', 'semestre letivo'],
        exemplo: '2027.1',
        descricao: 'Período letivo; se informado, precisa ser o período escolhido no sistema',
      },
      {
        campo: 'turma',
        rotulo: 'Turma',
        obrigatoria: true,
        sinonimos: ['codigo da turma', 'nome da turma'],
        exemplo: '1 TDS',
        descricao: 'Nome da turma, como aparece na grade',
      },
      {
        campo: 'curso',
        rotulo: 'Curso',
        obrigatoria: true,
        sinonimos: ['nome do curso'],
        exemplo: 'Téc. Desenv. Sistemas',
        descricao: 'Curso da turma; é criado se ainda não existir',
      },
      {
        campo: 'periodoCurso',
        rotulo: 'Período',
        sinonimos: ['serie', 'ano', 'modulo', 'periodo do curso', 'ano periodo'],
        exemplo: '1º ano',
        descricao:
          'Ano, período ou módulo do curso. "ano" indica integrado; "período", superior; "módulo", subsequente',
      },
      {
        campo: 'disciplina',
        rotulo: 'Disciplina',
        obrigatoria: true,
        sinonimos: ['nome da disciplina', 'componente curricular', 'componente'],
        exemplo: 'Fundamentos de Programação',
        descricao: 'Nome da disciplina; identifica a disciplina entre turmas e cursos',
      },
      {
        campo: 'aulasSemanais',
        rotulo: 'Aulas/semana',
        obrigatoria: true,
        sinonimos: [
          'aulas semana',
          'aulas por semana',
          'aulas semanais',
          'aulas',
          'ch semanal',
          'aulas na semana',
        ],
        exemplo: 4,
        descricao: 'Quantidade de aulas por semana',
        validacao: { tipo: 'inteiro', min: 1, max: 40 },
      },
      {
        campo: 'professores',
        rotulo: 'Professor',
        obrigatoria: true,
        sinonimos: ['professores', 'docente', 'docentes', 'nome do professor'],
        exemplo: 'Maria da Silva',
        descricao:
          'Nome completo do professor. Dois professores na mesma disciplina: separe com vírgula ou "/"',
      },
      {
        campo: 'turno',
        rotulo: 'Turno',
        sinonimos: ['turnos', 'turnos permitidos'],
        exemplo: 'Matutino',
        descricao:
          'Opcional. Turno(s) da turma; aceita a inicial (M, V, N). Sem ele, a turma nova recebe todos os turnos e o gestor define em Dados',
      },
      {
        campo: 'numeroAlunos',
        rotulo: 'Alunos',
        sinonimos: [
          'numero de alunos',
          'n de alunos',
          'no de alunos',
          'qtd alunos',
          'quantidade de alunos',
        ],
        exemplo: 35,
        descricao: 'Opcional. Número de alunos da turma (usado na capacidade das salas)',
        validacao: { tipo: 'inteiro', min: 0 },
      },
      {
        campo: 'tamanhoBloco',
        rotulo: 'Tamanho do bloco',
        sinonimos: ['bloco', 'geminadas', 'aulas geminadas', 'bloco geminado'],
        exemplo: 2,
        descricao:
          'Opcional. Aulas seguidas por encontro. Sem ele, disciplina nova com 2 ou mais aulas usa blocos de 2',
        validacao: { tipo: 'inteiro', min: 1, max: 6 },
      },
      {
        campo: 'sigla',
        rotulo: 'Sigla',
        sinonimos: ['sigla da disciplina', 'codigo da disciplina'],
        exemplo: 'FP',
        descricao: 'Opcional. Sem ela, a sigla é gerada pelas iniciais do nome da disciplina',
      },
    ],
    esquema: z
      .object({
        semestre: textoOpcional(20),
        turma: texto(40),
        curso: texto(120),
        periodoCurso: textoOpcional(40),
        disciplina: texto(150),
        aulasSemanais: inteiro({
          min: 1,
          mensagemMin: 'Informe ao menos uma aula semanal',
          max: 40,
        }),
        professores: lista('Informe o professor'),
        turno: z.preprocess((v) => (vazio(v) ? [] : separarLista(v)), z.array(z.string())),
        numeroAlunos: inteiroOpcional({
          min: 0,
          mensagemMin: 'O número de alunos não pode ser negativo',
        }),
        tamanhoBloco: inteiroOpcional({
          min: 1,
          mensagemMin: 'O bloco tem ao menos uma aula',
          max: 6,
        }),
        sigla: textoOpcional(20),
      })
      .superRefine((d, ctx) => {
        if (d.tamanhoBloco && d.aulasSemanais && d.tamanhoBloco > d.aulasSemanais) {
          ctx.addIssue({
            code: 'custom',
            path: ['tamanhoBloco'],
            message: 'O bloco não pode ser maior que as aulas semanais',
          })
        }
      }),
  },
}

export const TIPOS = Object.keys(PLANILHAS)

// Ordem de gravação: quem é referenciado vem antes de quem referencia.
export const ORDEM = ['salas', 'oferta', 'professores', 'disciplinas', 'turmas', 'atribuicoes']

function cabecalhosAceitos(coluna) {
  return new Set([coluna.campo, coluna.rotulo, ...coluna.sinonimos].map(normalizar))
}

function formasDoCabecalho(cabecalho) {
  // "Carga máxima semanal (aulas)" também é tentado como "Carga máxima semanal".
  return [normalizar(cabecalho), normalizar(String(cabecalho).replace(/\(.*?\)/g, ''))]
}

// Associa cada coluna da planilha a um campo do tipo informado.
export function mapearColunas(tipo, cabecalhos) {
  const def = PLANILHAS[tipo]
  const indices = {}
  const ignoradas = []
  const repetidas = []

  cabecalhos.forEach((cabecalho, indice) => {
    if (!cabecalho) return
    const formas = formasDoCabecalho(cabecalho)
    const coluna = def.colunas.find((c) => {
      const aceitos = cabecalhosAceitos(c)
      return formas.some((f) => aceitos.has(f))
    })
    if (!coluna) return ignoradas.push(cabecalho)
    if (coluna.campo in indices) return repetidas.push(cabecalho)
    indices[coluna.campo] = indice
  })

  const faltando = def.colunas
    .filter((c) => c.obrigatoria && !(c.campo in indices))
    .map((c) => c.rotulo)
  return { indices, ignoradas, repetidas, faltando }
}

const DICAS_DE_NOME = {
  salas: /sala/,
  professores: /profess|docente/,
  disciplinas: /disciplin/,
  turmas: /turma/,
  atribuicoes: /atribui/,
  oferta: /oferta/,
}

// Escolhe o tipo cujas colunas obrigatórias estão todas presentes. Em empate,
// usa o nome do arquivo como desempate.
export function detectarTipo(cabecalhos, nomeArquivo = '') {
  const candidatos = TIPOS.map((tipo) => {
    const mapa = mapearColunas(tipo, cabecalhos)
    // exigeUmaDe: além das obrigatórias, ao menos uma destas colunas (ex.: professores).
    const umaDe = PLANILHAS[tipo].exigeUmaDe
    const completos =
      mapa.faltando.length === 0 && (!umaDe || umaDe.some((campo) => campo in mapa.indices))
    return { tipo, completos, pontos: Object.keys(mapa.indices).length }
  })
    .filter((c) => c.completos)
    .sort((a, b) => b.pontos - a.pontos)

  if (!candidatos.length) return null
  const empatados = candidatos.filter((c) => c.pontos === candidatos[0].pontos)
  if (empatados.length === 1) return empatados[0].tipo

  const nome = normalizar(nomeArquivo)
  return empatados.find((c) => DICAS_DE_NOME[c.tipo].test(nome))?.tipo ?? empatados[0].tipo
}

// Valida uma linha. Devolve os dados convertidos ou os erros com o rótulo da coluna.
export function validarLinha(tipo, bruto) {
  const def = PLANILHAS[tipo]
  const resultado = def.esquema.safeParse(bruto)
  if (resultado.success) return { dados: resultado.data, erros: [] }

  const rotulo = (campo) => def.colunas.find((c) => c.campo === campo)?.rotulo ?? campo
  return {
    dados: null,
    erros: resultado.error.issues.map((i) => ({ coluna: rotulo(i.path[0]), mensagem: i.message })),
  }
}

// Converte as linhas lidas em objetos { campo: valor } conforme o mapeamento.
export function extrairLinhas(leitura, indices) {
  return leitura.linhas.map((linha) => {
    const bruto = {}
    for (const [campo, indice] of Object.entries(indices))
      bruto[campo] = linha.valores[indice] ?? ''
    return { numero: linha.numero, bruto }
  })
}
