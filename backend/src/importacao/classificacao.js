// F1-17 — Classificação de cada linha válida: criar, atualizar, inalterada ou
// rejeitar, comparando com o contexto pela chave de identificação.
import { chave, tipoAmbiente } from './texto.js'
import { adicionarProfessor, chaveAtribuicao, chaveCurso } from './contexto.js'

export const SITUACAO = Object.freeze({
  CRIAR: 'criar',
  ATUALIZAR: 'atualizar',
  INALTERADA: 'inalterada',
  REJEITAR: 'rejeitar',
})

const NOMES_CAMPOS = {
  siape: 'SIAPE',
  nome: 'Nome',
  email: 'E-mail',
  cargaMaxima: 'Carga máxima',
  tipo: 'Tipo',
  capacidade: 'Capacidade',
  tipoAmbiente: 'Tipo de ambiente',
  curso: 'Curso',
  nivel: 'Nível',
  turnos: 'Turnos',
  numeroAlunos: 'Número de alunos',
  aulasSemanais: 'Aulas semanais',
  tamanhoBloco: 'Tamanho do bloco',
  grupoParalelo: 'Grupo paralelo',
  professores: 'Professores',
}

function igual(a, b) {
  if (Array.isArray(a) || Array.isArray(b))
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
  return (a ?? null) === (b ?? null)
}

// Lista o que muda em relação ao registro existente, com valores legíveis.
function compararCampos(existente, novo, campos, exibir = (_c, v) => v) {
  return campos
    .filter((campo) => !igual(existente[campo], novo[campo]))
    .map((campo) => ({
      campo: NOMES_CAMPOS[campo] ?? campo,
      chaveCampo: campo,
      de: exibir(campo, existente[campo]),
      para: exibir(campo, novo[campo]),
    }))
}

function resultado(existente, registro, campos, exibir) {
  if (!existente) return { situacao: SITUACAO.CRIAR, registro, mudancas: [] }
  const mudancas = compararCampos(existente, registro, campos, exibir)
  return {
    situacao: mudancas.length ? SITUACAO.ATUALIZAR : SITUACAO.INALTERADA,
    registro: { ...registro, id: existente.id },
    mudancas,
  }
}

// ---------- Por tipo ----------
// Cada função recebe os dados já validados pelo Zod e o contexto, e devolve
// { chave, situacao, registro, mudancas, erros, avisos }.

