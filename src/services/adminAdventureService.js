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
const MonsterStatusEffect = require("../models/MonsterStatusEffect");
const Item = require("../models/Item");
const ExpeditionRegion = require("../models/ExpeditionRegion");
const { registrarAcao } = require("./adminAuditService");
const { CHAVES_VALIDAS } = require("../config/statusEffectConfig");
const { calcularPoderMonstro } = require("./combatPowerService");

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

// Mesmo padrão de adminClassService.comTraducaoDeFk — traduz uma violação
// de FK (Postgres bloqueando a exclusão porque outra tabela ainda
// referencia a linha) numa mensagem legível, em vez do erro cru do banco.
async function comTraducaoDeFk(fn, mensagemConflito) {
  try {
    return await fn();
  } catch (e) {
    if (e.name === "SequelizeForeignKeyConstraintError") {
      throw erro(mensagemConflito, 409);
    }
    throw e;
  }
}

// Valor final que vai ser persistido pra um campo, considerando PATCH
// parcial: usa o que veio no payload quando enviado, senão cai pro
// valor atualmente salvo (`atual` é a instância/registro do banco).
function valorFinal(dados, atual, campo) {
  return foiEnviado(dados, campo) ? dados[campo] : atual[campo];
}

// ---------------------------------------------------------------- ZONAS
const CAMPOS_ZONA = [
  "nome",
  "descricao",
  "nivel_monstro_min",
  "nivel_monstro_max",
  "nivel_jogador_minimo",
  "imagem_url",
  "ordem",
  "ativa",
];

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
  if (foiEnviado(dados, "nivel_jogador_minimo")) validarNivelJogadorMinimo(dados.nivel_jogador_minimo);

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
    if (foiEnviado(dados, "nivel_jogador_minimo")) validarNivelJogadorMinimo(dados.nivel_jogador_minimo);

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
  "nivel",
  "vida_maxima",
  "dano_min",
  "dano_max",
  "agilidade",
  "velocidade",
  "xp_recompensa",
  "ouro_recompensa",
  "defesa",
  "ativo",
  "disponivel_emboscada",
  // IA de Combate PvE & Habilidades de Monstros V1 (§4.4/§10.1) — rida
  // os mesmos endpoints de criar/editar monstro; validação de enum já é
  // garantida pelo model (ENUM do Postgres rejeita valor fora da lista).
  "ai_profile",
];

// CHECK constraints do banco (migration 20261208010000) já bloqueiam
// dados inválidos na gravação, mas validar aqui ANTES de abrir a
// transaction dá uma mensagem de erro legível pro admin em vez de um
// erro cru do Postgres.
function validarStatsFixosMonstro(dados) {
  const camposInteirosNaoNegativos = ["vida_maxima", "dano_min", "dano_max", "agilidade", "velocidade", "xp_recompensa", "ouro_recompensa", "defesa"];
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

// Especificação "Admin de Aventura + Defesa/Poder de Monstros" v3 §3.2
// — listagem precisa mostrar Poder pra ordenar/filtrar; combatPower
// nunca é persistido (§9), sempre recalculado aqui em cima dos stats
// reais de cada linha (cálculo puro e barato, sem N+1 de query).
async function listAdminMonsters() {
  const monstros = await AdventureMonster.findAll({ order: [["nome", "ASC"]] });
  return monstros.map((monstro) => {
    const json = monstro.toJSON();
    json.combat_power = calcularPoderMonstro(json).combatPower;
    return json;
  });
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

// Exclusão de verdade (não é o "ativo:false" do toggle "Desativar") — só
// possível quando nada de histórico real referencia esse monstro (Caçadas
// da Guilda dos Aventureiros, contrato de Caçador, etc: CharacterAdventureHunt/
// CharacterHunterProgress têm FK pra AdventureMonsters). Nesses casos o
// Postgres recusa com FK violation, e a gente traduz isso numa mensagem
// pedindo pra desativar em vez de excluir (mesmo padrão de
// adminClassService.excluirCaminho). Drop/vínculo de zona são CONFIGURAÇÃO
// própria do monstro (não histórico de ninguém) — sempre apagados junto,
// nunca bloqueiam a exclusão.
async function deleteAdminMonster(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!monstro) throw erro("Monstro não encontrado.", 404);

    const antes = monstro.toJSON();
    await AdventureMonsterLoot.destroy({ where: { id_monstro: id }, transaction });
    await AdventureZoneMonster.destroy({ where: { id_monstro: id }, transaction });
    await comTraducaoDeFk(
      () => monstro.destroy({ transaction }),
      "Esse monstro não pode ser excluído: já existe histórico de jogador vinculado a ele (Caçada, contrato de Caçador etc.). Desative-o em vez de excluir.",
    );

    await registrarAcao({
      idAdmin,
      acao: "excluir",
      entidade: "AdventureMonster",
      idEntidade: Number(id),
      dadosAntes: antes,
      req,
      transaction,
    });
    return { id: Number(id) };
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
// Mesma validação (inteiro >= 1) reaproveitada pro nivel_jogador_minimo
// da PRÓPRIA zona (gate de entrada, ver AdventureZone.js) — a regra é
// idêntica, só o campo que ela guarda é que muda de sentido.
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

async function listAdminMonsterLoot({ idMonstro, idItem } = {}) {
  const where = {};
  if (idMonstro) where.id_monstro = idMonstro;
  // idItem — busca reversa "quem dropa este item", usada pelo Painel de
  // Classes (§ requisito ITEM de evolução) pra mostrar/configurar onde a
  // relíquia exigida cai, sem precisar abrir a tela de Aventura à parte.
  if (idItem) where.id_item = idItem;
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

// Exclusão de verdade de um drop — diferente do "ativo:false" que o
// sincronizarLootMonstro grava quando uma linha some do payload de Salvar
// (isso é só "pausar", pra poder reativar depois sem perder chance/
// quantidade configuradas). Nada no banco referencia uma linha de
// AdventureMonsterLoot (é folha), então sempre é seguro apagar de vez —
// sem o mesmo risco de excluir um Monstro (que pode ter histórico de
// Caçada/Caçador vinculado).
async function deleteAdminMonsterLoot(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const loot = await AdventureMonsterLoot.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!loot) throw erro("Drop não encontrado.", 404);

    const antes = loot.toJSON();
    await loot.destroy({ transaction });
    await registrarAcao({
      idAdmin,
      acao: "excluir",
      entidade: "AdventureMonsterLoot",
      idEntidade: Number(id),
      dadosAntes: antes,
      req,
      transaction,
    });
    return { id: Number(id) };
  });
}

