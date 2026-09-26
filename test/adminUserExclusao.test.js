// Bug reportado: "As contas não estão sendo excluidas pelo painel de
// admin. Está dando erro interno do servidor." — causa raiz era
// SequelizeForeignKeyConstraintError: várias tabelas que referenciam
// Characters.id ainda tinham ON DELETE NO ACTION/RESTRICT (a maioria
// do schema já usa CASCADE; um punhado ficou pra trás conforme o jogo
// crescia). CharacterAbilities e character_inventory bloqueavam
// QUALQUER personagem real (todo mundo tem pelo menos uma habilidade ou
// item). Corrigido na migration 20261204010000-fix-fk-exclusao-conta.
//
// Este arquivo prova, contra o banco real, que:
// 1) A causa raiz reportada (habilidade + item no inventário) não
//    bloqueia mais a exclusão via adminUserService.bulkDeleteUsers.
// 2) A mesma correção também desbloqueia characterController.deleteCharacter
//    (o jogador excluindo o próprio personagem sofria do mesmo bug).
// 3) unique_feat_claims usa SET NULL (nunca CASCADE) — a claim
//    SOBREVIVE à exclusão da conta, preservando a garantia de "um
//    vencedor pra sempre" (a UNIQUE em id_unique_feat continua
//    impedindo a Proeza de ser reclamada de novo).
// 4) Protações que já existiam continuam valendo: conta admin nunca é
//    excluída: líder/fundador de guilda Ativa continua bloqueando.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const adminUserService = require("../src/services/adminUserService");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const CharacterInventory = require("../src/models/CharacterInventory");
const Power = require("../src/models/Power");
const Item = require("../src/models/Item");
const Character = require("../src/models/Character");
const User = require("../src/models/User");
const Guild = require("../src/models/Guild");
const GuildMember = require("../src/models/GuildMember");
const GuildContribution = require("../src/models/GuildContribution");
const UniqueFeat = require("../src/models/UniqueFeat");
const UniqueFeatClaim = require("../src/models/UniqueFeatClaim");
const uniqueFeatService = require("../src/services/uniqueFeatService");
const Message = require("../src/models/Message");
const Tournament = require("../src/models/Tournament");
const TournamentParticipant = require("../src/models/TournamentParticipant");
const TournamentSeries = require("../src/models/TournamentSeries");
const MarketListing = require("../src/models/MarketListing");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");

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

async function criarPowerETeste() {
  return Power.create({
    nome: `Poder ${sufixo()}`,
    descricao: "Poder de teste descartável.",
    tipo_poder: "Ativo",
    custo_mana: 5,
    escala_atributo: "Forca",
    valor_escala: 1,
  });
}

async function criarItemDeTeste() {
  return Item.create({
    nome: `Item ${sufixo()}`,
    descricao: "Item de teste descartável.",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 1,
    peso: 0.1,
    disponivel_loja: false,
  });
}

testeComBanco("bulkDeleteUsers exclui conta com habilidade aprendida + item no inventário (causa raiz do bug)", async () => {
  const { usuario: admin } = await criarPersonagem({ nivel: 1, isAdmin: true });
  const { usuario, personagem } = await criarPersonagem({ nivel: 10 });

  const power = await criarPowerETeste();
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, nivel_habilidade: 1, is_active: false });

  const item = await criarItemDeTeste();
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 3 });

  const resultado = await adminUserService.bulkDeleteUsers([usuario.id], { idAdmin: admin.id, req: null });

  assert.equal(resultado.excluidos, 1, `esperava excluir 1 conta — resultado: ${JSON.stringify(resultado)}`);
  assert.equal(resultado.resultados[0].excluido, true);

  const usuarioDepois = await User.findByPk(usuario.id);
  assert.equal(usuarioDepois, null, "usuário devia ter sido excluído de verdade");
  const personagemDepois = await Character.findByPk(personagem.id);
  assert.equal(personagemDepois, null, "personagem devia ter sido excluído em cascata");
});

