// Painel Administrativo Fase 8 (§19) — Zonas, Monstros, Aparições
// (vínculo zona-monstro) e Drops (AdventureMonsterLoot) da Aventura.
// Reaproveita os models existentes (AdventureZone/AdventureMonster/
// AdventureZoneMonster/AdventureMonsterLoot) — nenhuma tabela nova.
// Recompensa de XP/ouro continua calculada em adventureRewardService.js
// (não duplicado aqui).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const AdventureZone = require("../models/AdventureZone");
const AdventureMonster = require("../models/AdventureMonster");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonsterLoot = require("../models/AdventureMonsterLoot");
const Item = require("../models/Item");
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

// `dados` só carrega os campos que vieram no payload (ver somenteCampos
// acima) — usado em todo PATCH parcial pra decidir "o admin mandou um
// valor novo pra este campo" (mesmo que o valor enviado seja null) vs
// "não mandou nada, mantém o que já está salvo".
function foiEnviado(dados, campo) {
  return Object.prototype.hasOwnProperty.call(dados, campo);
}

// Valor final que vai ser persistido pra um campo, considerando PATCH
// parcial: usa o que veio no payload quando enviado, senão cai pro
// valor atualmente salvo (`atual` é a instância/registro do banco).
function valorFinal(dados, atual, campo) {
  return foiEnviado(dados, campo) ? dados[campo] : atual[campo];
}

// ---------------------------------------------------------------- ZONAS
const CAMPOS_ZONA = ["nome", "descricao", "nivel_monstro_min", "nivel_monstro_max", "imagem_url", "ordem", "ativa"];

// Valida a faixa de nível FINAL da zona (depois de mesclar payload +
// valor já salvo, no caso de PATCH parcial — ver valorFinal acima).
// Sem essa mescla, um PATCH que só manda nivel_monstro_min podia
// aprovar um valor maior que o nivel_monstro_max já salvo no banco
// (validação batendo só contra o campo enviado, nunca contra o par
// completo que realmente vai ficar persistido).
function validarFaixaNivelZona(min, max) {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw erro("nivel_monstro_min e nivel_monstro_max precisam ser números inteiros.");
  }
  if (min > max) {
    throw erro("O nível mínimo não pode ser maior que o nível máximo.");
  }
}

async function listAdminZones() {
  return AdventureZone.findAll({ order: [["ordem", "ASC"], ["id", "ASC"]] });
}

async function createAdminZone(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ZONA);
  if (!dados.nome) throw erro("nome é obrigatório.");
  if (dados.nivel_monstro_min == null || dados.nivel_monstro_max == null) {
    throw erro("nivel_monstro_min e nivel_monstro_max são obrigatórios.");
  }
  validarFaixaNivelZona(dados.nivel_monstro_min, dados.nivel_monstro_max);

  return sequelize.transaction(async (transaction) => {
    const zona = await AdventureZone.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AdventureZone",
      idEntidade: zona.id,
      dadosDepois: zona.toJSON(),
      req,
      transaction,
    });
    return zona;
  });
}

async function updateAdminZone(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ZONA);

  return sequelize.transaction(async (transaction) => {
    const zona = await AdventureZone.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!zona) throw erro("Zona não encontrada.", 404);

    // Lock pego acima já serializa updates concorrentes desta mesma
    // zona — a leitura de zona.nivel_monstro_min/max abaixo não corre o
    // risco clássico de "validou contra um valor que já mudou".
    const minFinal = valorFinal(dados, zona, "nivel_monstro_min");
    const maxFinal = valorFinal(dados, zona, "nivel_monstro_max");
    validarFaixaNivelZona(minFinal, maxFinal);

    const antes = zona.toJSON();
    await zona.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AdventureZone",
      idEntidade: zona.id,
      dadosAntes: antes,
      dadosDepois: zona.toJSON(),
      req,
      transaction,
    });
    return zona;
  });
}

// ------------------------------------------------------------- MONSTROS
// Reformulação V2 (Stats Fixos) — o Admin edita direto o que o monstro
// FAZ no combate (nível, vida, dano min/max, agilidade, velocidade,
// XP/Gold), nunca mais multiplicador em cima de um personagem de
// referência. multiplicador_vida/dano/agilidade/velocidade continuam
// existindo na tabela (legado, lidos só por Party/Caçadas/Editor de
// Balanceamento antigo até esses fluxos migrarem) mas NÃO fazem mais
// parte do payload editável daqui — congelados no valor que o Backfill
// deixou.
const CAMPOS_MONSTRO = [
  "nome",
  "descricao",
  "imagem_url",
  "sprite_key",
  "nivel",
  "vida_maxima",
  "dano_min",
  "dano_max",
  "agilidade",
  "velocidade",
  "xp_recompensa",
  "ouro_recompensa",
  "ativo",
];

