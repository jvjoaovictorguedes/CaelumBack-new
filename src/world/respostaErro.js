// O handler global do legado responde 500 para qualquer exceção. Este domínio
// devolve só erros de validação esperados; falhas internas seguem para ele.
module.exports = function respostaErro(erro, _req, res, next) {
  if ([400, 404].includes(erro.statusCode)) return res.status(erro.statusCode).json({ message: erro.message });
  next(erro);
};
