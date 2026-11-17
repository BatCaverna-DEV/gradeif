// F1-12 — Login, logout e sessão por cookie HTTP-only.
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirLogin } from '../middlewares/autenticacao.js'
import { alterarSenha, autenticar } from '../servicos/usuarios.js'
import { ErroNaoAutenticado } from '../erros.js'

const rotas = Router()

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  senha: z.string().min(1, 'Informe a senha'),
})

rotas.post('/login', validar({ body: LoginSchema }), async (req, res, next) => {
  const usuario = await autenticar(req.body.email, req.body.senha)
  if (!usuario) return next(new ErroNaoAutenticado('E-mail ou senha incorretos'))

  // Regenera a sessão para evitar fixação de sessão.
  req.session.regenerate((erro) => {
    if (erro) return next(erro)
    req.session.usuario = usuario
    res.json({ usuario })
  })
})

rotas.post('/logout', (req, res, next) => {
  req.session.destroy((erro) => {
    if (erro) return next(erro)
    res.clearCookie('horarios.sid')
    res.status(204).end()
  })
})

rotas.get('/eu', exigirLogin, (req, res) => {
  res.json({ usuario: req.session.usuario })
})

// F5-08 — Cada usuário troca a própria senha.
rotas.put(
  '/senha',
  exigirLogin,
  validar({
    body: z.object({
      senhaAtual: z.string().min(1, 'Informe a senha atual'),
      novaSenha: z.string().min(8, 'A nova senha precisa de ao menos 8 caracteres').max(100),
    }),
  }),
  async (req, res) => {
    await alterarSenha(
      req.session.usuario.id,
      req.body.senhaAtual,
      req.body.novaSenha,
      req.sessionID
    )
    res.status(204).end()
  }
)

export default rotas