const classificadores = {
  salas(dados, ctx) {
    const k = chave(dados.nome)
    const existente = ctx.salas.get(k)
    const registro = {
      nome: dados.nome,
      tipo: tipoAmbiente(dados.tipo ?? existente?.tipo),
      capacidade: dados.capacidade,
    }
    return { chave: dados.nome, ...resultado(existente, registro, ['tipo', 'capacidade']) }
  },

  // Professor: pelo SIAPE ou pelo nome (que é único no cadastro; quem veio da planilha
  // de oferta não tem SIAPE). Assim a planilha completa ou corrige SIAPE, e-mail e carga.
  professores(dados, ctx) {
    const rotulo = dados.siape ? `${dados.nome} (${dados.siape})` : dados.nome
    const recusar = (coluna, mensagem) => ({
      chave: rotulo,
      situacao: SITUACAO.REJEITAR,
      erros: [{ coluna, mensagem }],
    })
    const porSiape = dados.siape ? ctx.professores.get(dados.siape) : undefined
    const refs = [...(ctx.professoresPorNome.get(chave(dados.nome)) ?? [])]
    if (refs.length > 1 && !porSiape) {
      return recusar(
        'Nome',
        `Há ${refs.length} professores chamados "${dados.nome}"; informe o SIAPE ou corrija o nome em Dados`
      )
    }
    const porNome = refs.length === 1 ? ctx.professores.get(refs[0]) : undefined
    if (porSiape && porNome && porSiape !== porNome) {
      return recusar(
        'SIAPE',
        `O SIAPE ${dados.siape} é de ${porSiape.nome}, mas o nome é de outro professor cadastrado; corrija a planilha ou o cadastro em Dados`
      )
    }
    const existente = porSiape ?? porNome
    const registro = {
      siape: dados.siape ?? existente?.siape ?? null,
      nome: dados.nome,
      email: dados.email ?? existente?.email ?? null,
      cargaMaxima: dados.cargaMaxima ?? existente?.cargaMaxima ?? 20,
    }
    const avisos =
      existente?.siape && registro.siape !== existente.siape
        ? [`SIAPE corrigido de ${existente.siape} para ${registro.siape}`]
        : []
    return {
      chave: rotulo,
      avisos,
      ...resultado(existente, registro, ['siape', 'nome', 'email', 'cargaMaxima']),
    }
  },

  disciplinas(dados, ctx) {
    const existente = ctx.disciplinas.get(chave(dados.sigla))
    const registro = {
      sigla: dados.sigla,
      nome: dados.nome,
      tipoAmbiente: tipoAmbiente(dados.tipoAmbiente ?? existente?.tipoAmbiente),
    }
    return { chave: dados.sigla, ...resultado(existente, registro, ['nome', 'tipoAmbiente']) }
  },

  turmas(dados, ctx) {
    const erros = []
    const avisos = []

    if (!ctx.turnos.length) {
      erros.push({
        coluna: 'Turnos',
        mensagem:
          'O período não tem turnos; configure os turnos e tempos de aula antes de importar turmas',
      })
    }

    const turnos = new Set()
    for (const nome of ctx.turnos.length ? dados.turnos : []) {
      const k = chave(nome)
      const exatos = ctx.turnos.filter((t) => t.chave === k)
      const achados = exatos.length ? exatos : ctx.turnos.filter((t) => t.chave.startsWith(k))
      if (achados.length === 1) turnos.add(achados[0].id)
      else {
        const opcoes = ctx.turnos.map((t) => t.nome).join(', ')
        erros.push({
          coluna: 'Turnos',
          mensagem: achados.length
            ? `Turno "${nome}" é ambíguo; use o nome completo (${opcoes})`
            : `Turno "${nome}" não existe no período (${opcoes})`,
        })
      }
    }

    // Avisa só na primeira turma do curso novo, não em todas.
    const kCurso = chaveCurso(dados.curso, dados.nivel)
    ctx.cursosAnunciados ??= new Set()
    if (!ctx.cursos.has(kCurso) && !ctx.cursosAnunciados.has(kCurso)) {
      ctx.cursosAnunciados.add(kCurso)
      avisos.push(`Curso "${dados.curso}" (${dados.nivel}) será criado`)
    }

    if (erros.length) return { chave: dados.codigo, situacao: SITUACAO.REJEITAR, erros, avisos }

    const nomesTurnos = (ids) =>
      (ids ?? []).map((id) => ctx.turnos.find((t) => t.id === id)?.nome ?? `#${id}`).join(', ')

    const existente = ctx.turmas.get(chave(dados.codigo))
    const registro = {
      codigo: dados.codigo,
      curso: dados.curso,
      nivel: dados.nivel,
      turnos: [...turnos].sort((a, b) => a - b),
      numeroAlunos: dados.numeroAlunos,
    }
    // Compara o curso sem diferenciar acento e maiúscula, como o banco.
    const base = existente && {
      ...existente,
      curso: chave(existente.curso) === chave(registro.curso) ? registro.curso : existente.curso,
    }
    return {
      chave: dados.codigo,
      ...resultado(base, registro, ['curso', 'nivel', 'turnos', 'numeroAlunos'], (campo, v) =>
        campo === 'turnos' ? nomesTurnos(v) : v
      ),
      avisos,
    }
  },

  atribuicoes(dados, ctx) {
    const erros = []
    const turma = ctx.turmas.get(chave(dados.turma))
    const disciplina = ctx.disciplinas.get(chave(dados.disciplina))
    if (!turma)
      erros.push({ coluna: 'Turma', mensagem: `Turma "${dados.turma}" não existe no período` })
    if (!disciplina) {
      erros.push({ coluna: 'Disciplina', mensagem: `Disciplina "${dados.disciplina}" não existe` })
    }

    const siapes = new Set()
    for (const ref of dados.professores) {
      if (/^\d+$/.test(ref)) {
        if (ctx.professores.has(ref)) siapes.add(ref)
        else
          erros.push({ coluna: 'Professores', mensagem: `Professor com SIAPE ${ref} não existe` })
        continue
      }
      const porNome = [...(ctx.professoresPorNome.get(chave(ref)) ?? [])]
      if (porNome.length === 1) siapes.add(porNome[0])
      else {
        erros.push({
          coluna: 'Professores',
          mensagem: porNome.length
            ? `Há mais de um professor chamado "${ref}"; use o SIAPE`
            : `Professor "${ref}" não encontrado; use o SIAPE`,
        })
      }
    }

    const chaveLinha = `${dados.turma} · ${dados.disciplina}`
    if (erros.length) return { chave: chaveLinha, situacao: SITUACAO.REJEITAR, erros }

    const existente = ctx.atribuicoes.get(chaveAtribuicao(dados.turma, dados.disciplina))
    const registro = {
      turma: turma.codigo,
      disciplina: disciplina.sigla,
      turmaId: turma.id,
      disciplinaId: disciplina.id,
      aulasSemanais: dados.aulasSemanais,
      tamanhoBloco: dados.tamanhoBloco ?? 1,
      grupoParalelo: dados.grupoParalelo ?? null,
      professores: [...siapes].sort(),
    }

    const avisos = []
    if (registro.aulasSemanais % registro.tamanhoBloco !== 0) {
      avisos.push(
        `${registro.aulasSemanais} aulas em blocos de ${registro.tamanhoBloco}: um encontro terá bloco menor`
      )
    }

    const nomeProfessor = (siape) => ctx.professores.get(siape)?.nome ?? siape
    return {
      chave: chaveLinha,
      ...resultado(
        existente,
        registro,
        ['aulasSemanais', 'tamanhoBloco', 'grupoParalelo', 'professores'],
        (campo, v) => (campo === 'professores' ? (v ?? []).map(nomeProfessor).join(', ') : v)
      ),
      avisos,
    }
  },
}

// Depois de classificar um arquivo, as linhas válidas entram no contexto.
const incorporadores = {
  salas(ctx, r) {
    ctx.salas.set(chave(r.nome), { id: r.id ?? null, ...r })
  },
  professores(ctx, r) {
    adicionarProfessor(ctx, { id: r.id ?? null, ...r })
  },
  disciplinas(ctx, r) {
    ctx.disciplinas.set(chave(r.sigla), { id: r.id ?? null, ...r })
  },
  turmas(ctx, r) {
    ctx.turmas.set(chave(r.codigo), { id: r.id ?? null, ...r })
    const kc = chaveCurso(r.curso, r.nivel)
    if (!ctx.cursos.has(kc)) ctx.cursos.set(kc, { id: null, nome: r.curso, nivel: r.nivel })
  },
  atribuicoes(ctx, r) {
    ctx.atribuicoes.set(chaveAtribuicao(r.turma, r.disciplina), { id: r.id ?? null, ...r })
  },
}

export function classificarLinha(tipo, dados, ctx) {
  const r = classificadores[tipo](dados, ctx)
  return { erros: [], avisos: [], mudancas: [], ...r }
}

export function incorporar(tipo, ctx, registro) {
  incorporadores[tipo](ctx, registro)
}
