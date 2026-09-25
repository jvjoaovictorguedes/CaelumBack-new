// Painel Administrativo Fases 5/6/7 — catálogo Power (não confundir com
// CharacterAbilities, que é estado do personagem), vínculos ClassAbilities/
// RaceAbilities (formas de aquisição existentes, nenhuma tabela nova),
// PowerStatusEffect/WeaponStatusEffect, e os dois previews server-side
// (evolução 1-10 via abilityLevelService, status via combatEffectResolver)
// — nunca reimplementados no frontend.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Power = require("../models/Power");
const ClassAbilities = require("../models/ClassAbilities");
const RaceAbilities = require("../models/RaceAbilities");
const PowerStatusEffect = require("../models/PowerStatusEffect");
const WeaponStatusEffect = require("../models/WeaponStatusEffect");
const CharacterAbilities = require("../models/CharacterAbilities");
const Class = require("../models/Class");
const Race = require("../models/Race");
const Item = require("../models/Item");
// Efeito colateral necessário: ClassAbilities/RaceAbilities só ganham a
// associação belongsTo(Power) quando characterController é carregado
// (mesmo padrão de test/helpers/db.js) — sem isso, include: [Power]
// falha com "not associated".
require("../controllers/characterController");
// ClassAbilities<->Class e RaceAbilities<->Race nunca foram associadas
// em lugar nenhum do projeto (só existem como comentário morto em
// classAbilitiesController.js/raceAbilitiesController.js) — registradas
// aqui seguindo o mesmo padrão inline de characterController.js, só
// pra esse admin poder mostrar o nome da classe/raça no vínculo.
ClassAbilities.belongsTo(Class, { foreignKey: "id_classe" });
RaceAbilities.belongsTo(Race, { foreignKey: "id_raca" });
const { CHAVES_VALIDAS, STATUS, STACKS_MAXIMOS } = require("../config/statusEffectConfig");
const { NIVEL_MAXIMO_HABILIDADE, multiplicadorEfeito, multiplicadorCustoMana, marcoDoNivel, custoParaEvoluir } = require("../services/abilityLevelService");
const { potenciaEsperada } = require("../services/combatEffectResolver");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function somenteCampos(objeto, campos) {
  const out = {};
  for (const campo of campos) {
    if (objeto?.[campo] !== undefined) out[campo] = objeto[campo];
  }
  return out;
}

const ATRIBUTOS_VALIDOS = ["Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"];
const TARGETS_VALIDOS = ["Self", "Enemy"];
const TRIGGERS_SUPORTADOS = ["BASIC_ATTACK_HIT"]; // único suportado pelo motor hoje (§15)

function validarStatusKey(chave) {
  if (!CHAVES_VALIDAS.includes(chave)) {
    throw erro(`status_key "${chave}" não existe no catálogo canônico. Válidos: ${CHAVES_VALIDAS.join(", ")}.`);
  }
}

// ------------------------------------------------------------- CATÁLOGO
const CAMPOS_POWER = ["nome", "descricao", "tipo_poder", "custo_mana", "dano_base", "cura_base", "cooldown", "escala_atributo", "valor_escala", "imagem_url"];

async function listAdminPowers({ nome, tipo_poder, escala_atributo } = {}) {
  const where = {};
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };
  if (tipo_poder) where.tipo_poder = tipo_poder;
  if (escala_atributo) where.escala_atributo = escala_atributo;

  return Power.findAll({
    where,
    include: [{ model: PowerStatusEffect, as: "efeitosDeStatus" }],
    order: [["nome", "ASC"]],
  });
}

async function createAdminPower(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_POWER);
  if (!dados.nome) throw erro("nome é obrigatório.");
  if (!dados.tipo_poder) throw erro("tipo_poder é obrigatório.");
  if (!dados.escala_atributo || !ATRIBUTOS_VALIDOS.includes(dados.escala_atributo)) {
    throw erro(`escala_atributo precisa ser um de: ${ATRIBUTOS_VALIDOS.join(", ")}.`);
  }
  if (!dados.descricao) throw erro("descricao é obrigatória.");

  return sequelize.transaction(async (transaction) => {
    const power = await Power.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "Power", idEntidade: power.id, dadosDepois: power.toJSON(), req, transaction });
    return power;
  });
}

