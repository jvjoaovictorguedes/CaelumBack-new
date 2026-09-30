// Pedido do usuário: "Abandonar" um contrato de Rank aceito na Guilda
// dos Aventureiros, sem precisar esperar expirar (6h) — a vaga (limite
// de CONTRATOS_ATIVOS_MAX=2) precisa liberar na hora. Reaproveita o
// status "Falhou" do ENUM em vez de criar um novo valor.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const AdventureGuildMission = require("../src/models/AdventureGuildMission");
const AdventureGuildOffer = require("../src/models/AdventureGuildOffer");
const CharacterInventory = require("../src/models/CharacterInventory");
const Item = require("../src/models/Item");

const { aceitarOferta, abandonarContrato } = require("../src/services/adventureGuildContractService");
const { inicioDaJanelaAtual } = require("../src/config/adventureGuildConfig");
const { CONTRATOS_ATIVOS_MAX } = require("../src/config/adventureGuildConfig");

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

async function criarItemDeTeste() {
  return Item.create({
    nome: `Item Guilda Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 1,
    peso: 0.1,
    disponivel_loja: false,
  });
}

let proximaOrdemDeTeste = 20000 + (Date.now() % 1000000);

async function criarOfertaDeEntrega(rank, item, quantidade) {
  const missao = await AdventureGuildMission.create({
    rank,
    nome: `Entrega de Teste ${sufixo()}`,
    descricao: "Entregue os itens pedidos.",
    tipo_objetivo: "Entregar",
    id_item_alvo: item.id,
    quantidade_objetivo: quantidade,
    ativa: true,
  });
  const janelaInicio = inicioDaJanelaAtual();
  const offer = await AdventureGuildOffer.create({
    rank,
    janela_inicio: janelaInicio,
    id_mission: missao.id,
    ordem: proximaOrdemDeTeste++,
  });
  return { missao, offer };
}

testeComBanco("abandonarContrato: contrato Ativo vira Falhou e libera a vaga", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const item = await criarItemDeTeste();
  const { offer } = await criarOfertaDeEntrega("F", item, 3);

  const contrato = await sequelize.transaction((t) => aceitarOferta(personagem.id, offer.id, t));

  const abandonado = await sequelize.transaction((t) => abandonarContrato(personagem.id, contrato.id, t));
  assert.equal(abandonado.status, "Falhou");

  // Vaga liberada: dá pra aceitar CONTRATOS_ATIVOS_MAX contratos novos
  // sem esbarrar no limite, porque o abandonado não conta mais como Ativo.
  for (let i = 0; i < CONTRATOS_ATIVOS_MAX; i++) {
    const { offer: novaOferta } = await criarOfertaDeEntrega("F", item, 1);
    await assert.doesNotReject(() => sequelize.transaction((t) => aceitarOferta(personagem.id, novaOferta.id, t)));
  }
});

testeComBanco("abandonarContrato: não deixa abandonar contrato já Concluido/Resgatado ou de outro personagem", async () => {
  const { personagem: dono } = await criarPersonagem({ nivel: 10 });
  const { personagem: outro } = await criarPersonagem({ nivel: 10 });
  const item = await criarItemDeTeste();
  const { offer } = await criarOfertaDeEntrega("F", item, 3);
  await CharacterInventory.create({ id_personagem: dono.id, id_item: item.id, quantidade: 3 });

  const contrato = await sequelize.transaction((t) => aceitarOferta(dono.id, offer.id, t));

  // Personagem errado não pode abandonar o contrato de outro.
  await assert.rejects(
    () => sequelize.transaction((t) => abandonarContrato(outro.id, contrato.id, t)),
    /Contrato não encontrado/,
  );

  const { entregarItens } = require("../src/services/adventureGuildContractService");
  await sequelize.transaction((t) => entregarItens(dono.id, contrato.id, t));

  // Já Concluido — não é mais "Ativo", não pode abandonar.
  await assert.rejects(
    () => sequelize.transaction((t) => abandonarContrato(dono.id, contrato.id, t)),
    /Só é possível abandonar um contrato ativo/,
  );
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
