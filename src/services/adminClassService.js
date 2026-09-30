// Painel Administrativo — Classes V2 Fase 2 (§3/§5/§8/§9/§10/§11 do
// documento). CRUD de identidade/gameplay de Classe, árvore de evolução
// (caminhos em 2 estágios), requisitos/habilidades/efeitos genéricos, +
// validador de integridade e simulador de personagem evoluído. Nunca
// duplica lógica de runtime: o cálculo de bônus continua 100% em
// classEvolutionBonusService/classEvolutionEffectService/
// classEvolutionRequirementService (mesma fonte usada pelo jogador de
// verdade) — isto só gerencia o catálogo e roda o MESMO cálculo em modo
// leitura pro simulador.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Class = require("../models/Class");
const ClassEvolutionPath = require("../models/ClassEvolutionPath");
const ClassEvolutionRequirement = require("../models/ClassEvolutionRequirement");
const ClassEvolutionAbility = require("../models/ClassEvolutionAbility");
const ClassEvolutionEffect = require("../models/ClassEvolutionEffect");
const CharacterClassEvolution = require("../models/CharacterClassEvolution");
const Character = require("../models/Character");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const Achievement = require("../models/Achievement");
const AdventureMonster = require("../models/AdventureMonster");
const { RANKS_AVENTUREIRO } = require("../config/adventureGuildConfig");
const { avaliarUmRequisito } = require("./classEvolutionRequirementService");
const { EFFECT_KEYS_IMPLEMENTADAS, validarEffectKeyImplementada } = require("./classEvolutionEffectService");
const { registrarAcao } = require("./adminAuditService");
require("../models/associations");

const ATRIBUTOS_VALIDOS = ["Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"];
const TIPOS_REQUISITO = ["LEVEL", "GOLD", "ITEM", "MONSTER_KILL", "ADVENTURE_GUILD_RANK", "ACHIEVEMENT", "REPUTATION", "QUEST"];
const EFFECT_KEYS_CATALOGO = [
  "RAGE_STACK",
  "LIFESTEAL",
  "LOW_HP_DAMAGE",
  "DAMAGE_REDUCTION",
  "MANA_COST_REDUCTION",
  "COOLDOWN_REDUCTION",
  "CRITICAL_CHANCE",
  "CRITICAL_DAMAGE",
  "DODGE_BONUS",
  "HEALING_BONUS",
  "SHIELD_ON_CAST",
];

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

// Traduz violação de FK (Postgres) num 409 legível — cobre os casos em
// que o próprio banco já protege a integridade (excluir um caminho
// ainda referenciado por personagens evoluídos ou por um caminho filho),
// em vez de deixar estourar como 500 genérico.
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

// ============================================================ Classes ==
const CAMPOS_CLASSE = [
  "descricao",
  "imagem_url",
  "multiplicador_vida_por_nivel",
  "multiplicador_mana_por_nivel",
  "multiplicador_dano_fisico",
  "multiplicador_dano_magico",
  "slug",
  "icone_url",
  "banner_url",
  "ativo",
  "disponivel_criacao",
  "papel",
  "atributo_principal",
  "atributo_secundario",
  "ordem_exibicao",
];

async function listarClasses() {
  const classes = await Class.findAll({ order: [["ordem_exibicao", "ASC"], ["nome", "ASC"]] });
  const contagens = await ClassEvolutionPath.findAll({
    attributes: ["id_classe", "estagio", [sequelize.fn("COUNT", sequelize.col("id")), "total"]],
    group: ["id_classe", "estagio"],
    raw: true,
  });
  const contagemPorClasse = new Map();
  for (const linha of contagens) {
    const atual = contagemPorClasse.get(linha.id_classe) ?? { estagio1: 0, estagio2: 0 };
    if (Number(linha.estagio) === 1) atual.estagio1 = Number(linha.total);
    else if (Number(linha.estagio) === 2) atual.estagio2 = Number(linha.total);
    contagemPorClasse.set(linha.id_classe, atual);
  }
  return classes.map((c) => ({
    ...c.toJSON(),
    total_caminhos_estagio1: contagemPorClasse.get(c.id)?.estagio1 ?? 0,
    total_caminhos_estagio2: contagemPorClasse.get(c.id)?.estagio2 ?? 0,
  }));
}

