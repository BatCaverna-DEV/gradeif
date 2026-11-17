// Erros de domínio com status HTTP. O tratamento central (middlewares/erros.js)
// converte qualquer erro em JSON { erro, detalhes? }.
export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem)
    this.status = status
    this.detalhes = detalhes
  }
}

export class ErroValidacao extends ErroHttp {
  constructor(detalhes, mensagem = 'Dados inválidos') {
    super(400, mensagem, detalhes)
  }
}

export class ErroNaoAutenticado extends ErroHttp {
  constructor(mensagem = 'Autenticação necessária') {
    super(401, mensagem)
  }
}

export class ErroProibido extends ErroHttp {
  constructor(mensagem = 'Sem permissão para esta ação', detalhes) {
    super(403, mensagem, detalhes)
  }
}

export class ErroNaoEncontrado extends ErroHttp {
  constructor(mensagem = 'Registro não encontrado') {
    super(404, mensagem)
  }
}

export class ErroConflito extends ErroHttp {
  constructor(mensagem = 'Conflito com registro existente', detalhes) {
    super(409, mensagem, detalhes)
  }
}
