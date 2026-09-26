// Painel Administrativo — Sistema de Proezas Únicas §19. Cobre: CRUD
// de Proeza (criar com Power novo/existente, editar, duplicar sem
// copiar claim, desativar exige motivo quando já conquistada), Legados
// (upsert UniquePowerEffect + jogadoresAfetados), Triggers (schema
// read-only + validação estrutural), permissões separadas
// (uniquefeats.manage vs uniquefeats.repair — SÓ SuperAdmin), e
// Histórico/Reparo (revogar remove o grant mecânico; transferir move
// claim+CharacterAbilities+Achievement/Title).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const AdminRole = require("../src/models/AdminRole");
const Power = require("../src/models/Power");
const UniqueFeat = require("../src/models/UniqueFeat");
const UniqueFeatClaim = require("../src/models/UniqueFeatClaim");
const UniquePowerEffect = require("../src/models/UniquePowerEffect");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const Achievement = require("../src/models/Achievement");
const CharacterAchievement = require("../src/models/CharacterAchievement");

const adminRoleService = require("../src/services/adminRoleService");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");
const adminUniqueFeatService = require("../src/services/adminUniqueFeatService");
const uniqueFeatService = require("../src/services/uniqueFeatService");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

async function criarUsuarioAdmin() {
  const chave = sufixo();
  return User.create({
    username: `admin_proezas_${chave}`,
    email: `admin_proezas_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

function reqRes({ userId } = {}) {
  let statusCode = null;
  const req = { user: userId ? { id: userId } : undefined, body: {}, query: {}, ip: "127.0.0.1", get: () => "teste-agent" };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json() {
      return this;
    },
  };
  return { req, res, statusCode: () => statusCode };
}

function payloadFeat(overrides = {}) {
  return {
    nome: `Proeza Admin ${sufixo()}`,
    key: `admin_teste_${sufixo()}`,
    descricao_publica: "Lore pública de teste.",
    descricao_secreta_admin: "Vencer um combate de teste.",
    trigger_key: "ADVENTURE_VICTORY",
    trigger_config: { zoneId: -999999 },
    novo_power: {
      nome: `Legado Admin ${sufixo()}`,
      descricao: "Legado de teste.",
      tipo_poder: "Ativo",
      custo_mana: 10,
      escala_atributo: "Forca",
      valor_escala: 1,
    },
    ...overrides,
  };
}

// --------------------------------------------------------- 19.1 PROEZAS

testeComBanco("createAdminUniqueFeat cria Power (acquisition_scope=UNIQUE_FEAT) + Proeza juntos, inativa por padrão", async () => {
  const admin = await criarUsuarioAdmin();
  const feat = await adminUniqueFeatService.createAdminUniqueFeat(payloadFeat(), { idAdmin: admin.id });

  assert.equal(feat.ativa, false, "Proeza nasce sempre inativa (mesmo padrão de Blueprint da Forja)");
  const power = await Power.findByPk(feat.id_power_reward);
  assert.ok(power, "Power devia ter sido criado junto");
  assert.equal(power.acquisition_scope, "UNIQUE_FEAT");
});

testeComBanco("createAdminUniqueFeat rejeita reaproveitar um Power que NÃO é UNIQUE_FEAT", async () => {
  const admin = await criarUsuarioAdmin();
  const powerNormal = await Power.create({
    nome: `Power Normal ${sufixo()}`,
    descricao: "d",
    tipo_poder: "Ativo",
    custo_mana: 5,
    escala_atributo: "Forca",
    valor_escala: 1,
  });
  await assert.rejects(
    () => adminUniqueFeatService.createAdminUniqueFeat(payloadFeat({ id_power_reward: powerNormal.id, novo_power: undefined }), { idAdmin: admin.id }),
    /acquisition_scope=UNIQUE_FEAT/,
  );
});

testeComBanco("createAdminUniqueFeat rejeita trigger_config com campo fora do schema do trigger_key", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => adminUniqueFeatService.createAdminUniqueFeat(payloadFeat({ trigger_config: { campoInventado: 1 } }), { idAdmin: admin.id }),
    /não é permitido/,
  );
});

testeComBanco("updateAdminUniqueFeat edita metadados sem tocar a claim já existente", async () => {
  const admin = await criarUsuarioAdmin();
  const feat = await adminUniqueFeatService.createAdminUniqueFeat(payloadFeat(), { idAdmin: admin.id });
  await UniqueFeat.update({ ativa: true }, { where: { id: feat.id } });

  const { personagem } = await criarPersonagem();
  await UniqueFeatClaim.create({
    id_unique_feat: feat.id,
    id_personagem: personagem.id,
    character_name_snapshot: personagem.nome,
    claimed_at: new Date(),
    trigger_key: "ADVENTURE_VICTORY",
    trigger_snapshot: {},
  });

  const atualizada = await adminUniqueFeatService.updateAdminUniqueFeat(feat.id, { descricao_publica: "Nova lore." }, { idAdmin: admin.id });
  assert.equal(atualizada.descricao_publica, "Nova lore.");

  const claimAindaLa = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.ok(claimAindaLa, "editar a Proeza nunca deve remover a claim existente");
  assert.equal(claimAindaLa.id_personagem, personagem.id, "editar nunca troca o vencedor");
});

testeComBanco("duplicateAdminUniqueFeat gera key nova, nasce inativa e NUNCA copia a claim", async () => {
  const admin = await criarUsuarioAdmin();
  const feat = await adminUniqueFeatService.createAdminUniqueFeat(payloadFeat(), { idAdmin: admin.id });
  await UniqueFeat.update({ ativa: true }, { where: { id: feat.id } });
  const { personagem } = await criarPersonagem();
  await UniqueFeatClaim.create({
    id_unique_feat: feat.id,
    id_personagem: personagem.id,
    character_name_snapshot: personagem.nome,
    claimed_at: new Date(),
    trigger_key: "ADVENTURE_VICTORY",
    trigger_snapshot: {},
  });

  const copia = await adminUniqueFeatService.duplicateAdminUniqueFeat(feat.id, { idAdmin: admin.id });
  assert.notEqual(copia.key, feat.key);
  assert.equal(copia.ativa, false);
  const claimDaCopia = await UniqueFeatClaim.findOne({ where: { id_unique_feat: copia.id } });
  assert.equal(claimDaCopia, null, "cópia nunca nasce com claim");
});

testeComBanco("setAtivoAdminUniqueFeat exige motivo pra desativar uma Proeza JÁ conquistada (nunca pra uma sem claim)", async () => {
  const admin = await criarUsuarioAdmin();
  const feat = await adminUniqueFeatService.createAdminUniqueFeat(payloadFeat(), { idAdmin: admin.id });
  await UniqueFeat.update({ ativa: true }, { where: { id: feat.id } });

  // Sem claim: desativa livremente, sem motivo.
  await adminUniqueFeatService.setAtivoAdminUniqueFeat(feat.id, false, { idAdmin: admin.id });
  await adminUniqueFeatService.setAtivoAdminUniqueFeat(feat.id, true, { idAdmin: admin.id });

  const { personagem } = await criarPersonagem();
  await UniqueFeatClaim.create({
    id_unique_feat: feat.id,
    id_personagem: personagem.id,
    character_name_snapshot: personagem.nome,
    claimed_at: new Date(),
    trigger_key: "ADVENTURE_VICTORY",
    trigger_snapshot: {},
  });

  await assert.rejects(
    () => adminUniqueFeatService.setAtivoAdminUniqueFeat(feat.id, false, { idAdmin: admin.id }),
    /motivo é obrigatório/,
  );
  const desativada = await adminUniqueFeatService.setAtivoAdminUniqueFeat(feat.id, false, { idAdmin: admin.id, motivo: "Correção de balanceamento." });
  assert.equal(desativada.ativa, false);

  const aindaExiste = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.ok(aindaExiste, "desativar NUNCA remove a claim já concedida (§21)");
});

// --------------------------------------------------------- 19.2 LEGADOS

testeComBanco("upsertUniquePowerEffect cria/atualiza o efeito e reporta jogadoresAfetados", async () => {
  const admin = await criarUsuarioAdmin();
  const feat = await adminUniqueFeatService.createAdminUniqueFeat(payloadFeat(), { idAdmin: admin.id });

  const { power: powerAntes, efeito: efeitoAntes, jogadoresAfetados: afetadosAntes } = await adminUniqueFeatService.getUniquePowerEffect(feat.id_power_reward);
  assert.equal(powerAntes.acquisition_scope, "UNIQUE_FEAT");
  assert.equal(efeitoAntes, null, "ainda não existe UniquePowerEffect pra esse Power");
  assert.equal(afetadosAntes, 0);

  const efeito = await adminUniqueFeatService.upsertUniquePowerEffect(
    feat.id_power_reward,
    { effect_key: "olhar_do_abismo", config: { escala: 1.5 }, allow_ranked: false },
    { idAdmin: admin.id },
  );
  assert.equal(efeito.effect_key, "olhar_do_abismo");
  assert.equal(efeito.allow_ranked, false);
  assert.equal(efeito.allow_pve, true, "default preservado quando não enviado");

  const salvo = await UniquePowerEffect.findByPk(feat.id_power_reward);
  assert.equal(salvo.config.escala, 1.5);
});

testeComBanco("getUniquePowerEffect rejeita Power que não é Legado", async () => {
  const powerNormal = await Power.create({
    nome: `Power Comum ${sufixo()}`,
    descricao: "d",
    tipo_poder: "Passivo",
    custo_mana: 0,
    escala_atributo: "Vitalidade",
    valor_escala: 1,
  });
  await assert.rejects(() => adminUniqueFeatService.getUniquePowerEffect(powerNormal.id), /não é um Legado/);
});

// -------------------------------------------------------- 19.3 TRIGGERS

testeComBanco("listarTriggerSchemas/obterTriggerSchema expõem o schema, nunca aceitam nada pra persistir", async () => {
  const lista = adminUniqueFeatService.listarTriggerSchemas();
  assert.ok(lista.some((t) => t.trigger_key === "FISH_CAUGHT"));
  const um = adminUniqueFeatService.obterTriggerSchema("FISH_CAUGHT");
  assert.ok(um.schema.speciesId);
});

testeComBanco("validarConfiguracaoDeTrigger aceita config válida e rejeita campo/tipo inválido", async () => {
  assert.deepEqual(adminUniqueFeatService.validarConfiguracaoDeTrigger("ADVENTURE_VICTORY", { zoneId: 1 }), { valido: true });
  assert.throws(() => adminUniqueFeatService.validarConfiguracaoDeTrigger("ADVENTURE_VICTORY", { zoneId: "não é número" }));
  assert.throws(() => adminUniqueFeatService.validarConfiguracaoDeTrigger("ADVENTURE_VICTORY", { campoInexistente: 1 }));
});

// ---------------------------------------------- PERMISSÕES (§19.5)

testeComBanco("uniquefeats.manage e uniquefeats.repair são permissões SEPARADAS — Conteudo nunca tem repair", async () => {
  const admin = await criarUsuarioAdmin();
  const roleConteudo = await AdminRole.findOne({ where: { nome: "Conteudo" } });
  await adminRoleService.assignRole(admin.id, roleConteudo.id, { idAdmin: admin.id });

  const podeGerenciar = requireAdminPermission("uniquefeats.manage");
  const podeReparar = requireAdminPermission("uniquefeats.repair");

  const chamadaGerenciar = reqRes({ userId: admin.id });
  let liberouGerenciar = false;
  await podeGerenciar(chamadaGerenciar.req, chamadaGerenciar.res, () => {
    liberouGerenciar = true;
  });
  assert.equal(liberouGerenciar, true, "Conteudo tem uniquefeats.manage");

  const chamadaReparar = reqRes({ userId: admin.id });
  let liberouReparar = false;
  await podeReparar(chamadaReparar.req, chamadaReparar.res, () => {
    liberouReparar = true;
  });
  assert.equal(liberouReparar, false, "Conteudo NUNCA tem uniquefeats.repair");
  assert.equal(chamadaReparar.statusCode(), 403);
});

testeComBanco("SuperAdmin tem uniquefeats.repair", async () => {
  const admin = await criarUsuarioAdmin();
  const roleSuperAdmin = await AdminRole.findOne({ where: { nome: "SuperAdmin" } });
  await adminRoleService.assignRole(admin.id, roleSuperAdmin.id, { idAdmin: admin.id });

  const podeReparar = requireAdminPermission("uniquefeats.repair");
  const chamada = reqRes({ userId: admin.id });
  let liberou = false;
  await podeReparar(chamada.req, chamada.res, () => {
    liberou = true;
  });
  assert.equal(liberou, true);
});

// -------------------------------------------------- 19.4 HISTÓRICO/REPARO

async function criarFeatComClaim(admin, personagem) {
  const feat = await adminUniqueFeatService.createAdminUniqueFeat(payloadFeat(), { idAdmin: admin.id });
  await UniqueFeat.update({ ativa: true }, { where: { id: feat.id } });
  // Concede via o fluxo REAL (uniqueFeatService.check), nunca um INSERT
  // manual de claim — prova que o grant fica no shape certo antes do
  // reparo mexer nele.
  await sequelize.transaction(async (transaction) => {
    await uniqueFeatService.check(
      "ADVENTURE_VICTORY",
      { zoneId: -999999 },
      { transaction, characterId: personagem.id, sourceEventId: `teste-admin-${sufixo()}` },
    );
  });
  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  return { feat: await UniqueFeat.findByPk(feat.id), claim };
}

testeComBanco("revogarClaim exige motivo, marca REVOKED e remove o CharacterAbilities do Legado", async () => {
  const admin = await criarUsuarioAdmin();
  const { personagem } = await criarPersonagem();
  const { feat, claim } = await criarFeatComClaim(admin, personagem);

  await assert.rejects(() => adminUniqueFeatService.revogarClaim(claim.id, { idAdmin: admin.id }), /motivo é obrigatório/);

  const revogada = await adminUniqueFeatService.revogarClaim(claim.id, { motivo: "Exploit comprovado.", idAdmin: admin.id });
  assert.equal(revogada.status, "REVOKED");
  assert.equal(revogada.repair_metadata.motivo, "Exploit comprovado.");

  const ability = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: feat.id_power_reward } });
  assert.equal(ability, null, "grant mecânico devia ter sido removido");

  // A linha continua existindo (histórico) — nunca some.
  const aindaExiste = await UniqueFeatClaim.findByPk(claim.id);
  assert.ok(aindaExiste);
});

testeComBanco("revogarClaim rejeita revogar uma claim já revogada", async () => {
  const admin = await criarUsuarioAdmin();
  const { personagem } = await criarPersonagem();
  const { claim } = await criarFeatComClaim(admin, personagem);
  await adminUniqueFeatService.revogarClaim(claim.id, { motivo: "primeira revogação", idAdmin: admin.id });
  await assert.rejects(
    () => adminUniqueFeatService.revogarClaim(claim.id, { motivo: "segunda tentativa", idAdmin: admin.id }),
    /já está revogada/,
  );
});

testeComBanco("transferirClaim move claim + CharacterAbilities + Achievement pro novo personagem", async () => {
  const admin = await criarUsuarioAdmin();
  const { personagem: antigo } = await criarPersonagem();
  const { personagem: novo } = await criarPersonagem();
  const achievement = await Achievement.create({
    key: `ach_teste_${sufixo()}`,
    nome: "Conquista de teste",
    descricao: "d",
    categoria: "Geral",
  });

  const feat = await adminUniqueFeatService.createAdminUniqueFeat(
    payloadFeat({ id_achievement_reward: achievement.id }),
    { idAdmin: admin.id },
  );
  await UniqueFeat.update({ ativa: true, id_achievement_reward: achievement.id }, { where: { id: feat.id } });

  await sequelize.transaction(async (transaction) => {
    await uniqueFeatService.check(
      "ADVENTURE_VICTORY",
      { zoneId: -999999 },
      { transaction, characterId: antigo.id, sourceEventId: `teste-transfer-${sufixo()}` },
    );
  });
  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });

  await assert.rejects(
    () => adminUniqueFeatService.transferirClaim(claim.id, { idPersonagemNovo: novo.id, idAdmin: admin.id }),
    /motivo é obrigatório/,
  );

  const transferida = await adminUniqueFeatService.transferirClaim(claim.id, {
    idPersonagemNovo: novo.id,
    motivo: "Reparo de bug de concessão.",
    idAdmin: admin.id,
  });
  assert.equal(transferida.id_personagem, novo.id);
  assert.equal(transferida.character_name_snapshot, novo.nome);

  const abilityAntigo = await CharacterAbilities.findOne({ where: { id_personagem: antigo.id, id_power: feat.id_power_reward } });
  assert.equal(abilityAntigo, null, "personagem antigo perde o grant mecânico");
  const abilityNovo = await CharacterAbilities.findOne({ where: { id_personagem: novo.id, id_power: feat.id_power_reward } });
  assert.ok(abilityNovo, "novo personagem recebe o grant mecânico");
  assert.equal(abilityNovo.is_active, false);
  assert.equal(abilityNovo.nivel_habilidade, 1);

  const achAntigo = await CharacterAchievement.findOne({ where: { id_personagem: antigo.id, id_achievement: achievement.id } });
  assert.equal(achAntigo, null);
  const achNovo = await CharacterAchievement.findOne({ where: { id_personagem: novo.id, id_achievement: achievement.id } });
  assert.ok(achNovo);
});

testeComBanco("transferirClaim rejeita transferir uma claim REVOKED", async () => {
  const admin = await criarUsuarioAdmin();
  const { personagem: antigo } = await criarPersonagem();
  const { personagem: novo } = await criarPersonagem();
  const { claim } = await criarFeatComClaim(admin, antigo);
  await adminUniqueFeatService.revogarClaim(claim.id, { motivo: "teste", idAdmin: admin.id });

  await assert.rejects(
    () => adminUniqueFeatService.transferirClaim(claim.id, { idPersonagemNovo: novo.id, motivo: "tentativa inválida", idAdmin: admin.id }),
    /Só é possível transferir uma claim VALID/,
  );
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
