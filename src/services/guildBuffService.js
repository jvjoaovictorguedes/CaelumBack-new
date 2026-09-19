// Benefícios/Buffs da Guilda (spec "Aprimoramento do Sistema de
// Guildas" §18-§27/§53) — três árvores independentes (XP/GOLD/FORJA),
// nível 1-5, bônus TOTAL por nível (nunca cumulativo). Pertencem à
// GUILDA, nunca copiados pro Character (§24): quem quiser saber o bônus
// ativo de um personagem tem que perguntar aqui, sempre no momento do
// cálculo, nunca guardar um valor "congelado".
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");
const GuildBuff = require("../models/GuildBuff");
const GuildLog = require("../models/GuildLog");
const GuildTreasuryTransaction = require("../models/GuildTreasuryTransaction");
const { BUFF_TIPOS, BUFF_NIVEIS, NIVEL_MAXIMO_BUFF, membroEmCarencia } = require("../config/guildConfig");
const { emitParaGuild } = require("../socket/guildSocket");

function erroGuilda(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function obterNiveisAtuais(idGuild, transaction) {
  const linhas = await GuildBuff.findAll({ where: { id_guild: idGuild }, transaction });
  const niveis = { XP: 0, GOLD: 0, FORJA: 0 };
  for (const linha of linhas) niveis[linha.tipo] = linha.nivel;
  return niveis;
}

// §25/§48 — mesma regra fixa do Boss nesta versão: só o líder compra,
// mesmo que a permissão comprar_beneficios exista pro futuro.
async function comprarNivel(idGuild, idPersonagem, tipo, transaction) {
  if (!BUFF_TIPOS.includes(tipo)) throw erroGuilda("Tipo de benefício inválido.", 400);

  const guild = await Guild.findByPk(idGuild, { transaction, lock: transaction.LOCK.UPDATE });
  if (!guild) throw erroGuilda("Guilda não encontrada.", 404);
  if (guild.id_lider !== Number(idPersonagem)) {
    throw erroGuilda("Só o líder da guilda pode comprar benefícios.", 403);
  }

  let buff = await GuildBuff.findOne({ where: { id_guild: idGuild, tipo }, transaction, lock: transaction.LOCK.UPDATE });
  const nivelAtual = buff?.nivel ?? 0;
  const proximoNivel = nivelAtual + 1;
  if (proximoNivel > NIVEL_MAXIMO_BUFF) {
    throw erroGuilda(`Benefício de ${tipo} já está no nível máximo.`, 400);
  }

  const config = BUFF_NIVEIS[tipo][proximoNivel];
  if (guild.nivel < config.nivelGuildaMinimo) {
    throw erroGuilda(`Requer Guilda Nível ${config.nivelGuildaMinimo}.`, 400);
  }
  if (guild.tesouro < config.custo) {
    throw erroGuilda("O Tesouro não tem saldo suficiente para esse benefício.", 400);
  }

  guild.tesouro -= config.custo;
  await guild.save({ transaction });

  await GuildTreasuryTransaction.create(
    {
      id_guild: idGuild,
      tipo: "Gasto",
      id_personagem: idPersonagem,
      valor: config.custo,
      saldo_resultante: guild.tesouro,
      motivo: `Benefício ${tipo} nível ${proximoNivel}`,
    },
    { transaction },
  );

  if (buff) {
    buff.nivel = proximoNivel;
    await buff.save({ transaction });
  } else {
    buff = await GuildBuff.create({ id_guild: idGuild, tipo, nivel: proximoNivel }, { transaction });
  }

  await GuildLog.create(
    {
      id_guild: idGuild,
      tipo: "buff_comprado",
      id_personagem_responsavel: idPersonagem,
      detalhes: `${tipo} nível ${proximoNivel} (${config.custo} de ouro do Tesouro).`,
    },
    { transaction },
  );

  emitParaGuild(idGuild, "guild:buff:update", { tipo, nivel: proximoNivel });
  emitParaGuild(idGuild, "guild:treasury:update", { tesouro: guild.tesouro });

  return { tipo, nivel: proximoNivel, tesouro: guild.tesouro };
}

async function listarBeneficios(idGuild, transaction) {
  const guild = await Guild.findByPk(idGuild, { attributes: ["id", "nivel", "tesouro"], transaction });
  const niveis = await obterNiveisAtuais(idGuild, transaction);
  return BUFF_TIPOS.map((tipo) => {
    const nivelAtual = niveis[tipo];
    const proximoNivel = nivelAtual + 1;
    const configAtual = nivelAtual > 0 ? BUFF_NIVEIS[tipo][nivelAtual] : null;
    const configProxima = proximoNivel <= NIVEL_MAXIMO_BUFF ? BUFF_NIVEIS[tipo][proximoNivel] : null;
    return {
      tipo,
      nivel_atual: nivelAtual,
      bonus_atual: configAtual,
      proximo_nivel: configProxima ? { nivel: proximoNivel, ...configProxima } : null,
      guild_nivel_atual: guild?.nivel ?? 1,
      tesouro_atual: guild?.tesouro ?? 0,
    };
  });
}

// §19/§20/§26/§27 — bônus ATIVO pro personagem agora, considerando a
// mesma carência de 24h aplicada aos benefícios econômicos. Retorna 0
// em tudo se o personagem não está em guilda, está em carência, ou a
// guilda nunca comprou aquele buff.
async function bonusesAtivosPara(idPersonagem, transaction) {
  const membro = await GuildMember.findOne({ where: { id_personagem: idPersonagem }, transaction });
  if (!membro || membroEmCarencia(membro)) {
    return { xpPercentual: 0, goldPercentual: 0, forjaPontosPercentuais: 0 };
  }
  const niveis = await obterNiveisAtuais(membro.id_guild, transaction);
  return {
    xpPercentual: niveis.XP > 0 ? BUFF_NIVEIS.XP[niveis.XP].bonusPercentual : 0,
    goldPercentual: niveis.GOLD > 0 ? BUFF_NIVEIS.GOLD[niveis.GOLD].bonusPercentual : 0,
    forjaPontosPercentuais: niveis.FORJA > 0 ? BUFF_NIVEIS.FORJA[niveis.FORJA].bonusPontosPercentuais : 0,
  };
}

module.exports = { obterNiveisAtuais, comprarNivel, listarBeneficios, bonusesAtivosPara };
