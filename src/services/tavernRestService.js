// Sistema de Taverna §4 — Descanso: serviço instantâneo pago em Gold que
// restaura Vida/Mana pros máximos efetivos. Reaproveita as MESMAS
// funções de vida/mana máxima e bônus de atributo que o resto do jogo
// usa (combatFormulas/equipmentBonusService/regenService) — nunca uma
// segunda fórmula de "vida máxima da Taverna".
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Class = require("../models/Class");
const { vidaMaximaDe, manaMaximaDe, comMultiplicadoresDeClasse } = require("./combatFormulas");
const { buscarBonusDeAtributos, personagemComBonus } = require("./equipmentBonusService");
const { sincronizarRegeneracaoDeVidaEMana } = require("./regenService");
const gameSettingCache = require("./gameSettingCache");
const { GAME_SETTINGS_DEFAULT } = require("../config/tavernConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// §4.2 — bloqueio de descanso durante atividade de combate. encontro_pve
// é a MESMA coluna compartilhada por Aventura e Expedição (ver
// combatController.js/expeditionService.js) — nunca uma segunda fonte
// de verdade pra "personagem em combate". PvP ao vivo/Party/Guild Boss
// vivem em sessão de Socket em memória, fora do alcance de uma
// query simples nesta tabela; a Taverna é uma página separada da UI de
// combate, então essas atividades não são checadas aqui nesta fase.
function atividadeBloqueante(character) {
  if (character.encontro_pve) {
    return "Você está em combate. Termine o encontro antes de descansar na Taverna.";
  }
  return null;
}

async function personagemEfetivoDe(character) {
  const bonus_atributos = await buscarBonusDeAtributos(character.id);
  return comMultiplicadoresDeClasse(
    personagemComBonus(character.toJSON(), bonus_atributos),
    character.Class,
  );
}

function calcularCusto(character, personagemEfetivo) {
  const vidaMaxima = vidaMaximaDe(personagemEfetivo);
  const manaMaxima = manaMaximaDe(personagemEfetivo);
  const missingHp = vidaMaxima > 0 ? Math.max(0, 1 - character.vida_atual / vidaMaxima) : 0;
  const missingMp = manaMaxima > 0 ? Math.max(0, 1 - character.mana_atual / manaMaxima) : 0;

  if (missingHp === 0 && missingMp === 0) {
    return { custo: 0, vidaMaxima, manaMaxima, missingHp, missingMp, necessidade: 0 };
  }

  const necessidade = Math.min(1, Math.max(0, (missingHp + missingMp) / 2));
  const baseGold = gameSettingCache.obter("tavern.rest.base_gold", GAME_SETTINGS_DEFAULT["tavern.rest.base_gold"]);
  const levelFactor = gameSettingCache.obter("tavern.rest.level_factor", GAME_SETTINGS_DEFAULT["tavern.rest.level_factor"]);
  const missingResourceFactor = gameSettingCache.obter(
    "tavern.rest.missing_resource_factor",
    GAME_SETTINGS_DEFAULT["tavern.rest.missing_resource_factor"],
  );
  const minimumGold = gameSettingCache.obter("tavern.rest.minimum_gold", GAME_SETTINGS_DEFAULT["tavern.rest.minimum_gold"]);

  const custoBruto = Math.round(baseGold + (character.nivel || 1) * levelFactor + necessidade * missingResourceFactor);
  const custo = Math.max(minimumGold, custoBruto);

  return { custo, vidaMaxima, manaMaxima, missingHp, missingMp, necessidade };
}

// GET /api/tavern/rest/preview — só leitura, nenhum efeito colateral.
async function previewDescanso(characterId) {
  const character = await Character.findByPk(characterId, { include: [Class] });
  if (!character) throw erro("Personagem não encontrado.", 404);

  const personagemEfetivo = await personagemEfetivoDe(character);
  // Sincroniza em memória só pra refletir a regeneração já ocorrida no
  // preview — não persiste (preview nunca tem efeito colateral).
  sincronizarRegeneracaoDeVidaEMana(character, personagemEfetivo);

  const bloqueio = atividadeBloqueante(character);
  const { custo, vidaMaxima, manaMaxima, missingHp, missingMp } = calcularCusto(character, personagemEfetivo);

  return {
    bloqueado: Boolean(bloqueio),
    motivoBloqueio: bloqueio,
    vida_atual: character.vida_atual,
    vida_maxima: vidaMaxima,
    mana_atual: character.mana_atual,
    mana_maxima: manaMaxima,
    percentual_vida_faltante: Math.round(missingHp * 100),
    percentual_mana_faltante: Math.round(missingMp * 100),
    custo,
    dinheiro_disponivel: character.dinheiro,
    saldo_suficiente: character.dinheiro >= custo,
  };
}

// POST /api/tavern/rest — transacional, revalida tudo no servidor
// (§4: "Confirmacao" — nunca confia em custo vindo do preview/cliente).
async function confirmarDescanso(characterId) {
  return sequelize.transaction(async (transaction) => {
    // Nunca dá pra travar FOR UPDATE numa query com LEFT JOIN pro lado
    // nullable (Postgres recusa: "FOR UPDATE cannot be applied to the
    // nullable side of an outer join") — trava o Character sozinho
    // primeiro, Class vem numa segunda leitura dentro da mesma
    // transaction.
    const character = await Character.findByPk(characterId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!character) throw erro("Personagem não encontrado.", 404);
    character.Class = character.id_classe ? await Class.findByPk(character.id_classe, { transaction }) : null;

    const bloqueio = atividadeBloqueante(character);
    if (bloqueio) throw erro(bloqueio, 409);

    const personagemEfetivo = await personagemEfetivoDe(character);
    sincronizarRegeneracaoDeVidaEMana(character, personagemEfetivo);

    const { custo, vidaMaxima, manaMaxima } = calcularCusto(character, personagemEfetivo);

    if (custo > 0) {
      if (character.dinheiro < custo) throw erro("Gold insuficiente para descansar.", 400);
      character.dinheiro -= custo;
    }

    const agora = new Date();
    character.vida_atual = vidaMaxima;
    character.mana_atual = manaMaxima;
    character.ultima_atualizacao_vida = agora;
    character.ultima_atualizacao_mana = agora;
    await character.save({ transaction });

    return {
      custo_pago: custo,
      vida_atual: character.vida_atual,
      vida_maxima: vidaMaxima,
      mana_atual: character.mana_atual,
      mana_maxima: manaMaxima,
      dinheiro: character.dinheiro,
    };
  });
}

module.exports = { previewDescanso, confirmarDescanso, atividadeBloqueante };
