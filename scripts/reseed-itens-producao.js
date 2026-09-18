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
    nome: "Bandagem Improvisada",
    descricao: "Pano e um pouco de sorte — estanca o sangramento, não faz milagre.",
    raridade: "Comum",
    valor_compra: 4,
    valor_venda: 1,
    peso: 0.2,
    disponivel_loja: true,
    propriedades: { efeito_vida: 10 },
  },
  {
    nome: "Tônico Revigorante",
    descricao: "Recupera vida e mana em quantidade modesta — mais barato que o Elixir, mas cobre o básico.",
    raridade: "Incomum",
    valor_compra: 40,
    valor_venda: 14,
    peso: 0.4,
    disponivel_loja: true,
    propriedades: { efeito_vida: 30, efeito_mana: 30 },
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
  {
    nome: "Poção da Fênix",
    descricao: "Dizem que uma pena de verdade foi dissolvida nesse frasco — cura quase todo o corpo de uma vez.",
    raridade: "Lendario",
    valor_compra: 400,
    valor_venda: 140,
    peso: 0.5,
    disponivel_loja: false,
    propriedades: { efeito_vida: 100 },
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
    propriedades: { dano_min: 5, dano_max: 10, tipo_dano: "Fisico", tipo_arma: "Adaga", bonus_atributo: "Agilidade", valor_bonus_atributo: 1 },
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
    propriedades: { dano_min: 8, dano_max: 14, tipo_dano: "Fisico", tipo_arma: "Espada", bonus_atributo: "Forca", valor_bonus_atributo: 1 },
  },
  {
    nome: "Cajado do Aprendiz",
    descricao: "O primeiro cajado de qualquer mago — simples, mas já canaliza magia de verdade.",
    raridade: "Comum",
    valor_compra: 35,
    valor_venda: 12,
    peso: 2,
    disponivel_loja: true,
    propriedades: { dano_min: 5, dano_max: 9, tipo_dano: "Magico", tipo_arma: "Cajado", bonus_atributo: "Inteligencia", valor_bonus_atributo: 2 },
  },
  {
    nome: "Machado de Batalha",
    descricao: "Pesado e brutal, feito pra golpes que não perdoam.",
    raridade: "Incomum",
    valor_compra: 90,
    valor_venda: 30,
    peso: 5,
    disponivel_loja: true,
    propriedades: { dano_min: 13, dano_max: 22, tipo_dano: "Fisico", tipo_arma: "Machado", bonus_atributo: "Forca", valor_bonus_atributo: 3 },
  },
  {
    nome: "Adaga das Sombras",
    descricao: "Forjada pra golpear antes que o inimigo perceba.",
    raridade: "Incomum",
    valor_compra: 95,
    valor_venda: 32,
    peso: 1,
    disponivel_loja: true,
    propriedades: { dano_min: 11, dano_max: 18, tipo_dano: "Fisico", tipo_arma: "Adaga", bonus_atributo: "Agilidade", valor_bonus_atributo: 4 },
  },
  {
    nome: "Lança do Guardião",
    descricao: "Empunhada por quem protege mais do que ataca — alcance e firmeza acima de tudo.",
    raridade: "Raro",
    valor_compra: 220,
    valor_venda: 75,
    peso: 4,
    disponivel_loja: true,
    propriedades: { dano_min: 22, dano_max: 32, tipo_dano: "Fisico", tipo_arma: "Lança", bonus_atributo: "Vitalidade", valor_bonus_atributo: 5 },
  },
  {
    nome: "Espada Élfica",
    descricao: "Leve como uma pena e afiada como pouca coisa no mundo mortal.",
    raridade: "Raro",
    valor_compra: 230,
    valor_venda: 78,
    peso: 2,
    disponivel_loja: true,
    propriedades: { dano_min: 21, dano_max: 30, tipo_dano: "Fisico", tipo_arma: "Espada", bonus_atributo: "Agilidade", valor_bonus_atributo: 5 },
  },
  {
    nome: "Orbe de Cristal",
    descricao: "Um núcleo de cristal que amplifica qualquer intenção mágica de quem o segura.",
    raridade: "Raro",
    valor_compra: 240,
    valor_venda: 80,
    peso: 1.5,
    disponivel_loja: true,
    propriedades: { dano_min: 19, dano_max: 28, tipo_dano: "Magico", tipo_arma: "Orbe", bonus_atributo: "Inteligencia", valor_bonus_atributo: 6 },
  },
  {
    nome: "Machado Brutal do Orc",
    descricao: "Um machado lendário entre os orcs — poucos sobrevivem pra descrever o golpe.",
    raridade: "Epico",
    valor_compra: 500,
    valor_venda: 170,
    peso: 7,
    disponivel_loja: false,
    propriedades: { dano_min: 35, dano_max: 50, tipo_dano: "Fisico", tipo_arma: "Machado", bonus_atributo: "Forca", valor_bonus_atributo: 9 },
  },
  {
    nome: "Cajado do Arquimago",
    descricao: "Carrega o peso de gerações de estudo arcano em cada centímetro.",
    raridade: "Epico",
    valor_compra: 520,
    valor_venda: 175,
    peso: 2,
    disponivel_loja: false,
    propriedades: { dano_min: 32, dano_max: 44, tipo_dano: "Magico", tipo_arma: "Cajado", bonus_atributo: "Inteligencia", valor_bonus_atributo: 10 },
  },
  {
    nome: "Espada Curta de Bronze",
    descricao: "Comum nos treinos de recrutas — leve, direta, sem segredos.",
    raridade: "Comum",
    valor_compra: 20,
    valor_venda: 7,
    peso: 2,
    disponivel_loja: true,
    propriedades: { dano_min: 6, dano_max: 11, tipo_dano: "Fisico", tipo_arma: "Espada", bonus_atributo: "Forca", valor_bonus_atributo: 1 },
  },
  {
    nome: "Cajado Sussurrante",
    descricao: "Ecoa um murmúrio constante — dizem que os magos antigos conseguiam entender o que ele diz.",
    raridade: "Incomum",
    valor_compra: 100,
    valor_venda: 34,
    peso: 2,
    disponivel_loja: true,
    propriedades: { dano_min: 10, dano_max: 16, tipo_dano: "Magico", tipo_arma: "Cajado", bonus_atributo: "Inteligencia", valor_bonus_atributo: 4 },
  },
  {
    nome: "Machado Rúnico",
    descricao: "Runas gravadas na lâmina brilham fracamente a cada golpe certeiro.",
    raridade: "Raro",
    valor_compra: 250,
    valor_venda: 85,
    peso: 6,
    disponivel_loja: true,
    propriedades: { dano_min: 24, dano_max: 35, tipo_dano: "Fisico", tipo_arma: "Machado", bonus_atributo: "Forca", valor_bonus_atributo: 6 },
  },
  {
    nome: "Lança Perfurante do Abismo",
    descricao: "A ponta parece absorver a luz ao redor — perfura o que quer que seja preciso.",
    raridade: "Epico",
    valor_compra: 480,
    valor_venda: 160,
    peso: 4,
    disponivel_loja: false,
    propriedades: { dano_min: 33, dano_max: 48, tipo_dano: "Fisico", tipo_arma: "Lança", bonus_atributo: "Vitalidade", valor_bonus_atributo: 8 },
  },
  {
    nome: "Espada do Rei Adormecido",
    descricao: "Repousou num túmulo por séculos — ainda lembra como cortar através de qualquer armadura.",
    raridade: "Lendario",
    valor_compra: 900,
    valor_venda: 310,
    peso: 3,
    disponivel_loja: false,
    propriedades: { dano_min: 50, dano_max: 70, tipo_dano: "Fisico", tipo_arma: "Espada", bonus_atributo: "Forca", valor_bonus_atributo: 14 },
  },
  {
    nome: "Cajado das Mil Tempestades",
    descricao: "Cada relâmpago que já caiu perto dele deixou um pouco de energia presa na madeira.",
    raridade: "Lendario",
    valor_compra: 920,
    valor_venda: 315,
    peso: 2,
    disponivel_loja: false,
    propriedades: { dano_min: 46, dano_max: 65, tipo_dano: "Magico", tipo_arma: "Cajado", bonus_atributo: "Inteligencia", valor_bonus_atributo: 15 },
  },
  {
    nome: "Fragmento da Lâmina Celestial",
    descricao: "Um caco de algo que não deveria existir neste mundo — corta como se a matéria não oferecesse resistência nenhuma.",
    raridade: "Mitico",
    valor_compra: 2000,
    valor_venda: 700,
    peso: 1,
    disponivel_loja: false,
    propriedades: { dano_min: 75, dano_max: 100, tipo_dano: "Fisico", tipo_arma: "Adaga", bonus_atributo: "Agilidade", valor_bonus_atributo: 20 },
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
  {
    nome: "Bastião Inabalável",
    descricao: "Nem um exército inteiro empurraria quem segura isso um passo pra trás.",
    raridade: "Epico",
    valor_compra: 520,
    valor_venda: 175,
    peso: 8,
    disponivel_loja: false,
    propriedades: { slot_equipamento: "Maos", defesa: 26, bonus_vitalidade: 6 },
  },
  {
    nome: "Escudo do Último Baluarte",
    descricao: "O último a cair em toda batalha em que já esteve — ninguém sabe explicar como.",
    raridade: "Lendario",
    valor_compra: 950,
    valor_venda: 320,
    peso: 9,
    disponivel_loja: false,
    propriedades: { slot_equipamento: "Maos", defesa: 40, bonus_vitalidade: 10 },
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

  // --- Set Dracônico (Lendário) — fora da loja, só via drop/mercado ---
  { nome: "Elmo Dracônico", descricao: "Moldado a partir da escama da fronte de um dragão — quase impossível de rachar.", raridade: "Lendario", valor_compra: 380, valor_venda: 130, peso: 3, disponivel_loja: false, tipo_item: "Capacete", propriedades: { slot_equipamento: "Cabeca", defesa: 14, bonus_forca: 4, bonus_vitalidade: 4 } },
  { nome: "Peitoral Dracônico", descricao: "Escamas sobrepostas que já resistiram a fogo de verdade.", raridade: "Lendario", valor_compra: 620, valor_venda: 210, peso: 8, disponivel_loja: false, tipo_item: "Armadura", propriedades: { slot_equipamento: "Torso", defesa: 24, bonus_forca: 6, bonus_vitalidade: 8 } },
  { nome: "Manoplas Dracônicas", descricao: "Garras adaptadas em luvas — o golpe vem com peso de verdade.", raridade: "Lendario", valor_compra: 340, valor_venda: 115, peso: 4, disponivel_loja: false, tipo_item: "Armadura", propriedades: { slot_equipamento: "Maos", defesa: 12, bonus_forca: 7 } },
  { nome: "Botas Dracônicas", descricao: "Cada passo pesa como o de algo muito maior do que um humano.", raridade: "Lendario", valor_compra: 360, valor_venda: 120, peso: 5, disponivel_loja: false, tipo_item: "Armadura", propriedades: { slot_equipamento: "Pes", defesa: 12, bonus_vitalidade: 6 } },
];

// ---------------------------------------------------------------------
// Materiais — troféus de monstro/mundo, sem propriedade própria (não
// são equipáveis nem consumíveis): existem pra dar mais variedade de
// drop e pra vender no Mercado entre jogadores. Fora da loja de
// propósito — só se consegue via combate ou comprando de outro jogador.
// ---------------------------------------------------------------------
const MATERIAIS = [
  { nome: "Pelo de Lobo", descricao: "Ainda cheira a floresta. Curtidores pagam bem por um lote inteiro.", raridade: "Comum", valor_compra: 0, valor_venda: 3, peso: 0.2, disponivel_loja: false },
  { nome: "Presa Afiada", descricao: "Guardada como lembrança por quem sobreviveu ao dono dela.", raridade: "Comum", valor_compra: 0, valor_venda: 4, peso: 0.1, disponivel_loja: false },
  { nome: "Escama de Réptil", descricao: "Reflete a luz num verde metálico incomum.", raridade: "Incomum", valor_compra: 0, valor_venda: 12, peso: 0.3, disponivel_loja: false },
  { nome: "Núcleo Arcano Instável", descricao: "Pulsa fracamente — melhor não carregar muitos ao mesmo tempo.", raridade: "Raro", valor_compra: 0, valor_venda: 35, peso: 0.2, disponivel_loja: false },
  { nome: "Fragmento de Meteorito", descricao: "Ainda um pouco quente, mesmo dias depois de ter caído.", raridade: "Epico", valor_compra: 0, valor_venda: 90, peso: 1.5, disponivel_loja: false },
  { nome: "Pó de Estrela", descricao: "Ninguém sabe explicar de onde vem — só que some se ficar exposto à luz do sol por tempo demais.", raridade: "Lendario", valor_compra: 0, valor_venda: 250, peso: 0.05, disponivel_loja: false },
  // Recurso do sistema de evolução de habilidades (ver
  // abilityLevelService.js) — dropa em combate PvE igual qualquer outro
  // Material, e também circula pelo mercado entre jogadores.
  { nome: "Fragmento de Grimório", descricao: "Um pedaço de página arrancada, ainda pulsando com o poder de quem a escreveu. Consumido pra evoluir uma habilidade.", raridade: "Raro", valor_compra: 0, valor_venda: 20, peso: 0.05, disponivel_loja: false },
  // Relíquias de Ascensão — consumidas pra evoluir a CLASSE em si (nível
  // alto, ver classEvolutionService.js). Uma por classe, Mítica (mais
  // rara do jogo), nunca à venda — só drop.
  { nome: "Coração de Titã", descricao: "Ainda pulsa, mesmo depois de arrancado do peito da besta. Quem o absorve nunca mais luta como antes.", raridade: "Mitico", valor_compra: 0, valor_venda: 800, peso: 2, disponivel_loja: false },
  { nome: "Olho do Arcano Eterno", descricao: "Vê através do tecido da magia. Ninguém sabe dizer se ele observa quem o carrega, ou o contrário.", raridade: "Mitico", valor_compra: 0, valor_venda: 800, peso: 0.3, disponivel_loja: false },
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

async function criarMateriais(transaction) {
  let criados = 0;
  for (const dadosItem of MATERIAIS) {
    const item = await Item.create({ ...dadosItem, tipo_item: "Material" }, { transaction });
    console.log(`  [Material] ${item.nome}`);
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

    console.log("\nCriando materiais:");
    totalCriados += await criarMateriais(transaction);
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
