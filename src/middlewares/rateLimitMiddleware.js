// Limitador simples em memória, por IP — sem dependência nova só pra
// isso. Sem nenhum limite, login/registro ficavam abertos pra força
// bruta de senha e spam de contas (nada os impedia de tentar milhares
// de vezes por segundo).
//
// ATENÇÃO — só funciona corretamente com UMA única instância do
// processo: o contador vive na memória deste processo Node, então com
// múltiplas instâncias atrás de um load balancer (escala horizontal)
// cada instância tem sua própria contagem e o limite de fato vira
// (maxTentativas × número de instâncias). Se o backend passar a rodar
// em mais de uma instância, troque isto por um limitador com storage
// compartilhado (ex.: Redis — `rate-limit-redis` + `express-rate-limit`,
// ou equivalente) pra a contagem valer pra todas as instâncias juntas.
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