async function updateAdminPower(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_POWER);
  if (dados.escala_atributo && !ATRIBUTOS_VALIDOS.includes(dados.escala_atributo)) {
    throw erro(`escala_atributo precisa ser um de: ${ATRIBUTOS_VALIDOS.join(", ")}.`);
  }

  return sequelize.transaction(async (transaction) => {
    const power = await Power.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!power) throw erro("Habilidade não encontrada.", 404);

    // Balanceamento de Power é GLOBAL (Especificação §41 "Ciclo de
    // Vida"): qualquer personagem que já tenha essa habilidade passa a
    // usar os novos números na hora — não é opt-in, não versiona.
    const antes = power.toJSON();
    await power.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "Power", idEntidade: power.id, dadosAntes: antes, dadosDepois: power.toJSON(), req, transaction });
    return power;
  });
}

// §41 — antes de confirmar uma edição de balanceamento, o painel pode
// mostrar quantos jogadores são afetados.
async function countPlayersAffectedByPower(id) {
  return CharacterAbilities.count({ where: { id_power: id } });
}

async function duplicateAdminPower(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await Power.findByPk(id, { transaction });
    if (!original) throw erro("Habilidade não encontrada.", 404);

    const dados = somenteCampos(original.toJSON(), CAMPOS_POWER);
    dados.nome = `${original.nome} (cópia)`;

    const copia = await Power.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "duplicar", entidade: "Power", idEntidade: copia.id, dadosAntes: { origemId: original.id }, dadosDepois: copia.toJSON(), req, transaction });
    return copia;
  });
}

// ----------------------------------------------------- VÍNCULOS DE CLASSE/RAÇA
async function listAdminClassAbilities(idPower) {
  return ClassAbilities.findAll({ where: { id_poder: idPower }, include: [{ model: Class, attributes: ["id", "nome"] }] });
}
async function listAdminRaceAbilities(idPower) {
  return RaceAbilities.findAll({ where: { id_power: idPower }, include: [{ model: Race, attributes: ["id", "nome_masculino", "nome_feminino"] }] });
}

async function upsertAdminClassAbility(idPower, { id_classe, nivel_aprendizagem, custo_ouro }, { idAdmin, req }) {
  if (!id_classe || !nivel_aprendizagem) throw erro("id_classe e nivel_aprendizagem são obrigatórios.");
  return sequelize.transaction(async (transaction) => {
    const [vinculo] = await ClassAbilities.upsert(
      { id_classe, id_poder: idPower, nivel_aprendizagem, custo_ouro: custo_ouro ?? null },
      { transaction, returning: true },
    );
    await registrarAcao({ idAdmin, acao: "vincular", entidade: "ClassAbilities", idEntidade: null, dadosDepois: vinculo.toJSON(), req, transaction });
    return vinculo;
  });
}
async function removeAdminClassAbility(idPower, idClasse, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const removido = await ClassAbilities.destroy({ where: { id_poder: idPower, id_classe: idClasse }, transaction });
    if (!removido) throw erro("Vínculo não encontrado.", 404);
    await registrarAcao({ idAdmin, acao: "desvincular", entidade: "ClassAbilities", idEntidade: null, dadosAntes: { id_poder: idPower, id_classe: idClasse }, req, transaction });
    return { removido: true };
  });
}

async function upsertAdminRaceAbility(idPower, { id_raca, nivel_aprendizado, custo_ouro }, { idAdmin, req }) {
  if (!id_raca || !nivel_aprendizado) throw erro("id_raca e nivel_aprendizado são obrigatórios.");
  return sequelize.transaction(async (transaction) => {
    const [vinculo] = await RaceAbilities.upsert(
      { id_raca, id_power: idPower, nivel_aprendizado, custo_ouro: custo_ouro ?? null },
      { transaction, returning: true },
    );
    await registrarAcao({ idAdmin, acao: "vincular", entidade: "RaceAbilities", idEntidade: null, dadosDepois: vinculo.toJSON(), req, transaction });
    return vinculo;
  });
}
async function removeAdminRaceAbility(idPower, idRaca, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const removido = await RaceAbilities.destroy({ where: { id_power: idPower, id_raca: idRaca }, transaction });
    if (!removido) throw erro("Vínculo não encontrado.", 404);
    await registrarAcao({ idAdmin, acao: "desvincular", entidade: "RaceAbilities", idEntidade: null, dadosAntes: { id_power: idPower, id_raca: idRaca }, req, transaction });
    return { removido: true };
  });
}

