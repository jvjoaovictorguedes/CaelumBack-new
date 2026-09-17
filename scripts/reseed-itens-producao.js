// scripts/reseed-itens-producao.js
//
// Mesma ideia do reseed-poderes-producao.js: NÃO é migration, roda
// quando você quiser redesenhar o catálogo de itens inteiro do zero.
// Apaga TUDO relacionado a item (Items + as tabelas de "variação" —
// WeaponProperties/ArmorProperties/consumable_properties — e também
// tira o item de qualquer personagem que já tenha um: inventário e
// equipamento) e recria a partir da lista abaixo.
//
// Por que precisa tirar dos personagens antes de apagar: Items tem
// foreign key sendo referenciada por character_inventory e
// character_equipment — apagar um item que algum jogador possui
// quebraria a constraint. Como o catálogo inteiro está sendo trocado
// (raridades, nomes e stats não têm mais correspondência com o que
// existia antes), a única opção seria manter itens velhos "zumbis" só
// pra não incomodar quem tinha um — em vez disso, o inventário/
// equipamento de todo mundo é limpo junto, igual pedido.
//
// Como rodar: railway run node scripts/reseed-itens-producao.js

const Item = require("../src/models/Item");
const WeaponProperties = require("../src/models/WeaponProperties");
const ArmorProperties = require("../src/models/ArmorProperties");
const ConsumableProperties = require("../src/models/ConsumableProperties");
const { sequelize } = require("../src/config/database");

// ---------------------------------------------------------------------
// Consumíveis — poções de vida/mana em três tamanhos (pequena/média/
// grande, como em qualquer RPG) mais um elixir raro que cura os dois.
// efeito_vida/efeito_mana são PERCENTUAIS da vida/mana máxima (ver
// characterInventoryController.js) — a grande não cura tudo de uma vez
// de propósito, pra poção nunca substituir descanso/cura de verdade.
// ---------------------------------------------------------------------
const CONSUMIVEIS = [
  {
    nome: "Poção de Vida Pequena",
    descricao: "Um gole recupera um pouco de vida. Barata, mas fraca.",
    raridade: "Comum",
    valor_compra: 8,
    valor_venda: 2,
    peso: 0.3,
    disponivel_loja: true,
    propriedades: { efeito_vida: 20 },
  },
  {
    nome: "Poção de Vida Média",
    descricao: "Cura uma quantidade razoável de vida — o meio-termo entre preço e efeito.",
    raridade: "Incomum",
    valor_compra: 25,
    valor_venda: 8,
    peso: 0.4,
    disponivel_loja: true,
    propriedades: { efeito_vida: 45 },
  },
  {
    nome: "Poção de Vida Grande",
    descricao: "Um frasco denso, capaz de reverter ferimentos sérios em pleno combate.",
    raridade: "Raro",
    valor_compra: 60,
    valor_venda: 20,
    peso: 0.6,
    disponivel_loja: true,
    propriedades: { efeito_vida: 80 },
  },
  {
    nome: "Poção de Mana Pequena",
    descricao: "Recupera um pouco de mana. Ideal pra economizar nos primeiros combates.",
    raridade: "Comum",
    valor_compra: 8,
    valor_venda: 2,
    peso: 0.3,
    disponivel_loja: true,
    propriedades: { efeito_mana: 20 },
  },
  {
    nome: "Poção de Mana Média",
    descricao: "Recupera uma quantidade razoável de mana.",
    raridade: "Incomum",
    valor_compra: 25,
    valor_venda: 8,
    peso: 0.4,
    disponivel_loja: true,
    propriedades: { efeito_mana: 45 },
  },
  {
    nome: "Poção de Mana Grande",
    descricao: "Um frasco concentrado de energia arcana pura.",
    raridade: "Raro",
    valor_compra: 60,
    valor_venda: 20,
    peso: 0.6,
    disponivel_loja: true,
    propriedades: { efeito_mana: 80 },
  },
  {
    nome: "Elixir do Aventureiro",
    descricao: "Cura vida e mana ao mesmo tempo — caro, mas vale cada moeda numa emergência.",
    raridade: "Epico",
    valor_compra: 150,
    valor_venda: 50,
    peso: 0.8,
    disponivel_loja: true,
    propriedades: { efeito_vida: 50, efeito_mana: 50 },
  },
];

