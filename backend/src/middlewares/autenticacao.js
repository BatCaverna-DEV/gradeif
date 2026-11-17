import { ErroNaoAutenticado, ErroProibido } from '../erros.js'

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