async function buscarClasseComArvore(idClasse) {
  const classe = await Class.findByPk(idClasse);
  if (!classe) throw erro("Classe não encontrada.", 404);

  const caminhos = await ClassEvolutionPath.findAll({
    where: { id_classe: idClasse },
    order: [["estagio", "ASC"], ["ordem", "ASC"]],
    include: [
      { model: ClassEvolutionRequirement, as: "requisitos" },
      { model: ClassEvolutionAbility, as: "habilidadesConcedidas", include: [{ model: Power, as: "power", attributes: ["id", "nome", "tipo_poder", "acquisition_scope"] }] },
      { model: ClassEvolutionEffect, as: "efeitos" },
    ],
  });

  // Requisitos ITEM só guardam reference_id — resolve o nome em lote
  // pro Admin não precisar decorar/consultar ID (mesmo padrão de
  // adminAlchemyService.anexarItensResolvidos).
  const Item = require("../models/Item");
  const idsItens = new Set();
  for (const caminho of caminhos) {
    for (const req of caminho.requisitos ?? []) {
      if (req.tipo === "ITEM" && req.reference_id) idsItens.add(req.reference_id);
    }
  }
  const itens = idsItens.size ? await Item.findAll({ where: { id: [...idsItens] }, attributes: ["id", "nome", "imagem_url"] }) : [];
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const caminhosComItens = caminhos.map((caminho) => ({
    ...caminho.toJSON(),
    requisitos: (caminho.requisitos ?? []).map((req) => ({
      ...req.toJSON(),
      item: req.tipo === "ITEM" && req.reference_id ? (itemPorId.get(req.reference_id) ?? null) : null,
    })),
  }));

  return { classe, caminhos: caminhosComItens };
}

async function atualizarClasse(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_CLASSE);

  if (dados.atributo_principal && !ATRIBUTOS_VALIDOS.includes(dados.atributo_principal)) {
    throw erro(`atributo_principal precisa ser um de: ${ATRIBUTOS_VALIDOS.join(", ")}.`);
  }
  if (dados.atributo_secundario && !ATRIBUTOS_VALIDOS.includes(dados.atributo_secundario)) {
    throw erro(`atributo_secundario precisa ser um de: ${ATRIBUTOS_VALIDOS.join(", ")}.`);
  }
  for (const campo of ["multiplicador_vida_por_nivel", "multiplicador_mana_por_nivel", "multiplicador_dano_fisico", "multiplicador_dano_magico"]) {
    if (dados[campo] !== undefined && !(dados[campo] > 0)) {
      throw erro(`${campo} precisa ser maior que zero.`);
    }
  }
  if (dados.slug !== undefined && dados.slug !== null && !/^[a-z0-9-]+$/.test(dados.slug)) {
    throw erro("slug só pode ter letras minúsculas, números e hífen.");
  }

  return sequelize.transaction(async (transaction) => {
    const classe = await Class.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!classe) throw erro("Classe não encontrada.", 404);
    const antes = classe.toJSON();

    if (dados.slug) {
      const conflito = await Class.findOne({ where: { slug: dados.slug, id: { [Op.ne]: id } }, transaction });
      if (conflito) throw erro(`Já existe uma classe com o slug "${dados.slug}".`, 409);
    }

    await classe.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "Class",
      idEntidade: classe.id,
      dadosAntes: antes,
      dadosDepois: classe.toJSON(),
      req,
      transaction,
    });
    return classe;
  });
}

