"use strict";

// 42 equipamentos novos entregues pelo usuário (public/equips_new/),
// nenhum existia no catálogo ainda (checado por nome-base e por
// forge_blueprint_results — nenhum blueprint escondido apontava pra
// eles). Mesmo padrão de ForgeBlueprint com 6 qualidades usado em
// 20261026760000-forge-gaia-fix-e-sets-novos.js — tier/dano/defesa
// calibrados pelos itens "DIVERSOS" já existentes (Cutelo Rústico,
// Julgadora, Grimório Celeste, Trituradora de Ossos, Véu do Dragão).
//
// Tipo de arma/dano/atributo e tier foram inferidos só pela imagem e
// pelo nome (não veio spec nenhuma junto) — sinalizar se algum ficou
// errado, principalmente os nomeados únicos (Infernum, Manawall,
// Sanguessuga, Draco Ceifadora, Empaladora de Dragões, Quasar Estelar,
// Obsidiana Abissal, Crisma Cavalariça) que não tinham nenhuma pista
// óbvia de tier além do quão elaborada a arte parece.
const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = { Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico" };
const TIER_POWER_MULTIPLIER = { 5: 1.0, 4: 1.25, 3: 1.55, 2: 1.95, 1: 2.45 };
const RARITY_POWER_MULTIPLIER = { Comum: 1.0, Incomum: 1.05, Raro: 1.1, Epico: 1.17, Lendario: 1.25, Mitico: 1.35 };
const TIER_ECONOMIC_MULTIPLIER = { 5: 1, 4: 2, 3: 4, 2: 8, 1: 16 };
const VALOR_VENDA_POR_QUALIDADE = { Comum: 15, Incomum: 45, Raro: 130, Epico: 400, Lendario: 1200, Mitico: 3500 };

function fatorPoder(tier, qualidade) {
  return TIER_POWER_MULTIPLIER[tier] * RARITY_POWER_MULTIPLIER[qualidade];
}

const BLUEPRINTS = [
  // ---- Adagas (Ladino/Agilidade) — progressão Comum -> Nobre -> Real -> Escalpeladora ----
  { nome: "Adaga Comum", categoria: "Arma", tier: 5, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Adaga Comum.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Adaga", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 7, max: 11 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 1 }] },
  { nome: "Adaga Nobre", categoria: "Arma", tier: 4, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Adaga Nobre.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Adaga", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 8, max: 12 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cedro", quantidade_base: 1 }] },
  { nome: "Adaga Real", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Adaga Real.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Adaga", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 9, max: 14 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Solar", quantidade_base: 1 }] },
  { nome: "Adaga Escalpeladora", categoria: "Arma", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Adaga Escalpeladora.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Adaga", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Raiz Ancestral", quantidade_base: 1 }] },
  { nome: "Presa Carmesim", categoria: "Arma", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Presa Carmesim.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Adaga", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cogumelo Carmesim", quantidade_base: 1 }] },
  { nome: "Presas Gêmeas", categoria: "Arma", tier: 1, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Presas Gêmeas.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Adaga", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 14, max: 20 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Elemental", quantidade_base: 1 }] },

  // ---- Cajados/Livros/Orbes (Mago/Inteligência) ----
  { nome: "Cajado Improvisado", categoria: "Arma", tier: 5, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Cajado Improvisado.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva Medicinal", quantidade_base: 1 }] },
  { nome: "Cajado Catalisador", categoria: "Arma", tier: 4, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Cajado Catalisador.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva de Mana", quantidade_base: 1 }] },
  { nome: "Cetro Solaris", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Cetro Solaris.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 12, max: 17 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Solar", quantidade_base: 1 }] },
  { nome: "Livro de Feitiços", categoria: "Arma", tier: 5, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Livro de Feitiços.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva Medicinal", quantidade_base: 1 }] },
  { nome: "Livro de Feitiços Intermediário", categoria: "Arma", tier: 4, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Livro de Feitiços Intermediário.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva Lunar", quantidade_base: 1 }] },
  { nome: "Livro do Oráculo", categoria: "Arma", tier: 2, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Livro do Oráculo.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 13, max: 19 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Fruto Místico", quantidade_base: 1 }] },
  { nome: "Orbe de Mana", categoria: "Arma", tier: 5, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Orbe de Mana.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Orbe", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 7, max: 11 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva de Mana", quantidade_base: 1 }] },
  { nome: "Orbe Catalisadora Astral", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Orbe Catalisadora Astral.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Orbe", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 9, max: 14 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 1 }] },
  { nome: "Orbe Temporal", categoria: "Arma", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Orbe Temporal.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Orbe", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Elemental", quantidade_base: 1 }] },
  { nome: "Obsidiana Abissal", categoria: "Arma", tier: 1, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Obsidiana Abissal.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 16, max: 23 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Elemental", quantidade_base: 2 }] },
  { nome: "Draco Ceifadora", categoria: "Arma", tier: 1, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Draco Ceifadora.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 16, max: 23 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Madeira Dracônica", quantidade_base: 2 }] },

  // ---- Cimitarras/Lótus (curvas, Guerreiro-Agilidade) — tipo_arma
  // "Espada" (ENUM não tem Cimitarra) ----
  { nome: "Cimitarra Carmesim", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Cimitarra Carmesim.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 12, max: 17 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cogumelo Carmesim", quantidade_base: 1 }] },
  { nome: "Cimitarra Vorpal", categoria: "Arma", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Cimitarra Vorpal.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 13, max: 19 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Raiz Ancestral", quantidade_base: 1 }] },
  { nome: "Lótus Branca", categoria: "Arma", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Lótus Branca.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 13, max: 19 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Lunar", quantidade_base: 1 }] },
  { nome: "Lótus Negra", categoria: "Arma", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Lótus Negra.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 13, max: 19 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva Lunar", quantidade_base: 1 }] },

  // ---- Espadas (Guerreiro/Força) — progressão de Ferro -> Reforçada -> Longa -> do Cavaleiro ----
  // Nome do blueprint não pode ser "Espada de Ferro" — já existe um
  // blueprint com esse nome exato (linha de crafting por minério,
  // gera "Espada Forjada de Ferro — X"). Renomeado pra não colidir;
  // arquivo de imagem continua "Espada de Ferro.png" (nome original
  // entregue).
  { nome: "Espada Rústica de Ferro", categoria: "Arma", tier: 5, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Espada de Ferro.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 1 }] },
  { nome: "Espada de Ferro Reforçada", categoria: "Arma", tier: 4, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Espada de Ferro Reforçada.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Pinheiro", quantidade_base: 1 }] },
  { nome: "Espada Longa", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Espada Longa.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 12, max: 17 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cedro", quantidade_base: 1 }] },
  { nome: "Espada do Cavaleiro", categoria: "Arma", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Espada do Cavaleiro.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 13, max: 19 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Raiz Ancestral", quantidade_base: 1 }] },
  { nome: "Sanguessuga", categoria: "Arma", tier: 1, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Sanguessuga.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 16, max: 23 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Elemental", quantidade_base: 2 }] },
  { nome: "Quasar Estelar", categoria: "Arma", tier: 1, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Quasar Estelar.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 16, max: 23 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 2 }] },

  // ---- Lanças (Guerreiro/Força) ----
  { nome: "Lança", categoria: "Arma", tier: 5, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Lança.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Lança", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 1 }] },
  { nome: "Infernum", categoria: "Arma", tier: 1, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Infernum.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Lança", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 16, max: 23 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cogumelo Carmesim", quantidade_base: 2 }] },
  { nome: "Empaladora de Dragões", categoria: "Arma", tier: 1, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Empaladora de Dragões.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Lança", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 16, max: 23 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Madeira Dracônica", quantidade_base: 2 }] },

  // ---- Armaduras (Guerreiro) ----
  { nome: "Armadura de Couro", categoria: "Armadura", tier: 5, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Armadura de Couro.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 5,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 1 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 2 }] },
  { nome: "Cota de Malha de Ferro", categoria: "Armadura", tier: 4, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Cota de Malha de Ferro.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 7,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Pinheiro", quantidade_base: 1 }] },
  { nome: "Botas de Couro", categoria: "Armadura", tier: 5, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Botas de Couro.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 2,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 1 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 1 }] },
  { nome: "Botas de Ferro", categoria: "Armadura", tier: 4, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Botas de Ferro.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 3,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Pinheiro", quantidade_base: 1 }] },
  { nome: "Elmo de Couro", categoria: "Capacete", tier: 5, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Elmo de Couro.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 2,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 1 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 1 }] },
  { nome: "Elmo de Ferro", categoria: "Capacete", tier: 4, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Elmo de Ferro.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 3,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Pinheiro", quantidade_base: 1 }] },

  // ---- Escudos (slot_equipamento "Maos" — nunca lido de verdade,
  // Escudo sempre vai pra ArmaSecundaria, ver equipmentInstanceService)
  // — progressão de Madeira -> Reforçado -> de Ferro -> Real, mais dois
  // topo de linha (Manawall/Crisma Cavalariça) ----
  { nome: "Escudo de Madeira", categoria: "Escudo", tier: 5, multiplicador_tempo: 1.3,
    imagem: "/images/equipamentos/Escudo de Madeira.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Maos" }, defesaBase: 3,
    ingredientes: [{ tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 2 }, { tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 1 }] },
  { nome: "Escudo de Madeira Reforçado", categoria: "Escudo", tier: 4, multiplicador_tempo: 1.3,
    imagem: "/images/equipamentos/Escudo de Madeira Reforçado.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Maos" }, defesaBase: 5,
    ingredientes: [{ tipo_insumo: "RecursoExpedicao", nomeRecurso: "Pinheiro", quantidade_base: 2 }, { tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 2 }] },
  { nome: "Escudo de Ferro", categoria: "Escudo", tier: 3, multiplicador_tempo: 1.3,
    imagem: "/images/equipamentos/Escudo de Ferro.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Maos" }, defesaBase: 7,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cedro", quantidade_base: 1 }] },
  { nome: "Escudo Real", categoria: "Escudo", tier: 2, multiplicador_tempo: 1.3,
    imagem: "/images/equipamentos/Escudo Real.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Maos" }, defesaBase: 10,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Solar", quantidade_base: 1 }] },
  { nome: "Manawall", categoria: "Escudo", tier: 1, multiplicador_tempo: 1.4,
    imagem: "/images/equipamentos/Manawall.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Maos" }, defesaBase: 14,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 2 }] },
  { nome: "Crisma Cavalariça", categoria: "Escudo", tier: 1, multiplicador_tempo: 1.4,
    imagem: "/images/equipamentos/Crisma Cavalariça.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Maos" }, defesaBase: 14,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Elemental", quantidade_base: 2 }] },
];

