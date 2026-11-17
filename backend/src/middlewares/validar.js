// Valida req.body / req.params / req.query com um esquema Zod e substitui pelo
// valor já convertido. Erros caem no tratamento central como ZodError.
export function validar(esquemas) {
  return (req, _res, next) => {
    try {
      if (esquemas.body) req.body = esquemas.body.parse(req.body ?? {})
      if (esquemas.params) req.params = esquemas.params.parse(req.params)
      if (esquemas.query) req.validatedQuery = esquemas.query.parse(req.query)
      next()
    } catch (erro) {
      next(erro)
    }
  }
}
