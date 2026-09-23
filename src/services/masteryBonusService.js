// Bônus regional de Maestria (§14/§15/§16/§17 da spec) — só some na
// recompensa de vitória DENTRO da região que já atingiu aquele nível,
// nunca em outra (§15), nunca na chance de encontro do raro (§17, que
// continua 100% do adventureRollService), e nunca aumentando
// diretamente a chance de item raro/equipamento/Mítico (§16) — só a
// quantidade de um espólio comum que JÁ caiu naquela vitória.
const crypto = require("crypto");
const { calcularMaestriaDaRegiao } = require("./masteryService");
const { BONUS_POR_NIVEL } = require("../config/bestiaryConfig");

async function bonusAtivoNaRegiao(idPersonagem, idArea, transaction) {
  const { nivel } = await calcularMaestriaDaRegiao(idPersonagem, idArea, transaction);
  return BONUS_POR_NIVEL[nivel] ?? BONUS_POR_NIVEL[0];
}

// Aplica o bônus regional em cima de uma recompensa de zona já
// calculada (xpGanho/dinheiroGanho/espolios de
// adventureRewardService.concederRecompensaDeZona). Nunca CRIA um
// espólio do nada — só rola uma chance (igual ao percentual de bônus),
// INDEPENDENTE por espólio já caído, de aumentar em +1 a quantidade
// dele (§16 da spec original; Expansão Aventura Beta §21: agora pode
// haver mais de um espólio na mesma vitória, cada um rola seu próprio
// bônus separadamente — nunca um bônus só pro primeiro da lista).
async function aplicarBonusDeMaestria(idPersonagem, idArea, recompensa, transaction) {
  const bonus = await bonusAtivoNaRegiao(idPersonagem, idArea, transaction);

  const xpGanho = Math.round(recompensa.xpGanho * (1 + bonus.xp));
  const dinheiroGanho = Math.round(recompensa.dinheiroGanho * (1 + bonus.ouro));

  const ESCALA = 10000;
  const espolios = recompensa.espolios.map((espolio) => {
    if (bonus.espolio <= 0) return espolio;
    const rolagem = crypto.randomInt(0, ESCALA);
    if (rolagem < bonus.espolio * ESCALA) {
      return { ...espolio, quantidade: espolio.quantidade + 1 };
    }
    return espolio;
  });

  return { xpGanho, dinheiroGanho, espolios };
}

module.exports = { bonusAtivoNaRegiao, aplicarBonusDeMaestria };