// Só leitura, pro Simulador de Balanceamento (modo "expedicao") montar
// o dropdown de região sem duplicar o catálogo que expeditionController
// já expõe pro jogador comum — nenhuma tabela/rota de escrita nova.
async function listExpeditionRegions() {
  return ExpeditionRegion.findAll({ where: { ativo: true }, order: [["ordem", "ASC"], ["id", "ASC"]] });
}

// ----------------------------------------------- ENDPOINTS AGREGADOS (V3)
// Especificação "Admin de Aventura + Defesa/Poder de Monstros" v3 §2.4/
// §4.2/§9 — ZoneEditor/MonsterEditor editam tudo localmente e mandam UMA
// sincronização por Salvar, em vez de um PATCH por linha. Os endpoints
// granulares acima continuam existindo (§9.1 "mantenha endpoints antigos
// enquanto ainda houver consumidores") — estes são aditivos.

// PUT /zones/:id/monsters (§2.4) — upsert lógico por (id_area, id_monstro):
// vínculo ausente do payload não é deletado, vira ativo=false; um vínculo
// previamente inativo que volta no payload é REATIVADO na linha
// existente (nunca cria uma segunda linha — violaria a unique constraint
// id_area+id_monstro). Uma única ação de auditoria com o roster completo
// antes/depois, não uma por linha.
async function sincronizarRosterZona(idZona, monstrosPayload, { idAdmin, req }) {
  if (!Array.isArray(monstrosPayload)) throw erro("monsters precisa ser uma lista.");

  const idsMonstro = monstrosPayload.map((m) => m.id_monstro);
  if (idsMonstro.some((id) => !Number.isInteger(id))) throw erro("Todo item precisa de um id_monstro válido.");
  if (new Set(idsMonstro).size !== idsMonstro.length) throw erro("O mesmo monstro não pode aparecer duas vezes no roster.");
  for (const m of monstrosPayload) {
    validarPesoAparicao(m.peso_aparicao);
    if (!["Comum", "Raro"].includes(m.tipo_aparicao ?? "Comum")) {
      throw erro(`tipo_aparicao inválido: "${m.tipo_aparicao}".`);
    }
    validarNivelJogadorMinimo(m.nivel_jogador_minimo ?? 1);
  }

  return sequelize.transaction(async (transaction) => {
    // Lock na zona alvo (§2.4 passo 1) — serializa duas sincronizações
    // concorrentes da MESMA zona; evita lost update.
    const zona = await AdventureZone.findByPk(idZona, { transaction, lock: transaction.LOCK.UPDATE });
    if (!zona) throw erro("Zona não encontrada.", 404);

    if (idsMonstro.length) {
      const existentes = await AdventureMonster.count({ where: { id: idsMonstro }, transaction });
      if (existentes !== idsMonstro.length) throw erro("Algum monstro do roster não existe.");
    }

    const linhasAtuais = await AdventureZoneMonster.findAll({ where: { id_area: idZona }, transaction });
    const antes = linhasAtuais.map((l) => l.toJSON());
    const porMonstro = new Map(linhasAtuais.map((l) => [l.id_monstro, l]));
    const idsNoPayload = new Set(idsMonstro);

    for (const m of monstrosPayload) {
      const dados = {
        tipo_aparicao: m.tipo_aparicao ?? "Comum",
        peso_aparicao: m.peso_aparicao,
        nivel_jogador_minimo: m.nivel_jogador_minimo ?? 1,
        ativo: m.ativo ?? true,
      };
      const linha = porMonstro.get(m.id_monstro);
      if (linha) await linha.update(dados, { transaction });
      else await AdventureZoneMonster.create({ id_area: idZona, id_monstro: m.id_monstro, ...dados }, { transaction });
    }
    // Bug reportado: tirar um monstro da lista local (botão "Remover" do
    // ZoneEditor) e salvar só marcava `ativo:false` — como a listagem de
    // edição (listAdminZoneMonsters/GET aparições) devolve TODAS as
    // linhas, o monstro "removido" voltava a aparecer (desativado) toda
    // vez que o admin reabria a zona, e nunca saía de verdade do
    // roster. Uma linha ausente do payload é intenção explícita de
    // remoção — apaga de verdade, não só desativa.
    const idsParaRemover = linhasAtuais.filter((linha) => !idsNoPayload.has(linha.id_monstro)).map((linha) => linha.id);
    if (idsParaRemover.length) {
      await AdventureZoneMonster.destroy({ where: { id: idsParaRemover }, transaction });
    }

    const depois = await AdventureZoneMonster.findAll({
      where: { id_area: idZona },
      include: [{ model: AdventureMonster, as: "monstro", attributes: ["id", "nome", "imagem_url"] }],
      transaction,
    });
    await registrarAcao({
      idAdmin,
      acao: "sincronizar_roster",
      entidade: "AdventureZoneMonster",
      idEntidade: idZona,
      dadosAntes: { id_area: idZona, roster: antes },
      dadosDepois: { id_area: idZona, roster: depois.map((l) => l.toJSON()) },
      req,
      transaction,
    });
    return depois;
  });
}