// ------------------------------------------------------ POWER STATUS EFFECT
function validarStatusEffectPayload(dados) {
  if (dados.status_key !== undefined) validarStatusKey(dados.status_key);
  if (dados.target !== undefined && !TARGETS_VALIDOS.includes(dados.target)) {
    throw erro(`target precisa ser um de: ${TARGETS_VALIDOS.join(", ")}.`);
  }
  if (dados.potency_scale_attribute != null && !ATRIBUTOS_VALIDOS.includes(dados.potency_scale_attribute)) {
    throw erro(`potency_scale_attribute precisa ser um de: ${ATRIBUTOS_VALIDOS.join(", ")} (ou null).`);
  }
  if (dados.chance_ppm !== undefined && (!Number.isInteger(dados.chance_ppm) || dados.chance_ppm <= 0 || dados.chance_ppm > 1_000_000)) {
    throw erro("chance_ppm precisa ser um inteiro entre 1 e 1.000.000 (100%).");
  }
  if (dados.duration_turns !== undefined && (!Number.isInteger(dados.duration_turns) || dados.duration_turns < 1)) {
    throw erro("duration_turns precisa ser um inteiro >= 1.");
  }
}

async function addAdminPowerStatusEffect(idPower, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["status_key", "chance_ppm", "duration_turns", "potency_base", "potency_scale_attribute", "potency_scale_value", "target", "ativo"]);
  if (!dados.status_key || dados.duration_turns == null) throw erro("status_key e duration_turns são obrigatórios.");
  validarStatusEffectPayload(dados);

  return sequelize.transaction(async (transaction) => {
    const power = await Power.findByPk(idPower, { transaction });
    if (!power) throw erro("Habilidade não encontrada.", 404);
    const efeito = await PowerStatusEffect.create({ id_power: idPower, target: "Enemy", chance_ppm: 1_000_000, potency_base: 0, potency_scale_value: 0, ...dados }, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "PowerStatusEffect", idEntidade: efeito.id, dadosDepois: efeito.toJSON(), req, transaction });
    return efeito;
  });
}

async function updateAdminPowerStatusEffect(idEfeito, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["status_key", "chance_ppm", "duration_turns", "potency_base", "potency_scale_attribute", "potency_scale_value", "target", "ativo"]);
  validarStatusEffectPayload(dados);

  return sequelize.transaction(async (transaction) => {
    const efeito = await PowerStatusEffect.findByPk(idEfeito, { transaction, lock: transaction.LOCK.UPDATE });
    if (!efeito) throw erro("Efeito não encontrado.", 404);
    const antes = efeito.toJSON();
    await efeito.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "PowerStatusEffect", idEntidade: efeito.id, dadosAntes: antes, dadosDepois: efeito.toJSON(), req, transaction });
    return efeito;
  });
}

async function removeAdminPowerStatusEffect(idEfeito, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const efeito = await PowerStatusEffect.findByPk(idEfeito, { transaction });
    if (!efeito) throw erro("Efeito não encontrado.", 404);
    const antes = efeito.toJSON();
    await efeito.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "remover", entidade: "PowerStatusEffect", idEntidade: idEfeito, dadosAntes: antes, req, transaction });
    return { removido: true };
  });
}

// ----------------------------------------------------- WEAPON STATUS EFFECT
async function listAdminWeaponStatusEffects(idItem) {
  return WeaponStatusEffect.findAll({ where: { id_item: idItem } });
}

async function addAdminWeaponStatusEffect(idItem, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["status_key", "chance_ppm", "duration_turns", "potency_base", "potency_scale_attribute", "potency_scale_value", "trigger", "ativo"]);
  if (!dados.status_key) throw erro("status_key é obrigatório.");
  validarStatusEffectPayload(dados);
  const trigger = dados.trigger ?? "BASIC_ATTACK_HIT";
  if (!TRIGGERS_SUPORTADOS.includes(trigger)) {
    throw erro(`trigger "${trigger}" não é suportado pelo motor. Suportados: ${TRIGGERS_SUPORTADOS.join(", ")}.`);
  }

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(idItem, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    const efeito = await WeaponStatusEffect.create({ id_item: idItem, chance_ppm: 0, duration_turns: 1, potency_base: 0, potency_scale_value: 0, ...dados, trigger }, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "WeaponStatusEffect", idEntidade: efeito.id, dadosDepois: efeito.toJSON(), req, transaction });
    return efeito;
  });
}

