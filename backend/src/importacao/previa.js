// F1-17 — Prévia de um envio (um ou mais arquivos), sem gravar nada.
// Os arquivos podem vir em qualquer ordem: são processados na ordem de dependência
// e cada um enxerga os registros válidos dos anteriores.
import { lerArquivo } from './leitor.js'
import {
  ORDEM,
  PLANILHAS,
  detectarTipo,
  extrairLinhas,
  mapearColunas,
  validarLinha,
} from './planilhas.js'
import { carregarContexto } from './contexto.js'
import { SITUACAO, classificarLinha, incorporar } from './classificacao.js'
import { calcularImpacto } from './impacto.js'
import { classificarOferta, compararComHorario, impactoDaOferta } from './oferta.js'
import { chave } from './texto.js'
import { ErroHttp } from '../erros.js'

// Lê os arquivos enviados (buffer + nome). Erros de leitura ficam no próprio arquivo.
export async function lerArquivos(arquivos) {
  return Promise.all(
    arquivos.map(async ({ nome, buffer }) => {
      try {
        const leitura = await lerArquivo(buffer, nome)
        return { arquivo: nome, leitura }
      } catch (erro) {
        if (!(erro instanceof ErroHttp)) throw erro
        return { arquivo: nome, erro: erro.message }
      }
    })
  )
}

function resumir(linhas) {
  const resumo = { total: linhas.length, criar: 0, atualizar: 0, inalterada: 0, rejeitar: 0 }
  for (const l of linhas) resumo[l.situacao]++
  return resumo
}

function prepararArquivo(lido) {
  const base = { arquivo: lido.arquivo, tipo: null, linhas: [], resumo: resumir([]) }
  if (lido.erro) return { ...base, erro: lido.erro }

  const { leitura } = lido
  const info = {
    formato: leitura.formato,
    codificacao: leitura.codificacao,
    separador: leitura.separador,
  }
  const tipo = detectarTipo(leitura.cabecalhos, lido.arquivo)
  if (!tipo) {
    return {
      ...base,
      ...info,
      erro:
        'Não foi possível identificar a planilha pelos cabeçalhos. Use um dos modelos ' +
        `(cabeçalhos encontrados: ${leitura.cabecalhos.filter(Boolean).join(', ') || 'nenhum'})`,
    }
  }

  const mapa = mapearColunas(tipo, leitura.cabecalhos)
  if (mapa.repetidas.length) {
    return { ...base, ...info, tipo, erro: `Colunas repetidas: ${mapa.repetidas.join(', ')}` }
  }
  return {
    ...base,
    ...info,
    tipo,
    colunasIgnoradas: mapa.ignoradas,
    brutas: extrairLinhas(leitura, mapa.indices),
  }
}

function classificarArquivo(arquivo, ctx) {
  const vistas = new Map() // chave -> número da linha, para repetições no mesmo arquivo
  const linhas = []

  for (const { numero, bruto } of arquivo.brutas) {
    const { dados, erros } = validarLinha(arquivo.tipo, bruto)
    if (erros.length) {
      linhas.push({
        linha: numero,
        situacao: SITUACAO.REJEITAR,
        chave: chaveBruta(arquivo.tipo, bruto),
        erros,
        avisos: [],
        mudancas: [],
      })
      continue
    }

    const r = classificarLinha(arquivo.tipo, dados, ctx)
    const repetida = vistas.get(chave(r.chave))
    if (repetida) {
      linhas.push({
        ...r,
        linha: numero,
        situacao: SITUACAO.REJEITAR,
        erros: [{ coluna: null, mensagem: `Chave repetida: já aparece na linha ${repetida}` }],
      })
      continue
    }
    vistas.set(chave(r.chave), numero)
    linhas.push({ linha: numero, ...r })
  }

  // Só depois do arquivo inteiro, para que uma linha não enxergue a seguinte.
  for (const l of linhas) {
    if (l.situacao !== SITUACAO.REJEITAR) incorporar(arquivo.tipo, ctx, l.registro)
  }
  return linhas
}

