// Sistema de Taverna §13 — cobre os pontos de integração que NÃO são
// testados nos arquivos de domínio (alchemy.test.js/fishing.test.js não
// conheciam a Taverna quando foram escritos): ALCHEMY_XP_PCT somando na
// concessão de XP de Alquimia, e FISHING_CONTROL_PCT somando no
// `controle` efetivo da vara SÓ na pesca normal (nunca no torneio, que
// nem importa fishingEngine.resolverPassoDeReel).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterTavernBuff = require("../src/models/CharacterTavernBuff");

const AlchemyRecipe = require("../src/models/AlchemyRecipe");
const AlchemyRecipeIngredient = require("../src/models/AlchemyRecipeIngredient");
const CharacterAlchemyProgress = require("../src/models/CharacterAlchemyProgress");
const CharacterAlchemyRecipeUnlock = require("../src/models/CharacterAlchemyRecipeUnlock");
const alchemyService = require("../src/services/alchemyService");

const FishingSpecies = require("../src/models/FishingSpecies");
const FishingZone = require("../src/models/FishingZone");
const FishingZoneSpecies = require("../src/models/FishingZoneSpecies");
const FishingRodProperties = require("../src/models/FishingRodProperties");
const FishingSession = require("../src/models/FishingSession");
const CharacterFishingProgress = require("../src/models/CharacterFishingProgress");
const CharacterNavigationState = require("../src/models/CharacterNavigationState");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");
const fishingService = require("../src/services/fishingService");

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

const itensCriados = [];
const especiesCriadas = [];
const zonasCriadas = [];
const recipesCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  await FishingSession.destroy({ where: { id_zone: zonasCriadas.length ? zonasCriadas : [-1] } });
  await FishingZoneSpecies.destroy({ where: { id_zone: zonasCriadas.length ? zonasCriadas : [-1] } });
  await FishingRodProperties.destroy({ where: { id_item: itensCriados.length ? itensCriados : [-1] } });
  await FishingSpecies.destroy({ where: { id: especiesCriadas.length ? especiesCriadas : [-1] } });
  await FishingZone.destroy({ where: { id: zonasCriadas.length ? zonasCriadas : [-1] } });
  await AlchemyRecipeIngredient.destroy({ where: { id_recipe: recipesCriadas.length ? recipesCriadas : [-1] } });
  await AlchemyRecipe.destroy({ where: { id: recipesCriadas.length ? recipesCriadas : [-1] } });
  if (itensCriados.length > 0) {
    await CharacterEquipmentInstance.destroy({ where: { id_item: itensCriados } });
    await CharacterInventory.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
  }
  await sequelize.close();
});

async function darBuffTaverna(characterId, buffKey, magnitude) {
  await CharacterTavernBuff.upsert({
    id_personagem: characterId,
    categoria: "Refeicao",
    buff_key: buffKey,
    magnitude,
    source_menu_item_id: null,
    activated_at: new Date(),
    expires_at: new Date(Date.now() + 3_600_000),
  });
}

// --- ALCHEMY_XP_PCT -------------------------------------------------------

testeComBanco("Alquimia: ALCHEMY_XP_PCT da Taverna soma na concessão de XP (nunca na quantidade produzida)", async () => {
  const { personagem } = await criarPersonagem();

  const ingrediente = await Item.create({
    nome: `Erva de teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(ingrediente.id);
  const resultado = await Item.create({
    nome: `Poção de teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Consumivel",
    raridade: "Comum",
  });
  itensCriados.push(resultado.id);

  const recipe = await AlchemyRecipe.create({
    key: `receita_teste_${sufixo()}`,
    nome: "Receita de Teste",
    categoria: "POCAO",
    id_item_resultado: resultado.id,
    quantidade_resultado: 1,
    xp_alquimia: 100,
    nivel_alquimia_minimo: 1,
    modo_desbloqueio: "NIVEL",
    ativo: true,
  });
  recipesCriadas.push(recipe.id);
  await AlchemyRecipeIngredient.create({ id_recipe: recipe.id, id_item: ingrediente.id, quantidade: 1 });

  await CharacterInventory.create({ id_personagem: personagem.id, id_item: ingrediente.id, quantidade: 10 });
  await CharacterAlchemyProgress.upsert({ id_personagem: personagem.id, experiencia: 0, total_produzido: 0 });

  await darBuffTaverna(personagem.id, "ALCHEMY_XP_PCT", 20);

  const resultadoBrew = await alchemyService.prepararLote(personagem.id, recipe.id, {
    quantity: 1,
    idempotencyKey: `req-${sufixo()}`,
  });

  // xp_alquimia=100 * 1 unidade * (1 + 20/100) = 120 — nunca 100 puro.
  assert.equal(resultadoBrew.xp_ganho, 120, "XP deveria vir com +20% da Taverna aplicado");
});