// PUT /monsters/:id/loot (§4.2) — mesmo padrão de sincronização do
// roster de zona, mas identificado por `id` da linha (não há unique
// constraint natural item+monstro — um mesmo item pode aparecer em
// categorias diferentes de propósito). Entrada do payload SEM `id` é
// tratada como criação nova; com `id` desconhecido/de outro monstro é
// rejeitada (nunca deixa um admin sequestrar a linha de outro monstro
// por engano).
async function sincronizarLootMonstro(idMonstro, lootPayload, { idAdmin, req }) {
  if (!Array.isArray(lootPayload)) throw erro("loot precisa ser uma lista.");

  for (const l of lootPayload) {
    if (!Number.isInteger(l.id_item)) throw erro("Todo item de loot precisa de um id_item válido.");
    validarLoot(l);
    const minFinal = foiEnviado(l, "quantidade_min") ? l.quantidade_min : QUANTIDADE_LOOT_PADRAO;
    const maxFinal = foiEnviado(l, "quantidade_max") ? l.quantidade_max : QUANTIDADE_LOOT_PADRAO;
    validarQuantidadeLoot(minFinal, maxFinal);
  }

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.findByPk(idMonstro, { transaction, lock: transaction.LOCK.UPDATE });
    if (!monstro) throw erro("Monstro não encontrado.", 404);

    const idsItem = lootPayload.map((l) => l.id_item);
    if (idsItem.length) {
      const existentes = await Item.count({ where: { id: idsItem }, transaction });
      if (existentes !== new Set(idsItem).size) throw erro("Algum item do payload não existe.");
    }

    const linhasAtuais = await AdventureMonsterLoot.findAll({ where: { id_monstro: idMonstro }, transaction });
    const antes = linhasAtuais.map((l) => l.toJSON());
    const porId = new Map(linhasAtuais.map((l) => [l.id, l]));

    const idsMantidos = new Set();
    for (const l of lootPayload) {
      const dados = {
        id_item: l.id_item,
        chance_ppm: l.chance_ppm,
        quantidade_min: foiEnviado(l, "quantidade_min") ? l.quantidade_min : QUANTIDADE_LOOT_PADRAO,
        quantidade_max: foiEnviado(l, "quantidade_max") ? l.quantidade_max : QUANTIDADE_LOOT_PADRAO,
        categoria: l.categoria ?? "Principal",
        ativo: l.ativo ?? true,
      };
      if (l.id != null) {
        const linha = porId.get(l.id);
        if (!linha) throw erro(`Drop #${l.id} não pertence a este monstro.`, 404);
        idsMantidos.add(l.id);
        await linha.update(dados, { transaction });
      } else {
        const nova = await AdventureMonsterLoot.create({ id_monstro: idMonstro, ...dados }, { transaction });
        idsMantidos.add(nova.id);
      }
    }
    // Mesmo bug do roster de zona (sincronizarRosterZona): uma linha
    // ausente do payload só virava ativo:false — como a listagem de
    // edição devolve toda linha, o drop "removido" no MonsterEditor
    // reaparecia (desmarcado) sempre que o admin reabria o monstro,
    // dando a impressão de que "Remover" não salvava nada. Nada
    // referencia uma linha de AdventureMonsterLoot (é folha — mesmo
    // raciocínio de deleteAdminMonsterLoot acima), então é seguro apagar
    // de vez em vez de só desativar.
    const idsParaRemover = linhasAtuais.filter((linha) => !idsMantidos.has(linha.id)).map((linha) => linha.id);
    if (idsParaRemover.length) {
      await AdventureMonsterLoot.destroy({ where: { id: idsParaRemover }, transaction });
    }

    const depois = await AdventureMonsterLoot.findAll({
      where: { id_monstro: idMonstro },
      include: [{ model: Item, as: "item", attributes: ["id", "nome", "raridade", "imagem_url"] }],
      transaction,
    });
    await registrarAcao({
      idAdmin,
      acao: "sincronizar_loot",
      entidade: "AdventureMonsterLoot",
      idEntidade: idMonstro,
      dadosAntes: { id_monstro: idMonstro, loot: antes },
      dadosDepois: { id_monstro: idMonstro, loot: depois.map((l) => l.toJSON()) },
      req,
      transaction,
    });
    return depois;
  });
}