// CHECK constraints do banco (migration 20261208010000) já bloqueiam
// dados inválidos na gravação, mas validar aqui ANTES de abrir a
// transaction dá uma mensagem de erro legível pro admin em vez de um
// erro cru do Postgres.
function validarStatsFixosMonstro(dados) {
  const camposInteirosNaoNegativos = ["vida_maxima", "dano_min", "dano_max", "agilidade", "velocidade", "xp_recompensa", "ouro_recompensa"];
  for (const campo of camposInteirosNaoNegativos) {
    if (!foiEnviado(dados, campo) || dados[campo] == null) continue;
    if (!Number.isInteger(dados[campo]) || dados[campo] < 0) {
      throw erro(`${campo} precisa ser um número inteiro >= 0 (recebido: ${dados[campo]}).`);
    }
  }
  if (foiEnviado(dados, "nivel") && dados.nivel != null) {
    if (!Number.isInteger(dados.nivel) || dados.nivel < 1) {
      throw erro(`nivel precisa ser um número inteiro >= 1 (recebido: ${dados.nivel}).`);
    }
  }
  if (foiEnviado(dados, "vida_maxima") && dados.vida_maxima != null && dados.vida_maxima < 1) {
    throw erro("vida_maxima precisa ser um número inteiro >= 1.");
  }
}

// Confere dano_max >= dano_min depois de mesclar payload + valor já
// salvo (mesmo raciocínio de validarFaixaNivelZona — nunca validar só
// o campo enviado isoladamente num PATCH parcial).
function validarFaixaDanoMonstro(danoMinFinal, danoMaxFinal) {
  if (danoMinFinal == null || danoMaxFinal == null) return;
  if (!Number.isInteger(danoMinFinal) || !Number.isInteger(danoMaxFinal)) {
    throw erro("dano_min e dano_max precisam ser números inteiros.");
  }
  if (danoMaxFinal < danoMinFinal) {
    throw erro("dano_max não pode ser menor que dano_min.");
  }
}

async function listAdminMonsters() {
  return AdventureMonster.findAll({ order: [["nome", "ASC"]] });
}

async function createAdminMonster(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_MONSTRO);
  if (!dados.nome) throw erro("nome é obrigatório.");
  validarStatsFixosMonstro(dados);
  validarFaixaDanoMonstro(dados.dano_min, dados.dano_max);

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AdventureMonster",
      idEntidade: monstro.id,
      dadosDepois: monstro.toJSON(),
      req,
      transaction,
    });
    return monstro;
  });
}

async function updateAdminMonster(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_MONSTRO);
  validarStatsFixosMonstro(dados);

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!monstro) throw erro("Monstro não encontrado.", 404);

    const danoMinFinal = valorFinal(dados, monstro, "dano_min");
    const danoMaxFinal = valorFinal(dados, monstro, "dano_max");
    validarFaixaDanoMonstro(danoMinFinal, danoMaxFinal);

    const antes = monstro.toJSON();
    await monstro.update(dados, { transaction });
    const depois = monstro.toJSON();
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AdventureMonster",
      idEntidade: monstro.id,
      dadosAntes: antes,
      dadosDepois: depois,
      req,
      transaction,
    });
    return monstro;
  });
}

async function duplicateAdminMonster(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await AdventureMonster.findByPk(id, { transaction });
    if (!original) throw erro("Monstro não encontrado.", 404);

    const dados = somenteCampos(original.toJSON(), CAMPOS_MONSTRO);
    dados.nome = `${original.nome} (cópia)`;
    dados.ativo = false;

    const copia = await AdventureMonster.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "duplicar",
      entidade: "AdventureMonster",
      idEntidade: copia.id,
      dadosAntes: { origemId: original.id },
      dadosDepois: copia.toJSON(),
      req,
      transaction,
    });
    return copia;
  });
}

// ------------------------------------------------------------ APARIÇÕES
// Reformulação V2 (§4/§9.4) — o vínculo diz só ONDE o monstro aparece
// e com que frequência/tipo; nivel_min_override/nivel_max_override
// saíram do payload editável (o nível é sempre AdventureMonster.nivel,
// nunca escolhido pela aparição). nivel_jogador_minimo é o único campo
// de nível aqui, e controla só ELEGIBILIDADE — nunca o nível do monstro.
const CAMPOS_APARICAO = ["id_area", "id_monstro", "peso_aparicao", "tipo_aparicao", "nivel_jogador_minimo", "ativo"];

