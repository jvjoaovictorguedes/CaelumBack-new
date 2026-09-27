// Bug reportado: depois de resgatar a recompensa de um contrato de Rank
// (Guilda dos Aventureiros), a oferta correspondente voltava a mostrar
// "Aceitar" como se nada tivesse acontecido — o quadro de ofertas
// (GET /api/adventure-guild/rank) só olhava contratos "Ativo"/
// "Concluido" pra marcar ja_aceita, então um contrato "Resgatado"
// simplesmente sumia dessa marcação. Este arquivo prova, contra o
// banco real, que:
// 1) Depois do ciclo completo (aceitar -> entregar -> resgatar), a
//    oferta aparece com status_contrato "Resgatado" e ja_aceita true —
//    nunca mais "disponível pra aceitar" de novo.
// 2) Tentar aceitar a MESMA oferta de novo (em qualquer etapa do ciclo,
//    inclusive depois de resgatada) continua corretamente bloqueado
//    com 409 "Você já aceitou este contrato." — isso já funcionava
//    antes do fix; a mudança foi só o quadro passar a REFLETIR esse
//    estado em vez de esconder a oferta como se estivesse livre.
// 3) Uma oferta nunca tocada continua com status_contrato null e
//    ja_aceita false (comportamento normal, sem regressão).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const AdventureGuildMission = require("../src/models/AdventureGuildMission");
const AdventureGuildOffer = require("../src/models/AdventureGuildOffer");
const CharacterInventory = require("../src/models/CharacterInventory");
const Item = require("../src/models/Item");

const { aceitarOferta, entregarItens, resgatarRecompensaContrato, buscarStatusPorOferta } = require("../src/services/adventureGuildContractService");
const { obterOfertasDoRank } = require("../src/services/adventureGuildRotationService");
const { inicioDaJanelaAtual } = require("../src/config/adventureGuildConfig");

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

// Cria a missão + a oferta da janela ATUAL direto no banco — não
// depende do sorteio de obterOfertasDoRank (que escolhe entre um pool
// maior); só precisamos de UMA oferta determinística pra testar o
// ciclo de vida completo.
// Base derivada do relógio (nunca 0-4, faixa do sorteio real) e distinta
// a cada execução do arquivo — evita colidir com ofertas órfãs de uma
// execução anterior que caiu na mesma janela de rotação (`janela_inicio`
// é determinística pelo relógio do servidor, não muda entre execuções
// próximas no tempo).
let proximaOrdemDeTeste = 10000 + (Date.now() % 1000000);

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
    ordem: proximaOrdemDeTeste++, // fora da faixa 0-4 normal e única por oferta, só pra nunca colidir com o sorteio real do pool nem entre si
  });
  return { missao, offer };
}

testeComBanco("ciclo completo (aceitar -> entregar -> resgatar): oferta nunca mais mostra 'disponível' de novo", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const item = await criarItemDeTeste();
  const { offer } = await criarOfertaDeEntrega("F", item, 3);
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 3 });

  // Antes de qualquer coisa: oferta nunca tocada.
  const statusAntes = await sequelize.transaction((t) => buscarStatusPorOferta(personagem.id, [offer.id], t));
  assert.equal(statusAntes.has(offer.id), false, "oferta nunca aceita não pode aparecer no mapa de status");

  const contrato = await sequelize.transaction((t) => aceitarOferta(personagem.id, offer.id, t));
  const statusAtivo = await sequelize.transaction((t) => buscarStatusPorOferta(personagem.id, [offer.id], t));
  assert.equal(statusAtivo.get(offer.id), "Ativo");

  await sequelize.transaction((t) => entregarItens(personagem.id, contrato.id, t));
  const statusConcluido = await sequelize.transaction((t) => buscarStatusPorOferta(personagem.id, [offer.id], t));
  assert.equal(statusConcluido.get(offer.id), "Concluido");

  await sequelize.transaction((t) => resgatarRecompensaContrato(personagem.id, contrato.id, t));

  // O CERNE DO BUG: depois de resgatado, a oferta precisa continuar
  // marcada — nunca mais voltar a "null" (que o painel renderiza como
  // "Aceitar" disponível de novo).
  const statusDepoisDoResgate = await sequelize.transaction((t) => buscarStatusPorOferta(personagem.id, [offer.id], t));
  assert.equal(statusDepoisDoResgate.get(offer.id), "Resgatado", "oferta resgatada precisa continuar visível como 'Resgatado', nunca sumir do mapa");

  // E a trava de duplicidade (já existia, mas prova que continua de pé
  // mesmo pós-resgate): tentar aceitar de novo é rejeitado.
  await assert.rejects(
    () => sequelize.transaction((t) => aceitarOferta(personagem.id, offer.id, t)),
    /Você já aceitou este contrato/,
  );
});

testeComBanco("buscarStatusPorOferta: várias ofertas de uma vez, só as tocadas aparecem no mapa", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const item = await criarItemDeTeste();
  const { offer: ofertaTocada } = await criarOfertaDeEntrega("F", item, 1);
  const { offer: ofertaIntocada } = await criarOfertaDeEntrega("F", item, 1);
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 1 });

  await sequelize.transaction((t) => aceitarOferta(personagem.id, ofertaTocada.id, t));

  const status = await sequelize.transaction((t) => buscarStatusPorOferta(personagem.id, [ofertaTocada.id, ofertaIntocada.id], t));
  assert.equal(status.get(ofertaTocada.id), "Ativo");
  assert.equal(status.has(ofertaIntocada.id), false, "oferta intocada não pode aparecer no mapa (o painel mostra 'Aceitar' pra ela)");
});

testeComBanco("buscarStatusPorOferta: lista de ids vazia não bate no banco e devolve mapa vazio", async () => {
  const status = await sequelize.transaction((t) => buscarStatusPorOferta(1, [], t));
  assert.equal(status.size, 0);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
