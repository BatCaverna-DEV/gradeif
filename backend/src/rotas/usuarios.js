// F5-08 — Contas de acesso (gestor).
//   GET  /api/usuarios
//   POST /api/usuarios       { nome, email, perfil, professorId?, senha }
//   PUT  /api/usuarios/:id   { nome?, email?, perfil?, professorId?, ativo?, senha? }
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import * as servico from '../servicos/usuarios.js'

const rotas = Router()
rotas.use(exigirPerfil(PERFIS.GESTOR))

export const Senha = z.string().min(8, 'A senha precisa de ao menos 8 caracteres').max(100)
const Base = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(120),
  perfil: z.enum(['gestor', 'professor']),
  professorId: z.number().int().positive().nullable().default(null),
})

rotas.get('/', async (_req, res) => {
  res.json(await servico.listarUsuarios())
})

rotas.post('/', validar({ body: Base.extend({ senha: Senha }) }), async (req, res) => {
  res.status(201).json(await servico.criarUsuario(req.body))
})

rotas.put(
  '/:id',
  validar({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: Base.partial().extend({
      professorId: z.number().int().positive().nullable().optional(),
      ativo: z.boolean().optional(),
      senha: Senha.optional(),
    }),
  }),
  async (req, res) => {
    res.json(await servico.atualizarUsuario(req.params.id, req.body, req.session.usuario))
  }
)

export default rotas