// --- FISHING_CONTROL_PCT ---------------------------------------------------

testeComBanco("Pesca normal: FISHING_CONTROL_PCT da Taverna aumenta o `controle` efetivo usado no reel (REEL OFF)", async () => {
  const { personagem: p1 } = await criarPersonagem();
  const { personagem: p2 } = await criarPersonagem();

  const itemEspecie = await Item.create({
    nome: `Peixe taverna ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(itemEspecie.id);
  const especie = await FishingSpecies.create({
    key: `especie_taverna_${sufixo()}`,
    id_item: itemEspecie.id,
    comportamento_key: "CALM",
    dificuldade_base: 100,
    peso_min_g: 100,
    peso_max_g: 500,
    perfil_peso: "NORMAL",
    pontos_base_torneio: 100,
  });
  especiesCriadas.push(especie.id);

  const zona = await FishingZone.create({
    key: `zona_taverna_${sufixo()}`,
    nome: "Zona Taverna Teste",
    nivel_pesca_minimo: 1,
    tier_embarcacao_minimo: 1,
    dificuldade_ambiente: 100,
  });
  zonasCriadas.push(zona.id);
  await FishingZoneSpecies.create({ id_zone: zona.id, id_species: especie.id, encounter_weight: 100 });

  async function prepararPescador(personagem) {
    const varaItem = await Item.create({
      nome: `Vara taverna ${sufixo()}`,
      descricao: "teste",
      tipo_item: "Ferramenta",
      raridade: "Comum",
      tier_equipamento: 5,
    });
    itensCriados.push(varaItem.id);
    await FishingRodProperties.create({
      id_item: varaItem.id,
      forca_linha: 500,
      controle: 500,
      recolhimento: 500,
      precisao: 500,
      estabilidade: 500,
      nivel_pesca_minimo: 1,
    });
    const instancia = await equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: varaItem.id, raridade: "Comum" }, null);
    await CharacterNavigationState.upsert({ id_personagem: personagem.id, id_zone_atual: zona.id, id_port_atual: null });
    await CharacterFishingProgress.upsert({ id_personagem: personagem.id, experiencia: 0 });

    const sessaoPublica = await fishingService.iniciarSessao(personagem.id, { zoneId: zona.id, rodInstanceId: instancia.id });
    await fishingService.lancar(personagem.id, sessaoPublica.id);

    let mordeu = false;
    for (let i = 0; i < 90 && !mordeu; i += 1) {
      try {
        await fishingService.fisgar(personagem.id, sessaoPublica.id);
        mordeu = true;
      } catch (e) {
        if (!/ainda não mordeu/.test(e.message)) throw e;
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    // Seed fixo (sem I/O extra) só pra garantir que o passo de teste não
    // caia no branch de "arrancada" aleatória do comportamento CALM
    // (picoChance 8%) e vire flaky — seed=1/sequence=1 confirmado offline.
    const sessaoModel = await FishingSession.findByPk(sessaoPublica.id);
    sessaoModel.behavior_seed = 1;
    sessaoModel.tensao = 400;
    await sessaoModel.save();

    return sessaoPublica.id;
  }

  const sessaoSemBuff = await prepararPescador(p1);
  await darBuffTaverna(p2.id, "FISHING_CONTROL_PCT", 50);
  const sessaoComBuff = await prepararPescador(p2);

  const estadoSemBuff = await fishingService.recolher(p1.id, sessaoSemBuff, false);
  const estadoComBuff = await fishingService.recolher(p2.id, sessaoComBuff, false);

  // REEL OFF: tensao -= 20 + round(controle/1000*18).
  // Sem buff: controle=500 -> drop=20+round(9)=29 -> tensao=400-29=371.
  // Com +50%: controle efetivo=750 -> drop=20+round(13.5)=34 -> tensao=400-34=366.
  assert.equal(estadoSemBuff.tensao, 371, "sem buff, o controle efetivo é o puro da vara (500)");
  assert.equal(estadoComBuff.tensao, 366, "com FISHING_CONTROL_PCT +50%, o controle efetivo sobe pra 750");
  assert.ok(
    estadoComBuff.tensao < estadoSemBuff.tensao,
    "FISHING_CONTROL_PCT deveria reduzir a tensão mais (vara mais controlável) na pesca normal",
  );
});