// =============================================== ClassEvolutionPath ====
const CAMPOS_CAMINHO = [
  "slug",
  "nome",
  "descricao",
  "estagio",
  "id_evolucao_pai",
  "ativo",
  "icone_url",
  "imagem_url",
  "bonus_forca",
  "bonus_vitalidade",
  "bonus_agilidade",
  "bonus_inteligencia",
  "bonus_velocidade",
  "ordem",
];

function validarSlugCaminho(slug) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw erro("slug do caminho é obrigatório e só pode ter letras minúsculas, números e hífen.");
  }
}

async function criarCaminho(idClasse, payload, { idAdmin, req }) {
  const classe = await Class.findByPk(idClasse);
  if (!classe) throw erro("Classe não encontrada.", 404);

  const dados = somenteCampos(payload, CAMPOS_CAMINHO);
  dados.id_classe = Number(idClasse);
  dados.estagio = Number(dados.estagio) || 1;
  if (!dados.nome || !dados.descricao) throw erro("nome e descricao são obrigatórios.");
  validarSlugCaminho(dados.slug);
  if (dados.estagio < 1) throw erro("estagio precisa ser >= 1.");

  return sequelize.transaction(async (transaction) => {
    if (dados.estagio > 1) {
      if (!dados.id_evolucao_pai) {
        throw erro(`Caminho de estágio ${dados.estagio} precisa de id_evolucao_pai.`);
      }
      const pai = await ClassEvolutionPath.findByPk(dados.id_evolucao_pai, { transaction });
      if (!pai || pai.id_classe !== dados.id_classe) {
        throw erro("id_evolucao_pai precisa ser um caminho existente da MESMA classe.");
      }
      if (pai.estagio !== dados.estagio - 1) {
        throw erro(`id_evolucao_pai precisa ser do estágio ${dados.estagio - 1} (linhagem §5.2).`);
      }
    } else if (dados.id_evolucao_pai) {
      throw erro("Caminho de estágio 1 não pode ter id_evolucao_pai.");
    }

    const conflito = await ClassEvolutionPath.findOne({ where: { slug: dados.slug }, transaction });
    if (conflito) throw erro(`Já existe um caminho com o slug "${dados.slug}".`, 409);

    const caminho = await ClassEvolutionPath.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "ClassEvolutionPath",
      idEntidade: caminho.id,
      dadosDepois: caminho.toJSON(),
      req,
      transaction,
    });
    return caminho;
  });
}

async function atualizarCaminho(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_CAMINHO.filter((c) => c !== "estagio" && c !== "id_evolucao_pai"));
  if (dados.slug !== undefined) validarSlugCaminho(dados.slug);

  return sequelize.transaction(async (transaction) => {
    const caminho = await ClassEvolutionPath.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!caminho) throw erro("Caminho não encontrado.", 404);
    const antes = caminho.toJSON();

    // estagio e id_evolucao_pai são imutáveis depois de criados —
    // mudar a linhagem de um caminho que personagens já podem ter
    // adquirido corromperia CharacterClassEvolution retroativamente
    // (§5.2/§24 "nunca reescreve histórico já concedido"). Quem precisa
    // reestruturar a árvore cria um caminho novo e desativa o antigo.
    if (payload.estagio !== undefined && Number(payload.estagio) !== caminho.estagio) {
      throw erro("estagio não pode ser alterado depois de criado — crie um novo caminho.");
    }
    if (payload.id_evolucao_pai !== undefined && payload.id_evolucao_pai !== caminho.id_evolucao_pai) {
      throw erro("id_evolucao_pai não pode ser alterado depois de criado — crie um novo caminho.");
    }

    if (dados.slug) {
      const conflito = await ClassEvolutionPath.findOne({ where: { slug: dados.slug, id: { [Op.ne]: id } }, transaction });
      if (conflito) throw erro(`Já existe um caminho com o slug "${dados.slug}".`, 409);
    }

    await caminho.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "ClassEvolutionPath",
      idEntidade: caminho.id,
      dadosAntes: antes,
      dadosDepois: caminho.toJSON(),
      req,
      transaction,
    });
    return caminho;
  });
}