module.exports = {
  async up(queryInterface) {
    let blueprintsCriados = 0;
    let itensCriados = 0;

    for (const bp of BLUEPRINTS) {
      const [[existente]] = await queryInterface.sequelize.query(
        `SELECT id FROM forge_blueprints WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: bp.nome } },
      );
      if (existente) {
        console.log(`[migration] Blueprint "${bp.nome}" já existe — pulando.`);
        continue;
      }

      const [[blueprintCriado]] = await queryInterface.sequelize.query(
        `INSERT INTO forge_blueprints (nome, categoria_equipamento, multiplicador_tempo, nivel_forja_minimo, tier_equipamento, ativo, "createdAt", "updatedAt")
         VALUES (:nome, :categoria, :multiplicador, 1, :tier, true, now(), now())
         RETURNING id;`,
        { replacements: { nome: bp.nome, categoria: bp.categoria, multiplicador: bp.multiplicador_tempo, tier: bp.tier } },
      );
      const idBlueprint = blueprintCriado.id;
      blueprintsCriados += 1;

      for (const ingrediente of bp.ingredientes) {
        const [[recurso]] = await queryInterface.sequelize.query(
          `SELECT id FROM expedition_resources WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: ingrediente.nomeRecurso } },
        );
        if (!recurso) {
          throw new Error(`Recurso "${ingrediente.nomeRecurso}" não encontrado pra blueprint "${bp.nome}".`);
        }
        await queryInterface.sequelize.query(
          `INSERT INTO forge_blueprint_ingredients (id_blueprint, tipo_insumo, id_recurso, quantidade_base)
           VALUES (:id_blueprint, :tipo_insumo, :id_recurso, :quantidade);`,
          { replacements: { id_blueprint: idBlueprint, tipo_insumo: ingrediente.tipo_insumo, id_recurso: recurso.id, quantidade: ingrediente.quantidade_base } },
        );
      }

      for (const qualidade of QUALIDADES) {
        const nomeItem = `${bp.nome} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
        const fator = fatorPoder(bp.tier, qualidade);

        const [[itemCriado]] = await queryInterface.sequelize.query(
          `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, imagem_url, tier_equipamento, disponivel_loja, "createdAt", "updatedAt")
           VALUES (:nome, :descricao, :tipo_item, :raridade, 0, :valor_venda, 1, :imagem_url, :tier, false, now(), now())
           RETURNING id;`,
          {
            replacements: {
              nome: nomeItem,
              descricao: `${bp.nome} fabricado na Forja, qualidade ${NOME_EXIBICAO_QUALIDADE[qualidade]}.`,
              tipo_item: bp.categoria,
              raridade: qualidade,
              valor_venda: Math.round(VALOR_VENDA_POR_QUALIDADE[qualidade] * TIER_ECONOMIC_MULTIPLIER[bp.tier]),
              imagem_url: bp.imagem,
              tier: bp.tier,
            },
          },
        );
        const idItem = itemCriado.id;

        if (bp.tipoPropriedade === "Weapon") {
          await queryInterface.sequelize.query(
            `INSERT INTO "WeaponProperties" (id_item, dano_min, dano_max, tipo_dano, tipo_arma, bonus_atributo, valor_bonus_atributo, "createdAt", "updatedAt")
             VALUES (:id_item, :dano_min, :dano_max, :tipo_dano, :tipo_arma, :bonus_atributo, :valor_bonus, now(), now());`,
            {
              replacements: {
                id_item: idItem,
                dano_min: Math.round(bp.danoBase.min * fator),
                dano_max: Math.round(bp.danoBase.max * fator),
                tipo_dano: bp.weapon.tipo_dano,
                tipo_arma: bp.weapon.tipo_arma,
                bonus_atributo: bp.weapon.bonus_atributo,
                valor_bonus: Math.round(1 * fator * 10) / 10,
              },
            },
          );
        } else {
          await queryInterface.sequelize.query(
            `INSERT INTO "ArmorProperties" (id_item, slot_equipamento, defesa, bonus_forca, bonus_vitalidade, bonus_inteligencia, bonus_agilidade, bonus_velocidade, "createdAt", "updatedAt")
             VALUES (:id_item, :slot, :defesa, 0, :bonus_vit, 0, 0, 0, now(), now());`,
            {
              replacements: {
                id_item: idItem,
                slot: bp.armor.slot_equipamento,
                defesa: Math.round(bp.defesaBase * fator),
                bonus_vit: Math.round(1 * fator),
              },
            },
          );
        }

        await queryInterface.sequelize.query(
          `INSERT INTO forge_blueprint_results (id_blueprint, qualidade, id_item)
           VALUES (:id_blueprint, :qualidade, :id_item);`,
          { replacements: { id_blueprint: idBlueprint, qualidade, id_item: idItem } },
        );
        itensCriados += 1;
      }
    }

    console.log(`[migration] ${blueprintsCriados} blueprint(s) novo(s), ${itensCriados} item(ns) criado(s) (6 qualidades cada).`);
  },

  async down(queryInterface) {
    const nomes = BLUEPRINTS.map((bp) => bp.nome);
    const [blueprints] = await queryInterface.sequelize.query(
      `SELECT id FROM forge_blueprints WHERE nome IN (${nomes.map(() => "?").join(",")});`,
      { replacements: nomes },
    );
    const ids = blueprints.map((b) => b.id);
    if (ids.length === 0) return;

    const [resultados] = await queryInterface.sequelize.query(
      `SELECT id_item FROM forge_blueprint_results WHERE id_blueprint IN (${ids.join(",")});`,
    );
    const idsItens = resultados.map((r) => r.id_item);

    await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_results WHERE id_blueprint IN (${ids.join(",")});`);
    await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_ingredients WHERE id_blueprint IN (${ids.join(",")});`);
    await queryInterface.sequelize.query(`DELETE FROM forge_blueprints WHERE id IN (${ids.join(",")});`);
    if (idsItens.length > 0) {
      await queryInterface.sequelize.query(`DELETE FROM "WeaponProperties" WHERE id_item IN (${idsItens.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM "ArmorProperties" WHERE id_item IN (${idsItens.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (${idsItens.join(",")});`);
    }
  },
};