testeComBanco("bulkDeleteUsers exclui conta que é membro comum (não líder/fundador) com GuildContribution", async () => {
  const { usuario: admin } = await criarPersonagem({ nivel: 1, isAdmin: true });
  // Fundador/líder fica com OUTRO personagem, que não será excluído
  // neste teste — Guilds.id_fundador/id_lider ainda não passou por
  // essa correção (achado separado, fora do escopo deste bug; ver
  // adminUserService.js §"Guilds.id_lider/id_fundador").
  const { personagem: lider } = await criarPersonagem({ nivel: 10 });
  const { usuario, personagem } = await criarPersonagem({ nivel: 10 });

  const guild = await Guild.create({
    nome: `Guilda ${sufixo()}`.slice(0, 24),
    sigla: Math.random().toString(36).slice(2, 7).toUpperCase(),
    id_fundador: lider.id,
    id_lider: lider.id,
    status: "Ativa",
    nivel: 1,
    experiencia: 0,
  });
  await GuildMember.create({ id_guild: guild.id, id_personagem: personagem.id, cargo: "Membro" });
  await GuildContribution.create({ id_guild: guild.id, id_personagem: personagem.id, ouro_doado_total: 100, contribuicao_total: 10 });

  const resultado = await adminUserService.bulkDeleteUsers([usuario.id], { idAdmin: admin.id, req: null });
  assert.equal(resultado.excluidos, 1, `esperava excluir — resultado: ${JSON.stringify(resultado)}`);

  const contribuicaoDepois = await GuildContribution.findOne({ where: { id_guild: guild.id, id_personagem: personagem.id } });
  assert.equal(contribuicaoDepois, null, "GuildContribution do personagem excluído devia ter sido removida em cascata");
});

testeComBanco("conta administrativa nunca é excluída, mesmo selecionada", async () => {
  const { usuario: admin } = await criarPersonagem({ nivel: 1, isAdmin: true });
  const { usuario: outroAdmin } = await criarPersonagem({ nivel: 1, isAdmin: true });

  const resultado = await adminUserService.bulkDeleteUsers([outroAdmin.id], { idAdmin: admin.id, req: null });
  assert.equal(resultado.excluidos, 0);
  assert.match(resultado.resultados[0].motivo, /administrativa/);

  const aindaExiste = await User.findByPk(outroAdmin.id);
  assert.ok(aindaExiste, "conta admin não devia ter sido excluída");
});

testeComBanco("unique_feat_claims sobrevive à exclusão da conta (SET NULL) — Proeza continua permanentemente reclamada", async () => {
  const { usuario: admin } = await criarPersonagem({ nivel: 1, isAdmin: true });
  const { usuario, personagem } = await criarPersonagem({ nivel: 10 });

  const power = await Power.create({
    nome: `Legado ${sufixo()}`,
    descricao: "Power de teste pra Proeza Única.",
    tipo_poder: "Ativo",
    custo_mana: 10,
    escala_atributo: "Forca",
    valor_escala: 1,
    acquisition_scope: "UNIQUE_FEAT",
  });
  const feat = await UniqueFeat.create({
    key: `teste_exclusao_${sufixo()}`,
    nome: "Proeza de teste (exclusão de conta)",
    descricao_publica: "Lore pública de teste.",
    descricao_secreta_admin: "Trigger de teste.",
    trigger_key: "ADVENTURE_VICTORY",
    trigger_config: { zoneId: -424242 },
    id_power_reward: power.id,
    ativa: true,
  });

  const conquistadas = await sequelize.transaction((transaction) =>
    uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: -424242 }, { transaction, characterId: personagem.id }),
  );
  assert.equal(conquistadas.length, 1, "primeira vitória devia conquistar a Proeza");
  const claim = conquistadas[0].claim;

  const resultado = await adminUserService.bulkDeleteUsers([usuario.id], { idAdmin: admin.id, req: null });
  assert.equal(resultado.excluidos, 1, `esperava excluir — resultado: ${JSON.stringify(resultado)}`);

  const claimDepois = await UniqueFeatClaim.findByPk(claim.id);
  assert.ok(claimDepois, "claim NUNCA pode desaparecer — é a garantia de 'um vencedor pra sempre'");
  assert.equal(claimDepois.id_personagem, null, "id_personagem devia ter sido SET NULL, não CASCADE");
  assert.equal(claimDepois.character_name_snapshot, personagem.nome, "snapshot do nome preserva quem venceu, mesmo após excluir a conta");

  // A garantia central da Fase 2 continua de pé: ninguém mais consegue
  // reclamar essa Proeza, mesmo com o vencedor original já excluído.
  const { personagem: personagem2 } = await criarPersonagem({ nivel: 10 });
  const segundaTentativa = await sequelize.transaction((transaction) =>
    uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: -424242 }, { transaction, characterId: personagem2.id }),
  );
  assert.equal(segundaTentativa.length, 0, "Proeza já reclamada não pode ser reclamada de novo, mesmo com o vencedor excluído");
});