// adventureRollService.sortearMonstroDaZona soma peso_aparicao de todas
// as aparições ativas da zona e sorteia proporcionalmente — um peso
// <= 0 quebra a subtração da roleta (nunca fecha o alvo em zero) e um
// peso negativo pode até fazer `pesoTotal` de outra aparição parecer
// maior do que realmente é. A regra de negócio é só "maior que zero";
// a soma dos pesos da zona NUNCA precisa fechar em nenhum total fixo
// (100, 1000...) — são pesos relativos.
function validarPesoAparicao(peso) {
  if (!Number.isInteger(peso) || peso <= 0) {
    throw erro("O peso de aparição deve ser um número inteiro maior que zero.");
  }
}

// V2 (§4.3) — nivel_jogador_minimo só decide se a aparição entra no
// pool ponderado pra aquele jogador; nunca altera nível/stats do
// monstro. Sem teto (jogador de nível alto pode continuar encontrando
// monstros fracos, de propósito — §4.3 "sentir sua progressão").
function validarNivelJogadorMinimo(valor) {
  if (valor == null) return;
  if (!Number.isInteger(valor) || valor < 1) {
    throw erro("nivel_jogador_minimo precisa ser um número inteiro >= 1.");
  }
}

async function listAdminZoneMonsters({ idArea } = {}) {
  const where = {};
  if (idArea) where.id_area = idArea;
  return AdventureZoneMonster.findAll({
    where,
    // Sem `as:` nos dois includes de propósito — AdventureZoneMonster
    // registra essas duas belongsTo SEM alias em associations.js
    // (adventureHuntRotationService.js já lê `.AdventureZone` assim);
    // "monstro" é a exceção que já tem alias próprio.
    include: [
      { model: AdventureZone, attributes: ["id", "nome"] },
      { model: AdventureMonster, as: "monstro", attributes: ["id", "nome", "imagem_url"] },
    ],
    order: [["id_area", "ASC"], ["tipo_aparicao", "ASC"]],
  });
}

async function createAdminZoneMonster(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_APARICAO);
  if (!dados.id_area || !dados.id_monstro) throw erro("id_area e id_monstro são obrigatórios.");
  if (foiEnviado(dados, "peso_aparicao")) validarPesoAparicao(dados.peso_aparicao);
  if (foiEnviado(dados, "nivel_jogador_minimo")) validarNivelJogadorMinimo(dados.nivel_jogador_minimo);

  return sequelize.transaction(async (transaction) => {
    const zona = await AdventureZone.findByPk(dados.id_area, { transaction });
    if (!zona) throw erro("Zona não encontrada.", 404);
    const monstro = await AdventureMonster.findByPk(dados.id_monstro, { transaction });
    if (!monstro) throw erro("Monstro não encontrado.", 404);

    const existente = await AdventureZoneMonster.findOne({
      where: { id_area: dados.id_area, id_monstro: dados.id_monstro },
      transaction,
    });
    if (existente) throw erro("Esse monstro já está vinculado a essa zona.");

    const vinculo = await AdventureZoneMonster.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AdventureZoneMonster",
      idEntidade: vinculo.id,
      dadosDepois: vinculo.toJSON(),
      req,
      transaction,
    });
    return vinculo;
  });
}

async function updateAdminZoneMonster(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["peso_aparicao", "tipo_aparicao", "nivel_jogador_minimo", "ativo"]);
  if (foiEnviado(dados, "peso_aparicao")) validarPesoAparicao(dados.peso_aparicao);
  if (foiEnviado(dados, "nivel_jogador_minimo")) validarNivelJogadorMinimo(dados.nivel_jogador_minimo);

  return sequelize.transaction(async (transaction) => {
    const vinculo = await AdventureZoneMonster.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!vinculo) throw erro("Vínculo não encontrado.", 404);

    const antes = vinculo.toJSON();
    await vinculo.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AdventureZoneMonster",
      idEntidade: vinculo.id,
      dadosAntes: antes,
      dadosDepois: vinculo.toJSON(),
      req,
      transaction,
    });
    return vinculo;
  });
}

// ----------------------------------------------------------------- LOOT
const PPM_MAXIMO = 1_000_000;
const CAMPOS_LOOT = ["id_monstro", "id_item", "chance_ppm", "quantidade_min", "quantidade_max", "categoria", "ativo"];