// force=true desfaz a vinculação de qualquer personagem que já tenha
// evoluído pra este caminho antes de excluir (histórico
// CharacterClassEvolution, ponteiro legado Character.id_evolucao_classe
// e os poderes que vieram só daqui via ClassEvolutionAbility) — usado
// pra limpar caminhos de teste sem deixar personagem "preso" numa
// evolução que não existe mais. Sem force, mantém a proteção original
// (bloqueia com mensagem pra desativar em vez de excluir). Um caminho
// filho de estágio 2 ainda bloqueia a exclusão mesmo com force — isso
// exige apagar a linhagem de baixo pra cima, de propósito.
async function excluirCaminho(id, { idAdmin, req, force = false } = {}) {
  return sequelize.transaction(async (transaction) => {
    const caminho = await ClassEvolutionPath.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!caminho) throw erro("Caminho não encontrado.", 404);
    const antes = caminho.toJSON();

    let personagensDesvinculados = 0;
    if (force) {
      const evolucoes = await CharacterClassEvolution.findAll({
        where: { id_evolucao: id },
        transaction,
      });
      if (evolucoes.length > 0) {
        const idsPersonagens = evolucoes.map((e) => e.id_personagem);
        const idsPoderesDoCaminho = (
          await ClassEvolutionAbility.findAll({ where: { id_evolucao: id }, transaction })
        ).map((v) => v.id_power);

        if (idsPoderesDoCaminho.length > 0) {
          await CharacterAbilities.destroy({
            where: { id_personagem: idsPersonagens, id_power: idsPoderesDoCaminho },
            transaction,
          });
        }
        await Character.update(
          { id_evolucao_classe: null },
          { where: { id: idsPersonagens, id_evolucao_classe: id }, transaction },
        );
        await CharacterClassEvolution.destroy({ where: { id_evolucao: id }, transaction });
        personagensDesvinculados = idsPersonagens.length;
      }
    }

    await comTraducaoDeFk(
      () => caminho.destroy({ transaction }),
      "Esse caminho não pode ser excluído: ainda é referenciado por um caminho filho de estágio 2 (exclua o filho primeiro) — ou, se for por personagem já evoluído, marque a opção de forçar exclusão.",
    );

    await registrarAcao({
      idAdmin,
      acao: "excluir",
      entidade: "ClassEvolutionPath",
      idEntidade: id,
      dadosAntes: antes,
      dadosDepois: force ? { personagensDesvinculados } : undefined,
      req,
      transaction,
    });
    return { id: Number(id), personagensDesvinculados };
  });
}

// ===================================================== Requirements ====
async function criarRequisito(idEvolucao, payload, { idAdmin, req }) {
  const caminho = await ClassEvolutionPath.findByPk(idEvolucao);
  if (!caminho) throw erro("Caminho de evolução não encontrado.", 404);

  const dados = somenteCampos(payload, ["tipo", "quantidade", "reference_id", "reference_key", "config", "ordem"]);
  await validarRequisitoPayload(dados);
  dados.id_evolucao = Number(idEvolucao);

  return sequelize.transaction(async (transaction) => {
    const requisito = await ClassEvolutionRequirement.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "ClassEvolutionRequirement", idEntidade: requisito.id, dadosDepois: requisito.toJSON(), req, transaction });
    return requisito;
  });
}

async function atualizarRequisito(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["tipo", "quantidade", "reference_id", "reference_key", "config", "ordem"]);
  return sequelize.transaction(async (transaction) => {
    const requisito = await ClassEvolutionRequirement.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!requisito) throw erro("Requisito não encontrado.", 404);
    const antes = requisito.toJSON();
    const mesclado = { ...antes, ...dados };
    await validarRequisitoPayload(mesclado);
    await requisito.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "ClassEvolutionRequirement", idEntidade: requisito.id, dadosAntes: antes, dadosDepois: requisito.toJSON(), req, transaction });
    return requisito;
  });
}