function chaveBruta(tipo, bruto) {
  if (tipo === 'atribuicoes') return `${bruto.turma ?? ''} · ${bruto.disciplina ?? ''}`
  const campo = { salas: 'nome', professores: 'siape', disciplinas: 'sigla', turmas: 'codigo' }[
    tipo
  ]
  return String(bruto[campo] ?? '')
}

// versao: horário de destino ({ id, nome }) ou null para só a oferta do período.
export async function gerarPrevia(trx, periodoId, lidos, { versao = null } = {}) {
  const arquivos = lidos.map(prepararArquivo)

  // Dois arquivos do mesmo tipo no mesmo envio tornam a ordem ambígua.
  const porTipo = new Map()
  for (const a of arquivos.filter((x) => x.tipo && !x.erro)) {
    if (porTipo.has(a.tipo)) {
      a.erro = `Já há um arquivo de ${PLANILHAS[a.tipo].titulo.toLowerCase()} neste envio (${porTipo.get(a.tipo)}); envie um de cada tipo`
    } else porTipo.set(a.tipo, a.arquivo)
  }

  // A oferta já traz professores, disciplinas, turmas e atribuições: misturar com
  // as planilhas separadas daria duas fontes para os mesmos dados.
  if (porTipo.has('oferta')) {
    for (const a of arquivos) {
      if (a.tipo && !a.erro && !['oferta', 'salas'].includes(a.tipo)) {
        a.erro =
          'Com a planilha de oferta, envie só ela (e, se quiser, a de salas). A de professores vai num envio à parte, depois da oferta'
      }
    }
  }

  arquivos.sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo))

  const ctx = await carregarContexto(trx, periodoId)
  for (const arquivo of arquivos) {
    if (arquivo.erro || !arquivo.brutas) continue
    if (arquivo.tipo === 'oferta') {
      const r = await classificarOferta(trx, periodoId, arquivo, ctx, validarLinha)
      arquivo.linhas = r.linhas
      arquivo.avisos = r.avisos
      arquivo.resumo = resumir(arquivo.linhas)
      delete arquivo.brutas
      continue
    }
    arquivo.linhas = classificarArquivo(arquivo, ctx)
    arquivo.resumo = resumir(arquivo.linhas)
    delete arquivo.brutas
  }
  for (const arquivo of arquivos) delete arquivo.brutas

  const impacto = await calcularImpacto(
    trx,
    periodoId,
    arquivos.filter((a) => !a.erro && a.tipo !== 'oferta')
  )
  for (const arquivo of arquivos.filter((a) => !a.erro && a.tipo === 'oferta')) {
    const aulas = await impactoDaOferta(trx, periodoId, arquivo)
    const ids = new Set([...impacto.aulas, ...aulas.map((a) => a.id)])
    impacto.aulas = [...ids]
    impacto.versoes = Math.max(impacto.versoes, new Set(aulas.map((a) => a.versao_id)).size)
  }

  const comErro = arquivos.some((a) => a.erro || a.resumo.rejeitar > 0)
  let alteracoes = arquivos.reduce((s, a) => s + a.resumo.criar + a.resumo.atualizar, 0)

  // Horário de destino: compara cada linha da oferta com as atribuições dele.
  let horario = null
  const aulasDoHorario = []
  const oferta = arquivos.find((a) => a.tipo === 'oferta' && !a.erro)
  if (versao && oferta) {
    const r = await compararComHorario(trx, versao, oferta)
    horario = r.resumo
    oferta.horario = r.resumo
    aulasDoHorario.push(...r.aulas)
    alteracoes += r.resumo.adicionar + r.resumo.atualizar
  }
  const aulasParaRevisar = [...new Set([...impacto.aulas, ...aulasDoHorario])]

  return {
    arquivos: arquivos.map((a) => ({ ...a, titulo: a.tipo ? PLANILHAS[a.tipo].titulo : null })),
    impacto: { aulas: impacto.aulas.length, versoes: impacto.versoes },
    horario,
    aulasParaRevisar,
    alteracoes,
    podeConfirmar: arquivos.length > 0 && !comErro && alteracoes > 0,
  }
}
