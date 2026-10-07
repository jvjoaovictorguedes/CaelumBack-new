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
// obterChave: de onde tirar a identidade pra contar tentativas — por
// padrão o IP (rotas públicas, sem usuário autenticado ainda), mas rotas
// já autenticadas podem passar `(req) => req.user.id` pra limitar por
// CONTA em vez de por IP (evita que trocar de rede/proxy resete o
// contador, e evita que várias contas atrás do mesmo IP/NAT dividam o
// mesmo limite de propósito).
const { MemoryRateLimitStore } = require("../antiAutomation/rateLimitStore/memoryRateLimitStore");
function criarLimitador({ janelaMs, maxTentativas, obterChave = (req) => req.ip, store = new MemoryRateLimitStore() }) {
  return (req, res, next) => {
    const result = store.consume(obterChave(req), { now: Date.now(), windowMs: janelaMs, limit: maxTentativas });
    const respond = result => {
    if (result.allowed) return next();
    res.set?.("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
    return res.status(429).json({ message: `Muitas tentativas. Tente novamente em ${Math.ceil(result.retryAfterMs / 1000)} segundos.`, code: "ACTION_RATE_LIMITED", retryAfterMs: result.retryAfterMs });
    };
    return result && typeof result.then === "function" ? result.then(respond).catch(next) : respond(result);
  };
}
module.exports = { criarLimitador };