async function excluirRequisito(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const requisito = await ClassEvolutionRequirement.findByPk(id, { transaction });
    if (!requisito) throw erro("Requisito não encontrado.", 404);
    await requisito.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "ClassEvolutionRequirement", idEntidade: id, dadosAntes: requisito.toJSON(), req, transaction });
    return { id: Number(id) };
  });
}

async function validarRequisitoPayload(dados) {
  if (!TIPOS_REQUISITO.includes(dados.tipo)) {
    throw erro(`tipo precisa ser um de: ${TIPOS_REQUISITO.join(", ")}.`);
  }
  if (dados.tipo === "REPUTATION" || dados.tipo === "QUEST") {
    throw erro(`Requisito do tipo ${dados.tipo} ainda não é avaliado pelo jogo (nenhum sistema genérico modelado) — não pode ser cadastrado ainda.`);
  }
  if (dados.quantidade !== undefined && dados.quantidade < 1) {
    throw erro("quantidade precisa ser >= 1.");
  }
  if (dados.tipo === "ITEM") {
    if (!dados.reference_id) throw erro("Requisito de ITEM precisa de reference_id (id do item).");
    const Item = require("../models/Item");
    const item = await Item.findByPk(dados.reference_id);
    if (!item) throw erro("Item de reference_id não encontrado.", 404);
  }
  if (dados.tipo === "MONSTER_KILL") {
    if (!dados.reference_key) throw erro("Requisito de MONSTER_KILL precisa de reference_key (nome do monstro).");
    const monstro = await AdventureMonster.findOne({ where: { nome: dados.reference_key } });
    if (!monstro) throw erro(`Nenhum monstro chamado "${dados.reference_key}" encontrado no catálogo da Aventura.`, 404);
  }
  if (dados.tipo === "ADVENTURE_GUILD_RANK") {
    if (!RANKS_AVENTUREIRO.includes(dados.reference_key)) {
      throw erro(`reference_key precisa ser um rank válido: ${RANKS_AVENTUREIRO.join(", ")}.`);
    }
  }
  if (dados.tipo === "ACHIEVEMENT") {
    if (!dados.reference_key) throw erro("Requisito de ACHIEVEMENT precisa de reference_key (key da conquista).");
    const conquista = await Achievement.findOne({ where: { key: dados.reference_key } });
    if (!conquista) throw erro(`Nenhuma conquista com key "${dados.reference_key}" encontrada.`, 404);
  }
}

// ========================================================= Abilities ===
async function criarHabilidade(idEvolucao, payload, { idAdmin, req }) {
  const caminho = await ClassEvolutionPath.findByPk(idEvolucao);
  if (!caminho) throw erro("Caminho de evolução não encontrado.", 404);

  const dados = somenteCampos(payload, ["id_power", "auto_conceder", "ativar_se_houver_slot"]);
  if (!dados.id_power) throw erro("id_power é obrigatório.");

  return sequelize.transaction(async (transaction) => {
    const power = await Power.findByPk(dados.id_power, { transaction });
    if (!power) throw erro("Power não encontrado.", 404);
    if (power.acquisition_scope === "UNIQUE_FEAT") {
      throw erro(`"${power.nome}" é um poder de conquista única (UNIQUE_FEAT) — nunca pode ser concedido por evolução de classe (§9).`);
    }
    dados.id_evolucao = Number(idEvolucao);

    const habilidade = await comTraducaoDeFk(
      () => ClassEvolutionAbility.create(dados, { transaction }),
      "Esse Power já está vinculado a este caminho de evolução.",
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "ClassEvolutionAbility", idEntidade: habilidade.id, dadosDepois: habilidade.toJSON(), req, transaction });
    return habilidade;
  });
}

