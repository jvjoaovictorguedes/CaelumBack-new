// Limitador simples em memória, por IP — sem dependência nova só pra
// isso. Sem nenhum limite, login/registro ficavam abertos pra força
// bruta de senha e spam de contas (nada os impedia de tentar milhares
// de vezes por segundo).
function criarLimitador({ janelaMs, maxTentativas }) {
  const tentativasPorChave = new Map();

  return (req, res, next) => {
    const chave = req.ip;
    const agora = Date.now();
    const registro = tentativasPorChave.get(chave);

    if (!registro || agora > registro.resetAt) {
      tentativasPorChave.set(chave, { contagem: 1, resetAt: agora + janelaMs });
      return next();
    }

    if (registro.contagem >= maxTentativas) {
      const segundosRestantes = Math.ceil((registro.resetAt - agora) / 1000);
      return res.status(429).json({
        message: `Muitas tentativas. Tente novamente em ${segundosRestantes} segundos.`,
      });
    }

    registro.contagem += 1;
    next();
  };
}

module.exports = { criarLimitador };
