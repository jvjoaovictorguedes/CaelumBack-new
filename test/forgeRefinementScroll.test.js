// Fila: Pergaminho de Melhoria no Refinamento — spec
// "Especificacao_Pergaminho_Melhoria_Refinamento_Caelum.docx" §9 lista
// 15 cenários obrigatórios; este arquivo cobre os 14 que dependem de
// backend (o 15º — Fabricação não ganhar campo de pergaminho — é
// verificado por omissão: CraftingPanel.tsx/forgeCraftingService.js
// não foram tocados nessa implementação).
//
// A auditoria (pedida explicitamente pelo documento antes de qualquer
// código novo) encontrou a infraestrutura já parcialmente pronta:
// ForgeScroll, os 3 pergaminhos seedados, e chanceFinalRefinamentoPpm
// já somando base+forja+pergaminho com cap — mas a prévia não conferia
// posse/nível do pergaminho (só aplicava o bônus cegamente se o scroll
// existisse), o payload não trazia "antes/depois" nem objeto completo
// do pergaminho, e a fila não guardava qual pergaminho foi usado pra
// auditoria. Este arquivo testa o comportamento CORRIGIDO.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const Item = require("../src/models/Item");
const ForgeScroll = require("../src/models/ForgeScroll");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterForgeProgress = require("../src/models/CharacterForgeProgress");
const CharacterForgeQueue = require("../src/models/CharacterForgeQueue");
const { XP_TOTAL_PARA_NIVEL } = require("../src/config/forgeConfig");
const forgeRefinementService = require("../src/services/forgeRefinementService");

let temBanco = false;
let PERGAMINHOS = null; // { aprimoramento, mestreFerreiro, forjaCeleste } -> { id_item, bonus_percentual, nivel_forja_minimo }