async function atualizarHabilidade(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["auto_conceder", "ativar_se_houver_slot"]);
  return sequelize.transaction(async (transaction) => {
    const habilidade = await ClassEvolutionAbility.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!habilidade) throw erro("Vínculo de habilidade não encontrado.", 404);
    const antes = habilidade.toJSON();
    await habilidade.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "ClassEvolutionAbility", idEntidade: habilidade.id, dadosAntes: antes, dadosDepois: habilidade.toJSON(), req, transaction });
    return habilidade;
  });
}

async function excluirHabilidade(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const habilidade = await ClassEvolutionAbility.findByPk(id, { transaction });
    if (!habilidade) throw erro("Vínculo de habilidade não encontrado.", 404);
    await habilidade.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "ClassEvolutionAbility", idEntidade: id, dadosAntes: habilidade.toJSON(), req, transaction });
    return { id: Number(id) };
  });
}

// =========================================================== Effects ===
function catalogoEfeitos() {
  return EFFECT_KEYS_CATALOGO.map((chave) => ({ effect_key: chave, implementado: EFFECT_KEYS_IMPLEMENTADAS.includes(chave) }));
}

async function criarEfeito(idEvolucao, payload, { idAdmin, req }) {
  const caminho = await ClassEvolutionPath.findByPk(idEvolucao);
  if (!caminho) throw erro("Caminho de evolução não encontrado.", 404);

  const dados = somenteCampos(payload, ["effect_key", "valor", "config", "ativo"]);
  if (!EFFECT_KEYS_CATALOGO.includes(dados.effect_key)) {
    throw erro(`effect_key precisa ser um de: ${EFFECT_KEYS_CATALOGO.join(", ")}.`);
  }
  validarEffectKeyImplementada(dados.effect_key);
  dados.id_evolucao = Number(idEvolucao);

  return sequelize.transaction(async (transaction) => {
    const efeito = await ClassEvolutionEffect.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "ClassEvolutionEffect", idEntidade: efeito.id, dadosDepois: efeito.toJSON(), req, transaction });
    return efeito;
  });
}

async function atualizarEfeito(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["valor", "config", "ativo"]);
  return sequelize.transaction(async (transaction) => {
    const efeito = await ClassEvolutionEffect.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!efeito) throw erro("Efeito não encontrado.", 404);
    const antes = efeito.toJSON();
    await efeito.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "ClassEvolutionEffect", idEntidade: efeito.id, dadosAntes: antes, dadosDepois: efeito.toJSON(), req, transaction });
    return efeito;
  });
}

async function excluirEfeito(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const efeito = await ClassEvolutionEffect.findByPk(id, { transaction });
    if (!efeito) throw erro("Efeito não encontrado.", 404);
    await efeito.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "ClassEvolutionEffect", idEntidade: id, dadosAntes: efeito.toJSON(), req, transaction });
    return { id: Number(id) };
  });
}