async function listAdminMonsterLoot({ idMonstro } = {}) {
  const where = {};
  if (idMonstro) where.id_monstro = idMonstro;
  return AdventureMonsterLoot.findAll({
    where,
    // AdventureMonsterLoot->AdventureMonster também não tem alias em
    // associations.js (só ->Item tem, "item").
    include: [
      { model: AdventureMonster, attributes: ["id", "nome"] },
      { model: Item, as: "item", attributes: ["id", "nome", "raridade", "imagem_url"] },
    ],
    order: [["id_monstro", "ASC"], ["chance_ppm", "DESC"]],
  });
}

// Valores default do model (DataTypes.INTEGER, defaultValue: 1) — usados
// como "valor atual" na validação de CREATE, já que aqui ainda não
// existe registro no banco pra mesclar (ver validarQuantidadeLoot).
const QUANTIDADE_LOOT_PADRAO = 1;

function validarLoot(dados) {
  if (dados.chance_ppm != null) {
    if (!Number.isInteger(dados.chance_ppm) || dados.chance_ppm <= 0 || dados.chance_ppm > PPM_MAXIMO) {
      throw erro(`chance_ppm precisa ser um inteiro entre 1 e ${PPM_MAXIMO} (100%).`);
    }
  }
}

// adventureRewardService.sortearEspoliosDoMonstro usa
// crypto.randomInt(quantidade_min, quantidade_max + 1) — precisa dos
// dois como inteiros >= 1 (crypto.randomInt não aceita float/NaN) e
// quantidade_min <= quantidade_max, senão o intervalo do sorteio nem
// existe. Recebe os valores FINAIS (já mesclados com o que está salvo
// ou com o default do model, conforme o caller) pra também pegar o
// caso de PATCH parcial.
function validarQuantidadeLoot(min, max) {
  if (!Number.isInteger(min) || min < 1) {
    throw erro("A quantidade mínima de loot deve ser um número inteiro maior ou igual a 1.");
  }
  if (!Number.isInteger(max) || max < 1) {
    throw erro("A quantidade máxima de loot deve ser um número inteiro maior ou igual a 1.");
  }
  if (min > max) {
    throw erro("A quantidade mínima de loot não pode ser maior que a quantidade máxima.");
  }
}

async function createAdminMonsterLoot(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_LOOT);
  if (!dados.id_monstro || !dados.id_item || dados.chance_ppm == null) {
    throw erro("id_monstro, id_item e chance_ppm são obrigatórios.");
  }
  validarLoot(dados);
  const minFinal = foiEnviado(dados, "quantidade_min") ? dados.quantidade_min : QUANTIDADE_LOOT_PADRAO;
  const maxFinal = foiEnviado(dados, "quantidade_max") ? dados.quantidade_max : QUANTIDADE_LOOT_PADRAO;
  validarQuantidadeLoot(minFinal, maxFinal);

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.findByPk(dados.id_monstro, { transaction });
    if (!monstro) throw erro("Monstro não encontrado.", 404);
    const item = await Item.findByPk(dados.id_item, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);

    const loot = await AdventureMonsterLoot.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AdventureMonsterLoot",
      idEntidade: loot.id,
      dadosDepois: loot.toJSON(),
      req,
      transaction,
    });
    return loot;
  });
}

async function updateAdminMonsterLoot(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["chance_ppm", "quantidade_min", "quantidade_max", "categoria", "ativo"]);
  validarLoot(dados);

  return sequelize.transaction(async (transaction) => {
    const loot = await AdventureMonsterLoot.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!loot) throw erro("Drop não encontrado.", 404);

    const minFinal = valorFinal(dados, loot, "quantidade_min");
    const maxFinal = valorFinal(dados, loot, "quantidade_max");
    validarQuantidadeLoot(minFinal, maxFinal);

    const antes = loot.toJSON();
    await loot.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AdventureMonsterLoot",
      idEntidade: loot.id,
      dadosAntes: antes,
      dadosDepois: loot.toJSON(),
      req,
      transaction,
    });
    return loot;
  });
}

module.exports = {
  listAdminZones,
  createAdminZone,
  updateAdminZone,
  listAdminMonsters,
  createAdminMonster,
  updateAdminMonster,
  duplicateAdminMonster,
  listAdminZoneMonsters,
  createAdminZoneMonster,
  updateAdminZoneMonster,
  listAdminMonsterLoot,
  createAdminMonsterLoot,
  updateAdminMonsterLoot,
};