test.before(async () => {
  temBanco = await bancoDisponivel();
  if (!temBanco) return;
  const scrolls = await ForgeScroll.findAll({ include: [{ model: Item, as: "item" }] });
  const porNome = (nome) => {
    const s = scrolls.find((s) => s.item.nome === nome);
    if (!s) throw new Error(`Seed de pergaminhos não encontrado: "${nome}" — migration 20260930340000 rodou?`);
    return { id_item: s.id_item, bonus_percentual: s.bonus_percentual, nivel_forja_minimo: s.nivel_forja_minimo };
  };
  PERGAMINHOS = {
    aprimoramento: porNome("Pergaminho do Aprimoramento"),
    mestreFerreiro: porNome("Pergaminho do Mestre Ferreiro"),
    forjaCeleste: porNome("Pergaminho da Forja Celestial"),
  };
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

async function definirNivelForja(idPersonagem, nivel) {
  await CharacterForgeProgress.create({
    id_personagem: idPersonagem,
    nivel,
    experiencia: XP_TOTAL_PARA_NIVEL[nivel],
  });
}

async function criarEquipamento(idPersonagem, refinamento) {
  const item = await Item.create({
    nome: `Espada de Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Arma",
    raridade: "Raro",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  const instancia = await CharacterEquipmentInstance.create({
    id_personagem: idPersonagem,
    id_item: item.id,
    refinamento,
    estado: "Inventario",
  });
  return { item, instancia };
}

// Dá ouro e material o suficiente (calculados pelo próprio service, não
// chutados aqui) pra nunca falhar por "insuficiente" quando o teste
// não é sobre isso.
async function prepararRecursos(personagem, instancia) {
  const info = await forgeRefinementService.calcularMateriaisNecessarios(instancia, null);
  for (const material of info.materiais) {
    await CharacterInventory.create({
      id_personagem: personagem.id,
      id_item: material.id_item,
      quantidade: material.quantidade * 10,
    });
  }
  personagem.dinheiro = info.ouro * 10;
  await personagem.save();
  return info;
}

async function darPergaminho(idPersonagem, idItemPergaminho, quantidade = 1) {
  await CharacterInventory.create({ id_personagem: idPersonagem, id_item: idItemPergaminho, quantidade });
}

async function comSorteioForcado(sucesso, fn) {
  const original = crypto.randomInt;
  crypto.randomInt = () => (sucesso ? 0 : 999_999);
  try {
    return await fn();
  } finally {
    crypto.randomInt = original;
  }
}

// #1 — Refinar sem pergaminho: chance normal, nenhum consumível perdido.
testeComBanco("refinar sem pergaminho usa a chance normal e não mexe em nenhum pergaminho", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 4);
  const { instancia } = await criarEquipamento(personagem.id, 7); // alvo 8
  await prepararRecursos(personagem, instancia);

  const previa = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: null,
  });
  assert.equal(previa.pergaminho_aplicado, null);
  assert.equal(previa.chance_percentual, previa.chance_percentual_sem_pergaminho);
  // base 45% (alvo 8) + bônus de Forja nível 4 (3%) = 48%.
  assert.equal(previa.chance_percentual, 48);
});

// #2/#3/#4 — Prévia com +5%/+10%/+15%: chance sobe exatamente N pontos
// percentuais (nunca multiplicativo).
testeComBanco("prévia com Pergaminho do Aprimoramento soma exatamente +5 pontos percentuais", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 4);
  const { instancia } = await criarEquipamento(personagem.id, 7); // alvo 8
  await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.aprimoramento.id_item);

  const previa = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: PERGAMINHOS.aprimoramento.id_item,
  });
  assert.equal(previa.pergaminho_erro, null);
  assert.equal(previa.pergaminho_aplicado.bonus_percentual, 5);
  assert.equal(previa.chance_percentual - previa.chance_percentual_sem_pergaminho, 5);
});

testeComBanco("prévia com Pergaminho do Mestre Ferreiro soma exatamente +10 pontos percentuais", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 7);
  const { instancia } = await criarEquipamento(personagem.id, 7); // alvo 8
  await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.mestreFerreiro.id_item);

  const previa = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: PERGAMINHOS.mestreFerreiro.id_item,
  });
  assert.equal(previa.chance_percentual - previa.chance_percentual_sem_pergaminho, 10);
});

testeComBanco("prévia com Pergaminho da Forja Celestial soma exatamente +15 pontos percentuais", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 10);
  const { instancia } = await criarEquipamento(personagem.id, 7); // alvo 8
  await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.forjaCeleste.id_item);

  const previa = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: PERGAMINHOS.forjaCeleste.id_item,
  });
  assert.equal(previa.chance_percentual - previa.chance_percentual_sem_pergaminho, 15);
});

// #5 — Cap de 95%.
testeComBanco("chance que ultrapassaria 95% fica travada em 95% mesmo com pergaminho", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 10);
  const { instancia } = await criarEquipamento(personagem.id, 5); // alvo 6: base 70% + forja 20% + pergaminho 15% = 105%
  await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.forjaCeleste.id_item);

  const previa = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: PERGAMINHOS.forjaCeleste.id_item,
  });
  assert.equal(previa.chance_percentual, 95);
});

// #6 — +1/+2/+3 permanecem garantidos em 100% mesmo com pergaminho.
testeComBanco("refinamentos garantidos (+1/+2/+3) continuam 100% mesmo com pergaminho selecionado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 10);
  const { instancia } = await criarEquipamento(personagem.id, 0); // alvo 1 — garantido
  await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.forjaCeleste.id_item);

  const previa = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: PERGAMINHOS.forjaCeleste.id_item,
  });
  assert.equal(previa.chance_percentual, 100);
  assert.equal(previa.chance_percentual_sem_pergaminho, 100);
});

// #7 — Pergaminho inexistente: recusa a tentativa inteira, sem consumo.
testeComBanco("iniciar refinamento com id_item_pergaminho inexistente falha e não consome nada", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 10);
  const { instancia } = await criarEquipamento(personagem.id, 7);
  await prepararRecursos(personagem, instancia);
  const dinheiroAntes = personagem.dinheiro;

  await assert.rejects(
    () =>
      forgeRefinementService.iniciarRefinamento(personagem.id, {
        id_instancia: instancia.id,
        id_item_pergaminho: -1,
      }),
    (erro) => erro.statusCode === 400,
  );

  const personagemDepois = await personagem.reload();
  assert.equal(personagemDepois.dinheiro, dinheiroAntes);
  const filaCriada = await CharacterForgeQueue.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(filaCriada, null);
});

// #8 — id_item_pergaminho aponta pra um Item real que não é ForgeScroll.
testeComBanco("iniciar refinamento com um Item que não é ForgeScroll falha e não consome nada", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 10);
  const { instancia } = await criarEquipamento(personagem.id, 7);
  const info = await prepararRecursos(personagem, instancia);
  const idItemMaterial = info.materiais[0].id_item; // item real, mas não é forge_scrolls
  const dinheiroAntes = personagem.dinheiro;

  await assert.rejects(
    () =>
      forgeRefinementService.iniciarRefinamento(personagem.id, {
        id_instancia: instancia.id,
        id_item_pergaminho: idItemMaterial,
      }),
    (erro) => erro.statusCode === 400,
  );

  const personagemDepois = await personagem.reload();
  assert.equal(personagemDepois.dinheiro, dinheiroAntes);
});

// #9 — Sem estoque do pergaminho.
testeComBanco("iniciar refinamento sem ter o pergaminho no inventário falha e não consome nada", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 10);
  const { instancia } = await criarEquipamento(personagem.id, 7);
  await prepararRecursos(personagem, instancia);
  const dinheiroAntes = personagem.dinheiro;
  // Nunca deu o pergaminho pro personagem.

  await assert.rejects(
    () =>
      forgeRefinementService.iniciarRefinamento(personagem.id, {
        id_instancia: instancia.id,
        id_item_pergaminho: PERGAMINHOS.forjaCeleste.id_item,
      }),
    (erro) => erro.statusCode === 400 && /não possui/.test(erro.message),
  );

  const personagemDepois = await personagem.reload();
  assert.equal(personagemDepois.dinheiro, dinheiroAntes);
});

// #10 — Nível de Forja insuficiente pro pergaminho escolhido.
testeComBanco("iniciar refinamento com nível de Forja insuficiente pro pergaminho falha e não consome nada", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 1); // Forja Celestial exige nível 10
  const { instancia } = await criarEquipamento(personagem.id, 7);
  await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.forjaCeleste.id_item);
  const dinheiroAntes = personagem.dinheiro;

  await assert.rejects(
    () =>
      forgeRefinementService.iniciarRefinamento(personagem.id, {
        id_instancia: instancia.id,
        id_item_pergaminho: PERGAMINHOS.forjaCeleste.id_item,
      }),
    (erro) => erro.statusCode === 400 && /nível/i.test(erro.message),
  );

  const personagemDepois = await personagem.reload();
  assert.equal(personagemDepois.dinheiro, dinheiroAntes);
  const entradaPergaminho = await CharacterInventory.findOne({
    where: { id_personagem: personagem.id, id_item: PERGAMINHOS.forjaCeleste.id_item },
  });
  assert.equal(entradaPergaminho.quantidade, 1);

  // A prévia (não bloqueante) também precisa refletir essa
  // indisponibilidade em vez de aplicar o bônus cegamente.
  const previa = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: PERGAMINHOS.forjaCeleste.id_item,
  });
  assert.equal(previa.pergaminho_aplicado, null);
  assert.match(previa.pergaminho_erro, /nível/i);
});

// #11 — Tentativa FALHA com pergaminho: equipamento mantém refino,
// pergaminho/material/ouro consumidos mesmo assim.
testeComBanco("tentativa que falha ainda consome material, ouro e pergaminho", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 4);
  const { instancia } = await criarEquipamento(personagem.id, 7); // alvo 8, não garantido
  const info = await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.aprimoramento.id_item, 1);
  const dinheiroAntes = personagem.dinheiro;

  const resultado = await comSorteioForcado(false, () =>
    forgeRefinementService.iniciarRefinamento(personagem.id, {
      id_instancia: instancia.id,
      id_item_pergaminho: PERGAMINHOS.aprimoramento.id_item,
    }),
  );
  assert.ok(resultado.pronto_em);

  const fila = await CharacterForgeQueue.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(fila.payload_resultado.sucesso, false);
  assert.equal(fila.referencia.id_item_pergaminho, PERGAMINHOS.aprimoramento.id_item);
  assert.equal(fila.referencia.nome_pergaminho, "Pergaminho do Aprimoramento");

  const personagemDepois = await personagem.reload();
  assert.equal(personagemDepois.dinheiro, dinheiroAntes - info.ouro);
  const entradaPergaminho = await CharacterInventory.findOne({
    where: { id_personagem: personagem.id, id_item: PERGAMINHOS.aprimoramento.id_item },
  });
  assert.equal(entradaPergaminho, null); // tinha 1, consumiu 1 -> linha apagada

  const instanciaDepois = await CharacterEquipmentInstance.findByPk(instancia.id);
  assert.equal(instanciaDepois.refinamento, 7, "refino só muda na coleta, e só em caso de sucesso");
});

// #12 — Tentativa SUCESSO com pergaminho: consumo idêntico ao caso de falha.
testeComBanco("tentativa que tem sucesso também consome material, ouro e pergaminho", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 4);
  const { instancia } = await criarEquipamento(personagem.id, 0); // alvo 1, garantido — sucesso sempre
  const info = await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.aprimoramento.id_item, 1);
  const dinheiroAntes = personagem.dinheiro;

  const resultado = await comSorteioForcado(true, () =>
    forgeRefinementService.iniciarRefinamento(personagem.id, {
      id_instancia: instancia.id,
      id_item_pergaminho: PERGAMINHOS.aprimoramento.id_item,
    }),
  );
  assert.ok(resultado.pronto_em);

  const fila = await CharacterForgeQueue.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(fila.payload_resultado.sucesso, true);

  const personagemDepois = await personagem.reload();
  assert.equal(personagemDepois.dinheiro, dinheiroAntes - info.ouro);
  const entradaPergaminho = await CharacterInventory.findOne({
    where: { id_personagem: personagem.id, id_item: PERGAMINHOS.aprimoramento.id_item },
  });
  assert.equal(entradaPergaminho, null);
});

// #13 — Concorrência: duas tentativas simultâneas com só 1 pergaminho —
// só uma consegue consumir/iniciar, a outra falha de forma segura (sem
// consumo duplicado, sem consumo perdido).
testeComBanco("duas tentativas simultâneas com 1 único pergaminho: só uma consome, nenhuma perde/duplica", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 4);
  const { instancia: instanciaA } = await criarEquipamento(personagem.id, 7);
  const { instancia: instanciaB } = await criarEquipamento(personagem.id, 7);
  await prepararRecursos(personagem, instanciaA);
  // instanciaB usa o MESMO tipo de material/ouro (mesma raridade/categoria) —
  // prepararRecursos já deixou estoque de sobra (x10) pra cobrir as duas.
  await darPergaminho(personagem.id, PERGAMINHOS.aprimoramento.id_item, 1);

  const [resultadoA, resultadoB] = await Promise.allSettled([
    forgeRefinementService.iniciarRefinamento(personagem.id, {
      id_instancia: instanciaA.id,
      id_item_pergaminho: PERGAMINHOS.aprimoramento.id_item,
    }),
    forgeRefinementService.iniciarRefinamento(personagem.id, {
      id_instancia: instanciaB.id,
      id_item_pergaminho: PERGAMINHOS.aprimoramento.id_item,
    }),
  ]);

  const sucessos = [resultadoA, resultadoB].filter((r) => r.status === "fulfilled");
  const falhas = [resultadoA, resultadoB].filter((r) => r.status === "rejected");
  assert.equal(sucessos.length, 1, "exatamente uma das duas tentativas deveria ter conseguido iniciar");
  assert.equal(falhas.length, 1, "a outra precisa falhar (nunca as duas passarem)");

  // Nunca consumiu 2 (double-spend) nem sobrou sem consumir nenhum.
  const entradaPergaminho = await CharacterInventory.findOne({
    where: { id_personagem: personagem.id, id_item: PERGAMINHOS.aprimoramento.id_item },
  });
  assert.equal(entradaPergaminho, null, "o único pergaminho foi consumido pela tentativa vencedora");

  const filas = await CharacterForgeQueue.count({ where: { id_personagem: personagem.id } });
  assert.equal(filas, 1, "só uma entrada de fila deveria ter sido criada");
});

// #14 — Trocar seleção pra "Nenhum": nova prévia volta à chance sem bônus.
testeComBanco("prévia sem id_item_pergaminho (seleção 'Nenhum') não aplica bônus nenhum", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 10);
  const { instancia } = await criarEquipamento(personagem.id, 7);
  await prepararRecursos(personagem, instancia);
  await darPergaminho(personagem.id, PERGAMINHOS.forjaCeleste.id_item);

  const comPergaminho = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: PERGAMINHOS.forjaCeleste.id_item,
  });
  const semPergaminho = await forgeRefinementService.previaRefinamento(personagem.id, {
    id_instancia: instancia.id,
    id_item_pergaminho: null,
  });

  assert.ok(comPergaminho.chance_percentual > semPergaminho.chance_percentual);
  assert.equal(semPergaminho.pergaminho_aplicado, null);
  assert.equal(semPergaminho.chance_percentual, semPergaminho.chance_percentual_sem_pergaminho);
});

// Catálogo pro seletor do frontend (GET /crafting/scrolls).
testeComBanco("listarPergaminhosDisponiveis cruza catálogo com estoque e nível de Forja do personagem", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 5); // atende Aprimoramento(4) e Mestre Ferreiro(7)? não — só Aprimoramento
  await darPergaminho(personagem.id, PERGAMINHOS.aprimoramento.id_item, 3);
  // Mestre Ferreiro e Forja Celestial: personagem não tem nenhum no inventário.

  const catalogo = await forgeRefinementService.listarPergaminhosDisponiveis(personagem.id);
  assert.equal(catalogo.length, 3);

  const aprimoramento = catalogo.find((p) => p.id_item === PERGAMINHOS.aprimoramento.id_item);
  assert.equal(aprimoramento.quantidade_disponivel, 3);
  assert.equal(aprimoramento.bonus_percentual, 5);
  assert.equal(aprimoramento.nivel_forja_suficiente, true);

  const mestreFerreiro = catalogo.find((p) => p.id_item === PERGAMINHOS.mestreFerreiro.id_item);
  assert.equal(mestreFerreiro.quantidade_disponivel, 0);
  assert.equal(mestreFerreiro.nivel_forja_suficiente, false); // exige nível 7, personagem está no 5
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
