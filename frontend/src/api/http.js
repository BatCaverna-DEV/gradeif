// Cliente HTTP mínimo sobre fetch. Envia o cookie de sessão e converte
// respostas de erro da API ({ erro, detalhes }) em ErroApi.

export class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem)
    this.status = status
    this.detalhes = detalhes
  }
}

// Chamado em qualquer 401, para a store de autenticação limpar o usuário.
let aoNaoAutenticado = null
export function definirAoNaoAutenticado(fn) {
  aoNaoAutenticado = fn
}

async function requisitar(metodo, url, corpo) {
  const opcoes = {
    method: metodo,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }
  if (corpo instanceof FormData) {
    // O navegador define o Content-Type multipart com o boundary.
    opcoes.body = corpo
  } else if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json'
    opcoes.body = JSON.stringify(corpo)
  }

  let resposta
  try {
    resposta = await fetch(`/api${url}`, opcoes)
  } catch {
    throw new ErroApi(0, 'Não foi possível contatar o servidor')
  }

  if (resposta.status === 204) return null

  const dados = await resposta.json().catch(() => null)

  if (!resposta.ok) {
    if (resposta.status === 401 && aoNaoAutenticado) aoNaoAutenticado()
    throw new ErroApi(resposta.status, dados?.erro ?? `Erro ${resposta.status}`, dados?.detalhes)
  }
  return dados
}

export const http = {
  get: (url) => requisitar('GET', url),
  post: (url, corpo) => requisitar('POST', url, corpo ?? {}),
  put: (url, corpo) => requisitar('PUT', url, corpo ?? {}),
  delete: (url) => requisitar('DELETE', url),
  // Envia arquivos em multipart/form-data, todos no mesmo campo.
  enviar: (url, campo, arquivos) => {
    const dados = new FormData()
    for (const arquivo of arquivos) dados.append(campo, arquivo, arquivo.name)
    return requisitar('POST', url, dados)
  },
}

// Formata detalhes de validação ([{ campo, mensagem }]) para exibição.
export function mensagemDeErro(erro) {
  if (Array.isArray(erro?.detalhes) && erro.detalhes.length) {
    return erro.detalhes.map((d) => (d.campo ? `${d.campo}: ${d.mensagem}` : d.mensagem)).join('; ')
  }
  return erro?.message ?? 'Erro inesperado'
}
