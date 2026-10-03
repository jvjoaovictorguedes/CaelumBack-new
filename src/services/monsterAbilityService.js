// IA de Combate PvE & Habilidades de Monstros V1 (§4.2/§4.3/§10.1/§11.3)
// — CRUD/runtime loader de MonsterAbility. Mesmo padrão de
// adminAdventureService.sincronizarStatusEffectsMonstro: PUT substitui a
// lista inteira (natural key = id_power, já que o unique do banco é
// (id_monstro,id_power)), nunca POST/PATCH/DELETE por linha — adapta ao
// padrão real já usado por loot/status-effects (§11.2 "não duplicar
// rotas/padrões").
const { sequelize } = require("../config/database");
const AdventureMonster = require("../models/AdventureMonster");
const MonsterAbility = require("../models/MonsterAbility");
const MonsterAbilityCondition = require("../models/MonsterAbilityCondition");
const Power = require("../models/Power");
const { registrarAcao } = require("./adminAuditService");
const { garantirPowerUsavelPorMonstro } = require("./powerUsageScopeGuard");
const { carregarPowerComEfeitos, classificarPower } = require("./powerCapabilityService");
const {
  targetPolicyValida,
  TARGET_POLICIES,
  conditionKeyValida,
  configValidoParaCondicao,
  CONDITION_KEYS_VALIDAS,
} = require("../config/monsterAbilityConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function validarCondicoes(condicoes) {
  for (const condicao of condicoes ?? []) {
    if (!conditionKeyValida(condicao.condition_key)) {
      throw erro(`condition_key inválida: "${condicao.condition_key}". Válidas: ${CONDITION_KEYS_VALIDAS.join(", ")}.`);
    }
    if (!configValidoParaCondicao(condicao.condition_key, condicao.config ?? {})) {
      throw erro(`config inválido pra condition_key "${condicao.condition_key}" — campos fora do schema conhecido.`);
    }
  }
}

function validarAbility(linha) {
  if (!linha.id_power) throw erro("id_power é obrigatório em toda habilidade.");
  if (linha.target_policy && !targetPolicyValida(linha.target_policy)) {
    throw erro(`target_policy inválida: "${linha.target_policy}". Válidas: ${TARGET_POLICIES.join(", ")}.`);
  }
  if (linha.peso_uso != null && (!Number.isInteger(linha.peso_uso) || linha.peso_uso <= 0)) {
    throw erro("peso_uso precisa ser um inteiro maior que zero.");
  }
  validarCondicoes(linha.conditions);
}

// GET — inclui Power+condições e as capabilities já classificadas
// (§10.1 "Preview das capabilities"), pra Admin nunca precisar resolver
// isso no frontend.
async function listarAbilitiesDoMonstro(idMonstro) {
  const linhas = await MonsterAbility.findAll({
    where: { id_monstro: idMonstro },
    include: [{ model: MonsterAbilityCondition, as: "condicoes" }],
    order: [["ordem_admin", "ASC"], ["id", "ASC"]],
  });

  const resultado = [];
  for (const linha of linhas) {
    const power = await carregarPowerComEfeitos(linha.id_power);
    resultado.push({
      ...linha.toJSON(),
      power: power ? { id: power.id, nome: power.nome, tipo_poder: power.tipo_poder } : null,
      capabilities: power ? Array.from(classificarPower(power)) : [],
    });
  }
  return resultado;
}

async function sincronizarAbilitiesMonstro(idMonstro, payload, { idAdmin, req }) {
  if (!Array.isArray(payload)) throw erro("abilities precisa ser uma lista.");

  const idsPower = payload.map((l) => l.id_power);
  if (new Set(idsPower).size !== idsPower.length) {
    throw erro("Não pode haver duas habilidades com a mesma Power pro mesmo monstro.");
  }
  for (const linha of payload) validarAbility(linha);

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.findByPk(idMonstro, { transaction, lock: transaction.LOCK.UPDATE });
    if (!monstro) throw erro("Monstro não encontrado.", 404);

    // §4.1 — toda Power do payload precisa ser usage_scope MONSTER/BOTH
    // ANTES de abrir qualquer escrita (tudo-ou-nada: um id_power inválido
    // não pode criar metade da lista).
    for (const linha of payload) {
      const power = await Power.findByPk(linha.id_power, { transaction });
      garantirPowerUsavelPorMonstro(power);
    }

    const linhasAtuais = await MonsterAbility.findAll({
      where: { id_monstro: idMonstro },
      include: [{ model: MonsterAbilityCondition, as: "condicoes" }],
      transaction,
    });
    const antes = linhasAtuais.map((l) => l.toJSON());
    const porPower = new Map(linhasAtuais.map((l) => [l.id_power, l]));

    const idsPowerMantidos = new Set();
    for (const linha of payload) {
      const dados = {
        prioridade_base: linha.prioridade_base ?? 0,
        peso_uso: linha.peso_uso ?? 1,
        cooldown_override: linha.cooldown_override ?? null,
        custo_mana_override: linha.custo_mana_override ?? null,
        target_policy: linha.target_policy ?? "PLAYER",
        ativo: linha.ativo ?? true,
        ordem_admin: linha.ordem_admin ?? null,
      };

      let ability = porPower.get(linha.id_power);
      if (ability) {
        await ability.update(dados, { transaction });
      } else {
        ability = await MonsterAbility.create({ id_monstro: idMonstro, id_power: linha.id_power, ...dados }, { transaction });
      }

      // Condições: substitui a lista inteira desta ability (sem natural
      // key confiável entre múltiplas condições do mesmo
      // condition_key) — mais simples e correto que tentar casar por
      // índice, que quebraria silenciosamente numa reordenação do admin.
      await MonsterAbilityCondition.destroy({ where: { id_monster_ability: ability.id }, transaction });
      for (const condicao of linha.conditions ?? []) {
        await MonsterAbilityCondition.create(
          {
            id_monster_ability: ability.id,
            condition_key: condicao.condition_key,
            config: condicao.config ?? {},
            score_bonus: condicao.score_bonus ?? 0,
            required: condicao.required ?? false,
            ativo: condicao.ativo ?? true,
          },
          { transaction },
        );
      }

      idsPowerMantidos.add(linha.id_power);
    }

    const idsParaRemover = linhasAtuais.filter((l) => !idsPowerMantidos.has(l.id_power)).map((l) => l.id);
    if (idsParaRemover.length) {
      await MonsterAbility.destroy({ where: { id: idsParaRemover }, transaction });
    }

    const depois = await MonsterAbility.findAll({
      where: { id_monstro: idMonstro },
      include: [{ model: MonsterAbilityCondition, as: "condicoes" }],
      transaction,
      order: [["ordem_admin", "ASC"], ["id", "ASC"]],
    });
    await registrarAcao({
      idAdmin,
      acao: "sincronizar_monster_abilities",
      entidade: "MonsterAbility",
      idEntidade: idMonstro,
      dadosAntes: { id_monstro: idMonstro, abilities: antes },
      dadosDepois: { id_monstro: idMonstro, abilities: depois.map((l) => l.toJSON()) },
      req,
      transaction,
    });
    return depois;
  });
}

module.exports = {
  listarAbilitiesDoMonstro,
  sincronizarAbilitiesMonstro,
};