async function updateAdminWeaponStatusEffect(idEfeito, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["status_key", "chance_ppm", "duration_turns", "potency_base", "potency_scale_attribute", "potency_scale_value", "trigger", "ativo"]);
  validarStatusEffectPayload(dados);
  if (dados.trigger && !TRIGGERS_SUPORTADOS.includes(dados.trigger)) {
    throw erro(`trigger "${dados.trigger}" não é suportado pelo motor. Suportados: ${TRIGGERS_SUPORTADOS.join(", ")}.`);
  }

  return sequelize.transaction(async (transaction) => {
    const efeito = await WeaponStatusEffect.findByPk(idEfeito, { transaction, lock: transaction.LOCK.UPDATE });
    if (!efeito) throw erro("Efeito não encontrado.", 404);
    const antes = efeito.toJSON();
    await efeito.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "WeaponStatusEffect", idEntidade: efeito.id, dadosAntes: antes, dadosDepois: efeito.toJSON(), req, transaction });
    return efeito;
  });
}

async function removeAdminWeaponStatusEffect(idEfeito, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const efeito = await WeaponStatusEffect.findByPk(idEfeito, { transaction });
    if (!efeito) throw erro("Efeito não encontrado.", 404);
    const antes = efeito.toJSON();
    await efeito.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "remover", entidade: "WeaponStatusEffect", idEntidade: idEfeito, dadosAntes: antes, req, transaction });
    return { removido: true };
  });
}

// -------------------------------------------------------------- CATÁLOGO
function statusCatalog() {
  return CHAVES_VALIDAS.map((chave) => ({
    status_key: chave,
    ...STATUS[chave],
    stack_maximo: STACKS_MAXIMOS[chave] ?? null,
  }));
}

// ---------------------------------------------------------------- PREVIEWS
// Fase 7 — evolução 1-10 usando EXATAMENTE abilityLevelService (nunca
// reimplementado no frontend).
async function previewPowerEvolution(idPower) {
  const power = await Power.findByPk(idPower);
  if (!power) throw erro("Habilidade não encontrada.", 404);

  const niveis = [];
  for (let nivel = 1; nivel <= NIVEL_MAXIMO_HABILIDADE; nivel++) {
    const mult = multiplicadorEfeito(nivel);
    const multMana = multiplicadorCustoMana(nivel);
    niveis.push({
      nivel,
      marco: marcoDoNivel(nivel),
      dano: power.dano_base ? Math.round(power.dano_base * mult) : null,
      cura: power.cura_base ? Math.round(power.cura_base * mult) : null,
      custo_mana: Math.round(power.custo_mana * multMana),
      custo_para_proximo_nivel: nivel < NIVEL_MAXIMO_HABILIDADE ? custoParaEvoluir(nivel) : null,
    });
  }
  return { power_id: power.id, nome: power.nome, niveis };
}

// Fase 14 — preview de status usando o mesmo resolver do combate
// (combatEffectResolver.potenciaEsperada), com um valor de exemplo do
// atributo de escala (ex.: Inteligência = 200) informado pelo admin.
async function previewPowerStatus(idPower, valorAtributoExemplo) {
  const power = await Power.findByPk(idPower, { include: [{ model: PowerStatusEffect, as: "efeitosDeStatus" }] });
  if (!power) throw erro("Habilidade não encontrada.", 404);

  const personagemFicticio = {
    forca: valorAtributoExemplo,
    vitalidade: valorAtributoExemplo,
    agilidade: valorAtributoExemplo,
    inteligencia: valorAtributoExemplo,
    velocidade: valorAtributoExemplo,
  };

  const efeitos = (power.efeitosDeStatus ?? [])
    .filter((e) => e.ativo)
    .map((e) => ({
      status_key: e.status_key,
      nome_ui: STATUS[e.status_key]?.nomeUi ?? e.status_key,
      chance_percentual: e.chance_ppm / 10000,
      duration_turns: e.duration_turns,
      potencia_estimada: Math.round(potenciaEsperada(e, personagemFicticio) * 100) / 100,
      target: e.target,
    }));

  return { power_id: power.id, nome: power.nome, dano_base: power.dano_base, valor_atributo_exemplo: valorAtributoExemplo, efeitos };
}

module.exports = {
  CHAVES_VALIDAS,
  TRIGGERS_SUPORTADOS,
  listAdminPowers,
  createAdminPower,
  updateAdminPower,
  duplicateAdminPower,
  countPlayersAffectedByPower,
  listAdminClassAbilities,
  listAdminRaceAbilities,
  upsertAdminClassAbility,
  removeAdminClassAbility,
  upsertAdminRaceAbility,
  removeAdminRaceAbility,
  addAdminPowerStatusEffect,
  updateAdminPowerStatusEffect,
  removeAdminPowerStatusEffect,
  listAdminWeaponStatusEffects,
  addAdminWeaponStatusEffect,
  updateAdminWeaponStatusEffect,
  removeAdminWeaponStatusEffect,
  statusCatalog,
  previewPowerEvolution,
  previewPowerStatus,
};