// ================================================== Validador (§101) ===
// Varre a árvore inteira e devolve uma lista de problemas — nunca
// corrige nada sozinho, só relata. "erro" bloqueia expectativa do
// jogador (ex.: caminho publicado sem nenhum bônus nem habilidade);
// "aviso" é uma decisão de design que pode ser proposital.
async function validarIntegridade() {
  const problemas = [];
  const classes = await Class.findAll();
  const caminhos = await ClassEvolutionPath.findAll();
  const requisitos = await ClassEvolutionRequirement.findAll();
  const habilidades = await ClassEvolutionAbility.findAll();
  const efeitos = await ClassEvolutionEffect.findAll();
  const powers = await Power.findAll({ attributes: ["id", "nome", "acquisition_scope"] });
  const powerPorId = new Map(powers.map((p) => [p.id, p]));
  const caminhoPorId = new Map(caminhos.map((c) => [c.id, c]));

  for (const classe of classes) {
    if (classe.disponivel_criacao && (!classe.papel || !classe.atributo_principal)) {
      problemas.push({ nivel: "aviso", entidade: "Class", id: classe.id, mensagem: `Classe "${classe.nome}" está disponível pra criação mas não tem papel/atributo_principal definidos.` });
    }
    if (!classe.slug) {
      problemas.push({ nivel: "aviso", entidade: "Class", id: classe.id, mensagem: `Classe "${classe.nome}" não tem slug definido.` });
    }
  }

  const slugsVistos = new Map();
  for (const caminho of caminhos) {
    if (slugsVistos.has(caminho.slug)) {
      problemas.push({ nivel: "erro", entidade: "ClassEvolutionPath", id: caminho.id, mensagem: `slug "${caminho.slug}" duplicado com o caminho #${slugsVistos.get(caminho.slug)}.` });
    }
    slugsVistos.set(caminho.slug, caminho.id);

    if (caminho.estagio > 1) {
      if (!caminho.id_evolucao_pai) {
        problemas.push({ nivel: "erro", entidade: "ClassEvolutionPath", id: caminho.id, mensagem: `Caminho "${caminho.nome}" é estágio ${caminho.estagio} mas não tem id_evolucao_pai.` });
      } else {
        const pai = caminhoPorId.get(caminho.id_evolucao_pai);
        if (!pai) {
          problemas.push({ nivel: "erro", entidade: "ClassEvolutionPath", id: caminho.id, mensagem: `id_evolucao_pai #${caminho.id_evolucao_pai} não existe.` });
        } else {
          if (pai.id_classe !== caminho.id_classe) {
            problemas.push({ nivel: "erro", entidade: "ClassEvolutionPath", id: caminho.id, mensagem: `Caminho pai #${pai.id} pertence a outra classe.` });
          }
          if (pai.estagio !== caminho.estagio - 1) {
            problemas.push({ nivel: "erro", entidade: "ClassEvolutionPath", id: caminho.id, mensagem: `Caminho pai #${pai.id} não é do estágio anterior (linhagem quebrada).` });
          }
        }
      }
    }

    if (caminho.ativo) {
      const semBonus = !caminho.bonus_forca && !caminho.bonus_vitalidade && !caminho.bonus_agilidade && !caminho.bonus_inteligencia && !caminho.bonus_velocidade;
      const semHabilidade = !habilidades.some((h) => h.id_evolucao === caminho.id);
      const semEfeito = !efeitos.some((e) => e.id_evolucao === caminho.id && e.ativo);
      if (semBonus && semHabilidade && semEfeito) {
        problemas.push({ nivel: "aviso", entidade: "ClassEvolutionPath", id: caminho.id, mensagem: `Caminho ativo "${caminho.nome}" não concede nenhum bônus, habilidade nem efeito — evoluir pra ele não muda nada.` });
      }
      if (!requisitos.some((r) => r.id_evolucao === caminho.id)) {
        problemas.push({ nivel: "aviso", entidade: "ClassEvolutionPath", id: caminho.id, mensagem: `Caminho ativo "${caminho.nome}" não tem nenhum requisito — qualquer personagem pode evoluir pra ele a qualquer momento.` });
      }
    }
  }

  for (const habilidade of habilidades) {
    const power = powerPorId.get(habilidade.id_power);
    if (!power) {
      problemas.push({ nivel: "erro", entidade: "ClassEvolutionAbility", id: habilidade.id, mensagem: `id_power #${habilidade.id_power} não existe mais.` });
    } else if (power.acquisition_scope === "UNIQUE_FEAT") {
      problemas.push({ nivel: "erro", entidade: "ClassEvolutionAbility", id: habilidade.id, mensagem: `Power "${power.nome}" é UNIQUE_FEAT — nunca deveria estar vinculado a uma evolução (nunca é concedido em runtime, mas o vínculo está inconsistente).` });
    }
  }

  for (const efeito of efeitos) {
    if (efeito.ativo && !EFFECT_KEYS_IMPLEMENTADAS.includes(efeito.effect_key)) {
      problemas.push({ nivel: "aviso", entidade: "ClassEvolutionEffect", id: efeito.id, mensagem: `effect_key "${efeito.effect_key}" está ativo mas ainda não é interpretado em combate (catálogo documentado, sem integração nesta entrega).` });
    }
  }

  for (const req of requisitos) {
    if ((req.tipo === "REPUTATION" || req.tipo === "QUEST")) {
      problemas.push({ nivel: "erro", entidade: "ClassEvolutionRequirement", id: req.id, mensagem: `Requisito tipo ${req.tipo} nunca é atendido (sem sistema genérico modelado) — ninguém consegue evoluir por este caminho.` });
    }
  }

  return { total_problemas: problemas.length, total_erros: problemas.filter((p) => p.nivel === "erro").length, problemas };
}