// ---------------------------------------------------------------------
// Armas — dano físico ou mágico (tipo_dano), com bônus de atributo pra
// diferenciar arquétipos (Força pro guerreiro, Inteligência pro mago,
// Agilidade pra builds ágeis). Os dois últimos (Épico) não ficam à
// venda: disponivel_loja: false — não dá pra simplesmente comprar o
// topo de linha com ouro, fica reservado pra quando existir
// recompensa/loot de verdade.
// ---------------------------------------------------------------------
const ARMAS = [
  {
    nome: "Adaga Enferrujada",
    descricao: "Uma lâmina curta e desgastada. Rápida, mas fraca.",
    raridade: "Comum",
    valor_compra: 15,
    valor_venda: 5,
    peso: 1,
    disponivel_loja: true,
    propriedades: { dano_min: 3, dano_max: 6, tipo_dano: "Fisico", tipo_arma: "Adaga", bonus_atributo: "Agilidade", valor_bonus_atributo: 1 },
  },
  {
    nome: "Espada de Ferro",
    descricao: "Uma espada comum, mas confiável.",
    raridade: "Comum",
    valor_compra: 35,
    valor_venda: 12,
    peso: 3,
    disponivel_loja: true,
    imagem_url: "/images/sword-basic.webp",
    propriedades: { dano_min: 5, dano_max: 9, tipo_dano: "Fisico", tipo_arma: "Espada", bonus_atributo: "Forca", valor_bonus_atributo: 1 },
  },
  {
    nome: "Cajado do Aprendiz",
    descricao: "O primeiro cajado de qualquer mago — simples, mas já canaliza magia de verdade.",
    raridade: "Comum",
    valor_compra: 35,
    valor_venda: 12,
    peso: 2,
    disponivel_loja: true,
    propriedades: { dano_min: 3, dano_max: 5, tipo_dano: "Magico", tipo_arma: "Cajado", bonus_atributo: "Inteligencia", valor_bonus_atributo: 2 },
  },
  {
    nome: "Machado de Batalha",
    descricao: "Pesado e brutal, feito pra golpes que não perdoam.",
    raridade: "Incomum",
    valor_compra: 90,
    valor_venda: 30,
    peso: 5,
    disponivel_loja: true,
    propriedades: { dano_min: 8, dano_max: 14, tipo_dano: "Fisico", tipo_arma: "Machado", bonus_atributo: "Forca", valor_bonus_atributo: 3 },
  },
  {
    nome: "Adaga das Sombras",
    descricao: "Forjada pra golpear antes que o inimigo perceba.",
    raridade: "Incomum",
    valor_compra: 95,
    valor_venda: 32,
    peso: 1,
    disponivel_loja: true,
    propriedades: { dano_min: 7, dano_max: 11, tipo_dano: "Fisico", tipo_arma: "Adaga", bonus_atributo: "Agilidade", valor_bonus_atributo: 4 },
  },
  {
    nome: "Lança do Guardião",
    descricao: "Empunhada por quem protege mais do que ataca — alcance e firmeza acima de tudo.",
    raridade: "Raro",
    valor_compra: 220,
    valor_venda: 75,
    peso: 4,
    disponivel_loja: true,
    propriedades: { dano_min: 14, dano_max: 20, tipo_dano: "Fisico", tipo_arma: "Lança", bonus_atributo: "Vitalidade", valor_bonus_atributo: 5 },
  },
  {
    nome: "Espada Élfica",
    descricao: "Leve como uma pena e afiada como pouca coisa no mundo mortal.",
    raridade: "Raro",
    valor_compra: 230,
    valor_venda: 78,
    peso: 2,
    disponivel_loja: true,
    propriedades: { dano_min: 13, dano_max: 19, tipo_dano: "Fisico", tipo_arma: "Espada", bonus_atributo: "Agilidade", valor_bonus_atributo: 5 },
  },
  {
    nome: "Orbe de Cristal",
    descricao: "Um núcleo de cristal que amplifica qualquer intenção mágica de quem o segura.",
    raridade: "Raro",
    valor_compra: 240,
    valor_venda: 80,
    peso: 1.5,
    disponivel_loja: true,
    propriedades: { dano_min: 12, dano_max: 18, tipo_dano: "Magico", tipo_arma: "Orbe", bonus_atributo: "Inteligencia", valor_bonus_atributo: 6 },
  },
  {
    nome: "Machado Brutal do Orc",
    descricao: "Um machado lendário entre os orcs — poucos sobrevivem pra descrever o golpe.",
    raridade: "Epico",
    valor_compra: 500,
    valor_venda: 170,
    peso: 7,
    disponivel_loja: false,
    propriedades: { dano_min: 22, dano_max: 32, tipo_dano: "Fisico", tipo_arma: "Machado", bonus_atributo: "Forca", valor_bonus_atributo: 9 },
  },
  {
    nome: "Cajado do Arquimago",
    descricao: "Carrega o peso de gerações de estudo arcano em cada centímetro.",
    raridade: "Epico",
    valor_compra: 520,
    valor_venda: 175,
    peso: 2,
    disponivel_loja: false,
    propriedades: { dano_min: 20, dano_max: 28, tipo_dano: "Magico", tipo_arma: "Cajado", bonus_atributo: "Inteligencia", valor_bonus_atributo: 10 },
  },
];