testeComBanco("characterController.deleteCharacter (exclusão pelo próprio jogador) também é desbloqueado pela mesma correção", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });

  const power = await criarPowerETeste();
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, nivel_habilidade: 1, is_active: false });
  const item = await criarItemDeTeste();
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 1 });

  const characterController = require("../src/controllers/characterController");
  let statusCode = null;
  let corpo = null;
  const req = { params: { id: personagem.id } };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };

  await characterController.deleteCharacter(req, res);
  assert.equal(statusCode, 204, `esperava 204 — resposta: ${JSON.stringify(corpo)}`);

  const personagemDepois = await Character.findByPk(personagem.id);
  assert.equal(personagemDepois, null);
});

testeComBanco("bulkDeleteUsers exclui conta que enviou e recebeu mensagens (bug reportado em produção: messages_id_remetente/destinatario_fkey)", async () => {
  const { usuario: admin } = await criarPersonagem({ nivel: 1, isAdmin: true });
  const { usuario, personagem } = await criarPersonagem({ nivel: 10 });
  const { usuario: outroUsuario } = await criarPersonagem({ nivel: 10 });

  const msgEnviada = await Message.create({ id_remetente: usuario.id, id_destinatario: outroUsuario.id, conteudo: "oi" });
  const msgRecebida = await Message.create({ id_remetente: outroUsuario.id, id_destinatario: usuario.id, conteudo: "oi de volta" });

  const resultado = await adminUserService.bulkDeleteUsers([usuario.id], { idAdmin: admin.id, req: null });
  assert.equal(resultado.excluidos, 1, `esperava excluir — resultado: ${JSON.stringify(resultado)}`);

  assert.equal(await Message.findByPk(msgEnviada.id), null, "mensagem enviada pela conta excluída também some (CASCADE)");
  assert.equal(await Message.findByPk(msgRecebida.id), null, "mensagem recebida pela conta excluída também some (CASCADE)");
  assert.equal(await Character.findByPk(personagem.id), null);
});

testeComBanco("bulkDeleteUsers exclui conta inscrita num torneio, e a série do bracket sobrevive com o slot vazio (SET NULL)", async () => {
  const { usuario: admin } = await criarPersonagem({ nivel: 1, isAdmin: true });
  const { usuario, personagem } = await criarPersonagem({ nivel: 10 });

  const torneio = await Tournament.create({
    name: `Torneio Teste ${sufixo()}`,
    starts_at: new Date(),
    created_by: admin.id,
  });
  const participante = await TournamentParticipant.create({ tournament_id: torneio.id, character_id: personagem.id });
  const serie = await TournamentSeries.create({
    tournament_id: torneio.id,
    round: "Quartas",
    participant_a_id: participante.id,
    winner_participant_id: participante.id,
  });

  const resultado = await adminUserService.bulkDeleteUsers([usuario.id], { idAdmin: admin.id, req: null });
  assert.equal(resultado.excluidos, 1, `esperava excluir — resultado: ${JSON.stringify(resultado)}`);

  assert.equal(await TournamentParticipant.findByPk(participante.id), null, "inscrição do personagem excluído some (CASCADE, id_personagem->Characters)");
  const serieDepois = await TournamentSeries.findByPk(serie.id);
  assert.ok(serieDepois, "a série (jogo do bracket) NUNCA pode desaparecer — é histórico do torneio, não do jogador");
  assert.equal(serieDepois.participant_a_id, null, "slot do participante excluído vira null (SET NULL), não bloqueia nem apaga a série");
  assert.equal(serieDepois.winner_participant_id, null);
});

testeComBanco("bulkDeleteUsers exclui conta com anúncio ATIVO no mercado (market_listings.id_instancia é RESTRICT de propósito — precisa ser limpo no código, não só na FK)", async () => {
  const { usuario: admin } = await criarPersonagem({ nivel: 1, isAdmin: true });
  const { usuario, personagem } = await criarPersonagem({ nivel: 10 });

  const item = await criarItemDeTeste();
  const instancia = await CharacterEquipmentInstance.create({
    id_personagem: personagem.id,
    id_item: item.id,
    raridade: "Comum",
    refinamento: 0,
    estado: "Mercado",
  });
  const anuncio = await MarketListing.create({
    id_personagem_vendedor: personagem.id,
    id_item: item.id,
    id_instancia: instancia.id,
    quantidade_total: 1,
    quantidade_restante: 1,
    preco_unitario: 100,
    status: "Ativo",
  });

  const resultado = await adminUserService.bulkDeleteUsers([usuario.id], { idAdmin: admin.id, req: null });
  assert.equal(resultado.excluidos, 1, `esperava excluir — resultado: ${JSON.stringify(resultado)}`);

  assert.equal(await MarketListing.findByPk(anuncio.id), null, "anúncio do personagem excluído é removido junto, não bloqueia a exclusão da instância");
  assert.equal(await CharacterEquipmentInstance.findByPk(instancia.id), null);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