// =================================================== Simulador (§101) ==
// Soma os bônus de TODOS os estágios escolhidos (sem exigir um
// personagem real no banco) usando os MESMOS dados de
// ClassEvolutionPath/Effect que o jogo lê de verdade — nunca reimplementa
// a fórmula, só agrega os valores crus dos caminhos indicados.
async function simularEvolucao({ id_classe, id_caminho_estagio1, id_caminho_estagio2 }) {
  const classe = await Class.findByPk(id_classe);
  if (!classe) throw erro("Classe não encontrada.", 404);

  const idsCaminhos = [id_caminho_estagio1, id_caminho_estagio2].filter(Boolean);
  const caminhos = idsCaminhos.length
    ? await ClassEvolutionPath.findAll({
        where: { id: idsCaminhos },
        include: [{ model: ClassEvolutionEffect, as: "efeitos" }, { model: ClassEvolutionAbility, as: "habilidadesConcedidas", include: [{ model: Power, as: "power" }] }],
      })
    : [];

  for (const caminho of caminhos) {
    if (caminho.id_classe !== classe.id) {
      throw erro(`Caminho "${caminho.nome}" não pertence à classe "${classe.nome}".`);
    }
  }
  const caminho1 = caminhos.find((c) => c.id === Number(id_caminho_estagio1));
  const caminho2 = caminhos.find((c) => c.id === Number(id_caminho_estagio2));
  if (id_caminho_estagio2 && (!caminho1 || caminho2?.id_evolucao_pai !== caminho1.id)) {
    throw erro("O caminho de estágio 2 informado não é filho do caminho de estágio 1 informado.");
  }

  const bonus = { forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0, defesa: 0 };
  const habilidadesConcedidas = [];
  for (const caminho of [caminho1, caminho2].filter(Boolean)) {
    bonus.forca += caminho.bonus_forca;
    bonus.vitalidade += caminho.bonus_vitalidade;
    bonus.agilidade += caminho.bonus_agilidade;
    bonus.inteligencia += caminho.bonus_inteligencia;
    bonus.velocidade += caminho.bonus_velocidade;
    for (const efeito of caminho.efeitos ?? []) {
      if (efeito.ativo && efeito.effect_key === "DAMAGE_REDUCTION") bonus.defesa += efeito.valor;
    }
    for (const vinculo of caminho.habilidadesConcedidas ?? []) {
      if (vinculo.auto_conceder) habilidadesConcedidas.push({ id_power: vinculo.id_power, nome: vinculo.power?.nome ?? null });
    }
  }

  return {
    classe: { id: classe.id, nome: classe.nome },
    caminho_estagio1: caminho1 ? { id: caminho1.id, nome: caminho1.nome } : null,
    caminho_estagio2: caminho2 ? { id: caminho2.id, nome: caminho2.nome } : null,
    bonus_total: bonus,
    habilidades_concedidas: habilidadesConcedidas,
  };
}

module.exports = {
  listarClasses,
  buscarClasseComArvore,
  atualizarClasse,
  criarCaminho,
  atualizarCaminho,
  excluirCaminho,
  criarRequisito,
  atualizarRequisito,
  excluirRequisito,
  criarHabilidade,
  atualizarHabilidade,
  excluirHabilidade,
  catalogoEfeitos,
  criarEfeito,
  atualizarEfeito,
  excluirEfeito,
  validarIntegridade,
  simularEvolucao,
};
