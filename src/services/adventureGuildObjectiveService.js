// Progresso EVENT-DRIVEN dos contratos de Rank (§37/§38/§45 da spec) —
// chamado pelos MESMOS pontos de evento real que já alimentam
// missionService.registrarProgresso (combate PvE, PvP, Expedição,
// Forja), sempre dentro da mesma transaction da ação real. Nunca
// aceita "concluí a missão" do cliente — só reage a eventos que o
// próprio servidor já validou.
const CharacterAdventureGuildContract = require("../models/CharacterAdventureGuildContract");
const AdventureGuildMission = require("../models/AdventureGuildMission");
const { registrarConclusaoDeContrato } = require("./adventureGuildProgressionService");

// §23 — objetivo específico por ID, nunca por nome/texto.
function coincideObjetivo(missao, tipo, contexto) {
  if (missao.tipo_objetivo === "MatarMonstroEspecifico") {
    return tipo === "MatarInimigos" && contexto.id_monstro != null && contexto.id_monstro === missao.id_monstro_alvo;
  }
  if (missao.tipo_objetivo === "MatarNaRegiao") {
    return tipo === "MatarInimigos" && contexto.id_area != null && contexto.id_area === missao.id_area_alvo;
  }
  // Entregar nunca chega aqui — é uma ação atômica própria (ver
  // adventureGuildContractService.entregarItens), não um tipo de
  // evento que algum call site emite.
  return missao.tipo_objetivo === tipo;
}

async function registrarProgressoContrato(character, tipo, quantidade, contexto = {}, transaction) {
  // Nunca combina `lock` com `include` que gere LEFT OUTER JOIN
  // (Postgres recusa FOR UPDATE do lado nullable do join) — trava só os
  // contratos, busca as missões correspondentes numa consulta separada
  // sem lock.
  const contratosAtivos = await CharacterAdventureGuildContract.findAll({
    where: { id_personagem: character.id, status: "Ativo" },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (contratosAtivos.length === 0) return;

  const missoes = await AdventureGuildMission.findAll({
    where: { id: contratosAtivos.map((c) => c.id_mission) },
    transaction,
  });
  const missaoPorId = new Map(missoes.map((m) => [m.id, m]));

  for (const contrato of contratosAtivos) {
    const missao = missaoPorId.get(contrato.id_mission);
    if (!missao || !coincideObjetivo(missao, tipo, contexto)) continue;

    // §18 — contrato expirado nunca conta progresso, mesmo que ainda
    // não tenha sido varrido/marcado Expirado por uma leitura anterior.
    if (contrato.expira_em && contrato.expira_em.getTime() <= Date.now()) continue;

    contrato.progresso_atual = Math.min(missao.quantidade_objetivo, contrato.progresso_atual + quantidade);
    if (contrato.progresso_atual >= missao.quantidade_objetivo) {
      contrato.status = "Concluido";
      contrato.concluido_em = new Date();
      await contrato.save({ transaction });
      await registrarConclusaoDeContrato(character.id, contrato, transaction);
    } else {
      await contrato.save({ transaction });
    }
  }
}

module.exports = { registrarProgressoContrato };