// ---------------------------------------------------------------------
// Escudos — vivem em ArmaSecundaria (nunca junto com uma segunda arma,
// ver CharacterEquipmentController.js). slot_equipamento fica "Maos"
// só porque o ENUM de ArmorProperties não tem um valor específico pra
// escudo — a validação de equipar não olha esse campo pra Escudo, só
// checa se a linha existe.
// ---------------------------------------------------------------------
const ESCUDOS = [
  {
    nome: "Escudo de Madeira",
    descricao: "Simples, mas melhor do que nada na frente de um golpe.",
    raridade: "Comum",
    valor_compra: 25,
    valor_venda: 8,
    peso: 3,
    disponivel_loja: true,
    propriedades: { slot_equipamento: "Maos", defesa: 4 },
  },
  {
    nome: "Escudo de Ferro",
    descricao: "Pesado, mas praticamente impossível de rachar.",
    raridade: "Incomum",
    valor_compra: 70,
    valor_venda: 24,
    peso: 5,
    disponivel_loja: true,
    propriedades: { slot_equipamento: "Maos", defesa: 9 },
  },
  {
    nome: "Escudo do Guardião",
    descricao: "Carregado por quem jurou proteger algo mais importante que a própria vida.",
    raridade: "Raro",
    valor_compra: 200,
    valor_venda: 68,
    peso: 6,
    disponivel_loja: true,
    propriedades: { slot_equipamento: "Maos", defesa: 16, bonus_vitalidade: 3 },
  },
];

