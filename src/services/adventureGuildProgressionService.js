// Progressão de Rank da Guilda dos Aventureiros (§25-§30 da spec) —
// única responsabilidade: contar contratos concluídos no rank atual,
// marcar quando o personagem fica apto e promover ao concluir a
// Provação. Chamado a partir de UM lugar só (registrarConclusaoDeContrato),
// sempre no exato momento em que um contrato passa a Concluido — nunca
// no resgate da recompensa (§53: resgatar não pode duplicar o contador).
const CharacterAdventureGuildProgress = require("../models/CharacterAdventureGuildProgress");
const { REQUISITOS_PROMOCAO, proximoRankAventureiro } = require("../config/adventureGuildConfig");

// Garante que o personagem tem uma linha de progresso (cria com Rank F
// na primeira vez que ele interage com a Guilda) — nunca trava a linha
// sozinho; quem precisar de lock deve dar reload({ lock }) depois.
async function obterOuCriarProgresso(idPersonagem, transaction) {
  const [progresso] = await CharacterAdventureGuildProgress.findOrCreate({
    where: { id_personagem: idPersonagem },
    defaults: { rank: "F" },
    transaction,
  });
  return progresso;
}

// Chamado exatamente uma vez por contrato, no momento em que ele
// transiciona de Ativo pra Concluido (evento real ou entrega de
// itens) — nunca no resgate. Provação promove; contrato normal soma 1
// e, se atingir o requisito do rank atual, marca apto_para_promocao.
async function registrarConclusaoDeContrato(idPersonagem, contrato, transaction) {
  const progresso = await CharacterAdventureGuildProgress.findOne({
    where: { id_personagem: idPersonagem },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!progresso) return;

  if (contrato.eh_provacao) {
    const proximo = proximoRankAventureiro(progresso.rank);
    if (proximo) {
      progresso.rank = proximo;
      progresso.missoes_concluidas_no_rank = 0;
      progresso.apto_para_promocao = false;
    }
    await progresso.save({ transaction });
    return;
  }

  progresso.missoes_concluidas_no_rank += 1;
  const requisito = REQUISITOS_PROMOCAO[progresso.rank];
  if (requisito != null && progresso.missoes_concluidas_no_rank >= requisito) {
    progresso.apto_para_promocao = true;
  }
  await progresso.save({ transaction });
}

module.exports = { obterOuCriarProgresso, registrarConclusaoDeContrato };
