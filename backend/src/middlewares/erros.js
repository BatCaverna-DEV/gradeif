import { ZodError } from 'zod'
import { ErroHttp, ErroNaoEncontrado } from '../erros.js'
import { logger } from '../config/logger.js'
import { ErroProblema } from '../core/instancia.js'

export function rotaNaoEncontrada(req, _res, next) {
  next(new ErroNaoEncontrado(`Rota ${req.method} ${req.originalUrl} não existe`))
}

export function tratarErros(erro, req, res, _next) {
  if (erro instanceof ZodError) {
    return res.status(400).json({
      erro: 'Dados inválidos',
      detalhes: erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    })
  }

  if (erro instanceof ErroHttp) {
    return res.status(erro.status).json({ erro: erro.message, detalhes: erro.detalhes })
  }

  // Dados do período que o núcleo não consegue montar (referência inexistente etc.)
  if (erro instanceof ErroProblema) {
    return res.status(422).json({ erro: erro.message, detalhes: erro.detalhes })
  }

  // Violação de índice único do MariaDB (ex.: duas aulas na mesma sala e horário)
  if (erro?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ erro: 'Registro duplicado', detalhes: erro.sqlMessage })
  }

  if (erro?.code === 'ER_ROW_IS_REFERENCED_2' || erro?.code === 'ER_NO_REFERENCED_ROW_2') {
    return res
      .status(409)
      .json({ erro: 'Registro referenciado por outros dados', detalhes: erro.sqlMessage })
  }

  // Erros de upload do multer (tamanho, quantidade, campo inesperado)
  if (erro?.name === 'MulterError') {
    const mensagens = {
      LIMIT_FILE_SIZE: 'Arquivo grande demais; o limite é 5 MB',
      LIMIT_FILE_COUNT: 'Envie no máximo 5 arquivos por vez',
      LIMIT_UNEXPECTED_FILE: 'Envie os arquivos no campo "arquivos" (no máximo 5)',
    }
    return res.status(400).json({ erro: mensagens[erro.code] ?? `Falha no envio: ${erro.message}` })
  }

  if (erro?.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON malformado' })
  }

  logger.error({ err: erro, url: req.originalUrl }, 'Erro não tratado')
  res.status(500).json({ erro: 'Erro interno do servidor' })
}
