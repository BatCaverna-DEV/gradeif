import { ErroNaoAutenticado, ErroProibido } from '../erros.js'
import { exigirEditor } from '../servicos/editorDoHorario.js'

export const PERFIS = Object.freeze({ GESTOR: 'gestor', PROFESSOR: 'professor' })

export function exigirLogin(req, _res, next) {
  if (!req.session?.usuario) return next(new ErroNaoAutenticado())
  next()
}

// exigirPerfil('gestor') ou exigirPerfil('gestor', 'professor')
export function exigirPerfil(...perfis) {
  return (req, _res, next) => {
    if (!req.session?.usuario) return next(new ErroNaoAutenticado())
    if (!perfis.includes(req.session.usuario.perfil)) return next(new ErroProibido())
    next()
  }
}

// Só o editor do horário passa (servicos/editorDoHorario.js). versaoDe(req) diz
// qual horário a requisição altera; null quando ela não altera um horário.
// Use depois do validar(), que já converteu os parâmetros.
export function exigirEditorDoHorario(versaoDe = (req) => req.params.versaoId) {
  return async (req, _res, next) => {
    try {
      const versaoId = versaoDe(req)
      if (versaoId != null) await exigirEditor(req.params.periodoId, versaoId, req.session.usuario)
      next()
    } catch (erro) {
      next(erro)
    }
  }
}