// ----------------------------------------------------------- STATUS EFFECT
// PUT /monsters/:id/status-effects — ideia #3 da fila de melhorias
// (monstro causando status no jogador). Mesmo padrão de sincronização
// de loot acima: payload é a lista inteira, identificado por `status_key`
// (chave única por monstro, igual weapon_status_effects por item+trigger)
// — nunca duas linhas do mesmo status pro mesmo monstro.
function validarStatusEffectDeMonstro(dados) {
  if (!CHAVES_VALIDAS.includes(dados.status_key)) {
    throw erro(`status_key inválida: "${dados.status_key}". Use uma das chaves do Motor de Status.`);
  }
  if (dados.chance_ppm == null || !Number.isInteger(dados.chance_ppm) || dados.chance_ppm < 0 || dados.chance_ppm > PPM_MAXIMO) {
    throw erro(`chance_ppm precisa ser um inteiro entre 0 e ${PPM_MAXIMO}.`);
  }
  if (dados.duration_turns == null || !Number.isInteger(dados.duration_turns) || dados.duration_turns < 1) {
    throw erro("duration_turns precisa ser um inteiro maior ou igual a 1.");
  }
  if (dados.potency_base == null || typeof dados.potency_base !== "number" || Number.isNaN(dados.potency_base)) {
    throw erro("potency_base precisa ser um número.");
  }
  // Habilidades V2.0 §4/§21 — campo opcional (null = status continua no
  // modo legado, potency_base como dano absoluto). Quando informado, o
  // Admin está migrando ESTA linha pra % de Vida Máxima explicitamente.
  if (
    dados.percentual_vida_maxima != null &&
    (typeof dados.percentual_vida_maxima !== "number" ||
      Number.isNaN(dados.percentual_vida_maxima) ||
      dados.percentual_vida_maxima < 0 ||
      dados.percentual_vida_maxima > 100)
  ) {
    throw erro("percentual_vida_maxima precisa ser um número entre 0 e 100.");
  }
}

