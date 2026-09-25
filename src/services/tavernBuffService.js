// Sistema de Taverna §5/§6/§8.1/§13 — Cardápio (Refeições/Bebidas) e
// leitura dos buffs temporários ativos. buff_key é sempre uma chave da
// whitelist (tavernConfig.TAVERN_BUFF_KEYS); cada domínio consulta só a
// chave que entende (ver bonusesAtivosPara), nenhum controller central
// conhece a fórmula de cada bônus.
const { Op, QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterTavernBuff = require("../models/CharacterTavernBuff");
const TavernMenuItem = require("../models/TavernMenuItem");
const { CATEGORIAS_CARDAPIO } = require("../config/tavernConfig");
const { vidaMaximaDe, manaMaximaDe } = require("./combatFormulas");

// §6.1 — competitivo bloqueado: Ranqueada/Torneio (PvP ou Pesca) NUNCA
// aplicam buff de Taverna. PvP casual também fica desativado na V1.
const CONTEXTOS_BLOQUEADOS = new Set(["PvpCasual", "Ranqueada", "TorneioPvP", "TorneioPesca"]);

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// API interna consumida pelos domínios (Aventura/Expedição/Forja/
// Alquimia/Pesca) — §13: `async function bonusesAtivosPara(characterId,
// context, transaction?)`. Devolve só as chaves com buff ATIVO agora
// (nunca todas as 9 zeradas); quem chama lê a chave que interessa com
// fallback `?? 0`. Buffs expirados são ignorados aqui (nunca reativados
// só por o servidor não ter "limpado" a linha ainda).
async function bonusesAtivosPara(characterId, contexto = "Geral", transaction) {
  if (CONTEXTOS_BLOQUEADOS.has(contexto)) return {};

  const agora = new Date();
  const buffs = await CharacterTavernBuff.findAll({
    where: { id_personagem: characterId, expires_at: { [Op.gt]: agora } },
    transaction,
  });

  const bonuses = {};
  for (const buff of buffs) {
    bonuses[buff.buff_key] = buff.magnitude;
  }
  return bonuses;
}

// §13 — "Vida/Mana maximas: Adicionar MAX_HP_PCT / MAX_MANA_PCT na
// camada central que calcula maximos; evitar dupla aplicacao." Nunca
// muda vidaMaximaDe/manaMaximaDe em si (funções puras e síncronas
// usadas em pontos quentes do combate) — soma o percentual da Taverna
// POR CIMA do resultado delas, mesmo padrão já usado por GuildBuff/
// Buff Global em cima de xpGanho/dinheiroGanho.
async function vidaManaMaximaComTaverna(characterId, personagemEfetivo, transaction) {
  const vidaMaxima = vidaMaximaDe(personagemEfetivo);
  const manaMaxima = manaMaximaDe(personagemEfetivo);
  const bonus = await bonusesAtivosPara(characterId, "PVE", transaction);

  return {
    vidaMaxima: bonus.MAX_HP_PCT ? Math.round(vidaMaxima * (1 + bonus.MAX_HP_PCT / 100)) : vidaMaxima,
    manaMaxima: bonus.MAX_MANA_PCT ? Math.round(manaMaxima * (1 + bonus.MAX_MANA_PCT / 100)) : manaMaxima,
  };
}

// GET /api/tavern/buffs
async function buffsAtivosDoPersonagem(characterId) {
  const agora = new Date();
  const buffs = await CharacterTavernBuff.findAll({
    where: { id_personagem: characterId, expires_at: { [Op.gt]: agora } },
    order: [["categoria", "ASC"]],
  });
  return buffs;
}

// GET /api/tavern/menu
async function listarCardapioAtivo() {
  return TavernMenuItem.findAll({
    where: { ativo: true },
    order: [
      ["categoria", "ASC"],
      ["ordem", "ASC"],
    ],
  });
}

// POST /api/tavern/menu/:id/consume — §8.1: compra substitui IMEDIATAMENTE
// o buff atual da mesma categoria (Refeição substitui Refeição, Bebida
// substitui Bebida); nunca devolve Gold proporcional ao tempo restante
// do buff anterior, e categorias diferentes sempre coexistem.
async function consumirOferta(characterId, menuItemId) {
  if (!menuItemId) throw erro("menuItemId é obrigatório.");

  return sequelize.transaction(async (transaction) => {
    const character = await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!character) throw erro("Personagem não encontrado.", 404);

    const oferta = await TavernMenuItem.findByPk(menuItemId, { transaction });
    if (!oferta || !oferta.ativo) throw erro("Oferta indisponível.", 404);
    if (!CATEGORIAS_CARDAPIO.includes(oferta.categoria)) throw erro("Categoria de oferta inválida.", 400);

    if (character.dinheiro < oferta.preco_gold) throw erro("Gold insuficiente para essa oferta.", 400);
    character.dinheiro -= oferta.preco_gold;
    await character.save({ transaction });

    const agora = new Date();
    const expiresAt = new Date(agora.getTime() + oferta.duracao_segundos * 1000);

    const [buff] = await sequelize.query(
      `INSERT INTO character_tavern_buffs
         (id_personagem, categoria, buff_key, magnitude, source_menu_item_id, activated_at, expires_at, "createdAt", "updatedAt")
       VALUES (:idPersonagem, :categoria, :buffKey, :magnitude, :sourceMenuItemId, :activatedAt, :expiresAt, now(), now())
       ON CONFLICT (id_personagem, categoria)
       DO UPDATE SET
         buff_key = EXCLUDED.buff_key,
         magnitude = EXCLUDED.magnitude,
         source_menu_item_id = EXCLUDED.source_menu_item_id,
         activated_at = EXCLUDED.activated_at,
         expires_at = EXCLUDED.expires_at,
         "updatedAt" = now()
       RETURNING *;`,
      {
        replacements: {
          idPersonagem: characterId,
          categoria: oferta.categoria,
          buffKey: oferta.buff_key,
          magnitude: oferta.magnitude,
          sourceMenuItemId: oferta.id,
          activatedAt: agora,
          expiresAt,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    );

    return { buff, oferta, dinheiro: character.dinheiro };
  });
}

module.exports = {
  bonusesAtivosPara,
  vidaManaMaximaComTaverna,
  buffsAtivosDoPersonagem,
  listarCardapioAtivo,
  consumirOferta,
  CONTEXTOS_BLOQUEADOS,
};