// ---------------------------------------------------------------------
// Armaduras — 3 sets completos (Cabeça/Torso/Mãos/Pés), cada um com uma
// identidade diferente: Couro é leve (bônus de agilidade/velocidade),
// Ferro é equilibrado/tanque, Élfico favorece magos (inteligência) sem
// abrir mão de agilidade.
// ---------------------------------------------------------------------
const ARMADURAS = [
  // --- Set Couro (Comum) ---
  { nome: "Elmo de Couro", descricao: "Protege sem pesar — parte do conjunto de couro.", raridade: "Comum", valor_compra: 18, valor_venda: 6, peso: 1, disponivel_loja: true, tipo_item: "Capacete", propriedades: { slot_equipamento: "Cabeca", defesa: 2, bonus_agilidade: 1 } },
  { nome: "Peitoral de Couro", descricao: "Flexível o bastante pra não atrapalhar um golpe rápido.", raridade: "Comum", valor_compra: 30, valor_venda: 10, peso: 3, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Torso", defesa: 4, bonus_agilidade: 2 } },
  { nome: "Luvas de Couro", descricao: "Mantêm os dedos livres pra qualquer coisa que a batalha exigir.", raridade: "Comum", valor_compra: 14, valor_venda: 5, peso: 0.5, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Maos", defesa: 1, bonus_agilidade: 1 } },
  { nome: "Botas de Couro", descricao: "Leves o bastante pra correr, resistentes o bastante pra durar.", raridade: "Comum", valor_compra: 16, valor_venda: 5, peso: 1, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Pes", defesa: 1, bonus_velocidade: 2 } },

  // --- Set Ferro (Incomum) ---
  { nome: "Elmo de Ferro", descricao: "Um elmo simples, mas resistente.", raridade: "Incomum", valor_compra: 45, valor_venda: 15, peso: 2, disponivel_loja: true, tipo_item: "Capacete", propriedades: { slot_equipamento: "Cabeca", defesa: 5, bonus_vitalidade: 2 } },
  { nome: "Peitoral de Ferro", descricao: "Pesado, mas quase nada atravessa.", raridade: "Incomum", valor_compra: 80, valor_venda: 27, peso: 6, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Torso", defesa: 10, bonus_vitalidade: 4 } },
  { nome: "Manoplas de Ferro", descricao: "Cada soco pesa um pouco mais com elas.", raridade: "Incomum", valor_compra: 35, valor_venda: 12, peso: 2, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Maos", defesa: 3, bonus_forca: 2 } },
  { nome: "Botas de Ferro", descricao: "Firmes no chão, difíceis de derrubar.", raridade: "Incomum", valor_compra: 40, valor_venda: 13, peso: 3, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Pes", defesa: 3, bonus_vitalidade: 1 } },

  // --- Set Élfico (Raro) ---
  { nome: "Diadema Élfico", descricao: "Canaliza energia arcana só de estar na cabeça de quem sabe usá-la.", raridade: "Raro", valor_compra: 180, valor_venda: 60, peso: 0.5, disponivel_loja: true, tipo_item: "Capacete", propriedades: { slot_equipamento: "Cabeca", defesa: 6, bonus_inteligencia: 5 } },
  { nome: "Manto Élfico", descricao: "Tecido que parece se mover sozinho, sempre um passo à frente do vento.", raridade: "Raro", valor_compra: 260, valor_venda: 88, peso: 1.5, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Torso", defesa: 11, bonus_inteligencia: 6, bonus_agilidade: 2 } },
  { nome: "Luvas Élficas", descricao: "Precisas o bastante pra não perder um único fio de mana.", raridade: "Raro", valor_compra: 120, valor_venda: 40, peso: 0.3, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Maos", defesa: 4, bonus_inteligencia: 3 } },
  { nome: "Botas Élficas", descricao: "Quase não tocam o chão — feitas pra quem nunca devia ser alcançado.", raridade: "Raro", valor_compra: 140, valor_venda: 47, peso: 0.4, disponivel_loja: true, tipo_item: "Armadura", propriedades: { slot_equipamento: "Pes", defesa: 4, bonus_velocidade: 4, bonus_agilidade: 2 } },
];

async function limparTudo(transaction) {
  // Ordem importa por causa das foreign keys — sempre limpa quem
  // REFERENCIA Items antes de limpar Items em si. Isso também é o
  // "tira de todos os itens" pedido: ninguém fica com um item que não
  // existe mais no inventário ou equipado.
  await sequelize.query('DELETE FROM character_equipment;', { transaction });
  await sequelize.query('DELETE FROM character_inventory;', { transaction });
  await sequelize.query('DELETE FROM "WeaponProperties";', { transaction });
  await sequelize.query('DELETE FROM "ArmorProperties";', { transaction });
  await sequelize.query('DELETE FROM consumable_properties;', { transaction });

  // O delete sem WHERE do catálogo inteiro.
  await sequelize.query('DELETE FROM "Items";', { transaction });

  // Reinicia o auto-incremento — toda vez que este script rodar de
  // novo, os ids voltam a começar do 1 em vez de crescer pra sempre.
  await sequelize.query(
    `SELECT setval(pg_get_serial_sequence('"Items"', 'id'), 1, false);`,
    { transaction },
  );
}

async function criarConsumiveis(transaction) {
  let criados = 0;
  for (const { propriedades, ...dadosItem } of CONSUMIVEIS) {
    const item = await Item.create({ ...dadosItem, tipo_item: "Consumivel" }, { transaction });
    await ConsumableProperties.create({ id_item: item.id, ...propriedades }, { transaction });
    console.log(`  [Consumível] ${item.nome}`);
    criados += 1;
  }
  return criados;
}

async function criarArmas(transaction) {
  let criados = 0;
  for (const { propriedades, ...dadosItem } of ARMAS) {
    const item = await Item.create({ ...dadosItem, tipo_item: "Arma" }, { transaction });
    await WeaponProperties.create({ id_item: item.id, ...propriedades }, { transaction });
    console.log(`  [Arma] ${item.nome}${item.disponivel_loja ? "" : " (fora da loja)"}`);
    criados += 1;
  }
  return criados;
}

async function criarEscudos(transaction) {
  let criados = 0;
  for (const { propriedades, ...dadosItem } of ESCUDOS) {
    const item = await Item.create({ ...dadosItem, tipo_item: "Escudo" }, { transaction });
    await ArmorProperties.create({ id_item: item.id, ...propriedades }, { transaction });
    console.log(`  [Escudo] ${item.nome}`);
    criados += 1;
  }
  return criados;
}

async function criarArmaduras(transaction) {
  let criados = 0;
  for (const { propriedades, tipo_item, ...dadosItem } of ARMADURAS) {
    const item = await Item.create({ ...dadosItem, tipo_item }, { transaction });
    await ArmorProperties.create({ id_item: item.id, ...propriedades }, { transaction });
    console.log(`  [Armadura] ${item.nome} (${propriedades.slot_equipamento})`);
    criados += 1;
  }
  return criados;
}

async function main() {
  await sequelize.authenticate();
  console.log("Conectado ao banco.\n");

  let totalCriados = 0;

  await sequelize.transaction(async (transaction) => {
    console.log(
      "Limpando catálogo de itens (Items, WeaponProperties, ArmorProperties, consumable_properties, inventário e equipamento de todos os personagens)...",
    );
    await limparTudo(transaction);
    console.log("Catálogo limpo.\n");

    console.log("Criando consumíveis:");
    totalCriados += await criarConsumiveis(transaction);

    console.log("\nCriando armas:");
    totalCriados += await criarArmas(transaction);

    console.log("\nCriando escudos:");
    totalCriados += await criarEscudos(transaction);

    console.log("\nCriando armaduras:");
    totalCriados += await criarArmaduras(transaction);
  });

  console.log(`\nPronto! ${totalCriados} itens criados.`);
  console.log(
    "Nenhum personagem ficou com item órfão — quem tinha algo equipado ou no inventário precisa comprar de novo na loja.",
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Erro ao regenerar itens:", error);
  process.exit(1);
});