async function sincronizarStatusEffectsMonstro(idMonstro, payload, { idAdmin, req }) {
  if (!Array.isArray(payload)) throw erro("status effects precisa ser uma lista.");

  const chaves = payload.map((e) => e.status_key);
  if (new Set(chaves).size !== chaves.length) {
    throw erro("Não pode haver duas linhas do mesmo status_key pro mesmo monstro.");
  }
  for (const efeito of payload) validarStatusEffectDeMonstro(efeito);

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.findByPk(idMonstro, { transaction, lock: transaction.LOCK.UPDATE });
    if (!monstro) throw erro("Monstro não encontrado.", 404);

    const linhasAtuais = await MonsterStatusEffect.findAll({ where: { id_monstro: idMonstro }, transaction });
    const antes = linhasAtuais.map((l) => l.toJSON());
    const porStatusKey = new Map(linhasAtuais.map((l) => [l.status_key, l]));

    const chavesMantidas = new Set();
    for (const efeito of payload) {
      const dados = {
        chance_ppm: efeito.chance_ppm,
        duration_turns: efeito.duration_turns,
        potency_base: efeito.potency_base,
        percentual_vida_maxima: efeito.percentual_vida_maxima ?? null,
        ativo: efeito.ativo ?? true,
      };
      const existente = porStatusKey.get(efeito.status_key);
      if (existente) {
        await existente.update(dados, { transaction });
      } else {
        await MonsterStatusEffect.create({ id_monstro: idMonstro, status_key: efeito.status_key, ...dados }, { transaction });
      }
      chavesMantidas.add(efeito.status_key);
    }
    const idsParaRemover = linhasAtuais.filter((l) => !chavesMantidas.has(l.status_key)).map((l) => l.id);
    if (idsParaRemover.length) {
      await MonsterStatusEffect.destroy({ where: { id: idsParaRemover }, transaction });
    }

    const depois = await MonsterStatusEffect.findAll({ where: { id_monstro: idMonstro }, transaction, order: [["status_key", "ASC"]] });
    await registrarAcao({
      idAdmin,
      acao: "sincronizar_status_effects",
      entidade: "MonsterStatusEffect",
      idEntidade: idMonstro,
      dadosAntes: { id_monstro: idMonstro, efeitos: antes },
      dadosDepois: { id_monstro: idMonstro, efeitos: depois.map((l) => l.toJSON()) },
      req,
      transaction,
    });
    return depois;
  });
}

// GET /monsters/:id (§7.3) — detalhe agregado: reduz o número de
// requests que o MonsterEditor precisa fazer ao abrir (stats + Poder +
// drops + zonas onde aparece). Pedido do jogador: MonsterEditor passou a
// editar o vínculo de zona também (adicionar o monstro a qualquer zona,
// nova ou antiga, sem depender de abrir o ZoneEditor pra isso) — por
// isso `id`/`nivel_jogador_minimo` do vínculo vão junto agora, senão o
// front não tem como chamar PATCH /zone-monsters/:id.
async function getAdminMonsterDetail(id) {
  const monstro = await AdventureMonster.findByPk(id);
  if (!monstro) throw erro("Monstro não encontrado.", 404);

  const [loot, vinculos, efeitosDeStatus] = await Promise.all([
    listAdminMonsterLoot({ idMonstro: id }),
    AdventureZoneMonster.findAll({
      where: { id_monstro: id },
      include: [{ model: AdventureZone, attributes: ["id", "nome"] }],
      order: [["id_area", "ASC"]],
    }),
    MonsterStatusEffect.findAll({ where: { id_monstro: id }, order: [["status_key", "ASC"]] }),
  ]);

  const json = monstro.toJSON();
  return {
    monstro: json,
    combat_power: calcularPoderMonstro(json),
    loot,
    efeitosDeStatus,
    zonas: vinculos.map((v) => ({
      id: v.id,
      id_area: v.id_area,
      nome_zona: v.AdventureZone?.nome ?? null,
      tipo_aparicao: v.tipo_aparicao,
      peso_aparicao: v.peso_aparicao,
      nivel_jogador_minimo: v.nivel_jogador_minimo,
      ativo: v.ativo,
    })),
  };
}

module.exports = {
  listAdminZones,
  createAdminZone,
  updateAdminZone,
  listAdminMonsters,
  createAdminMonster,
  updateAdminMonster,
  duplicateAdminMonster,
  deleteAdminMonster,
  listAdminZoneMonsters,
  createAdminZoneMonster,
  updateAdminZoneMonster,
  listAdminMonsterLoot,
  createAdminMonsterLoot,
  updateAdminMonsterLoot,
  deleteAdminMonsterLoot,
  listExpeditionRegions,
  sincronizarRosterZona,
  sincronizarLootMonstro,
  sincronizarStatusEffectsMonstro,
  getAdminMonsterDetail,
};
